/**
 * Integration tests for the analytics reporting layer: externalContext.ts
 * (channel routing, ambient property merging, host whitelisting) together
 * with bloomPlayerAnalytics.tsx (the segment queue, the pending "Pages Read"
 * report, the read-to-the-end gate, the beforeunload flush).
 *
 * These modules hold per-book-session state at module level (ambient
 * properties, pendingBookAnalytics, allPagesRead), matching a real book
 * session's document lifetime. Each test therefore imports them freshly
 * (vi.resetModules) with the url arranged first, exactly as a real document
 * load would, and observes them only at their outward boundaries: the
 * window.analytics segment queue and the messages a host receives.
 */

// The segment snippet queue: entries are arrays like ["track", event, params].
function segmentTrackCalls(): { event: string; params: any }[] {
    return ((window as any).analytics as any[][])
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

// Arranges the document the way a real player load with this query string
// would see it, then imports a fresh copy of the reporting modules.
async function loadReportingModules(search: string) {
    window.history.replaceState(null, "", "/" + search);
    // Let the segment snippet re-create its queue for this "document".
    delete (window as any).analytics;
    window.onbeforeunload = null;
    localStorage.clear();
    vi.resetModules();
    return await import("./externalContext");
}

afterEach(() => {
    delete (window as any).ParentProxy;
    window.history.replaceState(null, "", "/");
});

describe("analytics event routing (reportAnalytics)", () => {
    it("independent mode (default): tracks to segment with ambient properties merged in", async () => {
        const { reportAnalytics, setAmbientAnalyticsProperties } =
            await loadReportingModules("");

        setAmbientAnalyticsProperties({
            title: "Ambient Title",
            sessionId: "session-1",
        });
        reportAnalytics("comprehension", {
            possiblePoints: 2,
            actualPoints: 1,
            percentRight: 50,
        });

        const tracked = segmentTrackCalls();
        expect(tracked.length).toBe(1);
        expect(tracked[0].event).toBe("comprehension");
        expect(tracked[0].params).toEqual({
            title: "Ambient Title",
            sessionId: "session-1",
            possiblePoints: 2,
            actualPoints: 1,
            percentRight: 50,
        });
    });

    it("independent=false: sends a sendAnalytics message to the host and nothing to segment", async () => {
        const { reportAnalytics, setAmbientAnalyticsProperties } =
            await loadReportingModules("?independent=false&host=bloomreader");
        const hostMessages = installHostThatReceivesMessages();

        setAmbientAnalyticsProperties({ title: "Ambient Title" });
        reportAnalytics("comprehension", { percentRight: 100 });

        expect(hostMessages).toEqual([
            {
                messageType: "sendAnalytics",
                event: "comprehension",
                params: { title: "Ambient Title", percentRight: 100 },
            },
        ]);
        expect(segmentTrackCalls()).toEqual([]);
    });

    it("independent=false without ParentProxy: posts the message to the parent window (iframe hosts)", async () => {
        const { reportAnalytics } = await loadReportingModules(
            "?independent=false",
        );
        // In jsdom, window.parent is window itself, so we can observe the
        // postMessage a real iframe host (BloomLibrary) would receive.
        const received: string[] = [];
        const listener = (event: MessageEvent) => {
            received.push(String(event.data));
        };
        window.addEventListener("message", listener);
        try {
            reportAnalytics("comprehension", { percentRight: 100 });
            await vi.waitFor(() => {
                expect(received.length).toBeGreaterThan(0);
            });
            const message = JSON.parse(received[0]);
            expect(message.messageType).toBe("sendAnalytics");
            expect(message.event).toBe("comprehension");
        } finally {
            window.removeEventListener("message", listener);
        }
    });
});

describe("book progress ('Pages Read') reporting, independent mode", () => {
    it("holds the report while reading, then flushes it (once) if the document unloads part-way", async () => {
        const { updateBookProgressReport, setAmbientAnalyticsProperties } =
            await loadReportingModules("");

        setAmbientAnalyticsProperties({ sessionId: "session-1" });
        updateBookProgressReport("Pages Read", {
            audioPages: 0,
            nonAudioPages: 1,
            lastNumberedPageRead: false,
        });
        updateBookProgressReport("Pages Read", {
            audioPages: 0,
            nonAudioPages: 2,
            lastNumberedPageRead: false,
        });

        // Nothing is sent while the reader is still reading...
        expect(segmentTrackCalls()).toEqual([]);

        // ...but quitting part-way sends the latest state. The module wires
        // the flush to window.onbeforeunload at load time; invoke it the way
        // the browser would on unload. (vitest's jsdom does not deliver a
        // dispatched "beforeunload" Event to on-property handlers, so we call
        // the registered handler directly.)
        // Note this pins only the flush *logic*; real-world delivery during
        // teardown is best-effort by design — see the comment on
        // finalAnalytics in bloomPlayerAnalytics.tsx.
        expect(typeof window.onbeforeunload).toBe("function");
        (window.onbeforeunload as any)(new Event("beforeunload"));
        let tracked = segmentTrackCalls();
        expect(tracked.length).toBe(1);
        expect(tracked[0].event).toBe("Pages Read");
        expect(tracked[0].params.nonAudioPages).toBe(2);
        expect(tracked[0].params.lastNumberedPageRead).toBe(false);
        expect(tracked[0].params.sessionId).toBe("session-1");

        // The flush clears the pending report: a second unload event (or a
        // host that fires beforeunload twice) must not double-report.
        (window.onbeforeunload as any)(new Event("beforeunload"));
        tracked = segmentTrackCalls();
        expect(tracked.length).toBe(1);
    });

    it("sends the report immediately when the last numbered page is read, and never again (BL-15851)", async () => {
        // Two caveats on the behavior pinned here, both acknowledged in the
        // "Important notes about analytics/session state and host lifecycle"
        // comment at the top of bloomPlayerAnalytics.tsx:
        // - the allPagesRead gate is module state living for the whole
        //   document, so if a host ever shows a second book without reloading
        //   (as /book/ link navigation does), the later book's "Pages Read"
        //   would be wrongly suppressed too. That cross-book behavior is a
        //   known open problem (BL-15851/BL-15852) and is deliberately NOT
        //   asserted here — this test only pins suppression within one book
        //   session.
        // - "read" means the last numbered page *came up*, which the
        //   updateBookProgress comment admits may be before the reader
        //   actually read it.
        const { updateBookProgressReport } = await loadReportingModules("");

        updateBookProgressReport("Pages Read", {
            nonAudioPages: 3,
            lastNumberedPageRead: true,
        });

        let tracked = segmentTrackCalls();
        expect(tracked.length).toBe(1);
        expect(tracked[0].event).toBe("Pages Read");
        expect(tracked[0].params.lastNumberedPageRead).toBe(true);

        // Later progress updates in the same session are suppressed: the book
        // already got full credit, and re-reporting would double-count it.
        updateBookProgressReport("Pages Read", {
            nonAudioPages: 3,
            lastNumberedPageRead: true,
        });
        updateBookProgressReport("Pages Read", {
            nonAudioPages: 4,
            lastNumberedPageRead: false,
        });
        expect(segmentTrackCalls().length).toBe(1);

        // ...and unloading doesn't re-send it either.
        (window.onbeforeunload as any)(new Event("beforeunload"));
        expect(segmentTrackCalls().length).toBe(1);
    });
});

describe("book progress ('Pages Read') reporting, host mode", () => {
    it("forwards each update to the host, keeping readDuration for the bloomlibrary host", async () => {
        const { updateBookProgressReport, setAmbientAnalyticsProperties } =
            await loadReportingModules("?independent=false&host=bloomlibrary");
        const hostMessages = installHostThatReceivesMessages();

        setAmbientAnalyticsProperties({ sessionId: "session-1" });
        updateBookProgressReport("Pages Read", {
            audioPages: 2,
            readDuration: 12,
            lastNumberedPageRead: false,
        });

        expect(hostMessages.length).toBe(1);
        expect(hostMessages[0].messageType).toBe("updateBookProgressReport");
        expect(hostMessages[0].event).toBe("Pages Read");
        expect(hostMessages[0].params.audioPages).toBe(2);
        expect(hostMessages[0].params.readDuration).toBe(12);
        expect(hostMessages[0].params.sessionId).toBe("session-1");
        expect(segmentTrackCalls()).toEqual([]);
    });

    it("strips readDuration for other hosts, which track reading time themselves", async () => {
        const { updateBookProgressReport } = await loadReportingModules(
            "?independent=false&host=bloomreader",
        );
        const hostMessages = installHostThatReceivesMessages();

        updateBookProgressReport("Pages Read", {
            audioPages: 2,
            readDuration: 12,
            lastNumberedPageRead: false,
        });

        expect(hostMessages.length).toBe(1);
        expect("readDuration" in hostMessages[0].params).toBe(false);
        expect(hostMessages[0].params.audioPages).toBe(2);
    });
});
