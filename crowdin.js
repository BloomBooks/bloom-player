const { default: Axios } = require("axios");
const { EOL } = require("os"); // system specific End Of Line string
const fs = require("fs");
const glob = require("glob");
const {
    Translations,
    TranslationStatus
} = require("@crowdin/crowdin-api-client");
const process = require("process");

const kCrowdinApiToken = process.env.bloomCrowdinApiToken;
const kCrowdinProjectId = 261564;
const kCrowdinBloomPlayerFileId = 120; // Only one file.  This keeps things simple.
let l10nsMergedAlready = false; // used to prevent "watch-run" from always finding new file to compile.

// Combine the messages.json files for the various languages into a single
// json file imported by compiling the code.
export async function buildTranslations() {
    // If the system is set up for it, download the current translated messages files.
    if (kCrowdinApiToken && !l10nsMergedAlready) {
        const results = await fetchUpdatedCrowdinTranslations();
        results.forEach(res => {
            SaveCrowdinTranslationFile(res.config.url, res.data);
        });
        CombineTranslatedMessagesFiles();
    } else {
        // Go with whatever translations we've got already.
        CombineTranslatedMessagesFiles();
    }
}

// Write the given messages file to the proper folder for the language given
// in the url.
function SaveCrowdinTranslationFile(url, messagesJson) {
    // A bit of a hack to get the language tag, but I couldn't think of a better way to get it.
    const urlRegex = /^http.*\/exported_files\/([^\/]+)\/.*$/;
    const matchUrl = urlRegex.exec(url);
    let lang = matchUrl[1];
    // handle es-ES, pt-PT, ne-NP and others like them.  (zh-CN is an exception to the rule.)
    const tagRegex = /^([a-z]+)-[A-Z][A-Z]$/;
    const matchTag = tagRegex.exec(lang);
    if (matchTag && matchTag[1] !== "zh") lang = matchTag[1];

    const folder = `src/l10n/_locales/${lang}`;
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, true);
    const path = `${folder}/messages.json`;
    console.log("Saving translated messages to " + path);
    fs.writeFileSync(path, JSON.stringify(messagesJson, null, 2)); // prettified stringification
}

// Export the translated messages file for the given language, and retrieve
// the exported file content.
async function fetchCrowdinData(translationsApi, lang) {
    const fetchUrl = await translationsApi.exportProjectTranslation(
        kCrowdinProjectId,
        {
            targetLanguageId: lang,
            fileIds: [kCrowdinBloomPlayerFileId],
            skipUntranslatedStrings: true,
            exportApprovedOnly: true
        }
    );
    return Axios.get(fetchUrl.data.url);
}

// Get the data for current, up to date translated messages files for all the languages
// that have translations for any of the strings.
async function fetchUpdatedCrowdinTranslations() {
    // Get the list of languages that have translations available for our
    // messages file.
    let languages = [];
    // An error here should stop the compilation process.
    try {
        const translationStatusApi = new TranslationStatus({
            token: kCrowdinApiToken
        });
        const status = await translationStatusApi.getFileProgress(
            kCrowdinProjectId,
            kCrowdinBloomPlayerFileId,
            500
        );
        status.data.forEach(language => {
            if (language.data.approvalProgress > 0) {
                languages.push(language.data.languageId);
            }
        });

        const translationsApi = new Translations({
            token: kCrowdinApiToken
        });

        // The Crowdin API allows a maximum of 20 simultaneous queries from any one account.
        // We do 10 at a time to keep safely under that limit.  (and we have 11 translations
        // already to start with, so this code could get exercised.)
        const results = [];
        while (languages.length > 0) {
            const langs = [];
            const limit = Math.min(10, languages.length);
            for (let i = 0; i < limit; ++i) {
                langs.push(languages.pop());
            }
            const partial = langs.map(lang => {
                return fetchCrowdinData(translationsApi, lang);
            });
            const partialResults = await Promise.all(partial);

            while (partialResults.length) {
                results.push(partialResults.pop());
            }
        }
        return results; // returns array of Axios response promises
    } catch (err) {
        console.log("Error in fetchUpdatedCrowdinTranslations: " + err);
        throw err;
    }
}

// Read all of the message files from the _locales folder and combine them
// to form the full messages file organized by language tag.
export function CombineTranslatedMessagesFiles() {
    if (l10nsMergedAlready) return;
    l10nsMergedAlready = true;
    const regex = /src\/l10n\/_locales\/(.*)\/messages.json/;
    glob("src/l10n/_locales/*/messages.json", (error, files) => {
        let output = "";
        let langs = [];
        files.forEach(filename => {
            const match = regex.exec(filename);
            const lang = match[1];
            langs.push(lang);
            const contents = ` "${lang}": ${fs.readFileSync(filename, "utf8")}`;
            output =
                output + (output.length ? "," + EOL : "") + contents.trimEnd();
        });
        fs.writeFileSync("src/l10n/l10n-all.json", `{ ${output} }`);
        console.log(`Combined localizations for ${langs.join(", ")}`);
    });
}
