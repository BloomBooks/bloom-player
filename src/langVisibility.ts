import { kLegacyCanvasElementSelector } from "./shared/dragActivityRuntime";

// Functions that adjust which language's content is visible in the book DOM
// when the active language changes. Extracted from BloomPlayerCore as part of
// the react modernization (Phase 1); they are pure DOM manipulation with no
// component state.

interface IAlternate {
    lang: string;
    style: string;
}

// If a book is displayed in some language other than the one it was primarily published in,
// We don't show the topic or the book language, because we are only able to display
// them in L1, and in fact the language would be wrong. So if the user changes languages,
// we hide the incorrect language and the topic. BL-11133.
//
// Don't be tempted to achieve this by returning conditionally created rules from assembleStyleSheets.
// That was our original implementation, but if state.styleRules gets set more than once for a book,
// it wreaks havoc on scoped styles. See BL-9504.
export function showOrHideL1OnlyText(page: Element, show: boolean) {
    page.querySelectorAll(
        ".coverBottomBookTopic, .coverBottomLangName",
    ).forEach((elementToShowOrHide) => {
        // bloom-content1 should never be hidden here, nor should anything if show is true.
        if (show || elementToShowOrHide.classList.contains("bloom-content1")) {
            elementToShowOrHide.classList.remove("do-not-display");
        } else {
            elementToShowOrHide.classList.add("do-not-display");
        }
    });
}

function getAllBloomCanvasElements(htmlElement: HTMLHtmlElement) {
    // (htmlElement is the root element of the book's document, so searching
    // from it is the same as searching its whole document.)
    const bloomCanvasElements =
        htmlElement.getElementsByClassName("bloom-canvas");
    if (bloomCanvasElements && bloomCanvasElements.length > 0)
        return Array.from(bloomCanvasElements);
    // older books use this class for canvas elements
    const unfilteredContainers =
        htmlElement.getElementsByClassName("bloom-imageContainer");
    return Array.from(unfilteredContainers).filter(
        (el: Element) =>
            el.parentElement!.closest(".bloom-imageContainer") === null,
    ) as HTMLElement[];
}

export function updateOverlayPositionsByLangCode(
    htmlElement: HTMLHtmlElement | undefined,
    activeLanguageCode: string,
): void {
    if (!activeLanguageCode || !htmlElement) {
        return; // shouldn't happen, just a precaution
    }
    try {
        const langVernacular = activeLanguageCode;
        getAllBloomCanvasElements(htmlElement).forEach((bloomCanvas) => {
            Array.from(
                bloomCanvas.querySelectorAll(kLegacyCanvasElementSelector),
            ).forEach((top) => {
                const editable = Array.from(
                    top.getElementsByClassName("bloom-editable"),
                ).find((e) => e.getAttribute("lang") === langVernacular);
                if (editable) {
                    const alternatesString = editable.getAttribute(
                        "data-bubble-alternate",
                    );
                    if (alternatesString) {
                        const alternate = JSON.parse(
                            alternatesString.replace(/`/g, '"'),
                        ) as IAlternate;
                        top.setAttribute("style", alternate.style);
                    }
                }
            });
            // If we have an alternate SVG for this language, activate it.
            const altSvg = Array.from(
                bloomCanvas.getElementsByClassName("comical-alternate"),
            ).find((svg) => svg.getAttribute("data-lang") === langVernacular);
            // if we don't find one, don't need to do anything.
            // Possibly this image container doesn't have overlays. Possibly
            // the right svg is already switched to be the active one. Possibly the
            // book was made by an older version of Bloom without multilingual overlay
            // support.
            if (altSvg) {
                const currentSvg =
                    bloomCanvas.getElementsByClassName("comical-generated")[0];
                if (currentSvg) {
                    // should always be true
                    // demote it to alternate
                    currentSvg.classList.remove("comical-generated");
                    currentSvg.classList.add("comical-alternate");
                    (currentSvg as HTMLElement).style.display = "none";
                }
                // and promote the alternate to live
                altSvg.classList.remove("comical-alternate");
                altSvg.classList.add("comical-generated");
                (altSvg as HTMLElement).style.removeProperty("display");
            }
        });
    } catch (ex) {
        // So, we can't position the bubbles just right. Shouldn't be too big a disaster.
        console.error(ex);
    }
}

function areStringsEqualInvariantCultureIgnoreCase(a: string, b: string) {
    return a.localeCompare(b, "en-US", { sensitivity: "accent" }) === 0;
}

// If a book is displayed in its original language, the author may well want to also see a title
// in the corresponding national language. Typically default rules or author styles will make
// the two titles appropriate sizes. And the original design of the book may support showing
// two or even three languages in each content block.
// When the user selects a different language, showing the published national language as well is
// less appropriate. It may not be the national language of any country where the chosen language
// is spoken. Worse, the book may have been published in a monolingual collection, where the
// vernacular and national languages are the same. When a different language is chosen,
// what was originally a single, possibly very large, title in the book's only language
// suddenly becomes a (possibly smaller) title in the chosen language followed by a possibly
// larger one in the original language (previously marked both bloom-content1 and
// bloom-contentNational1, now with just the second class making it visible).
// And the chosen language may take up more space than the original language, so bi- or tri-lingual
// content blocks may overflow.
// We decided (BL-9256) that in fields that display the book's primary language (V or auto),
// if the user has chosen a different language, we will only show that chosen language.
export function updateDivVisibilityByLangCode(
    htmlElement: HTMLHtmlElement | undefined,
    activeLanguageCode: string,
    bookLanguages: string[],
    firstRunForThisBook: boolean,
): void {
    if (!activeLanguageCode || !htmlElement) {
        return; // shouldn't happen, just a precaution
    }

    const usingDefaultLang =
        bookLanguages[0] === activeLanguageCode || !activeLanguageCode;

    // The newly selected language will be treated as the new, current vernacular language.
    // (It may or may not be the same as the original vernacular language at the time of publishing)
    const langVernacular = activeLanguageCode;

    // Update all the bloom-editables inside the translation group to take into account the new vernacular language
    const translationGroupDivs = htmlElement.ownerDocument!.evaluate(
        ".//div[contains(@class, 'bloom-translationGroup')]",
        htmlElement,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null,
    );

    const visibilityClass = "bloom-visibility-code-on";

    for (
        let iTranGrps = 0;
        iTranGrps < translationGroupDivs.snapshotLength;
        iTranGrps++
    ) {
        const groupElement = translationGroupDivs.snapshotItem(
            iTranGrps,
        ) as HTMLElement;
        const dataDefaultLangsAttr = groupElement.getAttribute(
            "data-default-languages",
        );

        // Split the string into array form instead, using delimiters "," or " "
        const dataDefaultLangs = dataDefaultLangsAttr
            ? dataDefaultLangsAttr.split(/,| /)
            : [];
        const isVernacularBlock =
            dataDefaultLangs == null ||
            dataDefaultLangs.length === 0 ||
            !dataDefaultLangs[0] ||
            dataDefaultLangs.includes("V") ||
            dataDefaultLangs.includes("L1") ||
            areStringsEqualInvariantCultureIgnoreCase(
                dataDefaultLangs[0],
                "auto",
            );

        const childElts = groupElement.childNodes;
        for (let iEdit = 0; iEdit < childElts.length; iEdit++) {
            const divElement = childElts.item(iEdit) as HTMLDivElement;
            if (
                !divElement ||
                !divElement.classList ||
                !divElement.classList.contains("bloom-editable")
            ) {
                continue;
            }
            if (firstRunForThisBook) {
                // Assume Bloom-desktop got it right for when usingDefaultLang. Save the classes it set.
                // (But keep going...the first run might NOT be usingDefaultLang.)
                divElement.setAttribute(
                    "data-original-class",
                    divElement.getAttribute("class") || "",
                );
            }
            if (usingDefaultLang) {
                // go back to the original classes from bloom desktop
                divElement.setAttribute(
                    "class",
                    divElement.getAttribute("data-original-class") || "",
                );
            } else if (isVernacularBlock) {
                // only the one that matches activeLanguage should be visible
                const lang = divElement.getAttribute("lang");
                if (lang === langVernacular) {
                    divElement.classList.add(visibilityClass);
                    // We don't want any behavior triggered by things like bloom-contentNational1, for example.
                    // It may be that language, but in this state it's more important that it is the selected book language.
                    Array.from(divElement.classList).forEach((className) => {
                        if (className.startsWith("bloom-content")) {
                            divElement.classList.remove(className);
                        }
                    });
                    // Depending on whether the field is controlled by the appearance system, one of these
                    // classes may activate style rules appropriate to the main book language.
                    divElement.classList.add("bloom-content1");
                    divElement.classList.add("bloom-contentFirst");
                } else {
                    divElement.classList.remove(visibilityClass);
                    // We don't care about the other classes since it isn't going to be seen at all.
                }
            }
            // (If it's not a vernacular block, the choices originally made by Bloom-desktop are still correct.)
            // (Well, there are a couple of exceptions, handled by showOrHideL1OnlyText)
        }
    }
}
