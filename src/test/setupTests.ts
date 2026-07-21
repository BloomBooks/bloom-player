// Runs before each test file (see vitest.config.ts setupFiles).

// The segment analytics snippet in bloomPlayerAnalytics.tsx runs at module-import
// time and inserts its script tag before the first <script> of the document. In a
// real browser there is always at least one (the app's own bundle); in jsdom there
// are none, so give it one to keep that module importable in tests.
if (document.getElementsByTagName("script").length === 0) {
    document.head.appendChild(document.createElement("script"));
}

// jsdom does not implement ResizeObserver, which swiper uses to track its
// container size. A no-op suffices: there is no layout in jsdom anyway.
if (typeof window.ResizeObserver === "undefined") {
    (window as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// jsdom does not implement innerText (it would require layout). Several code
// paths (langData.ts, stylesheets.ts) read it, so approximate it with
// textContent, which is equivalent for the simple content our fixtures use.
const innerTextProbe = document.createElement("div");
innerTextProbe.textContent = "probe";
if (innerTextProbe.innerText === undefined) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
        get(this: HTMLElement) {
            return this.textContent;
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        },
        configurable: true,
    });
}

// jsdom does not implement HTMLMediaElement playback methods (load/play/pause);
// calling them emits "Not implemented: HTMLMediaElement.prototype.<x>" errors on
// the virtual console (they don't throw, so tests still pass). Our activity,
// narration, and music code legitimately calls these, so stub them as no-ops to
// keep the test output clean and let real errors stand out. play() returns a
// resolved Promise to match the real API, which several call sites await.
Object.defineProperties(HTMLMediaElement.prototype, {
    load: { configurable: true, value: () => {} },
    pause: { configurable: true, value: () => {} },
    play: { configurable: true, value: () => Promise.resolve() },
});
