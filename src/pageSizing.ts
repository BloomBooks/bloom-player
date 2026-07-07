// Page size class computation, extracted from BloomPlayerCore statics as part
// of the react modernization (Phase 1).

export function getPageSizeClass(page: Element): string {
    const classAttr = page.getAttribute("class") || "";
    const matches = classAttr.match(/\b\S*?(Portrait|Landscape)\b/);
    if (matches && matches.length) {
        return matches[0];
    } else {
        return "";
    }
}

// Force size class to be one of the device classes
// return true if we determine that the book is landscape
export function setPageSizeClass(
    page: Element,
    bookCanRotate: boolean,
    showLandscape: boolean,
    useOriginalPageSize: boolean,
    originalPageClass: string,
): boolean {
    let landscape = false;
    const sizeClass = getPageSizeClass(page);
    if (sizeClass) {
        landscape = bookCanRotate
            ? showLandscape
            : (sizeClass as any).endsWith("Landscape");

        let desiredClass = "";
        if (useOriginalPageSize) {
            desiredClass = landscape
                ? originalPageClass.replace("Portrait", "Landscape")
                : originalPageClass.replace("Landscape", "Portrait");
        } else {
            desiredClass = landscape
                ? "Device16x9Landscape"
                : "Device16x9Portrait";
        }
        if (sizeClass !== desiredClass) {
            page.classList.remove(sizeClass);
            page.classList.add(desiredClass);
        }
    }
    return landscape;
}
