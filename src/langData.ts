// LangData groups information about a language that BloomPlayerCore finds
// in a book for transmission to/from the LanguageMenu in the ControlBar.

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

    public static createLangDataArrayFromMetadata(
        body: HTMLBodyElement,
        metadataObject: object
    ): LangData[] {
        const result: LangData[] = [];
        if (!metadataObject.hasOwnProperty("language-display-names")) {
            return result; // shouldn't ever happen
        }
        const languageDisplayNames: object =
            metadataObject["language-display-names"];
        let index = 0;
        for (const code in languageDisplayNames) {
            if (languageDisplayNames.hasOwnProperty(code)) {
                const displayName: string = languageDisplayNames[code];
                const langData = new LangData(
                    displayName === "" ? code : displayName,
                    code
                );
                if (index === 0) {
                    // assume the first is selected to begin with
                    langData.IsSelected = true;
                }
                if (LangData.hasAudioInLanguage(body, code)) {
                    langData.HasAudio = true;
                }
                result.push(langData);
                index++;
            }
        }
        return result;
    }

    private static hasAudioInLanguage(
        body: HTMLBodyElement,
        isoCode: string
    ): boolean {
        return (
            body.ownerDocument!.evaluate(
                ".//div[@lang='" +
                    isoCode +
                    "']//span[contains(@class, 'audio-sentence')]",
                body,
                null,
                XPathResult.ANY_UNORDERED_NODE_TYPE,
                null
            ).singleNodeValue != null
        );
    }
}
