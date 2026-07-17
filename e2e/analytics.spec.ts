import { test, expect, Page, FrameLocator } from "@playwright/test";

// Analytics regression tests, real-browser level.
//
// Analytics leaves bloom-player over two different channels, chosen by the
// `independent` url parameter (default true):
//  - host channel: JSON messages posted to the surrounding app. Covered here
//    by hosting the player in an iframe (e2e/fixtures/analytics-host.html)
//    exactly the way BloomLibrary does, and reading the captured messages.
//  - internal channel: straight to segment.io via the window.analytics
//    snippet. Covered here by blocking the segment script (which must never
//    load in tests anyway) so that events stay in the snippet's queue — the
//    very queue the segment script would drain on load.
//
// Unlike the component-level tests (src/analytics.test.tsx), these exercise
// the page-turn analytics that jsdom cannot reach: bookInteraction pageShown
// counts and lastNumberedPageRead come from real swiper page turns.

const kTarget1Book = "/testBooks/multibook-target1/index.htm";
const kTarget1InstanceId = "2c1b71ac-f399-446d-8398-e61a8efd4e83";
const kQuizBook = "/testBooks/sample-dom-activity/Simple Activities.htm";

function playerUrl(bookUrl: string, params: Record<string, string>): string {
    const query = new URLSearchParams({ url: bookUrl, ...params });
    return `/bloomplayer.htm?${query.toString()}`;
}

// Loads the player inside the message-capturing host page.
async function gotoHostedPlayer(
    page: Page,
    bookUrl: string,
    params: Record<string, string>,
): Promise<FrameLocator> {
    await page.goto(
        "/analytics-host.html?player=" +
            encodeURIComponent(playerUrl(bookUrl, params)),
    );
    const frame = page.frameLocator("#player");
    await expect(frame.locator(".swiper-slide-active .bloom-page")).toBeVisible();
    // Wait out the player's 500ms post-load stabilization window (see
    // PlayerPage.waitForPlayerToSettle); its last act shows the start page,
    // which produces the first book-progress update.
    await page.waitForTimeout(800);
    return frame;
}

async function messagesFromPlayer(page: Page): Promise<any[]> {
    const raw = await page.evaluate(
        () => (window as any).__messagesFromPlayer as string[],
    );
    return raw.map((message) => {
        try {
            return JSON.parse(message);
        } catch {
            return {};
        }
    });
}

async function analyticsEventsSentToHost(page: Page): Promise<any[]> {
    return (await messagesFromPlayer(page)).filter(
        (m) => m.messageType === "sendAnalytics",
    );
}

async function latestProgressReportToHost(
    page: Page,
): Promise<any | undefined> {
    const reports = (await messagesFromPlayer(page)).filter(
        (m) => m.messageType === "updateBookProgressReport",
    );
    return reports[reports.length - 1];
}

// Turns pages until the latest progress report says the last numbered page
// was read (or we run out of pages/attempts).
async function readToTheLastNumberedPage(page: Page, frame: FrameLocator) {
    const nextButton = frame.locator(".swiper-button-next");
    for (let i = 0; i < 10; i++) {
        const report = await latestProgressReportToHost(page);
        if (report?.params?.lastNumberedPageRead) {
            return;
        }
        if (
            await nextButton.evaluate((element) =>
                element.classList.contains("swiper-button-disabled"),
            )
        ) {
            return; // reached the end of the book
        }
        await nextButton.click();
        // the page-shown analytics update is deferred until after the turn
        await page.waitForTimeout(400);
    }
}

test.describe("analytics to a host (independent=false)", () => {
    test("reports BookOrShelf opened with ambient book properties", async ({
        page,
    }) => {
        await gotoHostedPlayer(page, kTarget1Book, {
            independent: "false",
            host: "bloomlibrary",
        });

        await expect
            .poll(async () =>
                (await analyticsEventsSentToHost(page)).map((m) => m.event),
            )
            .toContain("BookOrShelf opened");

        const opened = (await analyticsEventsSentToHost(page)).filter(
            (m) => m.event === "BookOrShelf opened",
        );
        expect(opened.length).toBe(1); // once per book open
        const params = opened[0].params;
        expect(params.bookInstanceId).toBe(kTarget1InstanceId);
        expect(params.title).toBe("multibook-target1");
        expect(params.totalNumberedPages).toBe(1);
        expect(params.contentLang).toBe("en");
        expect(params.host).toBe("bloomlibrary");
        expect(typeof params.sessionId).toBe("string");
    });

    test("updates the Pages Read progress report as pages are shown, through to the end", async ({
        page,
    }) => {
        const frame = await gotoHostedPlayer(page, kTarget1Book, {
            independent: "false",
            host: "bloomlibrary",
        });

        // Showing the start page (front cover, xmatter) already produces a
        // progress update, with nothing counted as read yet.
        await expect
            .poll(async () => (await latestProgressReportToHost(page))?.event)
            .toBe("Pages Read");
        const initial = await latestProgressReportToHost(page);
        expect(initial.params.audioPages).toBe(0);
        expect(initial.params.nonAudioPages).toBe(0);
        expect(initial.params.lastNumberedPageRead).toBe(false);
        // ambient properties ride along on progress reports
        expect(initial.params.bookInstanceId).toBe(kTarget1InstanceId);

        await readToTheLastNumberedPage(page, frame);

        // "read" = the page came up; see the credited-on-arrival note on the
        // "tracks Pages Read the moment..." test below.
        await expect
            .poll(
                async () =>
                    (await latestProgressReportToHost(page))?.params
                        ?.lastNumberedPageRead,
            )
            .toBe(true);
        const final = await latestProgressReportToHost(page);
        // this book has one numbered page, without audio or video
        expect(final.params.nonAudioPages).toBe(1);
        expect(final.params.audioPages).toBe(0);
        expect(final.params.videoPages).toBe(0);
        // the bloomlibrary host is allowed to receive readDuration
        expect(typeof final.params.readDuration).toBe("number");
    });

    test("strips readDuration from progress reports to hosts other than bloomlibrary", async ({
        page,
    }) => {
        await gotoHostedPlayer(page, kTarget1Book, {
            independent: "false",
            host: "bloomreader",
        });

        await expect
            .poll(async () => (await latestProgressReportToHost(page))?.event)
            .toBe("Pages Read");
        const report = await latestProgressReportToHost(page);
        expect("readDuration" in report.params).toBe(false);
        expect(report.params.host).toBe("bloomreader");
    });

    test("reports a comprehension score once every quiz page has been answered", async ({
        page,
    }) => {
        const frame = await gotoHostedPlayer(page, kQuizBook, {
            independent: "false",
            host: "bloomreader",
        });

        // The comprehension analytics group in this book is four checkbox-quiz
        // pages: two authored in the html (one new-style, one Bloom 4.6
        // legacy) and two the player generates from the legacy
        // questions.json. The score must only be reported once ALL of them
        // have been answered, as one combined event.
        //
        // QUESTIONABLE (pinned as-is): the group is all-or-nothing. A reader
        // who answers three of the four pages and quits reports NO
        // comprehension analytics at all — there is no partial-score flush on
        // unload the way "Pages Read" has. The header comment in page-api.ts
        // acknowledges this ("We don't currently have a way to tell the page
        // 'this is your last chance to report a score'"). If a partial flush
        // is ever added, the mid-way assertion below (no event after the
        // first answers) still holds for normal reading, but quit-time
        // behavior would need new coverage.
        const comprehensionEvents = async () =>
            (await analyticsEventsSentToHost(page)).filter(
                (m) => m.event === "comprehension",
            );
        const correctAnswerOnCurrentPage = () =>
            frame.locator(
                ".swiper-slide-active .checkbox-and-textbox-choice.correct-answer",
            );

        const kQuizPageCount = 4;
        let answered = 0;
        for (let i = 0; i < 10 && answered < kQuizPageCount; i++) {
            if ((await correctAnswerOnCurrentPage().count()) > 0) {
                if (answered === kQuizPageCount - 1) {
                    // Nothing may be reported while any quiz page is
                    // still unanswered.
                    expect(await comprehensionEvents()).toEqual([]);
                }
                await correctAnswerOnCurrentPage().click();
                answered++;
                await page.waitForTimeout(200);
            }
            if (answered < kQuizPageCount) {
                await frame.locator(".swiper-button-next").click();
                await page.waitForTimeout(300);
            }
        }
        expect(answered).toBe(kQuizPageCount);

        await expect
            .poll(async () =>
                (await analyticsEventsSentToHost(page)).map((m) => m.event),
            )
            .toContain("comprehension");
        const comprehension = await comprehensionEvents();
        expect(comprehension.length).toBe(1);
        expect(comprehension[0].params.possiblePoints).toBe(4);
        expect(comprehension[0].params.actualPoints).toBe(4);
        expect(comprehension[0].params.percentRight).toBe(100);
        // ambient properties ride along, including the question count
        expect(comprehension[0].params.questionCount).toBe(4);

        // Trying again must not report a second time.
        await correctAnswerOnCurrentPage().click();
        await page.waitForTimeout(300);
        expect((await comprehensionEvents()).length).toBe(1);
    });
});

test.describe("analytics sent internally to segment.io (independent)", () => {
    test.beforeEach(async ({ page }) => {
        // The player must never talk to the real analytics endpoint from
        // tests. With the script blocked, events stay in the window.analytics
        // snippet queue, where we can observe exactly what would be sent.
        await page.route("**/analytics*.min.js", (route) => route.abort());
    });

    function trackedEvents(page: Page): Promise<{ event: string; params: any }[]> {
        return page.evaluate(() =>
            ((window as any).analytics as any[])
                .filter((entry) => Array.isArray(entry) && entry[0] === "track")
                .map((entry) => ({ event: entry[1], params: entry[2] })),
        );
    }

    test("queues BookOrShelf opened with ambient book properties", async ({
        page,
    }) => {
        await page.goto(playerUrl(kTarget1Book, {}));
        await expect(
            page.locator(".swiper-slide-active .bloom-page"),
        ).toBeVisible();

        await expect
            .poll(async () => (await trackedEvents(page)).map((e) => e.event))
            .toContain("BookOrShelf opened");
        const opened = (await trackedEvents(page)).find(
            (e) => e.event === "BookOrShelf opened",
        )!;
        expect(opened.params.bookInstanceId).toBe(kTarget1InstanceId);
        expect(opened.params.totalNumberedPages).toBe(1);
        // no host= param and we're on localhost, which reports as "testing"
        expect(opened.params.host).toBe("testing");
    });

    test("tracks Pages Read the moment the last numbered page is reached", async ({
        page,
    }) => {
        // "the moment ... reached" is deliberate wording: full read-to-the-
        // end credit is given as soon as the last numbered page comes up,
        // even if the reader swiped straight to it without reading anything.
        // The updateBookProgress comment in bloomPlayerAnalytics.tsx admits
        // this ("even though this might be sent before the reader has
        // actually read the page in real time"). Pinned as-is; it is policy,
        // if a debatable one.
        await page.goto(playerUrl(kTarget1Book, {}));
        await expect(
            page.locator(".swiper-slide-active .bloom-page"),
        ).toBeVisible();
        await page.waitForTimeout(800); // startup stabilization window

        const nextButton = page.locator(".swiper-button-next");
        for (let i = 0; i < 10; i++) {
            const done = (await trackedEvents(page)).some(
                (e) => e.event === "Pages Read",
            );
            if (done) break;
            if (
                await nextButton.evaluate((element) =>
                    element.classList.contains("swiper-button-disabled"),
                )
            ) {
                break;
            }
            await nextButton.click();
            await page.waitForTimeout(400);
        }

        await expect
            .poll(async () => (await trackedEvents(page)).map((e) => e.event))
            .toContain("Pages Read");
        const pagesRead = (await trackedEvents(page)).filter(
            (e) => e.event === "Pages Read",
        );
        // sent exactly once, the moment the last numbered page came up
        expect(pagesRead.length).toBe(1);
        expect(pagesRead[0].params.lastNumberedPageRead).toBe(true);
        expect(pagesRead[0].params.nonAudioPages).toBe(1);
        expect(pagesRead[0].params.bookInstanceId).toBe(kTarget1InstanceId);
    });

    test("flushes a partial-read Pages Read report when the document unloads", async ({
        page,
    }) => {
        await page.goto(playerUrl(kTarget1Book, {}));
        await expect(
            page.locator(".swiper-slide-active .bloom-page"),
        ).toBeVisible();
        await page.waitForTimeout(800); // startup stabilization window

        // Still on the cover: the progress report is pending, not sent.
        expect(
            (await trackedEvents(page)).filter((e) => e.event === "Pages Read"),
        ).toEqual([]);

        // Leaving the book part-way flushes the pending report.
        await page.evaluate(() =>
            window.dispatchEvent(new Event("beforeunload")),
        );

        // QUESTIONABLE (pinned as-is): the reader only ever saw the cover,
        // yet this still emits a "Pages Read" event — with every count at
        // zero. Arguably useful as an "opened but not read" signal, but the
        // event name oversells it, and consumers of the analytics data need
        // to know zero-page "Pages Read" events exist.
        const pagesRead = (await trackedEvents(page)).filter(
            (e) => e.event === "Pages Read",
        );
        expect(pagesRead.length).toBe(1);
        expect(pagesRead[0].params.lastNumberedPageRead).toBe(false);
        expect(pagesRead[0].params.audioPages).toBe(0);
        expect(pagesRead[0].params.nonAudioPages).toBe(0);
    });
});
