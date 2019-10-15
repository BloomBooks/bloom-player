/*
bloom-player-core is responsible for all the behavior of working through a book, but without any UI controls
(other than page turning).
*/
import * as React from "react";
import axios, { AxiosPromise } from "axios";
import Swiper, { SwiperInstance } from "react-id-swiper";
// This loads some JS right here that is a polyfill for the (otherwise discontinued) scoped-styles html feature
// tslint:disable-next-line: no-submodule-imports
import "style-scoped/scoped"; // maybe use .min.js after debugging?
// tslint:disable-next-line: no-submodule-imports
import "swiper/dist/css/swiper.css";
// tslint:enable:no-submodule-imports
import "./bloom-player.less";
import Narration from "./narration";
import LiteEvent from "./event";
import { Animation } from "./animation";
import { Video } from "./video";
import { Music } from "./music";
import { OldQuestionsConverter } from "./legacyQuizHandling/old-questions";
import { LocalizationManager } from "./l10n/localizationManager";
import { LocalizationUtils } from "./l10n/localizationUtils";
import {
    reportAnalytics,
    setAmbientAnalyticsProperties,
    updateBookProgressReport
} from "./externalContext";
import LangData from "./langData";

// See related comments in controlBar.tsx
//tslint:disable-next-line:no-submodule-imports
import IconButton from "@material-ui/core/IconButton";
//tslint:disable-next-line:no-submodule-imports
import ArrowBack from "@material-ui/icons/ArrowBackIosRounded";
//tslint:disable-next-line:no-submodule-imports
import ArrowForward from "@material-ui/icons/ArrowForwardIosRounded";

// BloomPlayer takes a URL param that directs it to Bloom book.
// (See comment on sourceUrl for exactly how.)
// It displays pages from the book and allows them to be turned by dragging.
// On a wide screen, an option may be used to show the next and previous pages
// beside the current one.

interface IProps {
    url: string; // of the bloom book (folder)
    landscape: boolean; // whether viewing as landscape or portrait
    showContextPages?: boolean;
    // ``paused`` allows the parent to control pausing of audio. We expect we may supply
    // a click/touch event callback if needed to support pause-on-touch.
    paused?: boolean;

    pageStylesAreNowInstalled: () => void;
    onContentClick?: (event: any) => void;

    // reportBookProperties is called when book loaded enough to determine these properties.
    // This is probably obsolete, since if the player is embedded in a iframe as we currently
    // require, only the containing BloomPlayerControls can make use of it. However, it's just
    // possible we might want it if we end up with rotation-related controls. Note that the
    // same information is made available via postMessage if the control's window has a parent.
    reportBookProperties?: (properties: {
        landscape: boolean;
        canRotate: boolean;
    }) => void;

    // controlsCallback feeds the book's languages up to BloomPlayerControls for the LanguageMenu to use.
    controlsCallback?: (bookLanguages: LangData[]) => void;

    // Set by BloomPlayerControls -> ControlBar -> LanguageMenu
    // Changing this should modify bloom-visibility-code-on stuff in the DOM.
    activeLanguageCode: string;

    reportPageProperties?: (properties: {
        hasAudio: boolean;
        hasMusic: boolean;
        hasVideo: boolean;
    }) => void;

    hideNextPrevButtons?: boolean;
}
interface IState {
    pages: string[]; // of the book. First and last are empty in context mode.
    styleRules: string; // concatenated stylesheets the book references or embeds.
    // indicates current page, though typically not corresponding to the page
    // numbers actually on the page. This is an index into pages, and in context
    // mode it's the index of the left context page, not the main page.
    currentSwiperIndex: number;
    isLoading: boolean;

    //used to distinguish a drag from a click
    isChanging: boolean;
}

enum BookFeatures {
    talkingBook = "talkingBook",
    blind = "blind",
    signLanguage = "signLanguage",
    motion = "motion"
}

export class BloomPlayerCore extends React.Component<IProps, IState> {
    private static DEFAULT_CREATOR: string = "bloom";
    private readonly initialPages: string[] = ["loading..."];
    private readonly initialStyleRules: string = "";

    // This block of variables keep track of things we want to report in analytics
    private totalNumberedPages = 0; // found in book
    private questionCount = 0; // comprehension questions found in book
    private features = "";

    private audioPages = 0; // number of (non-xmatter) audio pages user has displayed
    private totalPagesShown = 0; // number of (non-xmatter) pages of all kinds user has displayed
    private videoPages = 0; // number of (non-xmatter) video pages user has displayed.
    private lastNumberedPageWasRead = false; // has user read to last numbered page?

    private totalAudioDuration = 0;
    private totalVideoDuration = 0;
    private reportedAudioOnCurrentPage = false;
    private reportedVideoOnCurrentPage = false;
    private brandingProjectName = "";
    private bookTitle = "";
    private copyrightHolder = "";
    private originalCopyrightHolder = "";
    private sessionId = this.generateUUID();
    private creator = BloomPlayerCore.DEFAULT_CREATOR; // If we find a head/meta element, we will replace this.

    private static currentPagePlayer: BloomPlayerCore;

    constructor(props: IProps, state: IState) {
        super(props, state);
        // Make this player (currently always the only one) the recipient for
        // notifications from narration.ts etc about duration etc.
        BloomPlayerCore.currentPagePlayer = this;
    }

    public readonly state: IState = {
        pages: this.initialPages,
        styleRules: this.initialStyleRules,
        currentSwiperIndex: 0,
        isLoading: true,
        isChanging: false
    };

    // The book url we were passed as a URL param.
    // May be a full url of the html file (eventually, typically, index.htm);
    // in this case, it must end with .htm (currently we do NOT support .html).
    // May be a url of a folder whose name is the book title, where the book has the same name,
    // e.g., .../X means the book is .../X/X.htm (NOT X.html)
    private sourceUrl: string;
    // The folder containing the html file.
    private urlPrefix: string;

    private bookLanguage1: string | undefined;
    private bookLanguage2: string | undefined;
    private bookLanguage3: string | undefined;

    private metaDataObject: any | undefined;
    private htmlElement: HTMLHtmlElement | undefined;

    private narration: Narration;
    private animation: Animation;
    private music: Music;
    private video: Video;
    private canRotate: boolean;

    private isPagesLocalized: boolean = false;

    private static currentPage: HTMLElement;

    private indexOflastNumberedPage: number;

    private needSpecialCss = false;

    public componentDidMount() {
        LocalizationManager.setUp();

        // To get this to fire consistently no matter where the focus is,
        // we have to attach to the document itself. No level of react component
        // seems to work (using the OnKeyDown prop). So we use good ol'-fashioned js.
        document.addEventListener("keydown", e =>
            this.handleDocumentLevelKeyDown(e)
        );
        this.componentDidUpdate(this.props);
    }

    private handleDocumentLevelKeyDown = e => {
        if (e.key === "Home") {
            this.goToFirstPage();
            e.preventDefault();
        }
        if (e.key === "End") {
            this.goToLastPage();
            e.preventDefault();
        }
    };

    // We expect it to show some kind of loading indicator on initial render, then
    // we do this work. For now, won't get a loading indicator if you change the url prop.
    public componentDidUpdate(prevProps: IProps) {
        // contains conditions to limit this to one time only after assembleStyleSheets has completed.
        this.localizeOnce();
        // also one-time setup; only the first time through
        this.initializeMedia();

        if (
            !this.state.isLoading &&
            prevProps.activeLanguageCode !== this.props.activeLanguageCode
        ) {
            // The usual case invoked by changing the language on the player menu.
            if (this.htmlElement) {
                this.updateDivVisibilityByLangCode(
                    prevProps.activeLanguageCode
                );
                this.finishUp(false); // finishUp(false) just reloads the swiper pages from our stored html
            }
        }

        const newSourceUrl = this.calculateNewUrl();
        if (newSourceUrl && newSourceUrl !== this.sourceUrl) {
            // We're changing books; reset several variables including isLoading,
            // until we inform the controls which languages are available.
            this.setState({ isLoading: true });
            this.metaDataObject = undefined;
            this.htmlElement = undefined;

            this.sourceUrl = newSourceUrl;
            // We support a two ways of interpreting URLs.
            // If the url ends in .htm, it is assumed to be the URL of the htm file that
            // is the book itself. The last slash indicates the folder in which all the
            // other resources may be found.
            // For compatibility with earlier versions of bloom-player, the url may be a folder
            // ending in the book name, and the book is assumed to occur in that folder and have
            // the same name as the folder.
            // Note: In the future, we are thinking of limiting to
            // a few domains (localhost, dev.blorg, blorg).
            // Note: we don't currently look for .html files, only .htm. That's what
            // Bloom has consistently created, both in .bloomd files and in
            // book folders, so it doesn't seem worth complicating the code
            // to look for the other as well.
            const slashIndex = this.sourceUrl.lastIndexOf("/");
            const encodedSlashIndex = this.sourceUrl.lastIndexOf("%2f");
            let filename: string;
            if (slashIndex > encodedSlashIndex) {
                filename = this.sourceUrl.substring(
                    slashIndex + 1,
                    this.sourceUrl.length
                );
            } else {
                filename = this.sourceUrl.substring(
                    encodedSlashIndex + 3,
                    this.sourceUrl.length
                );
            }
            const fullPath = filename.endsWith(".htm");
            const urlOfBookHtmlFile = fullPath
                ? this.sourceUrl
                : this.sourceUrl + "/" + filename + ".htm"; // enhance: search directory if name doesn't match?
            this.music.urlPrefix = this.narration.urlPrefix = this.urlPrefix = fullPath
                ? this.sourceUrl.substring(
                      0,
                      Math.max(slashIndex, encodedSlashIndex)
                  )
                : this.sourceUrl;
            const htmlPromise = axios.get(urlOfBookHtmlFile);
            const metadataPromise = axios.get(this.fullUrl("meta.json"));
            Promise.all([htmlPromise, metadataPromise]).then(result => {
                const [htmlResult, metadataResult] = result;
                this.metaDataObject = metadataResult.data;
                // Note: we do NOT want to try just making an HtmlElement (e.g., document.createElement("html"))
                // and setting its innerHtml, since that leads to the browser trying to load all the
                // urls referenced in the book, which is a waste and also won't work because we
                // haven't corrected them yet, so it can trigger yellow boxes in Bloom.
                const parser = new DOMParser();
                // we *think* bookDoc and bookHtmlElement get garbage collected
                const bookDoc = parser.parseFromString(
                    htmlResult.data,
                    "text/html"
                );
                const bookHtmlElement = bookDoc.documentElement as HTMLHtmlElement;

                const body = bookHtmlElement.getElementsByTagName("body")[0];
                this.bookLanguage1 = LocalizationUtils.getBookLanguage1(
                    body as HTMLBodyElement
                );
                this.canRotate = body.hasAttribute("data-bfcanrotate"); // expect value allOrientations;bloomReader, should we check?

                this.copyrightHolder = this.getCopyrightInfo(body, "copyright");
                this.originalCopyrightHolder = this.getCopyrightInfo(
                    body,
                    "originalCopyright"
                );

                this.makeNonEditable(body);
                this.htmlElement = bookHtmlElement;

                const firstPage = bookHtmlElement.getElementsByClassName(
                    "bloom-page"
                )[0];
                let pageClass = "Device16x9Portrait";
                if (firstPage) {
                    pageClass = BloomPlayerCore.getPageSizeClass(firstPage);
                }

                const urlOfQuestionsFile = this.urlPrefix + "/questions.json";
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
                        this.finishUp();
                    })
                    .catch(() => this.finishUp());
            }); // end of block that loads html and meta.json
        } else if (prevProps.landscape !== this.props.landscape) {
            // rotating the phone...may need to switch the orientation class on each page.
            const pages = document.getElementsByClassName("bloom-page");
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                this.forceDevicePageSize(page);
            }
        }
        if (prevProps.landscape !== this.props.landscape) {
            // may need to show or hide animation
            this.setIndex(this.state.currentSwiperIndex);
            this.showingPage(this.state.currentSwiperIndex);
        }
        if (prevProps.paused !== this.props.paused) {
            this.handlePausePlay();
        }
        if (this.swiperInstance) {
            // Other refactoring seems to have fixed an earlier problem with switching orientation,
            // so that we no longer need either the Swiper update or even the setTimeout here.
            // OTOH, we need to do a lazy.load(), otherwise all our pictures disappear when changing languages!
            this.swiperInstance.lazy.load();
        }
    }

    // This function, the rest of the work we need to do, will be executed after we attempt
    // to retrieve questions.json and either get it and convert it into extra pages,
    // or fail to get it and make no changes.
    // We also call this method when changing the language, but we only want it to update the swiper content
    private finishUp(isNewBook: boolean = true) {
        // assemble the page content list
        if (!this.htmlElement) {
            return;
        }
        const pages = this.htmlElement.getElementsByClassName("bloom-page");
        const swiperContent: string[] = [];
        if (this.props.showContextPages) {
            swiperContent.push(""); // blank page to fill the space left of first.
        }
        if (isNewBook) {
            this.totalNumberedPages = 0;
            this.questionCount = 0;
        }
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const landscape = this.forceDevicePageSize(page);
            // this used to be done for us by react-slick, but swiper does not.
            // Since it's used by at least page-api code, it's easiest to just stick it in.
            page.setAttribute("data-index", i.toString(10));
            // Now we have all the information we need to call reportBookProps if it is set.
            if (i === 0 && this.props.reportBookProperties) {
                // Informs containing react controls (in the same frame)
                this.props.reportBookProperties({
                    landscape,
                    canRotate: this.canRotate
                });
            }
            if (isNewBook) {
                this.fixRelativeUrls(page);
                // possibly more efficient to look for attribute data-page-number,
                // but due to a bug (BL-7303) many published books may have that on back-matter pages.
                const hasPageNum = page.classList.contains("numberedPage");
                if (hasPageNum) {
                    this.indexOflastNumberedPage =
                        i + (this.props.showContextPages ? 1 : 0);
                    this.totalNumberedPages++;
                }
                if (
                    page.getAttribute("data-analyticscategories") ===
                    "comprehension"
                ) {
                    // Note that this will count both new-style question pages,
                    // and ones generated from old-style json.
                    this.questionCount++;
                }
            }
            swiperContent.push(page.outerHTML);
        }
        if (this.props.showContextPages) {
            swiperContent.push(""); // blank page to fill the space right of last.
        }
        if (isNewBook) {
            const head = this.htmlElement.getElementsByTagName("head")[0];
            this.creator = this.getCreator(head); // prep for reportBookOpened()
            const body = this.htmlElement.getElementsByTagName("body")[0];
            this.reportBookOpened(body);
            if (this.props.controlsCallback) {
                const languages = LangData.createLangDataArrayFromMetadata(
                    body,
                    this.metaDataObject
                );
                // Tell BloomPlayerControls which languages are available for the Language Menu.
                this.props.controlsCallback(languages);
            }
        }
        this.assembleStyleSheets(this.htmlElement);
        // assembleStyleSheets takes a while, fetching stylesheets. So even though we're letting
        // the dom start getting loaded here, we'll leave state.isLoading as true and let assembleStyleSheets
        // change it when it is done.
        this.setState({
            pages: swiperContent
        });
        // A pause hopefully allows the document to become visible before we
        // start playing any audio or movement on the first page.
        // Also gives time for the first page
        // element to actually get created in the document.
        // Note: typically in Chrome we won't actually start playing, because
        // of a rule that the user must interact with the document first.
        if (isNewBook) {
            window.setTimeout(() => {
                this.setIndex(0);
                this.showingPage(0);
            }, 500);
        }
    }

    private localizeOnce() {
        // We want to localize once and only once after pages has been set and assembleStyleSheets has happened.
        if (
            !this.isPagesLocalized &&
            this.state.pages !== this.initialPages &&
            this.state.styleRules !== this.initialStyleRules
        ) {
            LocalizationManager.localizePages(
                document.body,
                this.getPreferredTranslationLanguages()
            );
            this.isPagesLocalized = true;
        }
    }

    private initializeMedia() {
        // The conditionals guarantee that each type of media will only be created once.
        if (!this.video) {
            this.video = new Video();
        }
        if (!this.narration) {
            this.narration = new Narration();
            this.narration.PageDurationAvailable = new LiteEvent<HTMLElement>();
            this.animation = new Animation();
            //this.narration.PageNarrationComplete.subscribe();
            this.narration.PageDurationAvailable.subscribe(pageElement => {
                this.animation.HandlePageDurationAvailable(
                    pageElement!,
                    this.narration.PageDuration
                );
            });
        }
        if (!this.music) {
            this.music = new Music();
        }
    }

    private calculateNewUrl(): string {
        let newSourceUrl = this.props.url;
        // Folder urls often (but not always) end in /. If so, remove it, so we don't get
        // an empty filename or double-slashes in derived URLs.
        if (newSourceUrl.endsWith("/")) {
            newSourceUrl = newSourceUrl.substring(0, newSourceUrl.length - 1);
        }
        // Or we might get a url-encoded slash.
        if (newSourceUrl.endsWith("%2f")) {
            newSourceUrl = newSourceUrl.substring(0, newSourceUrl.length - 3);
        }
        return newSourceUrl;
    }

    private handlePausePlay() {
        if (this.props.paused) {
            this.pauseAllMultimedia();
        } else {
            // This test determines if we changed pages while paused,
            // since the narration object won't yet be updated.
            if (BloomPlayerCore.currentPage !== this.narration.playerPage) {
                this.resetForNewPageAndPlay(BloomPlayerCore.currentPage);
            }
            this.narration.play();
            this.video.play();
            this.music.play();
        }
    }

    // Go through all .bloom-editable divs turning visibility off/on based on the activeLanguage (isoCode).
    private updateDivVisibilityByLangCode(previousLangCode: string): void {
        if (
            this.props.activeLanguageCode === undefined ||
            this.htmlElement === undefined
        ) {
            return; // shouldn't happen, just a precaution
        }
        const translationGroupDivs = this.htmlElement.ownerDocument!.evaluate(
            ".//div[contains(@class, 'bloom-translationGroup')]",
            this.htmlElement,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        const visibilityClass = "bloom-visibility-code-on";

        for (
            let iTrangGrps = 0;
            iTrangGrps < translationGroupDivs.snapshotLength;
            iTrangGrps++
        ) {
            const groupElement = translationGroupDivs.snapshotItem(
                iTrangGrps
            ) as HTMLElement;
            const dataDefaultLangsAttr = groupElement.getAttribute(
                "data-default-languages"
            );
            if (this.skipGroupByDefaultLangs(dataDefaultLangsAttr)) {
                continue;
            }
            const childElts = groupElement.childNodes;
            for (let iedit = 0; iedit < childElts.length; iedit++) {
                const divElement = childElts.item(iedit) as HTMLDivElement;
                if (
                    !divElement ||
                    !divElement.classList ||
                    !divElement.classList.contains("bloom-editable")
                ) {
                    continue;
                }
                if (
                    this.skipDivByDefaultLangs(
                        dataDefaultLangsAttr,
                        divElement.classList
                    )
                ) {
                    continue;
                }
                const divLang = divElement.getAttribute("lang");
                if (
                    divLang !== previousLangCode &&
                    divLang !== this.props.activeLanguageCode
                ) {
                    continue;
                }
                // Find the right div to remove visibility from
                // We don't want to remove visibility from bi-/tri-lingual divs that were already visible.
                if (divLang === previousLangCode &&
                    !(divElement.classList.contains("bloom-content2") ||
                    divElement.classList.contains("bloom-content3"))) {
                    divElement.classList.remove(visibilityClass);
                }
                if (divLang === this.props.activeLanguageCode) {
                    divElement.classList.add(visibilityClass);
                }
            }
        }
    }

    private skipDivByDefaultLangs(
        dataDefaultLangsAttr: string | null,
        divClassList: DOMTokenList
    ) {
        if (!dataDefaultLangsAttr || dataDefaultLangsAttr === "auto") {
            return false;
        }
        // The case that's left is data-default-languages contains something like 'V1, N1' or 'L1, L2'
        if (
            divClassList.contains("bloom-contentNational1") ||
            divClassList.contains("bloom-contentNational2")
        ) {
            return true;
        }
        return false;
    }

    private skipGroupByDefaultLangs(
        dataDefaultLangsAttr: string | null
    ): boolean {
        if (
            !dataDefaultLangsAttr ||
            dataDefaultLangsAttr === "auto" ||
            dataDefaultLangsAttr.indexOf("V") > -1 ||
            dataDefaultLangsAttr.indexOf("L1") > -1
        ) {
            return false;
        }
        return true;
    }

    public componentWillUnmount() {
        this.pauseAllMultimedia();
        document.removeEventListener("keydown", e =>
            this.handleDocumentLevelKeyDown(e)
        );
    }

    private pauseAllMultimedia() {
        this.narration.pause();
        this.video.pause();
        this.music.pause();
    }

    private getCreator(head: HTMLHeadElement): string {
        const metaElements = head.getElementsByTagName("meta");
        if (metaElements.length === 0) {
            return BloomPlayerCore.DEFAULT_CREATOR;
        }
        const creatorElement = metaElements.namedItem("bloom-digital-creator");
        if (creatorElement === null) {
            return BloomPlayerCore.DEFAULT_CREATOR;
        }
        return creatorElement.content;
    }

    private getCopyrightInfo(
        body: HTMLBodyElement,
        dataDivValue: string
    ): string {
        const copyrightNoticeRE = /^Copyright © \d\d\d\d, /;
        const copyrightElement = body.ownerDocument!.evaluate(
            ".//div[@data-book='" + dataDivValue + "']",
            body,
            null,
            XPathResult.ANY_UNORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        return copyrightElement
            ? (this.copyrightHolder = (copyrightElement.textContent || "")
                  .trim()
                  .replace(copyrightNoticeRE, ""))
            : "";
    }

    private reportBookOpened(body: HTMLBodyElement) {
        // this metaDataObject comes already parsed into a js object
        if (!this.metaDataObject) {
            return;
        }
        this.brandingProjectName = this.metaDataObject.brandingProjectName;
        this.bookTitle = this.metaDataObject.title;
        const bloomdVersion = this.metaDataObject.bloomdVersion
            ? this.metaDataObject.bloomdVersion
            : 0;

        this.features =
            bloomdVersion > 0
                ? this.metaDataObject.features
                : this.guessFeatures(body);

        // Some facts about the book will go out with not just this event,
        // but also subsequent events. We call these "ambient" properties.
        const ambientAnalyticsProps: any = {
            totalNumberedPages: this.totalNumberedPages,
            questionCount: this.questionCount,
            contentLang: this.bookLanguage1,
            features: this.features,
            sessionId: this.sessionId,
            title: this.bookTitle,
            creator: this.creator
        };
        if (this.brandingProjectName) {
            ambientAnalyticsProps.brandingProjectName = this.brandingProjectName;
        }
        if (this.originalCopyrightHolder) {
            ambientAnalyticsProps.originalCopyrightHolder = this.originalCopyrightHolder;
        }
        if (this.copyrightHolder) {
            ambientAnalyticsProps.copyrightHolder = this.copyrightHolder;
        }
        setAmbientAnalyticsProperties(ambientAnalyticsProps);
        reportAnalytics("BookOrShelf opened", {});
    }

    // In July 2019, Bloom Desktop added a bloomdVersion to meta.json and at the same
    // time, started to report features more fully/reliably in meta.json:features.
    private guessFeatures(body: HTMLBodyElement): string {
        const features: BookFeatures[] = [];
        // An obsolete .bloomd (won't happen on BL). Guess the features.
        // The only feature that we haven't already figured out is talkingBook.
        // Enhance: we could use a series of axios requests to see whether
        // any of the audio-sentece blocks actually has audio files.
        // Or, since obsolete bloomd's will only be found by BR, we could
        // send a request for BR to check the audio folder.

        // initially tried starts-with(@src, 'video') since we use that constraint in BR1.3.
        // It never matched. I suspect Android WebView doesn't support starts-with (XPath 1.0.4.2),
        // though I can't find any definite documentation saying so. Could use contains, but on
        // second thought this query (looking for video/source) is already superior to the 1.3
        // regular expression approach.
        const signLanguage =
            body.ownerDocument!.evaluate(
                ".//video/source[@src]",
                body,
                null,
                XPathResult.ANY_UNORDERED_NODE_TYPE,
                null
            ).singleNodeValue != null;
        const motion =
            (body.getAttribute("data-bffullscreenpicture") || "").indexOf(
                "landscape;bloomReader"
            ) >= 0;
        const blind =
            body.ownerDocument!.evaluate(
                ".//div[contains(@class, 'bloom-page') and not(@data-xmatter-page)]//div[contains(@class, 'bloom-imageDescription')]",
                body,
                null,
                XPathResult.ANY_UNORDERED_NODE_TYPE,
                null
            ).singleNodeValue != null;
        const isTalkingBook =
            body.ownerDocument!.evaluate(
                ".//*[contains(@class, 'audio-sentence')]",
                body,
                null,
                XPathResult.ANY_UNORDERED_NODE_TYPE,
                null
            ).singleNodeValue != null;
        // Note: the order of features here matches Bloom's BookMetaData.Features getter,
        // so the features will be in the same order as when output from there.
        // Not sure whether this matters, but it may make analysis of the data easier.
        if (blind) {
            features.push(BookFeatures.blind);
        }
        if (signLanguage) {
            features.push(BookFeatures.signLanguage);
        }
        if (isTalkingBook) {
            features.push(BookFeatures.talkingBook);
        }
        if (motion) {
            features.push(BookFeatures.motion);
        }
        return features.join(",");
    }

    // Update the analytics report that will be sent (if not updated again first)
    // by our external container (Bloom Reader, Bloom Library, etc.)
    // when the parent reader determines that the session reading this book is finished.
    private sendUpdateOfBookProgressReportToExternalContext() {
        const args = {
            audioPages: this.audioPages,
            nonAudioPages: this.totalPagesShown - this.audioPages,
            videoPages: this.videoPages,
            audioDuration: this.totalAudioDuration,
            videoDuration: this.totalVideoDuration,
            lastNumberedPageRead: this.lastNumberedPageWasRead
        };
        // Pass the completed report to the externalContext version of this method which actually sends it.
        updateBookProgressReport("Pages Read", args);
    }

    private generateUUID() {
        // Public Domain/MIT (stackoverflow)
        let d = new Date().getTime();

        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            // tslint:disable-next-line: no-bitwise
            const r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            // tslint:disable-next-line: no-bitwise
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    private getPreferredTranslationLanguages(): string[] {
        const languages: string[] = [];
        if (this.bookLanguage1) {
            languages.push(this.bookLanguage1);
        }
        if (this.bookLanguage2) {
            languages.push(this.bookLanguage2);
        }
        if (this.bookLanguage3) {
            languages.push(this.bookLanguage3);
        }
        return languages;
    }

    private makeNonEditable(body: HTMLBodyElement): void {
        // This is a preview, it's distracting to have it be editable.
        // (Should not occur in .bloomd, but might in books direct from BL.)
        const editable = body.ownerDocument!.evaluate(
            ".//*[@contenteditable]",
            body,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        for (let iedit = 0; iedit < editable.snapshotLength; iedit++) {
            (editable.snapshotItem(iedit) as HTMLElement).removeAttribute(
                "contenteditable"
            );
        }
    }

    private forceDevicePageSize(page: Element): boolean {
        return BloomPlayerCore.forceDevicePageSize(
            page,
            this.canRotate,
            this.props.landscape
        );
    }

    public static getPageSizeClass(page: Element): string {
        const classAttr = page.getAttribute("class") || "";
        const matches = classAttr.match(/\b\S*?(Portrait|Landscape)\b/);
        if (matches && matches.length) {
            return matches[0];
        } else {
            return "";
        }
    }

    // Force size class to be one of the device classes
    // return true if we determine that the book is landscape
    public static forceDevicePageSize(
        page: Element,
        bookCanRotate: boolean,
        showLandscape: boolean
    ): boolean {
        let landscape = false;
        const sizeClass = this.getPageSizeClass(page);
        if (sizeClass) {
            landscape = bookCanRotate
                ? showLandscape
                : (sizeClass as any).endsWith("Landscape");
            const desiredClass = landscape
                ? "Device16x9Landscape"
                : "Device16x9Portrait";
            if (sizeClass !== desiredClass) {
                page.classList.remove(sizeClass);
                page.classList.add(desiredClass);
            }
        }
        return landscape;
    }

    private goToFirstPage() {
        this.swiperInstance.slideTo(0);
    }

    private goToLastPage() {
        this.swiperInstance.slideTo(99999);
    }

    // urls of images and videos and audio need to be made
    // relative to the original book folder, not the page we are embedding them into.
    private fixRelativeUrls(page: Element) {
        const srcElts = page.ownerDocument!.evaluate(
            ".//*[@src]",
            page,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        for (let j = 0; j < srcElts.snapshotLength; j++) {
            const item = srcElts.snapshotItem(j) as HTMLElement;
            if (!item) {
                continue;
            }
            const srcName = item.getAttribute("src");
            const srcPath = this.fullUrl(srcName);
            item.setAttribute("src", srcPath);
        }

        // now we need to fix elements with attributes like this:
        // style="background-image:url('AOR_10AW.png')"
        const bgSrcElts = page.ownerDocument!.evaluate(
            ".//*[@style]",
            page,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        const regexp = new RegExp(/background-image:url\(['"](.*)['"]\)/);

        for (let j = 0; j < bgSrcElts.snapshotLength; j++) {
            const item = bgSrcElts.snapshotItem(j) as HTMLElement;
            if (!item) {
                continue;
            }
            const style = item.getAttribute("style") || ""; // actually we know it has style, but make lint happy
            const match = regexp.exec(style);
            if (!match) {
                continue;
            }
            const newUrl = this.fullUrl(match[1]);
            const newStyle = style.replace(
                regexp,
                // if we weren't using lazy-load:
                //  "background-image:url('" + newUrl + "'"
                ""
            );
            item.setAttribute("style", newStyle);
            item.setAttribute("data-background", newUrl);
            item.classList.add("swiper-lazy");
        }
    }

    // Make a <style> element in the head of the document containing an adjusted version
    // of the "fonts.css" file shipped with the book, if any.
    // This file typically contains @font-face declarations, which don't work when embedded
    // in the <scoped> element we make for each page contents. So we need the rules to
    // be placed in the <head> of the main document. (We don't want to do this with most
    // rules because rules from a book, especially from a customStyles file, could mess up
    // bloom-player itself.)
    // Since the root file, typically bloomPlayer.htm, is typically not at the same location
    // as the book files, the simple URLs it contains don't work, since they assume fonts.css
    // is loaded as part of a file in the same location as the font files. So we modify
    // the URLs in the file to be relative to the book folder.
    // There are possible dangers here...if someone got something malicious into fonts.css
    // it could at least mess up our player...but only for that one book, and in any case,
    // fonts.css is generated by the harvester so it shouldn't be possible for anyone without
    // harvester credentials to post a bad version of it.
    // Enhance: currently we're just looking for the (typically ttf) font uploaded as part
    // of the book if embedding is permitted. Eventually, we might want to try first for
    // a corresponding woff font in a standard location. We may even be able to pay to
    // provide some fonts there for book previewing that are NOT embeddable.
    private makeFontStylesheet(href: string): void {
        axios.get(href).then(result => {
            let stylesheet = document.getElementById(
                "fontCssStyleSheet"
            ) as HTMLStyleElement;
            if (!stylesheet) {
                stylesheet = document.createElement("style");
                document.head.appendChild(stylesheet);
                stylesheet.setAttribute("id", "fontCssStyleSheet");
            }
            const prefix = href.substring(0, href.length - "/fonts.css".length);
            stylesheet.innerText = result.data.replace(
                /src:url\(([^)]*)\)/g,
                "src:url(" + prefix + "/$1)"
            );
        });
        // no catch clause...if there's no fonts.css, we should never get a 'then' and
        // don't need to do anything.
    }

    // Assemble all the style rules from all the stylesheets the book contains or references.
    // When we finish (not before this method returns), the result will be set as
    // our state.styles with setState().
    // Exception: a stylesheet called "fonts.css" will instead be loaded into the <head>
    // of the main document, since it contains @font-face declarations that don't work
    // in the <scoped> element.
    private assembleStyleSheets(doc: HTMLHtmlElement) {
        const linkElts = doc.ownerDocument!.evaluate(
            ".//link[@href and @type='text/css']",
            doc,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        const promises: Array<AxiosPromise<any>> = [];
        for (let i = 0; i < linkElts.snapshotLength; i++) {
            const link = linkElts.snapshotItem(i) as HTMLElement;
            const href = link.getAttribute("href");
            const fullHref = this.fullUrl(href);
            if (fullHref.endsWith("/fonts.css")) {
                this.makeFontStylesheet(fullHref);
            } else {
                promises.push(axios.get(fullHref));
            }
        }
        if (this.needSpecialCss) {
            promises.push(
                axios.get(this.getFolderForSupportFiles() + "/Special.css")
            );
        }
        axios
            .all(
                promises.map(p =>
                    p.catch(
                        // if one stylesheet doesn't exist or whatever, keep going
                        () => undefined
                    )
                )
            )
            .then(results => {
                let combinedStyle = "";

                // start with embedded styles (typically before links in a bloom doc...)
                const styleElts = doc.ownerDocument!.evaluate(
                    ".//style[@type='text/css']",
                    doc,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
                for (let k = 0; k < styleElts.snapshotLength; k++) {
                    const styleElt = styleElts.snapshotItem(k) as HTMLElement;
                    combinedStyle += styleElt.innerText;
                }

                // then add the stylesheet contents we just retrieved
                results.forEach(result => {
                    if (result && result.data) {
                        combinedStyle += result.data;

                        // It is somewhat awkward to do this in a method called assembleStyleSheets,
                        // but this is the best way to access the information currently.
                        // See further comments in getNationalLanguagesFromCssStyles.
                        if (
                            result.config!.url!.endsWith(
                                "/settingsCollectionStyles.css"
                            )
                        ) {
                            [
                                this.bookLanguage2,
                                this.bookLanguage3
                            ] = LocalizationUtils.getNationalLanguagesFromCssStyles(
                                result.data
                            );
                        }
                    }
                });
                this.setState({
                    styleRules: combinedStyle,
                    isLoading: false
                });
                this.props.pageStylesAreNowInstalled();
            });
    }

    private fullUrl(url: string | null): string {
        // Enhance: possibly we should only do this if we somehow determine it is a relative URL?
        // But the things we apply it to always are, in bloom books.
        return this.urlPrefix + "/" + url;
    }

    private swiperInstance: SwiperInstance | null;
    private rootDiv: HTMLElement | null;

    public getRootDiv(): HTMLElement | null {
        return this.rootDiv;
    }

    public render() {
        if (this.state.isLoading) {
            return "Loading Book...";
        }
        const params = {
            // This is how we'd expect to make the next/prev buttons show up.
            // However, swiper puts them inside the swiper-container div, which has position:relative
            // and overflow:hidden. This hides the buttons when we want them to be outside the book
            // (e.g., bloom library). So instead we make our own buttons.
            // navigation: {
            //     nextEl: ".swiper-button-next",
            //     prevEl: ".swiper-button-prev"
            // },
            getSwiper: s => {
                this.swiperInstance = s;
            },
            on: {
                slideChange: () =>
                    this.showingPage(this.swiperInstance.activeIndex),
                slideChangeTransitionStart: () =>
                    this.setIndex(this.swiperInstance.activeIndex)
            },
            keyboard: {
                enabled: true,
                onlyInViewport: false
            },
            // Disable preloading of all images
            preloadImages: false,
            // Enable lazy loading, but load anything needed for the next couple of slides.
            // (I'm trying to avoid a problem where, in landscape mode of motion books,
            // we see a flash of the page without the full-screen picture overlaid.
            // I don't _think_ I saw this before implementing laziness. So far, I haven't
            // found settings that eliminate it completely, even commenting out preloadImages:false,
            // which defeats much of the purpose.)
            lazy: {
                loadPrevNext: true,
                loadOnTransitionStart: true,
                loadPrevNextAmount: 2
            },
            // This seems make it unnecessary to call Swiper.update at the end of componentDidUpdate.
            shouldSwiperUpdate: true
        };
        // multiple classes help make rules more specific than those in the book's stylesheet
        // (which benefit from an extra attribute item like __scoped_N)
        // It would be nice to use an ID but we don't want to assume there is
        // only one of these components on a page.
        return (
            <div
                className={
                    "bloomPlayer" +
                    (this.props.hideNextPrevButtons
                        ? " hideNextPrevButtons"
                        : "")
                }
                ref={bloomplayer => (this.rootDiv = bloomplayer)}
            >
                <Swiper {...params}>
                    {this.state.pages.map((slide, index) => {
                        return (
                            <div
                                key={slide}
                                className={
                                    "page-preview-slide " +
                                    this.getSlideClass(index)
                                }
                                onClick={e => {
                                    if (
                                        !this.state.isChanging && // if we're dragging, that isn't a click we want to propagate
                                        this.props.onContentClick
                                    ) {
                                        this.props.onContentClick(e);
                                    }
                                }}
                            >
                                <style scoped={true}>
                                    {this.state.styleRules}
                                </style>
                                <div
                                    className="actual-page-preview"
                                    dangerouslySetInnerHTML={{
                                        __html: slide
                                    }}
                                    ref={div => this.pageLoaded(div)}
                                />
                            </div>
                        );
                    })}
                </Swiper>
                <div
                    className={
                        "swiper-button-prev" +
                        (this.state.currentSwiperIndex === 0
                            ? " swiper-button-disabled"
                            : "")
                    }
                    onClick={() => this.swiperInstance.slidePrev()}
                >
                    {/* The ripple is an animation on the button on click and
                    focus, but it isn't placed correctly on our buttons for
                    some reason */}
                    <IconButton disableRipple={true}>
                        <ArrowBack />
                    </IconButton>
                </div>
                <div
                    className={
                        "swiper-button-next" +
                        (this.state.currentSwiperIndex >=
                        this.state.pages.length - 1
                            ? " swiper-button-disabled"
                            : "")
                    }
                    onClick={() => this.swiperInstance.slideNext()}
                >
                    <IconButton disableRipple={true}>
                        <ArrowForward />
                    </IconButton>
                </div>
            </div>
        );
    }

    private pageLoaded(div: HTMLDivElement | null): void {
        // When a page loads, if it is an interactive page we want to execute any scripts embedded in it.
        // This is potentially dangerous, so we make it less likely to happen through random attacks
        // by only doing it in pages that are explicitly marked as bloom interactive pages.
        if (
            div &&
            div.firstElementChild &&
            div.firstElementChild.classList.contains("bloom-interactive-page")
        ) {
            const scripts = div.getElementsByTagName("script");
            for (let i = 0; i < scripts.length; i++) {
                const script = scripts[i];
                const src = script.getAttribute("src");
                if (!src) {
                    // enhance: possibly window.eval(script.innerText?)
                    // But we consider embedding such scripts in Bloom
                    // unworkable, because our XHTML conversion mangles angle brackets.
                    continue;
                }

                if (src.endsWith("/simpleComprehensionQuiz.js")) {
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
                        })
                        .catch(error => {
                            console.log(error);
                        });
                } else {
                    // Get it from the specified place.
                    axios
                        .get(src)
                        // This would be highly dangerous in most contexts. It is one of the reasons
                        // we insist that bloom-player should live in its own iframe, protecting the rest
                        // of the page from things this eval might do.
                        // tslint:disable-next-line: no-eval
                        .then(result => eval(result.data))
                        .catch(() => {
                            // If we don't get it there, not much we can do.
                        });
                }
            }
        }
    }

    private getFolderForSupportFiles() {
        const href =
            window.location.protocol +
            "//" +
            window.location.host +
            window.location.pathname;
        const lastSlash = href.lastIndexOf("/");
        return href.substring(0, lastSlash);
    }

    // Get a class to apply to a particular slide. This is used to apply the
    // contextPage class to the slides before and after the current one.
    private getSlideClass(itemIndex: number): string {
        if (!this.props.showContextPages) {
            return "";
        }
        if (
            itemIndex === this.state.currentSwiperIndex ||
            itemIndex === this.state.currentSwiperIndex + 2
        ) {
            return "contextPage";
        }
        return "";
    }

    // Called from slideChangeTransitionStart
    // - makes an early change to state.currentSwiperIndex, which triggers some
    // class changes to animate the page sizing/shading in 3-page mode
    // - may need to force the page layout class to match the current button
    // setting, before we start to slide it into view
    // - if we're animating motion or showing video, need to get the page into the start state
    // before we slide it in
    private setIndex(index: number) {
        this.setState({ currentSwiperIndex: index });
        const bloomPage = this.getPageAtSwiperIndex(index);
        if (bloomPage) {
            // This is probably obsolete, since we update all the page sizes on rotate.
            // It's not expensive so leaving it in for robustness.
            if (this.canRotate) {
                this.forceDevicePageSize(bloomPage);
            }
            this.animation.HandlePageBeforeVisible(bloomPage);
            // Don't need to be playing a video that's off-screen,
            // and definitely don't want to be reporting analytics on
            // its continued playing.
            this.video.hidingPage();
            this.video.HandlePageBeforeVisible(bloomPage);
            this.music.hidingPage();
        }
    }

    private getPageAtSwiperIndex(index: number): HTMLElement | null {
        if (this.swiperInstance == null) {
            return null;
        }
        const swiperPage = this.swiperInstance.slides[index] as HTMLElement;
        if (!swiperPage) {
            return null; // unexpected
        }
        const bloomPage = swiperPage.getElementsByClassName(
            "bloom-page"
        )[0] as HTMLElement;
        return bloomPage;
    }

    public static getCurrentPage(): HTMLElement {
        return BloomPlayerCore.currentPage;
    }

    private isXmatterPage(): boolean {
        const page = BloomPlayerCore.currentPage;
        if (!page) {
            return true; // shouldn't happen, but at least it won't be counted in analytics
        }
        const classAttr = page.getAttribute("class");
        if (!classAttr || classAttr.indexOf("bloom-page") < 0) {
            return true; // as above, shouldn't happen, but...
        }
        // This test shouldn't be necessary, all xmatter pages are supposed to have data-xmatter-page,
        // but some (e.g., the final 'End' page in device-xmatter) currently don't. Even if we fix that,
        // it won't necessarily be fixed in existing bloomds.
        if (
            classAttr.indexOf("bloom-backMatter") >= 0 ||
            classAttr.indexOf("bloom-frontMatter") >= 0
        ) {
            return true;
        }
        return page.hasAttribute("data-xmatter-page");
    }

    // Called from slideChange, starts narration, etc.
    private showingPage(index: number): void {
        const bloomPage = this.getPageAtSwiperIndex(index);
        if (!bloomPage) {
            return; // blank initial or final page?
        }
        BloomPlayerCore.currentPage = bloomPage;
        // This is probably obsolete, since we update all the page sizes on rotate, and again in setIndex.
        // It's not expensive so leaving it in for robustness.
        if (this.canRotate) {
            this.forceDevicePageSize(bloomPage);
        }

        if (!this.props.paused) {
            this.resetForNewPageAndPlay(bloomPage);
        }

        if (!this.isXmatterPage()) {
            this.totalPagesShown++;
            if (index === this.indexOflastNumberedPage) {
                this.lastNumberedPageWasRead = true;
            }
        }

        if (this.props.reportPageProperties) {
            // Informs containing react controls (in the same frame)
            this.props.reportPageProperties({
                hasAudio: this.narration.pageHasAudio(bloomPage),
                hasMusic: Music.pageHasMusic(bloomPage),
                hasVideo: Video.pageHasVideo(bloomPage)
            });
        }

        this.reportedAudioOnCurrentPage = false;
        this.reportedVideoOnCurrentPage = false;
        this.sendUpdateOfBookProgressReportToExternalContext();
    }

    // called by narration.ts
    public static storeAudioAnalytics(duration: number): void {
        if (duration < 0.001) {
            return;
        }
        const player = BloomPlayerCore.currentPagePlayer;
        player.totalAudioDuration += duration;

        if (player.isXmatterPage()) {
            // Our policy is only to count non-xmatter audio pages. BL-7334.
            return;
        }

        if (!player.reportedAudioOnCurrentPage) {
            player.audioPages++;
            player.reportedAudioOnCurrentPage = true;
        }
        player.sendUpdateOfBookProgressReportToExternalContext();
    }

    public static storeVideoAnalytics(duration: number) {
        // We get some spurious very small durations, including sometimes a zero on a page that
        // doesn't have any video.
        if (duration < 0.001) {
            return;
        }
        const player = BloomPlayerCore.currentPagePlayer;
        player.totalVideoDuration += duration;
        if (!player.reportedVideoOnCurrentPage && !player.isXmatterPage()) {
            player.reportedVideoOnCurrentPage = true;
            player.videoPages++;
        }
        player.sendUpdateOfBookProgressReportToExternalContext();
    }
    // This should only be called when NOT paused, because it will begin to play audio and highlighting
    // and animation from the beginning of the page.
    private resetForNewPageAndPlay(bloomPage: HTMLElement): void {
        if (this.props.paused) {
            return; // shouldn't call when paused
        }
        // When we have computed it, this will raise PageDurationComplete,
        // which calls an animation method to start the image animation.
        this.narration.computeDuration(bloomPage);
        this.narration.playAllSentences(bloomPage);
        if (Animation.pageHasAnimation(bloomPage as HTMLDivElement)) {
            this.animation.HandlePageBeforeVisible(bloomPage);
        }
        this.video.HandlePageVisible(bloomPage);
        this.animation.HandlePageVisible(bloomPage);
        this.music.HandlePageVisible(bloomPage);
    }
}
