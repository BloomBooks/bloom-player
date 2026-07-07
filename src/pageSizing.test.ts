import { getPageSizeClass, setPageSizeClass } from "./pageSizing";

function makePage(classes: string): Element {
    const page = document.createElement("div");
    page.setAttribute("class", classes);
    return page;
}

describe("getPageSizeClass", () => {
    it("finds the size class among other classes", () => {
        expect(
            getPageSizeClass(makePage("bloom-page A5Portrait side-right")),
        ).toBe("A5Portrait");
        expect(
            getPageSizeClass(makePage("bloom-page Device16x9Landscape")),
        ).toBe("Device16x9Landscape");
    });

    it("returns empty string when there is no size class", () => {
        expect(getPageSizeClass(makePage("bloom-page side-right"))).toBe("");
    });
});

describe("setPageSizeClass", () => {
    it("gives a rotatable book the device class for the requested orientation", () => {
        const page = makePage("bloom-page A5Portrait");
        const landscape = setPageSizeClass(
            page,
            /* bookCanRotate */ true,
            /* showLandscape */ true,
            /* useOriginalPageSize */ false,
            "A5Portrait",
        );
        expect(landscape).toBe(true);
        expect(page.classList.contains("Device16x9Landscape")).toBe(true);
        expect(page.classList.contains("A5Portrait")).toBe(false);
    });

    it("ignores the requested orientation when the book cannot rotate", () => {
        // This is the rule that makes the landscape prop a no-op for most books:
        // orientation follows the book's own size class unless it canRotate.
        const page = makePage("bloom-page A5Portrait");
        const landscape = setPageSizeClass(page, false, true, false, "A5Portrait");
        expect(landscape).toBe(false);
        expect(page.classList.contains("Device16x9Portrait")).toBe(true);
    });

    it("keeps the original page size when useOriginalPageSize is set", () => {
        const page = makePage("bloom-page A5Portrait");
        setPageSizeClass(page, true, true, true, "A5Portrait");
        expect(page.classList.contains("A5Landscape")).toBe(true);
        expect(page.classList.contains("Device16x9Landscape")).toBe(false);
    });

    it("leaves a page without a size class untouched", () => {
        const page = makePage("bloom-page");
        const landscape = setPageSizeClass(page, true, true, false, "A5Portrait");
        expect(landscape).toBe(false);
        expect(page.getAttribute("class")).toBe("bloom-page");
    });
});
