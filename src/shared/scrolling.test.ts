import { afterEach, describe, expect, test, vi } from "vitest";
import {
    addScrollbarsToPage,
    unusedParagraphBelowLastTable,
} from "./scrolling";

const kTable = '<div class="bloom-table bloom-tableInText"></div>';

function makeBox(html: string): HTMLElement {
    document.body.innerHTML = `<div class="bloom-page"><div class="bloom-translationGroup"><div class="bloom-editable bloom-visibility-code-on">${html}</div></div></div>`;
    return document.querySelector<HTMLElement>(".bloom-editable")!;
}

describe("unusedParagraphBelowLastTable", () => {
    test("finds an empty paragraph that ends the text right after a table", () => {
        const box = makeBox(`<p>Words.</p>${kTable}<p><br></p>`);
        expect(unusedParagraphBelowLastTable(box)).toBe(box.lastElementChild);
    });

    test("finds nothing when something has been typed below the table", () => {
        const box = makeBox(`<p>Words.</p>${kTable}<p>Typed.</p>`);
        expect(unusedParagraphBelowLastTable(box)).toBeUndefined();
    });

    test("finds nothing when the empty paragraph does not follow a table", () => {
        const box = makeBox(`<p>Words.</p><p><br></p>`);
        expect(unusedParagraphBelowLastTable(box)).toBeUndefined();
    });
});

describe("which children addScrollbarsToPage checks", () => {
    // jsdom has no IntersectionObserver, so record what each observer is asked to watch.
    let observed: Element[] = [];
    class FakeIntersectionObserver {
        public observe(target: Element) {
            observed.push(target);
        }
        public unobserve() {}
        public disconnect() {}
    }

    function childrenChecked(box: HTMLElement): string[] {
        observed = [];
        vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
        addScrollbarsToPage(box.closest(".bloom-page")!);
        return observed.map((element) =>
            element.classList.contains("bloom-tableInText")
                ? "[table]"
                : `${element.tagName}:${element.textContent}`,
        );
    }

    afterEach(() => vi.unstubAllGlobals());

    test("checks the table, not the empty paragraph below it", () => {
        const box = makeBox(`<p>Words.</p>${kTable}<p><br></p>`);
        expect(childrenChecked(box)).toEqual(["P:Words.", "[table]"]);
    });

    test("checks a paragraph below a table once something is typed in it", () => {
        const box = makeBox(`<p>Words.</p>${kTable}<p>Typed.</p>`);
        expect(childrenChecked(box)).toEqual(["P:Words.", "P:Typed."]);
    });
});
