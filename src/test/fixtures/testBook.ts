// Builds minimal-but-realistic Bloom book content for component-level tests of
// BloomPlayerCore. The shapes here (bloomDataDiv, bloom-page, translationGroup,
// meta.json fields) intentionally mirror what Bloom Desktop publishes, but only
// the parts the player's loading code actually reads.

export const kTestBookFolderUrl = "http://localhost:1234/fakebooks/TestBook";
export const kTestBookHtmUrl = kTestBookFolderUrl + "/TestBook.htm";
export const kTestBookInstanceId = "test-book-instance-id";

interface ITestPageOptions {
    id: string;
    pageNumber?: string; // empty/omitted for xmatter pages
    classes?: string; // extra page classes, e.g. "bloom-frontMatter frontCover"
    // Map of lang tag to text for one translation group on the page.
    // The first language listed is given bloom-content1/visibility-code-on,
    // mimicking a book published with that language as L1.
    text?: { [lang: string]: string };
}

export function makeTestPage(options: ITestPageOptions): string {
    const numbered = options.pageNumber ? " numberedPage" : "";
    const pageNumberAttr = options.pageNumber
        ? ` data-page-number="${options.pageNumber}"`
        : "";
    let translationGroup = "";
    if (options.text) {
        const langs = Object.keys(options.text);
        const editables = langs
            .map((lang, i) => {
                const visibility =
                    i === 0 ? " bloom-content1 bloom-visibility-code-on" : "";
                return `<div class="bloom-editable normal-style${visibility}" lang="${lang}">
                            <p>${options.text![lang]}</p>
                        </div>`;
            })
            .join("\n");
        translationGroup = `<div class="bloom-translationGroup">
                ${editables}
            </div>`;
    }
    return `<div class="bloom-page Device16x9Portrait side-right${numbered} ${options.classes ?? ""}"
                 id="${options.id}"${pageNumberAttr}>
        <div class="marginBox">
            ${translationGroup}
        </div>
    </div>`;
}

interface ITestBookOptions {
    language1?: string; // defaults to "en"
    pages?: string[]; // markup from makeTestPage; a default 3-page book if omitted
    extraHeadContent?: string; // e.g. a FeatureRequirement meta tag
    bodyAttributes?: string; // e.g. data-bfcanrotate="allOrientations;bloomReader"
}

export function makeTestBookHtml(options: ITestBookOptions = {}): string {
    const lang1 = options.language1 ?? "en";
    const pages =
        options.pages ??
        [
            makeTestPage({
                id: "cover-page-guid",
                classes: "bloom-frontMatter frontCover cover coverColor",
                text: { [lang1]: "Test Book Title" },
            }),
            makeTestPage({
                id: "first-content-page-guid",
                pageNumber: "1",
                text: { [lang1]: "First page text" },
            }),
            makeTestPage({
                id: "second-content-page-guid",
                pageNumber: "2",
                text: { [lang1]: "Second page text" },
            }),
        ];
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    ${options.extraHeadContent ?? ""}
</head>
<body ${options.bodyAttributes ?? ""}>
    <div id="bloomDataDiv">
        <div data-book="contentLanguage1" lang="*">${lang1}</div>
    </div>
    ${pages.join("\n")}
</body>
</html>`;
}

export function makeTestBookMetaData(overrides: object = {}): object {
    return {
        bookInstanceId: kTestBookInstanceId,
        title: "Test Book",
        originalTitle: "Test Book",
        bloomdVersion: 1,
        features: [],
        "language-display-names": { en: "English", fr: "French" },
        ...overrides,
    };
}

// An axios error shaped the way HandleLoadingError expects (message + config.url).
export function makeAxios404(url: string): Error {
    return Object.assign(
        new Error("Request failed with status code 404"),
        // real axios errors carry the request config; HandleLoadingError reads config.url
        { config: { url }, response: { status: 404 } },
    );
}

// Installs an implementation on the mocked axios.get that serves the given book
// the way a real book folder server would. Anything unknown (stylesheets,
// .distribution, and questions.json unless supplied via extraFiles) is rejected
// with a 404, which the player is expected to tolerate for those files.
export function serveTestBook(
    mockedGet: { mockImplementation: (fn: (url: string) => Promise<any>) => void },
    html: string,
    metaData: object = makeTestBookMetaData(),
    // extra files by url suffix, e.g. { "questions.json": [...] }
    extraFiles: { [urlSuffix: string]: unknown } = {},
): void {
    mockedGet.mockImplementation((url: string) => {
        const extraSuffix = Object.keys(extraFiles).find((suffix) =>
            url.endsWith(suffix),
        );
        if (extraSuffix !== undefined) {
            return Promise.resolve({
                data: extraFiles[extraSuffix],
                config: { url },
            });
        }
        if (url.endsWith(".htm")) {
            return Promise.resolve({ data: html, config: { url } });
        }
        if (url.endsWith("meta.json")) {
            return Promise.resolve({ data: metaData, config: { url } });
        }
        return Promise.reject(makeAxios404(url));
    });
}
