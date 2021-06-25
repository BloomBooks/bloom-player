/*
bloom-player-core is responsible for all the behavior of working through a book, but without any UI controls
(other than page turning).
*/
/// <reference path="../node_modules/@types/jquery.nicescroll/index.d.ts" />
import * as React from "react";
import * as ReactDOM from "react-dom";
import axios, { AxiosPromise } from "axios";
import Swiper, { SwiperInstance } from "react-id-swiper";
// This loads some JS right here that is a polyfill for the (otherwise discontinued) scoped-styles html feature
// tslint:disable-next-line: no-submodule-imports
import "style-scoped/scoped.min.js";
// tslint:disable-next-line: no-submodule-imports
import "swiper/dist/css/swiper.min.css";
// tslint:enable:no-submodule-imports
import "./bloom-player.less";
import Narration from "./narration";
import LiteEvent from "./event";
import { Animation } from "./animation";
import { IPageVideoComplete, Video } from "./video";
import { Music } from "./music";
import { LocalizationManager } from "./l10n/localizationManager";
import {
    reportAnalytics,
    setAmbientAnalyticsProperties,
    updateBookProgressReport
} from "./externalContext";
import LangData from "./langData";
// tslint:disable-next-line: no-submodule-imports
import Replay from "@material-ui/icons/Replay";

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
import { BookInfo } from "./bookInfo";
import { BookInteraction } from "./bookInteraction";
import $ from "jquery";
import "jquery.nicescroll";
import { getQueryStringParamAndUnencode } from "./utilities/urlUtils";

export enum PlaybackMode {
    NewPage, // starting a new page ready to play
    NewPageMediaPaused, // starting a new page in the "paused" state
    VideoPlaying, // video is playing
    VideoPaused, // video is paused
    AudioPlaying, // narration and/or animation are playing (or possibly finished)
    AudioPaused, // narration and/or animation are paused
    MediaFinished // video, narration, and/or animation has played (possibly no media to play)
    // Note that music can be playing when the state is either AudioPlaying or MediaFinished.
}
// BloomPlayer takes a URL param that directs it to Bloom book.
// (See comment on sourceUrl for exactly how.)
// It displays pages from the book and allows them to be turned by dragging.
// On a wide screen, an option may be used to show the next and previous pages
// beside the current one.

interface IProps {
    // Url of the bloom book (folder). Should be a valid, well-formed URL
    // e.g. any special chars in the path or book title should be appropriately encoded
    // e.g. if title is C#, url should be http://localhost:8089/bloom/C:/PathToTemp/PlaceForStagingBook/C%23
    url: string;
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
        preferredLanguages: string[];
    }) => void;

    // 'controlsCallback' feeds information about the book's contents up to BloomPlayerControls
    // So far:
    // - the book's languages for the LanguageMenu to use
    // - whether the book has image descriptions or not.
    controlsCallback?: (
        bookLanguages: LangData[],
        bookHasImageDescriptions: boolean
    ) => void;

    // Allows the core to inform the controls that we have been forced to pause.
    // We use this when trying to play initially and that playback fails,
    // usually because the browser doesn't think the user has interacted with the page.
    // We set it false if we can detect that the user interacted, e.g., by clicking next.
    // Though we are no longer forced to be paused, we will stay paused unless the user
    // indicates he wants sound.
    // See BL-8864.
    setForcedPausedCallback?: (paused: boolean) => void;

    // Set by BloomPlayerControls -> ControlBar -> LanguageMenu
    // Changing this should modify bloom-visibility-code-on stuff in the DOM.
    activeLanguageCode: string;

    useOriginalPageSize?: boolean;

    reportPageProperties?: (properties: {
        hasAudio: boolean;
        hasMusic: boolean;
        hasVideo: boolean;
    }) => void;

    hideNextPrevButtons?: boolean;

    locationOfDistFolder: string;

    // may be "largeOutsideButtons" or "smallOutsideButtons" or empty.
    outsideButtonPageClass: string;

    extraClassNames?: string;

    shouldReadImageDescriptions: boolean;

    imageDescriptionCallback: (inImageDescription: boolean) => void;
}
interface IState {
    pages: string[]; // of the book. First and last are empty in context mode.

    // concatenated stylesheets the book references or embeds.
    // Make sure these are only set once per book or else
    // it wreaks havoc on scoped styles. See BL-9504.
    styleRules: string;

    importedBodyClasses: string;
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

    // True if finishUp has completed when isNewBook is true.
    // I couldn't find any other way to know if the change in the landscape prop
    // should trigger a load of the current slide. Without this, we were trying
    // to load the initial slide multiple times when a book was landscape when
    // it was loaded the first time.
    isFinishUpForNewBookComplete: boolean;

    // Works in tandem with props.setForcedPausedCallback. If true, we need to call the callback
    // whenever something happens that would end the forced pause.
    // True represents a state where we wanted to be playing but cannot (see setPausedCallback).
    // If the user interacts, which we detect as anything that makes us change page,
    // we're no longer in a FORCED pause, though we may still be paused.
    inPauseForced: boolean;
}

export class BloomPlayerCore extends React.Component<IProps, IState> {
    private readonly activityManager: ActivityManager = new ActivityManager();
    private readonly legacyQuestionHandler: LegacyQuestionHandler;

    private readonly initialPages: string[] = ["loading..."];
    private readonly initialStyleRules: string = "";
    private originalPageClass = "Device16x9Portrait";

    private bookInfo: BookInfo = new BookInfo();
    private bookInteraction: BookInteraction = new BookInteraction();

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
        importedBodyClasses: "",
        currentSwiperIndex: 0,
        isLoading: true,
        loadFailed: false,
        loadErrorHtml: "",
        ignorePhonyClick: false,
        isFinishUpForNewBookComplete: false,
        inPauseForced: false
    };

    // The book url we were passed as a URL param.
    // May be a full url of the html file (eventually, typically, index.htm);
    // in this case, it must end with .htm (currently we do NOT support .html).
    // May be a url of a folder whose name is the book title, where the book has the same name,
    // e.g., .../X means the book is .../X/X.htm (NOT X.html)
    private sourceUrl: string;
    // The folder containing the html file.
    private urlPrefix: string;

    private metaDataObject: any | undefined;
    private htmlElement: HTMLHtmlElement | undefined;

    private narration: Narration;
    private animation: Animation;
    private music: Music;
    private video: Video;

    private isPagesLocalized: boolean = false;

    private static currentPage: HTMLElement | null;
    private static currentPageIndex: number;
    private static currentPageHasVideo: boolean;

    public static currentPlaybackMode: PlaybackMode;

    private indexOflastNumberedPage: number;

    public componentDidMount() {
        LocalizationManager.setUp();

        // To get this to fire consistently no matter where the focus is,
        // we have to attach to the document itself. No level of react component
        // seems to work (using the OnKeyDown prop). So we use good ol'-fashioned js.
        document.addEventListener("keydown", e =>
            this.handleDocumentLevelKeyDown(e)
        );
        // March 2020 - Andrew/JohnH got confused about this line because 1) we don't actually *know* the
        // previous props & state, so it's a bit bogus (but it does work), and 2) when we remove it
        // everything still works (but there could well be some state that we didn't test). So we're leaving
        // it in.
        this.componentDidUpdate(this.props, this.state);
        const host = getQueryStringParamAndUnencode("host");
        if (host === "bloomdesktop") {
            // needed only for GeckoFx60. (We hope no one else is still running FF 60!)
            // To test this in storybook:
            // - use the "Activity that leads to FF60 split page";
            // - use Firefox 60, initially you should see the problem when advancing to second page
            // - inspect and add "&host=bloomdesktop" to the source of the storybook iframe to see the fix.
            // or, of course, you can try it actually in Bloom desktop.
            setTimeout(() => this.repairFF60Offset(), 2000);
        }
    }

    // This horrible hack attempts to fix the worst effects of BL-8900. Basically, something inside
    // a widget iframe sometimes causes the wrapper that holds the whole collection of pages to scroll
    // over to be out of position. It appears to be related to an unknown bug in FF60...a very nasty one
    // since anything happening inside an iframe should not be able to affect its size, position, or
    // anything outside it (except with the deliberate cooperation of the host page). We have not found
    // any good way to stop it happening, but this basically compensates for it and puts the current page
    // back where it belongs. Our theory is that the problem occurs when the activity finishes loading,
    // typically sometime after the page before it becomes the 'current' page and the activity itself is
    // therefore the 'next' page and no longer blocked by laziness.
    // Observed cases take about 2s for the problem to appear on a fast computer
    // with a good internet. To be fairly sure of catching it if it happens, but not keep using power
    // doing this forever, we monitor for it for 30s.
    // Note that the initial call that starts this checking process only happens if we are invoked
    // from bloomdesktop. Otherwise, this function will never be called at all.
    private repairFF60Offset() {
        try {
            let wrapper = document.getElementsByClassName(
                "swiper-wrapper"
            )[0] as HTMLElement;
            let current = document.getElementsByClassName(
                "swiper-slide-active"
            )[0] as HTMLElement;
            if (wrapper && current && this.msToContinueFF60RepairChecks > 0) {
                let error =
                    wrapper.parentElement!.getBoundingClientRect().left -
                    current.getBoundingClientRect().left;
                if (Math.abs(error) > 1) {
                    const scale =
                        wrapper.getBoundingClientRect().width /
                        wrapper.offsetWidth;
                    const paddingPx = wrapper.style.paddingLeft;
                    const padding =
                        paddingPx.length === 0
                            ? 0
                            : parseFloat(
                                  paddingPx.substring(0, paddingPx.length - 2)
                              );
                    wrapper.style.paddingLeft = padding + error / scale + "px";
                }
            }
        } catch (_) {
            // If something goes wrong with this...oh well, we tried, and on most
            // browsers we didn't need it anyway.
        }
        this.msToContinueFF60RepairChecks -= 100;
        setTimeout(() => this.repairFF60Offset(), 100);
    }

    // This stores a number of milliseconds during which we should continue to check repeatedly
    // for the FF60 problem described above. It is set to zero when checking should be disabled
    // (e.g., during drag or animation) and to a substantial number after we change pages.
    // Then it gets decremented in repairFF60Offset, and eventually decrements to zero so we
    // don't consume extra power forever doing this check.
    private msToContinueFF60RepairChecks = 0;

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
    public componentDidUpdate(prevProps: IProps, prevState: IState) {
        try {
            if (this.state.loadFailed) {
                return; // otherwise we'll just be stuck in here forever trying to load
            }
            // also one-time setup; only the first time through
            this.initializeMedia();

            const newSourceUrl = this.preprocessUrl();
            // Inside of Bloom Publish Preview,
            // this will be "" if we should just keep spinning, waiting for a render with different
            // props once the bloomd is created.

            if (newSourceUrl && newSourceUrl !== this.sourceUrl) {
                this.finishUpCalled = false;
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
                // Note, The current best practice is actually to have the htm file always be "index.htm".
                // Most (all?) bloom-player hosts are already looking for that, then looking for a name
                // matching the zip file's name, then going with the first.
                const haveFullPath = filename.endsWith(".htm");
                const urlOfBookHtmlFile = haveFullPath
                    ? this.sourceUrl
                    : this.sourceUrl + "/" + filename + ".htm";

                this.music.urlPrefix = this.narration.urlPrefix = this.urlPrefix = haveFullPath
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

                        this.bookInfo.setSomeBookInfoFromBody(body);
                        // contains conditions to limit this to one time only after assembleStyleSheets has completed.
                        // Requires bookInfo data, so we must do it after we initialize that.
                        this.localizeOnce();

                        this.animation.PlayAnimations = this.bookInfo.playAnimations;

                        this.setBodyClasses(body);
                        this.makeNonEditable(body);
                        this.htmlElement = bookHtmlElement;

                        const firstPage = bookHtmlElement.getElementsByClassName(
                            "bloom-page"
                        )[0];
                        this.originalPageClass = "Device16x9Portrait";
                        if (firstPage) {
                            this.originalPageClass = BloomPlayerCore.getPageSizeClass(
                                firstPage
                            );
                        }
                        // enhance: make this callback thing into a promise
                        this.legacyQuestionHandler.generateQuizPagesFromLegacyJSON(
                            this.urlPrefix,
                            body,
                            this.originalPageClass,
                            () => {
                                this.finishUp();
                            }
                        );
                    })
                    .catch(err => this.HandleLoadingError(err));
            } else if (
                prevProps.landscape !== this.props.landscape ||
                prevProps.useOriginalPageSize !== this.props.useOriginalPageSize
            ) {
                // rotating the phone...may need to switch the orientation class on each page.
                const pages = document.getElementsByClassName("bloom-page");
                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    this.setPageSizeClass(page);
                }
            }

            // This is likely not the most efficient way to do this. Ideally, we would set the initial language code
            // on the initial pass. But the complexity was overwhelming, so we settled for what works.
            if (
                !this.state.isLoading &&
                // First time after loaded - at this point, we know we are ready to get at the dom
                // BL-9307 we lost this case in a refactor, by the time we are loaded
                // prevProps.activeLanguageCode has already been setup, so we never hit the initial run.
                // See Storybook story: "Multilingual motion book - initial language set to 'ko'"
                (prevState.isLoading ||
                    // If the user changes the language code in the picker
                    prevProps.activeLanguageCode !==
                        this.props.activeLanguageCode)
            ) {
                this.updateDivVisibilityByLangCode();
                // If we have previously called finishup, we need to call it again to set the swiper pages correctly.
                // If we haven't called it, it will get called subsequently.
                if (this.finishUpCalled) {
                    this.finishUp(false); // finishUp(false) just reloads the swiper pages from our stored html
                }
            }

            // If the user changes the image description button on the controlbar
            if (
                !this.state.isLoading &&
                (prevState.isLoading ||
                    prevProps.shouldReadImageDescriptions !==
                        this.props.shouldReadImageDescriptions)
            ) {
                if (this.finishUpCalled) {
                    // We need to reset the page enough to get the narration rebuilt.
                    this.setIndex(this.state.currentSwiperIndex);
                    this.showingPage(this.state.currentSwiperIndex);
                }
            }

            if (
                this.state.isFinishUpForNewBookComplete &&
                prevProps.landscape !== this.props.landscape
            ) {
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

    private setBodyClasses(originalBodyElement: HTMLBodyElement) {
        // When working on the ABC-BARMM branding/XMatter pack, we discovered that the classes on the
        // Desktop body element were not getting passed into bloom-player.
        // Unfortunately, just putting them on the body element doesn't work because we are using
        // scoped styles. So we put them on the div.bloomPlayer-page (and then we have to adjust the rules
        // so they'll work there).
        this.setState({
            importedBodyClasses: originalBodyElement.className
        });
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
            axiosError.config.url.startsWith("file://");
        if (localFileMissing || axiosError.message.indexOf("404") >= 0) {
            msg = "<p>This book (or some part of it) was not found.<p>";
            if (axiosError.config && axiosError.config.url) {
                msg += `<p class='errorDetails'>${htmlEncode(
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

    private finishUpCalled = false;
    private hasImageDescriptions = false;

    // This function, the rest of the work we need to do, will be executed after we attempt
    // to retrieve questions.json and either get it and convert it into extra pages,
    // or fail to get it and make no changes.
    // We also call this method when changing the language, but we only want it to update the swiper content
    private async finishUp(isNewBook: boolean = true) {
        this.finishUpCalled = true;

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
            this.bookInfo.totalNumberedPages = 0;
            this.bookInfo.questionCount = 0;
            this.activityManager.collectActivityContextForBook(pages);
            this.bookInteraction.clearPagesShown();
            this.music.processAllMusicForBook(pages);
        }

        const preferredLanguages = this.bookInfo.getPreferredTranslationLanguages();
        const usingDefaultLang =
            preferredLanguages[0] === this.props.activeLanguageCode ||
            !this.props.activeLanguageCode;

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i] as HTMLElement;
            const landscape = this.setPageSizeClass(page);
            // this used to be done for us by react-slick, but swiper does not.
            // Since it's used by at least page-api code, it's easiest to just stick it in.
            page.setAttribute("data-index", i.toString(10));
            // Now we have all the information we need to call reportBookProps if it is set.
            if (i === 0 && this.props.reportBookProperties) {
                // Informs containing react controls (in the same frame)
                this.props.reportBookProperties({
                    landscape,
                    canRotate: this.bookInfo.canRotate,
                    preferredLanguages
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
                    this.bookInfo.totalNumberedPages++;
                }
                if (
                    page.getAttribute("data-analyticscategories") ===
                    "comprehension"
                ) {
                    // Note that this will count both new-style question pages,
                    // and ones generated from old-style json.
                    this.bookInfo.questionCount++;
                }
            }
            this.showOrHideTitle2(page, usingDefaultLang);
            swiperContent.push(page.outerHTML);

            // look for activities on this page
            this.activityManager.processPage(this.urlPrefix, page);
        }
        if (this.props.showContextPages) {
            swiperContent.push(""); // blank page to fill the space right of last.
        }
        if (isNewBook) {
            const head = this.htmlElement.getElementsByTagName("head")[0];
            this.bookInfo.setSomeBookInfoFromHead(head); // prep for reportBookOpened()
            const body = this.htmlElement.getElementsByTagName("body")[0];
            if (this.metaDataObject) {
                this.bookInfo.setSomeBookInfoFromMetadata(
                    this.metaDataObject,
                    body
                );
                this.reportBookOpened(body);
            }
            if (this.props.controlsCallback) {
                const languages = LangData.createLangDataArrayFromDomAndMetadata(
                    body,
                    this.metaDataObject
                );
                this.hasImageDescriptions = doesBookHaveImageDescriptions(body);
                // Tell BloomPlayerControls which languages are available for the Language Menu
                // and whether or not to bother with the readImageDescriptions toggle.
                this.props.controlsCallback(
                    languages,
                    this.hasImageDescriptions
                );
            }
        }

        // Make sure you only set state.styleRules once per book.
        // Otherwise, it wreaks havoc on scoped styles. See BL-9504.
        if (isNewBook) {
            const combinedStyle = await this.assembleStyleSheets(
                this.htmlElement
            );
            // assembleStyleSheets takes a while, fetching stylesheets. We can't render properly until
            // we get them, so we wait for the results and then make all the state changes in one go
            // to minimize renderings. (Because all this is happening asynchronously, not within the
            // original componentDidUpdate method call, each setState results in an immediate render.)
            this.setState({
                pages: swiperContent,
                styleRules: combinedStyle,
                isLoading: false
            });
        } else {
            this.setState({
                pages: swiperContent,
                isLoading: false
            });
        }

        this.props.pageStylesAreNowInstalled();
        // A pause hopefully allows the document to become visible before we
        // start playing any audio or movement on the first page.
        // Also gives time for the first page element and the buttons we want
        // to mess with here to actually get created in the document.
        // Note: typically in Chrome we won't actually start playing, because
        // of a rule that the user must interact with the document first.
        if (isNewBook) {
            window.setTimeout(() => {
                this.setState({ isFinishUpForNewBookComplete: true });
                this.setIndex(0);
                this.showingPage(0);
                // This allows a user to tab to the prev/next buttons, and also makes the focus() call work
                const nextButton = document.getElementsByClassName(
                    "swiper-button-next"
                )[0] as HTMLElement;
                const prevButton = document.getElementsByClassName(
                    "swiper-button-prev"
                )[0] as HTMLElement;

                prevButton?.setAttribute("tabindex", "4");
                nextButton?.setAttribute("tabindex", "5");
                // The most likely thing the user wants to do next, but also,
                // we need to focus something in the reader to make the arrow keys
                // work immediately.
                nextButton?.focus();
            }, 500);
        } else {
            if (BloomPlayerCore.currentPage) {
                // We need to replace the old currentPage with the corresponding one created from the updated content.
                window.setTimeout(() => {
                    BloomPlayerCore.currentPage = this.getPageAtSwiperIndex(
                        BloomPlayerCore.currentPageIndex
                    );
                }, 200);
            }
        }
    }

    // If a book is displayed in its original language, the author may well want to also see a title
    // in the corresponding national language. Typically default rules or author styles will make
    // the two titles appropriate sizes.
    // When the user selects a different language, showing the published national language as well is
    // less appropriate. It may not be the national language of any country where the chosen language
    // is spoken. Worse, the book may have been published in a monolingual collection, where the
    // vernacular and national languages are the same. When a different language is chosen,
    // what was originally a single, possibly very large, title in the book's only language
    // suddenly becomes a (possibly smaller) title in the chosen language followed by a possibly
    // larger one in the original language (previously marked both bloom-content1 and
    // bloom-contentNational1, now with just the second class making it visible).
    // We decided (BL-9256) that Title-On-Cover should not display in the national language
    // unless we are displaying the book's default language or unless the national language IS
    // the main one we're showing (that is, it has bloom-content1 as well as bloom-contentNational1).
    //
    // Don't be tempted to achieve this by returning conditionally created rules from assembleStyleSheets.
    // That was our original implementation, but if state.styleRules gets set more than once for a book,
    // it wreaks havoc on scoped styles. See BL-9504.
    private showOrHideTitle2(page: Element, show: boolean) {
        if (show) {
            page.querySelectorAll(
                ".Title-On-Cover-style.bloom-contentNational1, .Title-On-Title-Page-style.bloom-contentNational1"
            ).forEach(title2Element => {
                title2Element.classList.remove("do-not-display");
            });
        } else {
            page.querySelectorAll(
                ".Title-On-Cover-style.bloom-contentNational1:not(.bloom-content1), .Title-On-Title-Page-style.bloom-contentNational1:not(.bloom-content1)"
            ).forEach(title2Element => {
                title2Element.classList.add("do-not-display");
            });
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
                this.bookInfo.getPreferredTranslationLanguages()
            );
            this.isPagesLocalized = true;
        }
    }

    private showReplayButton(pageVideoData: IPageVideoComplete | undefined) {
        if (!pageVideoData?.video || !pageVideoData!.page) {
            return; // paranoia, and allows us to assume they are defined without ! everywhere.
        }
        const parent = pageVideoData.video.parentElement!;
        let replayButton = document.getElementById("replay-button");
        if (!replayButton) {
            replayButton = document.createElement("div");
            replayButton.setAttribute("id", "replay-button");
            replayButton.style.position = "absolute";
            replayButton.style.display = "none";
            ReactDOM.render(
                <Replay
                    style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
                    onClick={args => {
                        // in storybook, I was seeing the page jump around as I clicked the button.
                        // Guessing it was somehow caused by something higher up also responding to
                        // the click, I put these in to try to stop it, but didn't succeed.
                        // If we get the behavior in production, we'll need to try some more.
                        args.preventDefault();
                        args.stopPropagation();
                        // This not only starts the video, it should put everything in the right
                        // state, including stopping any audio. If we change our minds about
                        // always playing video first, or decide to support more than one video
                        // on a page, we'll need something smarter here.
                        this.resetForNewPageAndPlay(
                            BloomPlayerCore.currentPage!
                        );
                    }}
                    onMouseDown={args => {
                        // another attempt to stop the jumping around.
                        args.stopPropagation();
                    }}
                />,
                replayButton
            );
        }
        // from https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent
        // const UA = navigator.userAgent;
        // const isWebkit =
        //     /\b(iPad|iPhone|iPod)\b/.test(UA) &&
        //     /WebKit/.test(UA) &&
        //     !/Edge/.test(UA) &&
        //     !window.MSStream;
        //if (isWebkit || /chrome/.test(UA.toLowerCase())) {
        // Due to a bug in Chrome and Safari (and probably other Webkit-based browsers),
        // we can't be sure the button will show up if we place it over the video
        // So, instead, we hide the video to make room for it. That can seem a very abrupt change,
        // so we fade the video out before replacing it with the button.
        // We have tried keeping the behavior in the 'else' commented out below, which we would
        // prefer, for those browsers which can do it correctly; but it has proved too difficult
        // to detect which those are.
        parent.insertBefore(replayButton, pageVideoData.video); // there but still display:none
        pageVideoData.video.classList.add("fade-out");
        setTimeout(() => {
            pageVideoData.video.style.display = "none";
            replayButton!.style.display = "block";
            pageVideoData.video.classList.remove("fade-out");
        }, 1000);
        // } else {
        //     // On correctly-implemented browsers, it's neater to just overlay the button on top of the video.
        //     // keeping this code in case we decide to try again sometime, and to remember what we'd like to
        //     // do, but it will likely be a long time before we can be sure no problem browsers are around any more.
        //     replayButton.style.position = "absolute";
        //     parent.appendChild(replayButton);
        //     replayButton!.style.display = "block";
        // }
    }

    // We need named functions for each LiteEvent handler, so that we can unsubscribe them
    // when we are about to unmount.
    private handlePageVideoComplete = pageVideoData => {
        // Verify we're on the current page before playing audio (BL-10039)
        // If the user if flipping pages rapidly, video completed events can overlap.
        if (pageVideoData!.page === BloomPlayerCore.currentPage) {
            this.playAudioAndAnimation(pageVideoData!.page); // play audio after video finishes
            this.showReplayButton(pageVideoData);
            // } else {
            //     console.log(`DEBUG: ignoring out of sequence page audio`);
        }
    };

    private handlePageDurationAvailable = (
        pageElement: HTMLElement | undefined
    ) => {
        this.animation.HandlePageDurationAvailable(
            pageElement!,
            this.narration.PageDuration
        );
    };

    private handlePlayFailed = () => {
        this.setState({ inPauseForced: true });
        if (this.props.setForcedPausedCallback) {
            this.props.setForcedPausedCallback(true);
        }
    };

    private handlePlayCompleted = () => {
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.MediaFinished;
        this.props.imageDescriptionCallback(false);
    };

    private handleToggleImageDescription = (inImageDescription: boolean) => {
        this.props.imageDescriptionCallback(inImageDescription);
    };

    private initializeMedia() {
        // The conditionals guarantee that each type of media will only be created once.
        // N.B. If you add any new LiteEvent subscriptions, don't forget to unsubscribe in
        // unsubscribeAllEvents().
        if (!this.video) {
            this.video = new Video();
            this.video.PageVideoComplete = new LiteEvent<IPageVideoComplete>();
            this.video.PageVideoComplete.subscribe(
                this.handlePageVideoComplete
            );
        }
        if (!this.narration) {
            this.narration = new Narration();
            this.narration.PageDurationAvailable = new LiteEvent<HTMLElement>();
            this.narration.PageNarrationComplete = new LiteEvent<HTMLElement>();
            this.narration.PlayFailed = new LiteEvent<HTMLElement>();
            this.narration.PlayCompleted = new LiteEvent<HTMLElement>();
            this.narration.ToggleImageDescription = new LiteEvent<boolean>();
            this.animation = new Animation();
            this.narration.PageDurationAvailable.subscribe(
                this.handlePageDurationAvailable
            );
            this.narration.PageNarrationComplete.subscribe(
                this.handlePageNarrationComplete
            );
            this.narration.PlayFailed.subscribe(this.handlePlayFailed);
            this.narration.PlayCompleted.subscribe(this.handlePlayCompleted);
            this.narration.ToggleImageDescription.subscribe(
                this.handleToggleImageDescription
            );
        }
        if (!this.music) {
            this.music = new Music();
            this.music.PlayFailed = new LiteEvent<HTMLElement>();
            this.music.PlayFailed.subscribe(() => {
                this.setState({ inPauseForced: true });
                if (this.props.setForcedPausedCallback) {
                    this.props.setForcedPausedCallback(true);
                }
            });
        }
    }

    // a collection of things for cleaning up the url
    private preprocessUrl(): string {
        let url = this.props.url;
        if (url === undefined || "" === url.trim()) {
            throw new Error(
                "The url parameter was empty. It should point to the url of a book."
            );
        }
        // Bloom Publish Preview uses this so that we get spinning wheel while working on making the bloomd
        if (url === "working") {
            return "";
        }

        // Folder urls often (but not always) end in /. If so, remove it, so we don't get
        // an empty filename or double-slashes in derived URLs.
        if (url.endsWith("/")) {
            url = url.substring(0, url.length - 1);
        }
        // Or we might get a url-encoded slash.
        if (url.endsWith("%2f")) {
            url = url.substring(0, url.length - 3);
        }
        return url;
    }

    private handlePausePlay() {
        if (this.props.paused) {
            this.pauseAllMultimedia();
        } else {
            // This test determines if we changed pages while paused,
            // since the narration object won't yet be updated.
            if (
                BloomPlayerCore.currentPage !== this.narration.playerPage ||
                BloomPlayerCore.currentPlaybackMode ===
                    PlaybackMode.MediaFinished
            ) {
                this.resetForNewPageAndPlay(BloomPlayerCore.currentPage!);
            } else {
                if (
                    BloomPlayerCore.currentPlaybackMode ===
                    PlaybackMode.VideoPaused
                ) {
                    this.video.play(); // sets currentPlaybackMode = VideoPlaying
                } else {
                    this.narration.play(); // sets currentPlaybackMode = AudioPlaying
                    this.animation.PlayAnimation();
                    this.music.play();
                }
            }
        }
    }

    // Go through all .bloom-editable divs turning visibility off/on based on the activeLanguage (isoCode).
    // When using the language chooser, the activeLanguage should be treated as if it were the L1/Vernacular language
    private updateDivVisibilityByLangCode(): void {
        if (!this.props.activeLanguageCode || !this.htmlElement) {
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
            let iTranGrps = 0;
            iTranGrps < translationGroupDivs.snapshotLength;
            iTranGrps++
        ) {
            const groupElement = translationGroupDivs.snapshotItem(
                iTranGrps
            ) as HTMLElement;
            const dataDefaultLangsAttr = groupElement.getAttribute(
                "data-default-languages"
            );

            // Split the string into array form instead, using delimiters "," or " "
            const dataDefaultLangs = dataDefaultLangsAttr
                ? dataDefaultLangsAttr.split(/,| /)
                : [];

            const childElts = groupElement.childNodes;
            for (let iEdit = 0; iEdit < childElts.length; iEdit++) {
                const divElement = childElts.item(iEdit) as HTMLDivElement;
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
        this.unsubscribeAllEvents();
    }

    private unsubscribeAllEvents() {
        this.video.PageVideoComplete.unsubscribe(this.handlePageVideoComplete);
        this.narration.PageDurationAvailable.unsubscribe(
            this.handlePageDurationAvailable
        );
        this.narration.PageNarrationComplete.unsubscribe(
            this.handlePageNarrationComplete
        );
        this.narration.PlayFailed.unsubscribe(this.handlePlayFailed);
        this.narration.PlayCompleted.unsubscribe(this.handlePlayCompleted);
        this.narration.ToggleImageDescription.unsubscribe(
            this.handleToggleImageDescription
        );
    }

    private pauseAllMultimedia() {
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.VideoPlaying) {
            this.video.pause(); // sets currentPlaybackMode = VideoPaused
        } else if (
            BloomPlayerCore.currentPlaybackMode === PlaybackMode.AudioPlaying
        ) {
            this.narration.pause(); // sets currentPlaybackMode = AudioPaused
            this.animation.PauseAnimation();
        }
        // Music keeps playing after all video, narration, and animation have finished.
        // Clicking on pause should pause the music, even though clicking on play will
        // then restart the video, narration, or animation while resuming the music where
        // it paused.  See https://issues.bloomlibrary.org/youtrack/issue/BL-9967.
        this.music.pause();
    }

    private reportBookOpened(body: HTMLBodyElement) {
        // Some facts about the book will go out with not just this event,
        // but also subsequent events. We call these "ambient" properties.
        setAmbientAnalyticsProperties(this.bookInfo.getAmbientAnalyticsProps());
        reportAnalytics("BookOrShelf opened", {});
    }

    // Update the analytics report that will be sent (if not updated again first)
    // by our external container (Bloom Reader, Bloom Library, etc.)
    // when the parent reader determines that the session reading this book is finished.
    private sendUpdateOfBookProgressReportToExternalContext() {
        const properties = this.bookInteraction.getProgressReportPropertiesForAnalytics();
        // Pass the completed report to the externalContext version of this method which actually sends it.
        updateBookProgressReport("Pages Read", properties);
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

    private setPageSizeClass(page: Element): boolean {
        return BloomPlayerCore.setPageSizeClass(
            page,
            this.bookInfo.canRotate,
            this.props.landscape,
            this.props.useOriginalPageSize || this.bookInfo.hasFeature("comic"),
            this.originalPageClass
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
    public static setPageSizeClass(
        page: Element,
        bookCanRotate: boolean,
        showLandscape: boolean,
        useOriginalPageSize: boolean,
        originalPageClass: string
    ): boolean {
        let landscape = false;
        const sizeClass = this.getPageSizeClass(page);
        if (sizeClass) {
            landscape = bookCanRotate
                ? showLandscape
                : (sizeClass as any).endsWith("Landscape");

            let desiredClass = "";
            if (useOriginalPageSize) {
                desiredClass = landscape
                    ? originalPageClass.replace("Portrait", "Landscape")
                    : originalPageClass.replace("Landscape", "Portrait");
            } else {
                desiredClass = landscape
                    ? "Device16x9Landscape"
                    : "Device16x9Portrait";
            }
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
    // When the async completes, the result will be set as our state.styles with setState().
    // Exception: a stylesheet called "fonts.css" will instead be loaded into the <head>
    // of the main document, since it contains @font-face declarations that don't work
    // in the <scoped> element.
    private async assembleStyleSheets(doc: HTMLHtmlElement): Promise<string> {
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

        try {
            const results = await axios.all(
                promises.map(promise =>
                    promise.catch(
                        // if one stylesheet doesn't exist or whatever, keep going
                        () => undefined
                    )
                )
            );

            const fileUrlOk = this.urlPrefix.startsWith("file:");
            // The Andika New Basic font might be found already installed. Failing that,
            // if we're inside BloomReader or RAB, we should be able to get it at the standard
            // URL for assets embedded in the program. If instead we're embedded in a web
            // page like BloomLibrary.org, we need to download from the web.
            // Note that currently that last option will only work when the page origin
            // is *bloomlibrary.org. This helps limit our exposure to large charges from
            // people using our font arbitrarily. This does include, however, books
            // displayed in an iframe using https://bloomlibrary.org/bloom-player/bloomplayer.htm
            // Safari on IOS generates masses of exceptions, possibly every time Andika is used,
            // if we use a file:/// url, so unless our main URL is a file:/// one (as on Android),
            // we leave it out. This is also why these rules are here rather than in bloom-player.less.
            // (If we ARE on Android, we shouldn't need the web url, so in the interestes of
            // failing fast if anything goes wrong with loading the font from the android asset
            // folder, we leave it out in that case.)
            let combinedStyle = `
                @font-face {
                    font-family: "Andika New Basic";
                    font-weight: normal;
                    font-style: normal;
                    src: local("Andika New Basic"),
                        ${
                            fileUrlOk
                                ? 'url("file:///android_asset/fonts/Andika New Basic/AndikaNewBasic-R.ttf"),'
                                : 'url("https://bloomlibrary.org/fonts/Andika%20New%20Basic/AndikaNewBasic-R.woff")'
                        };
                }

                @font-face {
                    font-family: "Andika New Basic";
                    font-weight: bold;
                    font-style: normal;
                    src: local("Andika New Basic Bold"),
                        ${
                            fileUrlOk
                                ? 'url("file:///android_asset/fonts/Andika New Basic/AndikaNewBasic-B.ttf"),'
                                : 'url("https://bloomlibrary.org/fonts/Andika%20New%20Basic/AndikaNewBasic-B.woff")'
                        };
                }

                @font-face {
                    font-family: "Andika New Basic";
                    font-weight: normal;
                    font-style: italic;
                    src: local("Andika New Basic Italic"),
                        ${
                            fileUrlOk
                                ? 'url("file:///android_asset/fonts/Andika New Basic/AndikaNewBasic-I.ttf"),'
                                : 'url("https://bloomlibrary.org/fonts/Andika%20New%20Basic/AndikaNewBasic-I.woff")'
                        };
                }

                @font-face {
                    font-family: "Andika New Basic";
                    font-weight: bold;
                    font-style: italic;
                    src: local("Andika New Basic Bold Italic"),
                        ${
                            fileUrlOk
                                ? 'url("file:///android_asset/fonts/Andika New Basic/AndikaNewBasic-BI.ttf"),'
                                : 'url("https://bloomlibrary.org/fonts/Andika%20New%20Basic/AndikaNewBasic-BI.woff")'
                        };
                }

                .do-not-display {
                    display:none !important;
                }
                `;

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
                        this.bookInfo.setLanguage2And3(result.data);
                    }
                }
            });
            return combinedStyle;
        } catch (err) {
            this.HandleLoadingError(err);
            return "";
        }
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

    public slideNext(): void {
        if (this.swiperInstance) {
            this.swiperInstance.slideNext();
        }
    }

    public slidePrevious(): void {
        if (this.swiperInstance) {
            this.swiperInstance.slidePrev();
        }
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
        this.narration.setIncludeImageDescriptions(
            this.props.shouldReadImageDescriptions && this.hasImageDescriptions
        );
        const swiperParams: any = {
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
            touchStartPreventDefault: false, // If true, would prevent the default, which would cause niceScroll not to receive mousedown events.

            on: {
                slideChange: () => {
                    if (
                        this.state.inPauseForced &&
                        this.props.setForcedPausedCallback
                    ) {
                        this.props.setForcedPausedCallback(false);
                    }
                    this.setState({ inPauseForced: false });

                    this.showingPage(this.swiperInstance.activeIndex);
                    this.msToContinueFF60RepairChecks = 30000;
                },
                slideChangeTransitionStart: () => {
                    this.msToContinueFF60RepairChecks = 0; // disable
                    this.setIndex(this.swiperInstance.activeIndex);
                },
                // Not sure we need all of these. The idea is that if slider is
                // messing with offsets itself, we don't want to try to adjust things.
                // During e.g. animation, it's normal that the current page isn't aligned
                // with the frame.
                // It appears that the last setTranslate call happens before at least one
                // of the events we're using to turn checking on.
                setTranslate: () => (this.msToContinueFF60RepairChecks = 0), // disable
                sliderMove: () => (this.msToContinueFF60RepairChecks = 0), // disable
                // This (30s) is a pretty generous allowance. Our theory is that the problem occurs
                // when the activity finishes loading, typically sometime after the page before
                // it becomes the 'current' page and the activity itself is therefore the 'next'
                // page. Observed cases take about 2s for the problem to appear on a fast computer
                // with a good internet. 30s allows for it to be a LOT slower on a phone with a poor
                // connection.. We want SOME limit so
                // we don't keep using power for hours if the device is left on this page.
                slideChangeTransitionEnd: () =>
                    (this.msToContinueFF60RepairChecks = 30000)
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

        let bloomPlayerClass = "bloomPlayer";
        if (this.props.hideNextPrevButtons) {
            bloomPlayerClass += " hideNextPrevButtons";
        } else if (this.props.outsideButtonPageClass) {
            // there's room for buttons outside the page; show them.
            bloomPlayerClass += " " + this.props.outsideButtonPageClass;
            // Bloom Reader on Android can have states where the page display
            // area is smaller than the screen area, and the buttons could
            // display outside the page if needed.
            // See https://issues.bloomlibrary.org/youtrack/issue/BL-8680.
            // See also https://issues.bloomlibrary.org/youtrack/issue/BL-8806.
            if (showNavigationButtonsEvenOnTouchDevices) {
                bloomPlayerClass += " showNavigationButtonsEvenOnTouchDevices";
            }
        } else if (showNavigationButtonsEvenOnTouchDevices) {
            bloomPlayerClass += " showNavigationButtonsEvenOnTouchDevices";
        }

        // multiple classes help make rules more specific than those in the book's stylesheet
        // (which benefit from an extra attribute item like __scoped_N)
        // It would be nice to use an ID but we don't want to assume there is
        // only one of these components on a page.
        return (
            <div
                className={
                    bloomPlayerClass +
                    (this.props.extraClassNames
                        ? " " + this.props.extraClassNames
                        : "")
                }
                ref={bloomplayer => (this.rootDiv = bloomplayer)}
            >
                <Swiper {...swiperParams}>
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
                                    this.setState({
                                        ignorePhonyClick: false
                                    });
                                }}
                            >
                                {/* This is a huge performance enhancement on large books (from several minutes to a few seconds):
                                    Only load up the one that is about to be current page and the ones on either side of it with
                                    actual html contents, let every other page be an empty string placeholder. Ref BL-7652 */}
                                {Math.abs(
                                    index - this.state.currentSwiperIndex
                                ) < 2 ? (
                                    <>
                                        {/* The idea here is to scope our styles (using a polyfill)
                                            so that book styles cannot inadvertently change the swiper or other
                                            elements outside the pages themselves. However, we discovered 2/2021
                                            that this does not work, at least in some circumstances.
                                            E.g. you can style the swiper next button using an !important rule
                                            in the collection custom css.
                                            The problem occurs because state.styleRules gets modified on a subsequent render.
                                            I.e. if we could get rid of the extra render, this would work until something
                                            else introduces another render.
                                            I (Andrew) attempted to implement this using a shadow dom and got fairly
                                            far using the react-shadow package, but various styles inside the page
                                            were having issues, and lazy loading of images was not working. */}
                                        <style scoped={true}>
                                            {this.state.styleRules}
                                        </style>
                                        <div
                                            className={`bloomPlayer-page ${this.state.importedBodyClasses}`}
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
                    onClick={() => this.slidePrevious()}
                    onTouchStart={e => {
                        this.setState({ ignorePhonyClick: true });
                        this.slidePrevious();
                    }}
                >
                    {/* The ripple is an animation on the button on click and
                    focus, but it isn't placed correctly on our buttons for
                    some reason */}
                    <IconButton disableRipple={true}>
                        <ArrowBack
                            titleAccess={LocalizationManager.getTranslation(
                                "Button.Prev",
                                this.bookInfo.getPreferredTranslationLanguages(),
                                "Previous Page"
                            )}
                        />
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
                    onClick={() => this.slideNext()}
                    onTouchStart={() => this.slideNext()}
                >
                    <IconButton disableRipple={true}>
                        <ArrowForward
                            titleAccess={LocalizationManager.getTranslation(
                                "Button.Next",
                                this.bookInfo.getPreferredTranslationLanguages(),
                                "Next Page"
                            )}
                        />
                    </IconButton>
                </div>
            </div>
        );
    }

    // What we need to do when the page narration is completed (if autoadvance, go to next page).
    public handlePageNarrationComplete = (page: HTMLElement | undefined) => {
        // When we run this in Bloom, these variables are all present and accounted for and accurate.
        // When it's run in Storybook, not so much.
        if (!page) {
            return;
        }
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.MediaFinished;
        // TODO: at this point, signal BloomPlayerControls to switch the pause button to show play.
        if (this.bookInfo.autoAdvance && this.props.landscape) {
            this.swiperInstance.slideNext();
        }
    };

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
            // We need this in case the page size class has changed since we built
            // the page list, e.g., because of useOriginalPageSize changing, or possibly rotation.
            this.setPageSizeClass(bloomPage);
            this.animation.HandlePageBeforeVisible(bloomPage);
            // Don't need to be playing a video that's off-screen,
            // and definitely don't want to be reporting analytics on
            // its continued playing.
            this.video.hidingPage();
            this.video.HandlePageBeforeVisible(bloomPage);
            this.narration.hidingPage();
            this.music.hidingPage();
            if (
                BloomPlayerCore.currentPlaybackMode ===
                    PlaybackMode.AudioPaused ||
                BloomPlayerCore.currentPlaybackMode === PlaybackMode.VideoPaused
            ) {
                BloomPlayerCore.currentPlaybackMode =
                    PlaybackMode.NewPageMediaPaused;
            } else {
                BloomPlayerCore.currentPlaybackMode = PlaybackMode.NewPage;
            }
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
        return BloomPlayerCore.currentPage!;
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
        // Values this sets are used in the render of the new page, so it must NOT
        // be postponed like the other actions below.
        this.activityManager.showingPage(index, bloomPage);
        // While working on performance, we found that (at least some of) the following was slow.
        // (In a large book, still somewhat inexplicably, the stuff checking for audio was slow).
        // Even though the new page was already computed, we found that this blocked the ui from
        // scrolling it into view. So now we allow that to finish, then do this stuff.
        //console.log(`ShowingPage(${index})`);
        window.setTimeout(() => {
            BloomPlayerCore.currentPage = bloomPage;
            BloomPlayerCore.currentPageIndex = index;
            BloomPlayerCore.currentPageHasVideo = Video.pageHasVideo(bloomPage);

            // This is probably redundant, since we update all the page sizes on rotate, and again in setIndex.
            // It's not expensive so leaving it in for robustness.
            this.setPageSizeClass(bloomPage);

            if (!this.props.paused) {
                this.resetForNewPageAndPlay(bloomPage);
            }

            if (!this.isXmatterPage()) {
                this.bookInteraction.pageShown(index);
                if (index === this.indexOflastNumberedPage) {
                    this.bookInteraction.lastNumberedPageWasRead = true;
                }
            }

            if (this.props.reportPageProperties) {
                // Informs containing react controls (in the same frame)
                this.props.reportPageProperties({
                    hasAudio: this.narration.pageHasAudio(bloomPage),
                    hasMusic: this.music.pageHasMusic(bloomPage),
                    hasVideo: BloomPlayerCore.currentPageHasVideo
                });
            }

            this.bookInteraction.reportedAudioOnCurrentPage = false;
            this.bookInteraction.reportedVideoOnCurrentPage = false;
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

            BloomPlayerCore.addScrollbarsToPage(bloomPage);
        }, 0); // do this on the next cycle, so we don't block scrolling and display of the next page
    }

    private static addScrollbarsToPage(bloomPage: Element): void {
        // Expected behavior for cover: "on the cover, which is has a very dynamic layout, we just don't do scrollbars"
        if (bloomPage.classList.contains("cover")) {
            return;
        }

        // ENHANCE: If you drag the scrollbar mostly horizontal instead of mostly vertical,
        // both the page swiping and the scrollbar will be operating, which is somewhat confusing
        // and not perfectly ideal, although it doesn't really break anything.
        // It'd be nice so that if you're dragging the scrollbar in any way, swiping is disabled.

        // Attach overlaid scrollbar to all editables except textOverPictures (e.g. comics)
        // Expected behavior for comic bubbbles:  "we want overflow to show, but not generate scroll bars"
        const scrollBlocks = $(bloomPage).find(
            ":not(.bloom-textOverPicture) > .bloom-translationGroup .bloom-editable.bloom-visibility-code-on"
        );
        scrollBlocks.each((i, e) => {
            // niceScroll somehow fails to work when these classes are applied;
            // probably something to do with the bloom-editables being display:flex
            // to achieve vertical positioning. However, if the block is overflowing,
            // we don't need it centered or forced to the bottom; so just remove
            // the classes that do it.
            // Note: there are complications Bloom desktop handles in determining
            // accurately whether a block is overflowing. We don't need those here.
            // If it is close enough to overflow to get a scroll bar, it's close
            // enough not to care whether extra white space is at the top, bottom,
            // or split.
            const group = e.parentElement!;
            if (e.scrollHeight > e.clientHeight) {
                group.classList.remove("bloom-vertical-align-center");
                group.classList.remove("bloom-vertical-align-bottom");
            }
        });
        scrollBlocks.niceScroll({
            autohidemode: false,
            cursorwidth: "12px",
            cursorcolor: "#000000",
            cursoropacitymax: 0.1,
            cursorborderradius: "12px" // Make the corner more rounded than the 5px default.
        });
    }

    // called by narration.ts
    public static storeAudioAnalytics(duration: number): void {
        if (duration < 0.001 || Number.isNaN(duration)) {
            return;
        }

        const player = BloomPlayerCore.currentPagePlayer;
        player.bookInteraction.totalAudioDuration += duration;

        if (player.isXmatterPage()) {
            // Our policy is only to count non-xmatter audio pages. BL-7334.
            return;
        }

        if (!player.bookInteraction.reportedAudioOnCurrentPage) {
            player.bookInteraction.reportedAudioOnCurrentPage = true;
            player.bookInteraction.audioPageShown(
                BloomPlayerCore.currentPageIndex
            );
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
        player.bookInteraction.totalVideoDuration += duration;
        if (
            !player.bookInteraction.reportedVideoOnCurrentPage &&
            !player.isXmatterPage()
        ) {
            player.bookInteraction.reportedVideoOnCurrentPage = true;
            player.bookInteraction.videoPageShown(
                BloomPlayerCore.currentPageIndex
            );
        }
        player.sendUpdateOfBookProgressReportToExternalContext();
    }
    // This should only be called when NOT paused, because it will begin to play audio and highlighting
    // and animation from the beginning of the page.
    private resetForNewPageAndPlay(bloomPage: HTMLElement): void {
        if (this.props.paused) {
            return; // shouldn't call when paused
        }
        const replayButton = document.getElementById("replay-button");
        if (replayButton) {
            replayButton.style.display = "none";
            const video = replayButton.parentElement?.getElementsByTagName(
                "video"
            )[0];
            if (video) {
                video.style.display = "";
            }
        }
        // State must be set before calling HandlePageVisible() and related methods.
        if (BloomPlayerCore.currentPageHasVideo) {
            BloomPlayerCore.currentPlaybackMode = PlaybackMode.VideoPlaying;
            this.video.HandlePageVisible(bloomPage);
            this.music.pause(); // in case we have audio from previous page
        } else {
            this.playAudioAndAnimation(bloomPage);
        }
    }

    public playAudioAndAnimation(bloomPage: HTMLElement | undefined) {
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.AudioPlaying;
        if (!bloomPage) return;
        this.narration.setSwiper(this.swiperInstance);
        // When we have computed it, this will raise PageDurationComplete,
        // which calls an animation method to start the image animation.
        this.narration.computeDuration(bloomPage);
        this.narration.playAllSentences(bloomPage);
        if (Animation.pageHasAnimation(bloomPage as HTMLDivElement)) {
            this.animation.HandlePageBeforeVisible(bloomPage);
        }
        this.animation.HandlePageVisible(bloomPage);
        this.music.HandlePageVisible(bloomPage);
    }
}

function htmlEncode(str: string): string {
    return str.replace("%23", "#").replace(/[\u00A0-\u9999<>\&]/gim, i => {
        return "&#" + i.charCodeAt(0) + ";";
    });
}
function doesBookHaveImageDescriptions(body: HTMLBodyElement): boolean {
    const xpath =
        "//div[contains(@class, 'bloom-imageDescription')]" +
        "/div[contains(@class, 'bloom-editable') and contains(@class, 'bloom-visibility-code-on')]" +
        "//*[contains(@class, 'audio-sentence') or contains(@class, 'bloom-highlightSegment')]";
    const imgDescDivs = body.ownerDocument!.evaluate(
        xpath,
        body,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
    );
    if (imgDescDivs.snapshotLength > 0) return true;
    // Perhaps the user never split TextBox recordings into segments for image descriptions
    // because none of them had multiple sentences.  Playback works fine without the segmentation,
    // so check for this condition as well.
    const xpath2 =
        "//div[contains(@class, 'bloom-imageDescription')]" +
        "/div[contains(@class, 'bloom-editable') and contains(@class, 'bloom-visibility-code-on') and @data-audiorecordingmode='TextBox']" +
        "/p[text()]";
    const imgDescParas = body.ownerDocument!.evaluate(
        xpath2,
        body,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
    );
    return imgDescParas.snapshotLength > 0;
}
