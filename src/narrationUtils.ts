export interface ISetHighlightParams {
    newElement: Element;
    shouldScrollToElement: boolean;
    disableHighlightIfNoAudio?: boolean;
    oldElement?: Element | null | undefined; // Optional. Provides some minor optimization if set.
}

// We need to sort these by the tabindex of the containing bloom-translationGroup element.
// We need a stable sort, which array.sort() does not provide: elements in the same
// bloom-translationGroup, or where the translationGroup does not have a tabindex,
// should remain in their current order.
// This function was extracted from the narration.ts file for testing:
// I was not able to import the narration file into the test suite because
// MutationObserver is not emulated in the test environment.
// It's not obvious what should happen to TGs with no tabindex when others have it.
// At this point we're going with the approach that no tabindex is equivalent to tabindex 999.
// This should cause text with no tabindex to sort to the bottom, if other text has a tabindex;
// It should also not affect order in situations where no text has a tabindex
// (An earlier algorithm attempted to preserve document order for the no-tab-index case
// by comparing any two elements using document order if either lacks tabindex.
// This works well for many cases, but if there's a no-tabindex element between two
// that get re-ordered (e.g., ABCDEF where the only tabindexes are C=2 and E=1),
// the function is not transitive (e.g. C < D < E but E < C) which will produce
// unpredictable results.
export function sortAudioElements(input: HTMLElement[]): HTMLElement[] {
    const keyedItems = input.map((item, index) => {
        return { tabindex: getTgTabIndex(item), index, item };
    });
    keyedItems.sort((x, y) => {
        // If either is not in a translation group with a tabindex,
        // order is determined by their original index.
        // Likewise if the tabindexes are the same.
        if (!x.tabindex || !y.tabindex || x.tabindex === y.tabindex) {
            return x.index - y.index;
        }
        // Otherwise, determined by the numerical order of tab indexes.
        return parseInt(x.tabindex, 10) - parseInt(y.tabindex, 10);
    });
    return keyedItems.map(x => x.item);
}

function getTgTabIndex(input: HTMLElement): string | null {
    let tg: HTMLElement | null = input;
    while (tg && !tg.classList.contains("bloom-translationGroup")) {
        tg = tg.parentElement;
    }
    if (!tg) {
        return "999";
    }
    return tg.getAttribute("tabindex") || "999";
}
