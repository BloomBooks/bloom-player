import { updateDivVisibilityByLangCode } from "./langVisibility";

// The book's languages: "en" is its first (vernacular) language, "fr" its second.
// "es" is another language the book has, which the reader may choose.
const kBookLanguages = ["en", "fr", "es"];

// Makes a translation group with the given data-default-languages and one bloom-editable
// for each of en, fr and es. As Bloom desktop would, it marks the en box as the visible
// first language and the fr box as the visible national language; es is not visible.
function makeBook(defaultLanguages: string): HTMLHtmlElement {
    const doc = document.implementation.createHTMLDocument("test");
    doc.body.innerHTML = `<div class="bloom-page">
    <div class="bloom-translationGroup" data-default-languages="${defaultLanguages}">
        <div class="bloom-editable bloom-content1 bloom-visibility-code-on" lang="en">English</div>
        <div class="bloom-editable bloom-contentNational1 bloom-visibility-code-on" lang="fr">French</div>
        <div class="bloom-editable" lang="es">Spanish</div>
    </div>
</div>`;
    return doc.documentElement as HTMLHtmlElement;
}

function editable(html: HTMLHtmlElement, lang: string): HTMLElement {
    const result = html.querySelector(
        `.bloom-editable[lang="${lang}"]`,
    ) as HTMLElement | null;
    if (!result) {
        throw new Error(`test book has no bloom-editable in ${lang}`);
    }
    return result;
}

function isVisible(html: HTMLHtmlElement, lang: string): boolean {
    return editable(html, lang).classList.contains("bloom-visibility-code-on");
}

// The classes of each of the book's boxes, in kBookLanguages order.
function classesOf(html: HTMLHtmlElement): string[] {
    return kBookLanguages.map((lang) => editable(html, lang).className);
}

// Checks the book is as makeBook built it, so a test can't pass because the data was wrong.
function expectBookAsBuilt(html: HTMLHtmlElement, defaultLanguages: string) {
    expect(
        html
            .querySelector(".bloom-translationGroup")!
            .getAttribute("data-default-languages"),
    ).toBe(defaultLanguages);
    expect(isVisible(html, "en")).toBe(true);
    expect(isVisible(html, "fr")).toBe(true);
    expect(isVisible(html, "es")).toBe(false);
}

describe("updateDivVisibilityByLangCode", () => {
    // V and CL1 must behave the same, so run each test for both.
    describe.each(["V", "CL1"])("a block marked %s", (role) => {
        it("keeps Bloom's classes when the book is shown in its first language", () => {
            const html = makeBook(role);
            expectBookAsBuilt(html, role);
            const originalClasses = classesOf(html);

            updateDivVisibilityByLangCode(html, "en", kBookLanguages, true);

            expect(classesOf(html)).toEqual(originalClasses);
        });

        it("shows only the chosen language when the reader picks another one", () => {
            const html = makeBook(role);
            expectBookAsBuilt(html, role);

            updateDivVisibilityByLangCode(html, "es", kBookLanguages, true);

            expect(isVisible(html, "es")).toBe(true);
            expect(isVisible(html, "en")).toBe(false);
            expect(isVisible(html, "fr")).toBe(false);
            // The chosen language is styled as the book's first language.
            expect(
                editable(html, "es").classList.contains("bloom-content1"),
            ).toBe(true);
        });

        it("goes back to Bloom's classes when the reader returns to the first language", () => {
            const html = makeBook(role);
            expectBookAsBuilt(html, role);
            const originalClasses = classesOf(html);
            updateDivVisibilityByLangCode(html, "es", kBookLanguages, true);
            expect(isVisible(html, "en")).toBe(false);

            updateDivVisibilityByLangCode(html, "en", kBookLanguages, false);

            expect(classesOf(html)).toEqual(originalClasses);
        });
    });

    // N1/N2 blocks keep the choices Bloom desktop made, whatever language the reader
    // picks; CL2/CL3 are synonyms of them, so they must do the same.
    describe.each(["N1", "N2", "CL2", "CL3"])("a block marked %s", (role) => {
        it("keeps Bloom's classes when the reader picks another language", () => {
            const html = makeBook(role);
            expectBookAsBuilt(html, role);
            const originalClasses = classesOf(html);

            updateDivVisibilityByLangCode(html, "es", kBookLanguages, true);

            expect(classesOf(html)).toEqual(originalClasses);
        });
    });
});
