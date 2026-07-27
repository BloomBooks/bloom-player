/**
 * Analytics regression tests, component level.
 *
 * Analytics leaves bloom-player over two different channels, chosen by the
 * `independent` url parameter (default true):
 *
 *  - internal: straight to segment.io via the window.analytics snippet queue
 *    (bloomPlayerAnalytics.tsx). In jsdom the real segment script never loads,
 *    so events accumulate in the snippet's queue array — the very queue the
 *    segment script would drain — which makes it a faithful observation point,
 *    not a mock.
 *
 *  - host: JSON messages to the surrounding app (Bloom Reader, RAB,
 *    BloomLibrary) via externalContext.sendMessageToHost. Defining
 *    window.ParentProxy here is implementing the host side of the real
 *    contract (it is exactly what Bloom Reader injects into its WebView).
 *
 * These tests render the real BloomPlayerCore with axios mocked to serve a
 * fixture book (same arrangement as bloom-player-core.test.tsx). Everything
 * between the book bytes and the channel boundary — bookInfo ambient
 * properties, bookInteraction accumulation, externalContext routing — is real
 * production code.
 *
 * The parts of analytics that require real swiper page turns (pageShown counts
 * from showingPage) can't run in jsdom (see the coverage note at the end of
 * bloom-player-core.test.tsx); those are covered by e2e/analytics.spec.ts.
 *
 * CAUTION for future tests in this file: bloomPlayerAnalytics.tsx holds
 * module-level per-book-session state (the allPagesRead gate,
 * pendingBookAnalytics), and this file does NOT re-import modules per test.
 * That is fine for everything here — the progress-report tests all run in
 * host mode, which bypasses that state, and reportAnalytics is ungated — but
 * do not add an independent-mode "Pages Read" test to this file: it would be
 * order-dependent. That path belongs in analyticsChannels.test.ts, which
 * imports the modules freshly for each test.
 */
import * as React from "react";
import { render, waitFor } from "@testing-library/react";
import axios from "axios";
import { BloomPlayerCore } from "./bloom-player-core";
import {
    kTestBookFolderUrl,
    kTestBookInstanceId,
    makeTestBookHtml,
    makeTestBookMetaData,
    serveTestBook,
} from "./test/fixtures/testBook";

vi.mock("axios", () => {
    const get = vi.fn(() =>
        Promise.reject(new Error("axios.get called before test set up a book")),
    );
    return {
        default: {
            get,
            post: vi.fn(() => Promise.resolve({ data: "" })),
            all: (promises: Array<Promise<unknown>>) => Promise.all(promises),
        },
    };
});

const mockedGet = vi.mocked(axios.get);

function defaultProps() {
    return {
        url: kTestBookFolderUrl,
        landscape: false,
        preferredUiLanguages: ["en"],
        pageStylesAreNowInstalled: vi.fn(),
        activeLanguageCode: "en",
        locationOfDistFolder: "/dist",
        outsideButtonPageClass: "",
        shouldReadImageDescriptions: false,
        imageDescriptionCallback: vi.fn(),
    };
}

const kAfterStartupTimeout = { timeout: 3000 };

// See the same helper in bloom-player-core.test.tsx: waits out the player's
// 500ms post-load stabilization timer so it doesn't fire after unmount.
async function waitForStartupToComplete(container: HTMLElement) {
    await waitFor(() => {
        expect(
            container.querySelector('.swiper-button-next[tabindex="5"]'),
        ).not.toBeNull();
    }, kAfterStartupTimeout);
}

// The segment snippet queue. Entries made through its stub methods are arrays
// like ["track", eventName, params].
function segmentQueue(): any[][] {
    return (window as any).analytics as any[][];
}

// Track calls made after the given queue position.
function trackedEventsSince(
    startIndex: number,
): { event: string; params: any }[] {
    return segmentQueue()
        .slice(startIndex)
        .filter((entry) => Array.isArray(entry) && entry[0] === "track")
        .map((entry) => ({ event: entry[1], params: entry[2] }));
}

// Implements the host side of the ParentProxy contract (what Bloom Reader
// injects into its WebView) and collects the messages the player sends.
function installHostThatReceivesMessages(): any[] {
    const messages: any[] = [];
    (window as any).ParentProxy = {
        receiveMessage: (message: string) => {
            messages.push(JSON.parse(message));
        },
    };
    return messages;
}

let segmentQueueStart = 0;

beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockImplementation(() =>
        Promise.reject(new Error("axios.get called before test set up a book")),
    );
    segmentQueueStart = segmentQueue().length;
});

afterEach(() => {
    delete (window as any).ParentProxy;
    window.history.replaceState(null, "", "/");
});

describe("analytics: BookOrShelf opened", () => {
    it("sends BookOrShelf opened with ambient book properties to segment when independent (the default)", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);

        await waitFor(() => {
            expect(
                trackedEventsSince(segmentQueueStart).map((e) => e.event),
            ).toContain("BookOrShelf opened");
        }, kAfterStartupTimeout);

        const opened = trackedEventsSince(segmentQueueStart).filter(
            (e) => e.event === "BookOrShelf opened",
        );
        // exactly once per book open
        expect(opened.length).toBe(1);

        // The ambient properties: these ride along on every subsequent
        // analytics event too, so getting them right matters a lot.
        const params = opened[0].params;
        expect(params.bookInstanceId).toBe(kTestBookInstanceId);
        expect(params.title).toBe("Test Book");
        expect(params.originalTitle).toBe("Test Book");
        expect(params.totalNumberedPages).toBe(2); // fixture: cover + pages 1,2
        expect(params.questionCount).toBe(0);
        expect(params.contentLang).toBe("en");
        expect(typeof params.sessionId).toBe("string");
        expect(params.sessionId.length).toBeGreaterThan(0);
        // jsdom runs on localhost with no host= param, which reports as "testing"
        expect(params.host).toBe("testing");

        await waitForStartupToComplete(container);
    });

    it("sends BookOrShelf opened to the host instead when independent=false", async () => {
        window.history.replaceState(
            null,
            "",
            "/?independent=false&host=bloomreader",
        );
        const hostMessages = installHostThatReceivesMessages();
        serveTestBook(mockedGet, makeTestBookHtml());
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);

        await waitFor(() => {
            expect(
                hostMessages.some(
                    (m) =>
                        m.messageType === "sendAnalytics" &&
                        m.event === "BookOrShelf opened",
                ),
            ).toBe(true);
        }, kAfterStartupTimeout);

        const message = hostMessages.find(
            (m) =>
                m.messageType === "sendAnalytics" &&
                m.event === "BookOrShelf opened",
        )!;
        expect(message.params.bookInstanceId).toBe(kTestBookInstanceId);
        expect(message.params.totalNumberedPages).toBe(2);
        expect(message.params.host).toBe("bloomreader");

        // and nothing leaked to the segment channel
        expect(
            trackedEventsSince(segmentQueueStart).map((e) => e.event),
        ).not.toContain("BookOrShelf opened");

        await waitForStartupToComplete(container);
    });

    it("includes distributionSource from the book's .distribution file", async () => {
        serveTestBook(mockedGet, makeTestBookHtml(), makeTestBookMetaData(), {
            ".distribution": "bloomdirect",
        });
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);

        await waitFor(() => {
            expect(
                trackedEventsSince(segmentQueueStart).map((e) => e.event),
            ).toContain("BookOrShelf opened");
        }, kAfterStartupTimeout);

        const opened = trackedEventsSince(segmentQueueStart).find(
            (e) => e.event === "BookOrShelf opened",
        )!;
        expect(opened.params.distributionSource).toBe("bloomdirect");

        await waitForStartupToComplete(container);
    });
});

describe("analytics: media durations feed the book progress report", () => {
    // These call the same entry points the runtime media code uses:
    // video.ts reports watched durations through the currentPlayer registry's
    // storeVideoAnalytics, and narration.ts reports played audio durations
    // through storeAudioAnalytics (wired up via listenForPlayDuration).
    // From there everything through bookInteraction and externalContext to
    // the host message is the real pipeline.
    //
    // The exact report counts below assume that startup emits NO progress
    // report in jsdom (showingPage's deferred block never runs — swiper can't
    // show a page here, see the file header). In a real browser it does; the
    // e2e tests assert that. If a refactor starts emitting a startup report
    // without a page turn, these counts will shift by one — that's the test
    // doing its job; re-derive the expected counts.

    async function renderBookForHost(host: string) {
        window.history.replaceState(
            null,
            "",
            `/?independent=false&host=${host}`,
        );
        const hostMessages = installHostThatReceivesMessages();
        serveTestBook(mockedGet, makeTestBookHtml());
        const playerRef = React.createRef<BloomPlayerCore>();
        const { container } = render(
            <BloomPlayerCore {...defaultProps()} ref={playerRef} />,
        );
        await waitForStartupToComplete(container);
        return { hostMessages, playerRef };
    }

    function progressReports(hostMessages: any[]): any[] {
        return hostMessages.filter(
            (m) =>
                m.messageType === "updateBookProgressReport" &&
                m.event === "Pages Read",
        );
    }

    // (No afterEach reset needed for currentPage/currentPageIndex: since the
    // Phase 2 registry refactor those are per-instance, and each test renders a
    // fresh player that is unmounted by testing-library between tests, so the
    // arrangement can't leak the way the old class statics could.)

    it("accumulates video duration into 'Pages Read' progress updates sent to the host", async () => {
        const { hostMessages, playerRef } =
            await renderBookForHost("bloomlibrary");

        playerRef.current!.storeVideoAnalytics(3.5);
        let reports = progressReports(hostMessages);
        expect(reports.length).toBe(1);
        expect(reports[0].params.videoDuration).toBe(3.5);
        // ambient properties ride along on progress reports too
        expect(reports[0].params.bookInstanceId).toBe(kTestBookInstanceId);
        expect(reports[0].params.totalNumberedPages).toBe(2);
        // the bloomlibrary host is allowed to receive readDuration
        expect(typeof reports[0].params.readDuration).toBe("number");

        // durations keep accumulating across reports
        playerRef.current!.storeVideoAnalytics(1.5);
        reports = progressReports(hostMessages);
        expect(reports.length).toBe(2);
        expect(reports[1].params.videoDuration).toBe(5);
    });

    it("ignores the spurious near-zero video durations the video code warns about", async () => {
        const { hostMessages, playerRef } =
            await renderBookForHost("bloomlibrary");

        playerRef.current!.storeVideoAnalytics(0.0005);
        expect(progressReports(hostMessages).length).toBe(0);
    });

    it("counts audio played on xmatter pages toward duration but sends no update for it (BL-7334)", async () => {
        // QUESTIONABLE (pinned as-is): audio and video are asymmetric here.
        // storeVideoAnalytics (bloom-player-core.tsx) always sends a progress
        // update after accumulating, while storeAudioAnalytics returns before
        // sending when the current page is xmatter (the early return above
        // its BL-7334 page-counting comment). Consequence: audio duration
        // played on a cover page reaches the host only when some later event
        // sends a report — if the reader quits right after cover narration,
        // the host's final snapshot is missing that duration. If this is ever
        // made symmetric on purpose, update this test.
        //
        // With no page current yet (jsdom never turns a page), the player
        // treats the situation as an xmatter page: the duration accumulates
        // but doesn't itself trigger a progress update...
        const { hostMessages, playerRef } =
            await renderBookForHost("bloomlibrary");

        playerRef.current!.storeAudioAnalytics(2.25);
        expect(progressReports(hostMessages).length).toBe(0);

        // ...and rides along on the next update that is sent.
        playerRef.current!.storeVideoAnalytics(1);
        const reports = progressReports(hostMessages);
        expect(reports.length).toBe(1);
        expect(reports[0].params.audioDuration).toBe(2.25);
    });

    it("reports audio duration and counts each audio page once for content pages", async () => {
        const { hostMessages, playerRef } =
            await renderBookForHost("bloomlibrary");

        // Make page 1 (a numbered content page) the player's current page.
        // On a real page turn showingPage does this; in jsdom swiper cannot
        // turn pages (see the coverage note in bloom-player-core.test.tsx).
        // currentPage/currentPageIndex became per-instance members in the
        // Phase 2 registry refactor, so we arrange the seam on the live player
        // instance (playerRef.current) rather than on the class.
        const contentPage = document.querySelectorAll(".bloom-page")[1];
        expect(contentPage.classList.contains("numberedPage")).toBe(true);
        (playerRef.current as any).currentPage = contentPage;
        (playerRef.current as any).currentPageIndex = 1;

        playerRef.current!.storeAudioAnalytics(2.25);
        let reports = progressReports(hostMessages);
        expect(reports.length).toBe(1);
        expect(reports[0].params.audioDuration).toBe(2.25);
        expect(reports[0].params.audioPages).toBe(1);

        // More audio on the same page: duration accumulates, but the page is
        // only ever counted once.
        playerRef.current!.storeAudioAnalytics(0.75);
        reports = progressReports(hostMessages);
        expect(reports.length).toBe(2);
        expect(reports[1].params.audioDuration).toBe(3);
        expect(reports[1].params.audioPages).toBe(1);
    });

    it("omits readDuration from progress reports to hosts other than bloomlibrary", async () => {
        // Hosts like Bloom Reader accumulate read time natively (window
        // focus/blur don't work in their webviews), so the player must not
        // send them its own (wrong) readDuration.
        const { hostMessages, playerRef } =
            await renderBookForHost("bloomreader");

        playerRef.current!.storeVideoAnalytics(2);
        const reports = progressReports(hostMessages);
        expect(reports.length).toBe(1);
        expect(reports[0].params.videoDuration).toBe(2);
        expect("readDuration" in reports[0].params).toBe(false);
    });
});
