// LangData groups information about a language that BloomPlayerCore finds
// in a book for transmission to/from the LanguageMenu in the ControlBar.
import AutonymHandler from "./autonyms";

export default class LangData {
    private name: string;
    private code: string;
    private selected: boolean = false;
    private hasAudio: boolean = false;

    constructor(name: string, code: string) {
        this.name = name;
        this.code = code;
    }

    public get Name(): string {
        return this.name;
    }

    public get Code(): string {
        return this.code;
    }

    public get HasAudio(): boolean {
        return this.hasAudio;
    }

    public set HasAudio(value: boolean) {
        this.hasAudio = value;
    }

    public get IsSelected(): boolean {
        return this.selected;
    }

    public set IsSelected(value: boolean) {
        this.selected = value;
    }

    private static getLangDataByCode = (
        languageData: LangData[],
        languageCode: string
    ): LangData => {
        return languageData.filter(lang => lang.Code === languageCode)[0];
    };

    private static getActiveCodeFromLangData = (
        languageData: LangData[]
    ): string => {
        if (languageData.length < 1) {
            return "";
        }
        return languageData.filter(lang => lang.IsSelected)[0].Code;
    };

    // Assumes caller has already verified that there is a change in code.
    public static selectNewLanguageCode = (
        languageData: LangData[],
        newActiveLanguageCode: string
    ) => {
        const oldActiveLangCode = LangData.getActiveCodeFromLangData(
            languageData
        );
        const newActiveLangData = LangData.getLangDataByCode(
            languageData,
            newActiveLanguageCode
        );
        newActiveLangData.IsSelected = true;
        if (oldActiveLangCode !== undefined) {
            const oldActiveLangData = LangData.getLangDataByCode(
                languageData,
                oldActiveLangCode
            );
            oldActiveLangData.IsSelected = false;
        }
    };

    public static createLangDataArrayFromDomAndMetadata(
        body: HTMLBodyElement,
        metadataObject: object
    ): LangData[] {
        const result: LangData[] = [];
        if (!metadataObject.hasOwnProperty("language-display-names")) {
            const fallbackLangData = LangData.getMinimalFallbackL1(body);
            result.push(fallbackLangData);
            return result;
        }
        const languageDisplayNames: object =
            metadataObject["language-display-names"];
        for (const code in languageDisplayNames) {
            if (languageDisplayNames.hasOwnProperty(code)) {
                let displayName: string = languageDisplayNames[code];
                displayName = LangData.getBestLanguageName(code, displayName);
                const langData = new LangData(displayName, code);
                if (LangData.hasAudioInLanguage(body, code)) {
                    langData.HasAudio = true;
                }
                result.push(langData);
            }
        }
        // Apply fallback information if we need it
        if (result.length === 0 || result[0].Name === result[0].Code) {
            const fallbackLangData = LangData.getMinimalFallbackL1(body);
            if (result.length === 0) {
                result.push(fallbackLangData);
            } else {
                result[0].name = fallbackLangData.Name;
            }
        }
        // Always assume the first is selected to begin with
        result[0].IsSelected = true;
        return result;
    }

    private static getMinimalFallbackL1(body: HTMLBodyElement): LangData {
        const dataDivElement = body.ownerDocument!.getElementById(
            "bloomDataDiv"
        );
        if (!dataDivElement) {
            // Not even a bloomDataDiv in the book!
            const totalFallBack = new LangData("English", "en");
            totalFallBack.IsSelected = true;
            return totalFallBack;
        }
        const contentLangDiv = dataDivElement.ownerDocument!.evaluate(
            "//div[@data-book='contentLanguage1' and @lang='*']",
            dataDivElement,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        const langsOfBookDiv = dataDivElement.ownerDocument!.evaluate(
            "//div[@data-book='languagesOfBook' and @lang='*']",
            dataDivElement,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        const code =
            contentLangDiv === null ? "en" : contentLangDiv.textContent!.trim();
        let name =
            langsOfBookDiv === null ? "" : langsOfBookDiv.textContent!.trim();
        // langsOfBookDiv could have a couple of comma separated language names,
        // but we only want the first for our fallback.
        name = name.split(",")[0];
        name = LangData.getBestLanguageName(code, name);
        const fallback = new LangData(name, code);
        fallback.IsSelected = true;
        if (LangData.hasAudioInLanguage(body, code)) {
            fallback.HasAudio = true;
        }
        return fallback;
    }

    private static getBestLanguageName(
        code: string,
        proposedName: string
    ): string {
        const autonymHandler = AutonymHandler.getAutonymHandler();
        const langDbEntry = autonymHandler.getAutonymDataFor(code);
        const autonym = langDbEntry.autonym;
        const english = langDbEntry.english;
        // The "business logic" of choosing the best name as laid out by JH in BL-7610.
        if (proposedName === "") {
            if (autonym !== "") {
                if (english !== autonym) {
                    return `${autonym} (${english})`;
                }
                return autonym;
            } else {
                if (english === "") {
                    return `${code} ("unknown")`;
                }
                return english;
            }
        } else {
            if (proposedName === english) {
                return proposedName;
            } else {
                if (english === "") {
                    return `${proposedName} (${code})`;
                }
                return `${proposedName} (${english})`;
            }
        }
    }

    // ENHANCE
    // Ideally, we would have access to this information in meta.json, but alas we don't.
    // We would like to add it, but even then, it wouldn't be there for older books.
    // When we do add it, we could update the meta version number so we know we can
    // trust meta.json as the source of truth after that version number and fall back to
    // this for versions before it.
    private static hasAudioInLanguage(
        body: HTMLBodyElement,
        isoCode: string
    ): boolean {
        let result = false;
        const audioDivs =
            body.ownerDocument!.evaluate(
                ".//div[@lang='" +
                    isoCode +
                    "']//span[contains(@class, 'audio-sentence')]",
                body,
                null,
                XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
                null
            );
            for (let idx = 0; idx < audioDivs.snapshotLength; idx++) {
                const audioSpan = audioDivs.snapshotItem(
                    idx
                ) as HTMLElement;
                const divParent = audioSpan.closest("div");
                if (divParent === null) {
                    continue;
                }
                if (divParent.getAttribute("data-book") !== null) {
                    continue;
                }
                result = true;
                break;
            }
        return result;
    }
}
