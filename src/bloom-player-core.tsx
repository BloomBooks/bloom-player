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
//tslint:disable-next-line:no-submodule-imports
import LoadFailedIcon from "@material-ui/icons/SentimentVeryDissatisfied";

import { ActivityManager } from "./activities/activityManager";
import { LegacyQuestionHandler } from "./activities/legacyQuizHandling/LegacyQuizHandler";
import { CircularProgress } from "@material-ui/core";

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

    locationOfDistFolder: string;
}
interface IState {
    pages: string[]; // of the book. First and last are empty in context mode.
    styleRules: string; // concatenated stylesheets the book references or embeds.
    // indicates current page, though typically not corresponding to the page
    // numbers actually on the page. This is an index into pages, and in context
    // mode it's the index of the left context page, not the main page.
    currentSwiperIndex: number;
    isLoading: boolean;
    loadFailed: boolean;
    loadErrorHtml: string;

    //When in touch mode (in chrome debugger at least), a touch on a navigation button
    //causes a click to be raised after the onTouchEnd(). This would normally try and
    //toggle the app bar. So we have onTouchStart() set this to true and then set to
    // false in the onClick handler. Sigh.
    ignorePhonyClick: boolean;
}

enum BookFeatures {
    talkingBook = "talkingBook",
    blind = "blind",
    signLanguage = "signLanguage",
    motion = "motion"
}

export class BloomPlayerCore extends React.Component<IProps, IState> {
    private static DEFAULT_CREATOR: string = "bloom";
    private readonly activityManager: ActivityManager = new ActivityManager();
    private readonly legacyQuestionHandler: LegacyQuestionHandler;

    private readonly initialPages: string[] = ["loading..."];
    private readonly initialStyleRules: string = "";

    // This block of variables keep track of things we want to report in analytics
    private totalNumberedPages = 0; // found in book
    private pagesShown: Set<number> = new Set<number>(); // collection of (non-xmatter) pages shown
    private audioPagesShown: Set<number> = new Set<number>(); // collection of (non-xmatter) audio pages shown
    private videoPagesShown: Set<number> = new Set<number>(); // collection of (non-xmatter) video pages shown
    private questionCount = 0; // comprehension questions found in book
    private features = "";

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
        this.legacyQuestionHandler = new LegacyQuestionHandler(
            props.locationOfDistFolder
        );
    }

    public readonly state: IState = {
        pages: this.initialPages,
        styleRules: this.initialStyleRules,
        currentSwiperIndex: 0,
        isLoading: true,
        loadFailed: false,
        loadErrorHtml: "",
        ignorePhonyClick: false
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
    private autoAdvance: boolean;

    private isPagesLocalized: boolean = false;

    private static currentPage: HTMLElement;
    private static currentPageIndex: number;

    private indexOflastNumberedPage: number;

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
        try {
            if (this.state.loadFailed) {
                return; // otherwise we'll just be stuck in here forever trying to load
            }
            // contains conditions to limit this to one time only after assembleStyleSheets has completed.
            this.localizeOnce();
            // also one-time setup; only the first time through
            this.initializeMedia();

            if (
                !this.state.isLoading &&
                !this.state.loadFailed &&
                prevProps.activeLanguageCode !== this.props.activeLanguageCode
            ) {
                // The usual case invoked by changing the language on the player menu.
                if (this.htmlElement) {
                    this.updateDivVisibilityByLangCode();
                    this.finishUp(false); // finishUp(false) just reloads the swiper pages from our stored html
                }
            }

            const newSourceUrl = this.calculateNewUrl();
            // Inside of Bloom Publish Preview,
            // this will be "" if we should just keep spinning, waiting for a render with different
            // props once the bloomd is created.

            if (newSourceUrl && newSourceUrl !== this.sourceUrl) {
                // We're changing books; reset several variables including isLoading,
                // until we inform the controls which languages are available.
                this.setState({ isLoading: true, loadFailed: false });
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
                Promise.all([htmlPromise, metadataPromise])
                    .then(result => {
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

                        const body = bookHtmlElement.getElementsByTagName(
                            "body"
                        )[0];
                        this.bookLanguage1 = LocalizationUtils.getBookLanguage1(
                            body as HTMLBodyElement
                        );
                        this.canRotate = body.hasAttribute("data-bfcanrotate"); // expect value allOrientations;bloomReader, should we check?
                        this.autoAdvance = body.hasAttribute(
                            "data-bfautoadvance"
                        ); // expect value landscape:bloomReader, should we check?

                        this.copyrightHolder = this.getCopyrightInfo(
                            body,
                            "copyright"
                        );
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
                            pageClass = BloomPlayerCore.getPageSizeClass(
                                firstPage
                            );
                        }
                        // enhance: make this callback thing into a promise
                        this.legacyQuestionHandler.generateQuizPagesFromLegacyJSON(
                            this.urlPrefix,
                            body,
                            pageClass,
                            () => {
                                this.finishUp();
                            }
                        );
                    })
                    .catch(err => this.HandleLoadingError(err));
            } else if (prevProps.landscape !== this.props.landscape) {
                // rotating the phone...may need to switch the orientation class on each page.
                const pages = document.getElementsByClassName("bloom-page");
                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    this.forceDevicePageSize(page);
                }
            }

            if (prevProps.landscape !== this.props.landscape) {
                // if there was a rotation, we may need to show the page differently (e.g. Motion books)
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
        } catch (error) {
            this.setState({
                isLoading: false,
                loadFailed: true,
                loadErrorHtml: error.message
            });
        }
    }

    private HandleLoadingError(axiosError: any) {
        const errorMessage = axiosError.message as string;
        // Note: intentionally no bothering to add this to the l10n load, at this time.
        let msg = `<p>There was a problem displaying this book: ${errorMessage}<p>`; // just show the raw thing
        // If it's a file:/// url, we're probably on an Android, and something
        // went wrong with unpacking it, or it is corrupt. This typically results in an error
        // message that is NOT a 404 but IS reported, unhelpfully, as a "Network Error" (BL-7813).
        // A file:/// url can't possibly be a network error, so the "part of the book is missing"
        // error is at least a little more helpful, maybe to the user, and certainly to a developer
        // trying to fix the problem, especially if the user reports the problem URL.
        const localFileMissing =
            axiosError.config &&
            axiosError.config.url &&
            axiosError.config.url.startsWith("file:///");
        if (localFileMissing || axiosError.message.indexOf("404") >= 0) {
            msg = "<p>This book (or some part of it) was not found.<p>";
            if (axiosError.config && axiosError.config.url) {
                msg += `<p class='errorDetails'>${encodeURI(
                    axiosError.config.url
                )}</p>`;
            }
        }
        this.setState({
            isLoading: false,
            loadFailed: true,
            loadErrorHtml: msg
        });
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
            this.activityManager.collectActivityContextForBook(pages);
            this.pagesShown.clear();
            this.audioPagesShown.clear();
            this.videoPagesShown.clear();
        }
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i] as HTMLElement;
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

            // look for activities on this page
            this.activityManager.processPage(this.urlPrefix, page);
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
                const languages = LangData.createLangDataArrayFromDomAndMetadata(
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
            this.narration.PageNarrationComplete = new LiteEvent<HTMLElement>();
            this.animation = new Animation();
            this.narration.PageDurationAvailable.subscribe(pageElement => {
                this.animation.HandlePageDurationAvailable(
                    pageElement!,
                    this.narration.PageDuration
                );
            });
            this.narration.PageNarrationComplete.subscribe(pageElement => {
                this.HandlePageNarrationComplete(pageElement);
            });
        }
        if (!this.music) {
            this.music = new Music();
        }
    }

    private calculateNewUrl(): string {
        let newSourceUrl = this.props.url;
        if (newSourceUrl === undefined || "" === newSourceUrl.trim()) {
            throw new Error(
                "The url parameter was empty. It should point to the url of a book."
            );
        }
        // Bloom Publish Preview uses this so that we get spinning wheel while working on making the bloomd
        if (newSourceUrl === "working") {
            return "";
        }

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
            this.animation.PlayAnimation();
            this.video.play();
            this.music.play();
        }
    }

    // Go through all .bloom-editable divs turning visibility off/on based on the activeLanguage (isoCode).
    // When using the language chooser, the activeLanguage should be treated as if it were the L1/Vernacular language
    private updateDivVisibilityByLangCode(): void {
        if (
            this.props.activeLanguageCode === undefined ||
            this.htmlElement === undefined
        ) {
            return; // shouldn't happen, just a precaution
        }

        // The newly selected language will be treated as the new, current vernacular language.
        // (It may or may not be the same as the original vernacular language at the time of publishing)
        const langVernacular = this.props.activeLanguageCode;

        // Update all the bloom-editables inside the translation group to take into account the new vernacular language
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

            // Split the string into array form instead, using delimiters "," or " "
            const dataDefaultLangs = dataDefaultLangsAttr
                ? dataDefaultLangsAttr.split(/,| /)
                : [];

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

                const divLang = divElement.getAttribute("lang");

                const shouldShow = BloomPlayerCore.shouldNormallyShowEditable(
                    divLang || "",
                    dataDefaultLangs,
                    langVernacular,
                    divElement
                );

                if (shouldShow) {
                    divElement.classList.add(visibilityClass);

                    // Note: Well, the BloomDesktop C# code technically removes anything beginning with "bloom-visibility-code"
                    // before checking if should show,
                    // but handling just the "-on" and "-off" suffixes seems sufficient and makes the code simpler.
                    divElement.classList.remove("bloom-visibility-code-off");
                } else {
                    divElement.classList.remove(visibilityClass);
                }

                // Since we potentially change the Language1 (aka Vernacular language), we should ideally update which divs have bloom-content1
                // In addition to maintaining consistency, it also allows divs in the new L1 to receive L1-specific CSS.
                //     e.g. the title receives special formatting if it contains "bloom-content1" class
                // Another benefit is that if the old L3 becomes the new L1, then having "bloom-content1" applied
                //     allows the new L1 divs to appear above the L2 in diglot books, whereas if not then the new L1 would be below old L2
                if (divLang === langVernacular) {
                    divElement.classList.add("bloom-content1");
                } else {
                    divElement.classList.remove("bloom-content1");
                }
            }
        }
    }

    // Returns true if the editable should be visible.
    // The "Normally" means ignoring user overrides via .bloom-visibility-user-on/off
    //   Note: Even though there were some plans for user overrides, it doesn't seem like it's actually really supported / working.
    //   So, this function should be responsible for basically entirely determining the visibility.
    //
    // This function is modeled as much as possible on BloomDesktop's src/BloomExe/Book/TranslationGroupManager.cs ShouldNormallyShowEditable()
    private static shouldNormallyShowEditable(
        lang: string, // The language of the editable in question
        dataDefaultLanguages: string[] | null | undefined,
        settingsLang1: string,
        divElement: HTMLElement
    ): boolean {
        const matchesContent2 = divElement.classList.contains("bloom-content2");
        const matchesContent3 = divElement.classList.contains("bloom-content3");

        if (
            dataDefaultLanguages == null ||
            dataDefaultLanguages.length === 0 ||
            !dataDefaultLanguages[0] ||
            this.areStringsEqualInvariantCultureIgnoreCase(
                dataDefaultLanguages[0],
                "auto"
            )
        ) {
            return lang === settingsLang1 || matchesContent2 || matchesContent3;
        } else {
            // Note there are (perhaps unfortunately) two different labelling systems, but they have a 1-to-1 correspondence:
            // The V/N1/N2 system feels natural in vernacular book contexts
            // The L1/L2/L3 system is more natural in source book contexts.
            return (
                (lang === settingsLang1 &&
                    dataDefaultLanguages.includes("V")) ||
                (lang === settingsLang1 &&
                    dataDefaultLanguages.includes("L1")) ||
                (this.isDivInL2(divElement) &&
                    dataDefaultLanguages.includes("N1")) ||
                (this.isDivInL2(divElement) &&
                    dataDefaultLanguages.includes("L2")) ||
                (this.isDivInL3(divElement) &&
                    dataDefaultLanguages.includes("N2")) ||
                (this.isDivInL3(divElement) &&
                    dataDefaultLanguages.includes("L3")) ||
                dataDefaultLanguages.includes(lang) // a literal language id, e.g. "en" (used by template starter)
            );
        }
    }

    private static areStringsEqualInvariantCultureIgnoreCase(
        a: string,
        b: string
    ) {
        return a.localeCompare(b, "en-US", { sensitivity: "accent" }) === 0;
    }

    private static isDivInL2(divElement: HTMLElement): boolean {
        return divElement.classList.contains("bloom-contentNational1");
    }

    private static isDivInL3(divElement: HTMLElement): boolean {
        return divElement.classList.contains("bloom-contentNational2");
    }

    public componentWillUnmount() {
        this.pauseAllMultimedia();
        document.removeEventListener("keydown", e =>
            this.handleDocumentLevelKeyDown(e)
        );
    }

    private pauseAllMultimedia() {
        this.narration.pause();
        this.animation.PauseAnimation();
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
            audioPages: this.audioPagesShown.size,
            nonAudioPages: this.pagesShown.size - this.audioPagesShown.size,
            videoPages: this.videoPagesShown.size,
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
                // This is so complex because at one time we weren't adding the
                // quotes around the original url. So, now we handle no quotes,
                // single quotes, and double quotes. Note that we also have to
                // handle possible parentheses in the file name.
                /src:url\(['"]?(.*\.[^\)'"]*)['"]?\)/g,
                "src:url('" + prefix + "/$1')"
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
        const p = this.legacyQuestionHandler.getPromiseForAnyQuizCss();
        if (p) {
            promises.push(p);
        }

        axios
            .all(
                promises.map(promise =>
                    promise.catch(
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
            })
            .catch(err => this.HandleLoadingError(err));
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
        const showNavigationButtonsEvenOnTouchDevices = this.activityManager.getActivityAbsorbsDragging(); // we have to have *some* way of changing the page
        if (this.state.isLoading) {
            return (
                <CircularProgress
                    className="loadingSpinner"
                    color="secondary"
                />
            );
        }
        if (this.state.loadFailed) {
            return (
                <>
                    <LoadFailedIcon
                        className="loadFailedIcon"
                        color="secondary"
                    />
                    <div
                        className="loadErrorMessage"
                        dangerouslySetInnerHTML={{
                            __html: this.state.loadErrorHtml
                        }}
                    />
                </>
            );
        }
        const params: any = {
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
            simulateTouch: true, //Swiper will accept mouse events like touch events (click and drag to change slides)

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
                    (showNavigationButtonsEvenOnTouchDevices
                        ? " showNavigationButtonsEvenOnTouchDevices"
                        : this.props.hideNextPrevButtons
                        ? " hideNextPrevButtons"
                        : "")
                }
                ref={bloomplayer => (this.rootDiv = bloomplayer)}
            >
                <Swiper {...params}>
                    {this.state.pages.map((slide, index) => {
                        return (
                            <div
                                key={index}
                                className={
                                    "page-preview-slide " +
                                    this.getSlideClass(index)
                                }
                                onClick={e => {
                                    if (
                                        !this.state.ignorePhonyClick && // if we're dragging, that isn't a click we want to propagate
                                        this.props.onContentClick &&
                                        !this.activityManager.getActivityAbsorbsClicking()
                                    ) {
                                        this.props.onContentClick(e);
                                    }
                                    this.setState({ ignorePhonyClick: false });
                                }}
                            >
                                {/* This is a huge performance enhancement on large books (from several minutes to a few seconds):
                                    Only load up the one that is about to be current page and the ones on either side of it with
                                    actual html contents, let every other page be an empty string placeholder. Ref BL-7652 */}
                                {Math.abs(
                                    index - this.state.currentSwiperIndex
                                ) < 2 ? (
                                    <>
                                        <style scoped={true}>
                                            {this.state.styleRules}
                                        </style>
                                        <div
                                            className="bloomPlayer-page"
                                            dangerouslySetInnerHTML={{
                                                __html: slide
                                            }}
                                        />
                                    </>
                                ) : (
                                    // All other pages are just empty strings
                                    ""
                                )}
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
                    onTouchStart={e => {
                        this.setState({ ignorePhonyClick: true });
                        this.swiperInstance.slidePrev();
                    }}
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
                    onTouchStart={() => this.swiperInstance.slideNext()}
                >
                    <IconButton disableRipple={true}>
                        <ArrowForward />
                    </IconButton>
                </div>
            </div>
        );
    }

    // What we need to do when the page narration is completed (if autoadvance, go to next page).
    public HandlePageNarrationComplete(page: HTMLElement | undefined) {
        // When we run this in Bloom, these variables are all present and accounted for and accurate.
        // When it's run in Storybook, not so much.
        if (!page) {
            return;
        }
        if (this.autoAdvance && this.props.landscape) {
            this.swiperInstance.slideNext();
        }
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
        clearTimeout(this.narration.pageNarrationCompleteTimer);
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
        // While working on performance, we found that (at least some of) the following was slow.
        // (In a large book, still somewhat inexplicably, the stuff checking for audio was slow).
        // Even though the new page was already computed, we found that this blocked the ui from
        // scrolling it into view. So now we allow that to finish, then do this stuff.
        //console.log(`ShowingPage(${index})`);
        window.setTimeout(() => {
            const bloomPage = this.getPageAtSwiperIndex(index);
            if (!bloomPage) {
                return; // blank initial or final page?
            }
            BloomPlayerCore.currentPage = bloomPage;
            BloomPlayerCore.currentPageIndex = index;

            // This is probably obsolete, since we update all the page sizes on rotate, and again in setIndex.
            // It's not expensive so leaving it in for robustness.
            if (this.canRotate) {
                this.forceDevicePageSize(bloomPage);
            }

            if (!this.props.paused) {
                this.resetForNewPageAndPlay(bloomPage);
            }

            if (!this.isXmatterPage()) {
                this.pagesShown.add(index);
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
            this.activityManager.showingPage(index, bloomPage);

            this.reportedAudioOnCurrentPage = false;
            this.reportedVideoOnCurrentPage = false;
            this.sendUpdateOfBookProgressReportToExternalContext();

            // these were hard to get right. If you change them, make sure to test both mouse and touch mode (simulated in Chrome)
            this.swiperInstance.params.noSwiping = this.activityManager.getActivityAbsorbsDragging();
            this.swiperInstance.params.touchRatio = this.activityManager.getActivityAbsorbsDragging()
                ? 0
                : 1;
            // didn't seem to help: this.swiperInstance.params.allowTouchMove = false;
            if (this.activityManager.getActivityAbsorbsTyping()) {
                this.swiperInstance.keyboard.disable();
            } else {
                this.swiperInstance.keyboard.enable();
            }
        }, 0); // do this on the next cycle, so we don't block scrolling and display of the next page
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
            player.reportedAudioOnCurrentPage = true;
            player.audioPagesShown.add(BloomPlayerCore.currentPageIndex);
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
            player.videoPagesShown.add(BloomPlayerCore.currentPageIndex);
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
