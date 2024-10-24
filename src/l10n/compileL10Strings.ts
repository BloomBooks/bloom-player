import glob from "glob";
import fs from "fs";

// This is used at build-time only, called from package.json

// Read all of the message files from the the src/l10n folder and combine them
// to form the full messages file organized by language tag.
function CombineTranslatedMessagesFiles() {
    // for painful reasons, the stuff we download comes in under "bloom-player/"
    const pattern = /src\/l10n\/(bloom-player\/)(.*)\/messages.json/;
    glob("src/l10n/**/messages.json", (error, files) => {
        let output = "";
        let langs: string[] = [];
        files.forEach((filename) => {
            const match = pattern.exec(filename);
            if (match) {
                const lang = match[2];
                if (lang) {
                    const s = fs.readFileSync(filename, "utf8");
                    if (s.length > 4) {
                        langs.push(lang);
                        const stringForThisLanguage =
                            ` "${lang}": ${s}`.trimEnd();

                        output =
                            output +
                            (output.length ? ",\n" : "") +
                            stringForThisLanguage;
                    }
                }
            }
        });
        fs.writeFileSync("src/l10n/all-messages.json", `{ ${output} }`);
        console.log(`Combined localizations for ${langs.join(", ")}`);
    });
}

CombineTranslatedMessagesFiles();
