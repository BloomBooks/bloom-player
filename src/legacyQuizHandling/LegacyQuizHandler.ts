import axios from "axios";
import { OldQuestionsConverter } from "./old-questions";
import { IActivity } from "../activityManager";

// NB: there are two levels of "legacy" we're dealing with here.
// The first is before we had actual activity pages; instead the presence of a
// "questions.json" was the trigger to make pages at the end. Next, starting with Bloom 4.6,
// we had a first go at actual bloom pages that could be activities. The only activity
// developed for that was the "SimpleComprehensionQuiz.js", and it had several things that
// got simplified away for the next round of APIs, along with some problems that required
// hacks to prevent multiple copies from stepping on each other.
export class LegacyQuestionHandler {
    public constructor(locationOfDistFolder: string) {
        this.locationOfDistFolder = locationOfDistFolder;
    }
    private needSpecialCss = false;
    private locationOfDistFolder: string;
    public getPromiseForAnySpecialCss() {
        return this.needSpecialCss
            ? axios.get(this.getFolderForSupportFiles() + "/Special.css")
            : null;
    }

    public loadQuizScript(callWithUrl: (url: string) => void) {
        // We want the reader's own version of this file. For one thing, if we generated
        // the quiz pages from json, the book folder won't have it. Also, this means we
        // always use the latest version of the quiz code rather than whatever was current
        // when the book was published.
        const folder = this.getFolderForSupportFiles();
        const tryForQuiz = folder + "/simpleComprehensionQuiz.js";
        axios
            .get(tryForQuiz)
            .then(result => {
                // See comment on eval below.
                // tslint:disable-next-line: no-eval
                eval(result.data);
                callWithUrl(tryForQuiz);
            })
            .catch(error => {
                console.log(error);
            });
    }
    public handleLegacyQuestions(
        urlPrefix,
        body,
        pageClass,
        finished: () => void
    ) {
        const urlOfQuestionsFile = urlPrefix + "/questions.json";
        this.needSpecialCss = false;
        axios
            .get(urlOfQuestionsFile)
            .then(qfResult => {
                const newPages = OldQuestionsConverter.convert(
                    qfResult.data,
                    pageClass
                );
                const firstBackMatterPage = body.getElementsByClassName(
                    "bloom-backMatter"
                )[0];
                for (let i = 0; i < newPages.length; i++) {
                    this.needSpecialCss = true;
                    // insertAdjacentElement is tempting, but not in FF45.
                    firstBackMatterPage.parentElement!.insertBefore(
                        newPages[i],
                        firstBackMatterPage
                    );
                }
                finished();
            })
            .catch(() => finished());
    }

    private getFolderForSupportFiles() {
        const href =
            window.location.protocol +
            "//" +
            window.location.host +
            window.location.pathname;
        const lastSlash = href.lastIndexOf("/");
        return href.substring(0, lastSlash) + this.locationOfDistFolder;
    }

    public processPage(
        pageDiv: Element,
        loadedActivityScripts: { [name: string]: IActivity }
    ) {
        // The following is the 4.6 version, which used <script> tags and, as far as we know,
        //  is just for simpleComprehensionQuiz.js.
        // When a page loads, if it is an interactive page we want to execute any scripts embedded in it.
        // This is potentially dangerous, so we make it less likely to happen through random attacks
        // by only doing it in pages that are explicitly marked as bloom interactive pages.
        if (pageDiv.classList.contains("bloom-interactive-page")) {
            LegacyQuestionHandler.getActivityScriptUrls(pageDiv).forEach(
                src => {
                    if (!loadedActivityScripts[src]) {
                        if (src.endsWith("/simpleComprehensionQuiz.js")) {
                            this.loadQuizScript(
                                url =>
                                    (loadedActivityScripts[url] = {
                                        // simpleComprehensionQuiz isn't a module yet, doesn't use our API yet, so module is null
                                        name: src,
                                        module: null,
                                        runningObject: null,
                                        requirements: { dragging: false }
                                    })
                            );
                        }
                    }
                }
            );
        }
    }

    // currently only for 4.6-style simpleComprehensionQuiz, which used a actual <script> tag
    private static getActivityScriptUrls(pageDiv: Element): string[] {
        const scripts = pageDiv.getElementsByTagName("script");
        const urls: string[] = [];
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].getAttribute("src");
            if (src) {
                urls.push(src);
            }
        }
        return urls;
    }
}
