import i18nData from "./l10n-all.json"; // file created at build time

// Handles loading and retrieving of localization data.
//
// l10n-all.json contains all the translation information.
// We build that file from Crowdin (or git) at build time.
// We would call the class LocalizationManager, but we're using that
// for the singleton.
class LocalizationManagerImplementation {
    // l10n-all.json has the following structure:
    // {
    //   "en": { "Sample.ID1": { "message": "First Sample English Text", "description": "..." },
    //           "Sample.ID2": { "message": "Second English Text", "description": "..." }
    //         },
    //   "fr": { "Sample.ID1": { "message": "Premier échantillon de texte en français", "description": "..."},
    //           "Sample.ID2": { "message": "Deuxième texte français", "description": "..."}
    //         }
    // }
    // This is essentially a concatenation of the individual language json files, with the
    // language codes tagging the  separate pieces that were gathered together.  This is based
    // on the "Chrome JSON" format (https://support.crowdin.com/file-formats/chrome-json/).
    private l10nDictionary: Map<string, Map<string, string>> = new Map();

    private isSetup: boolean = false;

    // Set up the l10n dictionary. If this is not called first, localize will do nothing.
    public setUp(i18nDataOverride?: any) {
        if (this.isSetup) {
            return;
        }
        this.isSetup = true;

        const i18nDataToUse = i18nDataOverride ? i18nDataOverride : i18nData;

        Object.keys(i18nDataToUse).forEach(lang => {
            const strings = i18nDataToUse[lang];
            Object.keys(strings).forEach(stringId => {
                let translations = this.l10nDictionary.get(stringId);
                if (!translations) {
                    translations = new Map();
                    this.l10nDictionary.set(stringId, translations);
                }
                translations.set(lang, strings[stringId].message);
            });
        });
    }

    // Find all pages which are descendents of the given element and localize them.
    // As opposed to UI controls, we don't have a good react-y way of localizing pages.
    //
    // preferredLanguages is an ordered array such that we use the most preferred language
    // for which a translation exists (on an element by element basis).
    public localizePages(
        ancestorElement: HTMLElement,
        preferredLanguages: string[]
    ): void {
        const elementsToTranslate = ancestorElement.querySelectorAll(
            ".bloom-page [data-i18n]"
        );
        if (elementsToTranslate) {
            // nodeList.forEach not supported in FF45, so we add Array.from()
            Array.from(elementsToTranslate).forEach(elementToTranslate => {
                this.localizeElement(
                    elementToTranslate as HTMLElement,
                    preferredLanguages
                );
            });
        }
    }

    private localizeElement(
        element: HTMLElement,
        preferredLanguages: string[]
    ): void {
        const key = element.dataset["i18n"];
        if (!key) {
            return;
        }

        const [translation, language] = this.getTranslationAndLanguage(
            key,
            preferredLanguages
        );
        if (translation && language) {
            element.innerText = translation;
            element.setAttribute("lang", language);
        }
    }

    // Get the translation for the given l10n ID in the most preferred language
    // for which we have a translation.
    public getTranslationAndLanguage(
        id: string,
        preferredLanguages: string[]
    ): [string, string] | [undefined, undefined] {
        const translations = this.l10nDictionary.get(id);
        if (!translations) {
            return [undefined, undefined];
        }

        // Using for (not foreach) so we can return early
        for (let i: number = 0; i < preferredLanguages.length; i++) {
            const language = preferredLanguages[i];
            const translation = translations.get(language);
            if (translation) {
                return [translation, language];
            }
        }

        const englishFallback = translations.get("en");
        if (englishFallback) {
            return [englishFallback, "en"];
        }
        return [undefined, undefined];
    }

    public getTranslation(
        id: string,
        preferredLanguages: string[],
        defaultVal: string
    ): string {
        const [result] = this.getTranslationAndLanguage(id, preferredLanguages);
        return result || defaultVal;
    }
}

// This is the one instance of this class.
export const LocalizationManager = new LocalizationManagerImplementation();
