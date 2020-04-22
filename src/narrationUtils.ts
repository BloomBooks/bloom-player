// We need to sort these by the tabindex of the containing bloom-translationGroup element.
// We need a stable sort, which array.sort() does not provide: elements in the same
// bloom-translationGroup, or where the translationGroup does not have a tabindex,
// should remain in their current order.
// This function was extracted from the narration.ts file for testing:
// I was not able to import the narration file into the test suite because
// MutationObserver is not emulated in the test environment.
// It's not obvious what should happen to TGs with no tabindex when others have it.
// Currently, in Bloom, new text-over-picture elements get added at the start of the parent
// div and thus come first in document order; Bloom Desktop playback keeps them before
// ones that have a tabindex.
// It's a case that probably won't occur. Hopefully Bloom will soon be improved to
// give every translationGroup a sensible tabindex. So we're going with a simple
// approach: no tabindex is equivalent to tabindex zero.
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
        return "0";
    }
    return tg.getAttribute("tabindex") || "0";
}
