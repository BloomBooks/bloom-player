// tslint:disable-next-line: no-submodule-imports
import autonymData from "raw-loader!./iso639-autonyms.tsv";

// This class handles retrieving data from the 'iso639-autonyms.tsv' file.
export class AutonymHandler {
    private static singleton: AutonymHandler;
    private autonymArray: object;
    private twoLetterTothreeLetterIndex: object;

    public static getAutonymHandler(): AutonymHandler {
        if (!AutonymHandler.singleton) {
            AutonymHandler.singleton = new AutonymHandler();
            AutonymHandler.singleton.init();
        }
        return this.singleton;
    }

    private constructor() {
        this.autonymArray = {};
        this.twoLetterTothreeLetterIndex = {};
    }

    private init() {
        // .tsv extension is tab-delimited data in rows.
        // The first few rows follow as example data: (for clarity pipes have been substituted for tabs)
        //   tag3|tag1|name|autonym|source
        //   kap||Bezhta||iso639-3
        //   aar|aa|Afar|Qafar|cldr
        //   aaq||Eastern Abnaki||iso639-3
        //   aap||Pará Arára|Ukarãngmã|iso639-3, ethnologue

        //console.log("Starting AutonymHandler load...");
        const rows: string[] = autonymData.split("\n");
        let index = 1; // first row is header info.
        while (index < rows.length) {
            const currentRow = rows[index];
            if (!currentRow) {
                break;
            }
            const parts = currentRow.split("\t");
            const row = { autonym: parts[3], english: parts[2] };
            this.autonymArray[parts[0]] = row;
            if (parts[1]) {
                this.twoLetterTothreeLetterIndex[parts[1]] = parts[0];
            }
            index++;
        }
        //console.log("Loaded AutonymHandler...");
    }

    // Returns an object containing two strings: autonym and English name
    public getAutonymDataFor(
        code: string
    ): { autonym: string; english: string } {
        const failure = { autonym: "", english: "" };
        //console.log("Processing code to get autonym data...");
        const threeLetterIsoCode = this.getThreeLetterIsoCode(code);
        if (!threeLetterIsoCode) {
            return failure;
        }
        return this.autonymArray[threeLetterIsoCode]
            ? this.autonymArray[threeLetterIsoCode]
            : failure;
    }

    private getThreeLetterIsoCode(code: string): string | undefined {
        if (code.length < 3) {
            // If the two-letter code is not in our index, this returns 'undefined'
            return this.twoLetterTothreeLetterIndex[code];
        }
        const splitCode = code.split("-")[0]; // in case of some complicated Regional, Script, Variant stuff
        if (splitCode.length < 4) {
            return splitCode;
        }
        return undefined; // failed to get a decent iso639 code
    }
}

export default AutonymHandler;
