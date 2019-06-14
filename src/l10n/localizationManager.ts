import i18nData = require("./i18n.json");

// Handles loading and retrieving of localization data.
//
// i18n.json contains all the translation information.
// Ideally, we will build that file from Crowdin (or git)
// at build time. However, we only have one string currently,
// it is for legacy quizzes, and we're not even sure we will
// add more strings in the future (as we are going to use icons
// whenever possible). So today it is maintained manually
// using approved translations from Crowdin. Last updated 6/10/19.
// We would call the class LocalizationManager, but we're using that
// for the singleton.
class LocalizationManagerImplementation {
    // Each item has the following structure:
    // "Sample.ID": { "en": "Sample English Text", "fr": "Sample French Text" }
    // So you have a l10n ID mapped to a set of key-value pairs, each of
    // which is a translation in a particular language.
    private l10nDictionary: Map<string, Map<string, string>> = new Map();

    private isSetup: boolean = false;

    // Set up the l10n dictionary. If this is not called first, localize will do nothing.
    public setUp(i18nDataOverride?) {
        if (this.isSetup) {
            return;
        }
        this.isSetup = true;

        const i18nDataToUse = i18nDataOverride ? i18nDataOverride : i18nData;

        Object.keys(i18nDataToUse).forEach(key => {
            const translations = i18nDataToUse[key];
            const translationsMap = new Map();
            Object.keys(translations).forEach(language => {
                translationsMap.set(language, translations[language]);
            });
            this.l10nDictionary.set(key, translationsMap);
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
            elementsToTranslate.forEach(elementToTranslate => {
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
}

// This is the one instance of this class.
export const LocalizationManager = new LocalizationManagerImplementation();
