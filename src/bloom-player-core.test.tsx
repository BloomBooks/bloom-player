/**
 * Component-level smoke tests for BloomPlayerCore (react-modernization Phase 0).
 *
 * These render the real component in jsdom with axios mocked to serve a small
 * fixture book (see src/test/fixtures/testBook.ts). They pin down the externally
 * observable behavior of the loading pipeline, callbacks to the host, page
 * navigation, language switching, and the error paths, so that the class-to-hooks
 * conversion (and the React/Swiper/MUI upgrades) can be verified against them.
 */
import * as React from "react";
import { act, render, waitFor } from "@testing-library/react";
import axios from "axios";
import { BloomPlayerCore } from "./bloom-player-core";
import { PlayFailed, PlayUnblocked } from "./shared/narration";
import {
    kTestBookFolderUrl,
    kTestBookHtmUrl,
    makeTestBookHtml,
    makeTestBookMetaData,
    makeTestPage,
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

// The player deliberately waits 500ms after loading before it considers swiper
// stable and fires page-oriented side effects (see finishUp). Tests that assert
// on those effects need to wait past that.
const kAfterStartupTimeout = { timeout: 3000 };

// Waits until the post-load startup timeout in finishUp has run. Its last acts
// include setting tabindex on the navigation buttons, so that's our signal.
// Tests that load a book should wait for this before finishing; otherwise the
// timer fires after unmount, against a destroyed swiper.
async function waitForStartupToComplete(container: HTMLElement) {
    await waitFor(() => {
        expect(
            container.querySelector('.swiper-button-next[tabindex="5"]'),
        ).not.toBeNull();
    }, kAfterStartupTimeout);
}

beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockImplementation(() =>
        Promise.reject(new Error("axios.get called before test set up a book")),
    );
});

describe("BloomPlayerCore loading", () => {
    it("shows a loading spinner before the book arrives", () => {
        // never resolves, so we stay in the loading state
        mockedGet.mockImplementation(() => new Promise(() => {}));
        const { container } = render(
            <BloomPlayerCore {...defaultProps()} />,
        );
        expect(container.querySelector(".loadingSpinner")).not.toBeNull();
    });

    it("loads a book from a folder url and renders nearby pages", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const props = defaultProps();
        const { container } = render(<BloomPlayerCore {...props} />);

        await waitFor(() => {
            expect(container.textContent).toContain("First page text");
        }, kAfterStartupTimeout);

        // The book html was fetched from <folder>/<folder-name>.htm
        expect(
            mockedGet.mock.calls.some((call) => call[0] === kTestBookHtmUrl),
        ).toBe(true);
        expect(props.pageStylesAreNowInstalled).toHaveBeenCalled();

        // All three pages get slides...
        const slides = container.querySelectorAll(".swiper-slide");
        expect(slides.length).toBe(3);
        // ...but for performance, pages more than one step from the current one
        // are placeholders (BL-7652), so page 2's content is not in the DOM yet.
        expect(container.textContent).toContain("Test Book Title");
        expect(container.textContent).not.toContain("Second page text");

        await waitForStartupToComplete(container);
    });

    it("loads a book given the full url of its .htm file", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const { container } = render(
            <BloomPlayerCore {...defaultProps()} url={kTestBookHtmUrl} />,
        );
        await waitFor(() => {
            expect(container.textContent).toContain("First page text");
        }, kAfterStartupTimeout);
        await waitForStartupToComplete(container);
    });

    it("loads a book whose folder url uses a %2f-encoded slash", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const encodedUrl = "http://localhost:1234/fakebooks%2fTestBook";
        const { container } = render(
            <BloomPlayerCore {...defaultProps()} url={encodedUrl} />,
        );
        await waitFor(() => {
            expect(container.textContent).toContain("First page text");
        }, kAfterStartupTimeout);
        // The book name is taken from after the encoded slash, and the htm is
        // fetched from inside the (still-encoded) folder url.
        expect(
            mockedGet.mock.calls.some(
                (call) => call[0] === encodedUrl + "/TestBook.htm",
            ),
        ).toBe(true);
        await waitForStartupToComplete(container);
    });

    it("shows the load-failed UI when the book cannot be fetched", async () => {
        // serveTestBook not called: everything, including the .htm, 404s
        serveTestBook(mockedGet, undefined as unknown as string);
        mockedGet.mockImplementation((url: string) =>
            Promise.reject(
                Object.assign(new Error("Request failed with status code 404"), {
                    config: { url },
                }),
            ),
        );
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);
        await waitFor(() => {
            expect(container.querySelector(".loadErrorMessage")).not.toBeNull();
        }, kAfterStartupTimeout);
        expect(container.textContent).toContain("was not found");
        expect(container.querySelector(".loadFailedIcon")).not.toBeNull();
    });

    it("shows the required-version message for a book needing a newer player", async () => {
        const html = makeTestBookHtml({
            extraHeadContent:
                `<meta name='FeatureRequirement' content='[{"BloomDesktopMinVersion":"6.0","BloomPlayerMinVersion":"100.0.0","FeatureId":"someFutureFeature","FeaturePhrase":"Some future feature"}]' />`,
        });
        serveTestBook(mockedGet, html);
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);
        await waitFor(() => {
            expect(
                container.querySelector(".requiredVersionMessage"),
            ).not.toBeNull();
        }, kAfterStartupTimeout);
        expect(container.textContent).toContain("someFutureFeature");
    });
});

describe("BloomPlayerCore callbacks to its host", () => {
    it("reports book properties once the book is loaded", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const reportBookProperties = vi.fn();
        const { container } = render(
            <BloomPlayerCore
                {...defaultProps()}
                reportBookProperties={reportBookProperties}
            />,
        );
        await waitFor(() => {
            expect(reportBookProperties).toHaveBeenCalled();
        }, kAfterStartupTimeout);
        const properties = reportBookProperties.mock.calls[0][0];
        expect(properties.canRotate).toBe(false);
        expect(properties.preferredLanguages).toEqual(["en"]);
        // one entry per page: unnumbered cover, then pages 1 and 2
        expect(properties.pageNumbers).toEqual(["", "1", "2"]);
        await waitForStartupToComplete(container);
    });

    it("reports canRotate for a book that allows rotation", async () => {
        serveTestBook(
            mockedGet,
            makeTestBookHtml({
                bodyAttributes:
                    'data-bfcanrotate="allOrientations;bloomReader"',
            }),
        );
        const reportBookProperties = vi.fn();
        const { container } = render(
            <BloomPlayerCore
                {...defaultProps()}
                reportBookProperties={reportBookProperties}
            />,
        );
        await waitFor(() => {
            expect(reportBookProperties).toHaveBeenCalled();
        }, kAfterStartupTimeout);
        expect(reportBookProperties.mock.calls[0][0].canRotate).toBe(true);
        await waitForStartupToComplete(container);
    });

    it("gives the controls the book's languages and image-description status", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const controlsCallback = vi.fn();
        const { container } = render(
            <BloomPlayerCore
                {...defaultProps()}
                controlsCallback={controlsCallback}
            />,
        );
        await waitFor(() => {
            expect(controlsCallback).toHaveBeenCalled();
        }, kAfterStartupTimeout);
        const [languages, hasImageDescriptions] =
            controlsCallback.mock.calls[0];
        expect(languages.map((language) => language.Code)).toContain("en");
        expect(hasImageDescriptions).toBe(false);
        await waitForStartupToComplete(container);
    });
});

describe("BloomPlayerCore page navigation", () => {
    it("fires pageChanged on startup and when slideNext is called", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const pageChanged = vi.fn();
        const playerRef = React.createRef<BloomPlayerCore>();
        render(
            <BloomPlayerCore
                {...defaultProps()}
                ref={playerRef}
                pageChanged={pageChanged}
            />,
        );
        // The startup timeout (500ms) ends with showingPage(startPage), which
        // reports the initial page.
        await waitFor(() => {
            expect(pageChanged).toHaveBeenCalledWith(0);
        }, kAfterStartupTimeout);

        playerRef.current!.slideNext();
        await waitFor(() => {
            expect(pageChanged).toHaveBeenCalledWith(1);
        }, kAfterStartupTimeout);
        // Note: we don't assert on the DOM after the page turn. Swiper 4 computes
        // NaN geometry in jsdom (no layout), so after navigating it can snap back
        // to slide 0. The event-level behavior above is what we can pin down here;
        // real page-turn rendering is covered by the storybook checklist and should
        // become assertable when Swiper is upgraded (modernization plan, Phase 3).
    });

    it("starts at the page given by startPageIndex", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const pageChanged = vi.fn();
        render(
            <BloomPlayerCore
                {...defaultProps()}
                startPageIndex={1}
                pageChanged={pageChanged}
            />,
        );
        // In a browser the player reports only page 1; in jsdom, Swiper's NaN
        // geometry (see above) can also produce spurious reports of page 0, so
        // we only assert that the requested start page was reached.
        await waitFor(() => {
            expect(pageChanged).toHaveBeenCalledWith(1);
        }, kAfterStartupTimeout);
    });

    it("starts at the page identified by a #pageId hash in the url", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const pageChanged = vi.fn();
        render(
            <BloomPlayerCore
                {...defaultProps()}
                url={kTestBookFolderUrl + "#second-content-page-guid"}
                pageChanged={pageChanged}
            />,
        );
        await waitFor(() => {
            expect(pageChanged).toHaveBeenCalledWith(2);
        }, kAfterStartupTimeout);
    });
});

describe("BloomPlayerCore language switching", () => {
    const bilingualBookHtml = () =>
        makeTestBookHtml({
            pages: [
                makeTestPage({
                    id: "bilingual-page-guid",
                    pageNumber: "1",
                    text: {
                        en: "English text",
                        fr: "French text",
                    },
                }),
            ],
        });

    it("shows only the active language's text after a language change", async () => {
        serveTestBook(mockedGet, bilingualBookHtml());
        const props = defaultProps();
        const { container, rerender } = render(
            <BloomPlayerCore {...props} />,
        );
        await waitFor(() => {
            expect(container.textContent).toContain("English text");
        }, kAfterStartupTimeout);
        await waitForStartupToComplete(container);

        const visibleLangsIn = (root: HTMLElement) =>
            Array.from(
                root.querySelectorAll(
                    ".swiper-slide .bloom-editable.bloom-visibility-code-on",
                ),
            ).map((div) => div.getAttribute("lang"));

        expect(visibleLangsIn(container)).toEqual(["en"]);

        rerender(<BloomPlayerCore {...props} activeLanguageCode="fr" />);

        await waitFor(() => {
            expect(visibleLangsIn(container)).toEqual(["fr"]);
        }, kAfterStartupTimeout);
    });
});

describe("BloomPlayerCore page size and navigation buttons", () => {
    it("switches page size class when the landscape prop changes", async () => {
        serveTestBook(
            mockedGet,
            // landscape display only applies to books that allow rotation
            makeTestBookHtml({
                bodyAttributes:
                    'data-bfcanrotate="allOrientations;bloomReader"',
            }),
        );
        const props = defaultProps();
        const { container, rerender } = render(<BloomPlayerCore {...props} />);
        await waitForStartupToComplete(container);

        const firstPage = () =>
            container.querySelector(".bloom-page") as HTMLElement;
        expect(firstPage().classList.contains("Device16x9Portrait")).toBe(true);

        rerender(<BloomPlayerCore {...props} landscape={true} />);
        await waitFor(() => {
            expect(firstPage().classList.contains("Device16x9Landscape")).toBe(
                true,
            );
        }, kAfterStartupTimeout);

        rerender(<BloomPlayerCore {...props} landscape={false} />);
        await waitFor(() => {
            expect(firstPage().classList.contains("Device16x9Portrait")).toBe(
                true,
            );
        }, kAfterStartupTimeout);
    });

    it("disables the navigation buttons when hideSwiperButtons is set", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const { container } = render(
            <BloomPlayerCore {...defaultProps()} hideSwiperButtons={true} />,
        );
        await waitForStartupToComplete(container);
        // hideSwiperButtons works by adding the disabled class (css hides it)
        // to both buttons regardless of position in the book.
        expect(
            container.querySelector(
                ".swiper-button-next.swiper-button-disabled",
            ),
        ).not.toBeNull();
        expect(
            container.querySelector(
                ".swiper-button-prev.swiper-button-disabled",
            ),
        ).not.toBeNull();
    });
});

describe("BloomPlayerCore right-to-left books", () => {
    it("puts swiper in RTL mode and reports isRtl for an RTL book", async () => {
        serveTestBook(
            mockedGet,
            makeTestBookHtml(),
            makeTestBookMetaData({ isRtl: true }),
        );
        const reportBookProperties = vi.fn();
        const { container } = render(
            <BloomPlayerCore
                {...defaultProps()}
                reportBookProperties={reportBookProperties}
            />,
        );
        await waitForStartupToComplete(container);
        // The RTL kluges in render() set dir="rtl" on the swiper container.
        expect(
            container.querySelector('.swiper-container[dir="rtl"]'),
        ).not.toBeNull();
        expect(reportBookProperties.mock.calls[0][0].isRtl).toBe(true);
    });
});

describe("BloomPlayerCore activity pages", () => {
    const bookWithActivityPage = () =>
        makeTestBookHtml({
            pages: [
                makeTestPage({
                    id: "cover-page-guid",
                    classes: "bloom-frontMatter frontCover",
                    text: { en: "Test Book Title" },
                }),
                makeTestPage({
                    id: "activity-page-guid",
                    pageNumber: "1",
                    classes: "bloom-interactive-page",
                    text: { en: "Activity page text" },
                }),
                makeTestPage({
                    id: "last-page-guid",
                    pageNumber: "2",
                    text: { en: "Last page text" },
                }),
            ],
        });

    it("includes activity pages by default", async () => {
        serveTestBook(mockedGet, bookWithActivityPage());
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);
        await waitForStartupToComplete(container);
        expect(container.querySelectorAll(".swiper-slide").length).toBe(3);
        expect(container.textContent).toContain("Activity page text");
    });

    it("omits activity pages when skipActivities is set", async () => {
        serveTestBook(mockedGet, bookWithActivityPage());
        const { container } = render(
            <BloomPlayerCore {...defaultProps()} skipActivities={true} />,
        );
        await waitForStartupToComplete(container);
        expect(container.querySelectorAll(".swiper-slide").length).toBe(2);
        expect(container.textContent).not.toContain("Activity page text");
    });

    it("generates quiz pages from a legacy questions.json", async () => {
        // Keep the book to two pages so the quiz page (inserted just before the
        // back matter, i.e. at index 1) is close enough to the first page to get
        // real content rather than a lazy placeholder.
        const html = makeTestBookHtml({
            pages: [
                makeTestPage({
                    id: "cover-page-guid",
                    classes: "bloom-frontMatter frontCover",
                    text: { en: "Test Book Title" },
                }),
                makeTestPage({
                    id: "back-matter-guid",
                    classes: "bloom-backMatter",
                    text: { en: "The end" },
                }),
            ],
        });
        serveTestBook(mockedGet, html, makeTestBookMetaData(), {
            "questions.json": [
                {
                    lang: "en",
                    questions: [
                        {
                            question: "What color is the sky?",
                            answers: [
                                { text: "Blue", correct: true },
                                { text: "Green", correct: false },
                            ],
                        },
                    ],
                },
            ],
        });
        const { container } = render(<BloomPlayerCore {...defaultProps()} />);
        await waitForStartupToComplete(container);
        // cover, generated quiz page, back matter
        expect(container.querySelectorAll(".swiper-slide").length).toBe(3);
        const quizPage = container.querySelector(".simple-comprehension-quiz");
        expect(quizPage).not.toBeNull();
        expect(quizPage!.textContent).toContain("What color is the sky?");
        expect(quizPage!.textContent).toContain("Blue");
    });
});

describe("BloomPlayerCore forced-pause reporting (BL-8864)", () => {
    it("reports forced pause when play fails, and clears it when unblocked", async () => {
        serveTestBook(mockedGet, makeTestBookHtml());
        const setForcedPausedCallback = vi.fn();
        const { container } = render(
            <BloomPlayerCore
                {...defaultProps()}
                setForcedPausedCallback={setForcedPausedCallback}
            />,
        );
        await waitForStartupToComplete(container);

        // Narration raises this when the browser blocks playback (e.g. no
        // user interaction yet).
        act(() => PlayFailed.raise());
        expect(setForcedPausedCallback).toHaveBeenLastCalledWith(true);

        // ...and this once playback is possible again.
        act(() => PlayUnblocked.raise());
        expect(setForcedPausedCallback).toHaveBeenLastCalledWith(false);
    });
});

describe("BloomPlayerCore current-player registry", () => {
    it("registers on mount and unregisters on unmount", async () => {
        const { getCurrentPlayer } = await import("./currentPlayer");
        serveTestBook(mockedGet, makeTestBookHtml());
        const { container, unmount } = render(
            <BloomPlayerCore {...defaultProps()} />,
        );
        await waitForStartupToComplete(container);
        expect(getCurrentPlayer()).toBeDefined();
        unmount();
        expect(getCurrentPlayer()).toBeUndefined();
    });
});

// Note on coverage limits: props.reportPageProperties (and the other side effects
// of showingPage's deferred block, like starting narration) cannot be tested in
// jsdom at all: they read the page via swiper's internal `slides` collection,
// which stays empty in jsdom because Swiper 4's layout math needs real geometry.
// Those behaviors belong to the e2e suite (see E2E-TESTING-PLAN.md).
