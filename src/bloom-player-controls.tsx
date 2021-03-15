/*
BloomPlayerControls wraps BloomPlayerCore and adds just enough controls to preview the
book inside of the Bloom:Publish:Android screen.
*/
import { BloomPlayerCore } from "./bloom-player-core";
import * as ReactDOM from "react-dom";
import {
    onBackClicked,
    showNavBar,
    hideNavBar,
    reportBookProperties,
    setExternalControlCallback,
    logError
} from "./externalContext";
import { ControlBar, IExtraButton } from "./controlBar";
import { ThemeProvider } from "@material-ui/styles";
import theme from "./bloomPlayerTheme";
import React, { useState, useEffect } from "react";
import LangData from "./langData";
import {
    getQueryStringParamAndUnencode,
    getBooleanUrlParam
} from "./utilities/urlUtils";
import { createMuiTheme, IconButton } from "@material-ui/core";
//tslint:disable-next-line:no-submodule-imports
import PlayCircleOutline from "@material-ui/icons/PlayCircleOutline";
import { LocalizationManager } from "./l10n/localizationManager";

// This component is designed to wrap a BloomPlayer with some controls
// for things like pausing audio and motion, hiding and showing
// image descriptions.

interface IProps {
    // Url of the bloom book (folder). Should be a valid, well-formed URL
    // e.g. any special chars in the path or book title should be appropriately encoded using URL (percent) encoding
    // e.g. if title is C#, url should be http://localhost:8089/bloom/C:/PathToTemp/PlaceForStagingBook/C%23
    // (Not "[...]/C#" nor "[...]%2FC%2523", and most certainly not with any XML (entity) encoding)
    url: string;
    initiallyShowAppBar: boolean;
    allowToggleAppBar: boolean;
    showBackButton: boolean;
    hideFullScreenButton: boolean;
    centerVertically?: boolean;
    showContextPages?: boolean;
    // when bloom-player is told what content language to use from the start (vs. user changing using the language picker)
    initialLanguageCode?: string;
    paused: boolean;
    useOriginalPageSize?: boolean;
    // in production, this is just "". But during testing, we need
    // the server to be able to serve sample books from a directory that isn't in dist/,
    // e.g. src/activity-starter/
    locationOfDistFolder: string;
    extraButtons?: IExtraButton[];
}

// This logic is not straightforward...
// Basically, if an external app sends a resume command, we only want
// to start playback if an external app was the one to initially pause.
// The use case is...
// * Bloom Reader goes out of the foreground (sending an external "pause" event)
// * Bloom Reader comes back to the foreground (sending an external "resume" event)
// * We want to return the user to the state he was in when he left (playing or paused)
let canExternallyResume: boolean = false;

let keydownFunction = (ev: KeyboardEvent) => {};
function listenForKeydown(ev: KeyboardEvent) {
    if (keydownFunction) {
        keydownFunction(ev);
    }
}

// window width the last time we ran scalePageToWindow
let oldWindowWidth = 0;
let oldWindowHeight = 0;

function getWindowSize() {
    // Most IOS versions give unreliable, often huge widths if the document contains something like
    // bloom player's slider. Not quite sure what the critical problem is, but suspect it has
    // something to do with using a transform:scale on something that, when not clipped, is very wide.
    // This test will not catch an IPAD running IOS > 13...if that has the problem we'll need
    // another condition to detect it. StackOverflow suggests
    // (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const browserHasWidthBug = /iPad|iPhone|iPod/.test(navigator.platform);
    let player: Element;
    let parent: HTMLElement;
    let following: Node | null; // currently always null, but used for future-proofing
    if (browserHasWidthBug) {
        player = document.getElementsByClassName("bloomPlayer")[0];
        parent = player.parentElement!;
        following = player.nextSibling;
        parent.removeChild(player);
    }
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    if (browserHasWidthBug) {
        // currently player is always the last child so we could just appendChild,
        // but I wanted to be sure this will go on working if we later add something
        // after it.
        parent!.insertBefore(player!, following!);
    }
    return { width, height };
}

export const BloomPlayerControls: React.FunctionComponent<IProps &
    React.HTMLProps<HTMLDivElement>> = props => {
    // default is to center BP vertically; various versions of blorg should pass this as false.
    const doVerticalCentering =
        props.centerVertically === undefined ? true : props.centerVertically;

    // Allows an external controller (such as Bloom Reader) to manipulate our controls
    setExternalControlCallback(data => {
        if (data.pause) {
            canExternallyResume = !paused;
            setPaused(true);
        } else if (data.resume && canExternallyResume) {
            setPaused(false);
        } else if (data.play) {
            setPaused(false);
        }
    });

    const [pageScaled, setPageScaled] = useState(false);

    const [showAppBar, setShowAppBar] = useState<boolean>(
        props.initiallyShowAppBar
    );

    // When we're in storybook we won't get a new page when we change the book,
    // so we need to be able to detect that the book changed and thus do new size calculations.
    const [previousUrl, setPreviousUrl] = useState<string>("");
    const [previousPageClass, setPreviousPageClass] = useState(
        "Device16x9Portrait"
    );

    // while the initiallyShowAppBar prop won't change in production, it can change
    // when we're tinkering with storybook. The statement above won't re-run if
    // that prop changes, so we have to do this:
    useEffect(() => {
        setShowAppBar(props.initiallyShowAppBar);
    }, [props.initiallyShowAppBar]);

    useEffect(() => {
        // We show and hide the app bar and nav bar together.
        showAppBar ? showNavBar() : hideNavBar();
    }, [showAppBar]);

    useEffect(() => {
        setPaused(props.paused);
    }, [props.paused]);

    const [paused, setPaused] = useState(false);
    const [browserForcedPaused, setBrowserForcedPaused] = useState(false);
    const [preferredLanguages, setPreferredLanguages] = useState(["en"]);
    useEffect(() => {
        if (!paused) {
            // When we change from paused to playing, reset this to the initial state (false)
            canExternallyResume = false;
        }
    }, [paused]);

    const [windowLandscape, setWindowLandscape] = useState(false);
    const [hasAudio, setHasAudio] = useState(false);
    const [hasMusic, setHasMusic] = useState(false);
    const [hasVideo, setHasVideo] = useState(false);
    const [pageStylesInstalled, setPageStylesInstalled] = useState(false);
    const [maxPageDimension, setMaxPageDimension] = useState(0);
    // The factor we multiply maxPageDimension by to get the smaller dimension.
    const [pageAspectRatio, setPageAspectRatio] = useState(9 / 16);
    const emptyLangDataArray: LangData[] = [];
    const [languageData, setLanguageData] = useState(emptyLangDataArray);
    const [activeLanguageCode, setActiveLanguageCode] = useState("");

    const [readImageDescriptions, setReadImageDescriptions] = useState(true);
    const [bookHasImageDescriptions, setBookHasImageDescriptions] = useState(
        false
    );

    // the point of this is just to have an ever-increasing number; each time the number
    // is increased, it will cause the useEffect to scale the page to the window again.
    const [scalePageToWindowTrigger, setScalePageToWindowTrigger] = useState(0);
    const rerunScalePageToWindow = () => {
        // NB: if we instead said "resizeTrigger+1", the closure would capture the value of
        // scalePageToWindowTrigger the first time through, and so it would never change. So we instead
        // provide a function, and react will supply us with the current value.
        setScalePageToWindowTrigger(currentValue => currentValue + 1);
    };

    const [outsideButtonPageClass, setOutsideButtonPageClass] = useState("");

    useEffect(() => {
        scalePageToWindow();
    }, [
        pageStylesInstalled,
        scalePageToWindowTrigger,
        windowLandscape,
        props.useOriginalPageSize
    ]);

    // One-time cleanup when this component is being removed
    useEffect(() => {
        return () => {
            // Likely this only matters for Storybook where the main dom remains the same for multiple books
            const scaleStyleSheet = document.getElementById(
                "scale-style-sheet"
            );
            if (scaleStyleSheet) {
                scaleStyleSheet.parentNode!.removeChild(scaleStyleSheet);
            }
        };
    }, []);

    // Assumes that we want the controls and player to fill a (typically device) window.
    // (The page is trying to be a standard height (in mm) for a predictable layout
    // that does not depend on how text of a particular point size fits onto a
    // screen of a particular size. But we don't want to have to scroll to see it all.)
    // We want to scale it so that it and the controls fit the window.
    // On a very large screen like a tablet this might even scale it bigger.
    const scalePageToWindow = () => {
        // We need to work from the page that is currently visible. Others may not have the right
        // orientation class set.
        const currentSwiperElt = document.getElementsByClassName(
            "swiper-slide-active"
        )[0] as HTMLElement;
        let page: HTMLElement | null = null;
        if (currentSwiperElt) {
            page = currentSwiperElt.getElementsByClassName(
                "bloom-page"
            )[0] as HTMLElement;
        }
        // note that these are independent: we could have received a pageStylesInstalled signal, but
        // the page isn't loaded in the slider yet.
        if (!page || !pageStylesInstalled) {
            // may well be called before the book is sufficiently loaded
            // for a page to be found (or before the styles are loaded that set its page size).
            // If so, keep trying until all is ready.
            // We want to check pretty frequently so that we don't display the wrong size
            // version of the page.
            window.setTimeout(rerunScalePageToWindow, 100);
            return; // can't do any useful scaling (yet)
        }

        // Make a stylesheet that causes bloom pages to be the size we want.
        let scaleStyleSheet = document.getElementById("scale-style-sheet");

        if (!scaleStyleSheet) {
            scaleStyleSheet = document.createElement("style");
            scaleStyleSheet.setAttribute("type", "text/css");
            scaleStyleSheet.setAttribute("id", "scale-style-sheet");
            document.head!.appendChild(scaleStyleSheet);
        }
        // The first time through, we compute this, afterwards we get it from the state.
        // There has to be a better way to do this, probably a separate useEffect to compute
        // maxPageDimension and pageAspecRatio.
        // But then we get into duplicating the logic for retrying if the page isn't ready,
        // and have to make sure the resulting timeouts occur in the right order...
        let localMaxPageDimension = maxPageDimension;
        let localAspectRatio = pageAspectRatio;
        const pageClass = BloomPlayerCore.getPageSizeClass(page);
        if (props.url !== previousUrl || pageClass !== previousPageClass) {
            setPreviousUrl(props.url);
            setPreviousPageClass(pageClass);
            // Some other one-time stuff:
            // Arrange for this to keep being called when the window size changes.
            window.onresize = () => {
                const { width: newWidth, height } = getWindowSize();
                // We sometimes seem to get spurious resize notifications...this might be redundant,
                // as it was introduced while trying to fix an IOS problem, and didn't turn out
                // to be a sufficient fix. In any case, it is harmless to check: if the size
                // hasn't really changed since the last scalePageToWindow, we don't need to
                // run it again!
                if (height !== oldWindowHeight || newWidth !== oldWindowWidth) {
                    // we don't want to call this inside a closure, because then we get
                    // a bunch of stale state, so we use the react
                    // hooks system to trigger this in a useEffect()
                    rerunScalePageToWindow();
                }
            };

            // I'm not sure if this is necessary, but capturing the page size in pixels on this
            // device before we start scaling and rotating it seems to make things more stable.
            // (If useOriginalPageSize changes, we won't quite be capturing the original
            // dimensions, but currently changing that only happens in storybook, and at least
            // we won't get variation on every page.)
            localMaxPageDimension = Math.max(
                page.offsetHeight,
                page.offsetWidth
            );
            localAspectRatio =
                Math.min(page.offsetHeight, page.offsetWidth) /
                localMaxPageDimension;
            setPageAspectRatio(localAspectRatio);
            // save for future use
            setMaxPageDimension(localMaxPageDimension);
        }
        const { width: winWidth, height: winHeight } = getWindowSize();
        oldWindowWidth = winWidth;
        oldWindowHeight = winHeight;
        const desiredWindowLandscape = winWidth > winHeight;
        if (desiredWindowLandscape !== windowLandscape) {
            setWindowLandscape(desiredWindowLandscape); // will result in another call from useEffect
            return;
        }
        // enhance: maybe we just want to force the automatic browser margins to zero?
        let topMargin = 0;
        let bottomMargin = 0;
        const style = window.getComputedStyle(document.body);
        if (style && style.marginTop) {
            topMargin = parseInt(style.marginTop, 10);
        }
        if (style && style.marginBottom) {
            bottomMargin = parseInt(style.marginBottom, 10);
        }

        const landscape = page.getAttribute("class")!.indexOf("Landscape") >= 0;

        const pageHeight = landscape
            ? localMaxPageDimension * localAspectRatio
            : localMaxPageDimension;
        // The current height of whatever must share the page with the adjusted document
        // At one point this could include some visible controls.
        // It almost works to compute
        // const docHeight = document.body.offsetHeight + topMargin + bottomMargin;
        // and then controlsHeight = docHeight - pageHeight.
        // However, sometimes there are pages (not currently visible) in the wrong orientation.
        // This can make document.body.offsetHeight unexpectedly big.
        // For now we are hard-coding that the only thing not part of the document is any
        // margins on the body and the appbar.
        let controlsHeight = topMargin + bottomMargin;
        if (showAppBar) {
            const appbar = document.getElementById("control-bar");
            if (appbar) {
                controlsHeight += appbar.offsetHeight;
            }
        }
        // How high the document needs to be to make it and the controls fit the window
        const desiredPageHeight = winHeight - controlsHeight;
        let scaleFactor = desiredPageHeight / pageHeight;

        // Similarly compute how we'd have to scale to fit horizontally.
        // Not currently trying to allow for controls left or right of page.
        const pageWidth = landscape
            ? localMaxPageDimension
            : localMaxPageDimension * localAspectRatio;
        const desiredPageWidth = document.body.offsetWidth;
        const horizontalScaleFactor = desiredPageWidth / pageWidth;
        scaleFactor = Math.min(scaleFactor, horizontalScaleFactor);
        const actualPageHeight = pageHeight * scaleFactor;

        let width = (actualPageHeight * localAspectRatio) / scaleFactor;
        if (landscape) {
            width = actualPageHeight / localAspectRatio / scaleFactor;
        }

        // how much horizontal space do we have to spare, in the scaled pixels
        // which control the button size?
        const widthMargin = winWidth / scaleFactor - width;
        const player = document.getElementsByClassName("bloomPlayer")[0];
        // To put the buttons outside, we need twice @navigationButtonWidth,
        // as defined in bloom-player.less.
        let newOutsideButtonPageClass = "";

        let leftMargin = Math.max((winWidth - pageWidth * scaleFactor) / 2, 0);

        // We may need to adjust scaleFactor and leftMargin to leave extra space for buttons;
        // see below. But on touch devices we usually don't need buttons and can use the
        // unadjusted values. Save them before adjusting.
        const leftMarginDevice = leftMargin;
        const scaleFactorDevice = scaleFactor;

        // should match that defined in bloom-player.less
        const smallNavigationButtonWidth = 30;
        const largeNavigationButtonWidth = 100;
        if (widthMargin > largeNavigationButtonWidth * 2) {
            // We have two button widths to spare; can put buttons outside phone
            newOutsideButtonPageClass = "largeOutsideButtons";
        } else if (widthMargin > smallNavigationButtonWidth * 2) {
            newOutsideButtonPageClass = "smallOutsideButtons";
        } else if (winWidth > 407 && navigator.userAgent.includes("Chrome")) {
            // This nasty kludge is to work around a bug in Chrome 85.
            // In browsers based on that engine, when the next-page button is overlaid on
            // the page and the window is more than 407px wide, it disappears (BL-8936; see also BL-8944).
            // The workaround is to shrink the swiper-container so that the buttons get
            // drawn outside the page. We only need this if the width is more than 407px
            // (below that, the bug doesn't happen, and screen space is more precious).
            // Some style rules suppress the shrinking on touch devices except for activity pages,
            // since we don't need to show the buttons at all.
            scaleFactor *= 0.9;
            leftMargin = Math.max((winWidth - pageWidth * scaleFactor) / 2, 0);
            newOutsideButtonPageClass =
                "smallOutsideButtons extraScalingForChrome85Bug";
        }
        if (newOutsideButtonPageClass !== outsideButtonPageClass) {
            setOutsideButtonPageClass(newOutsideButtonPageClass);
        }

        // OK, this is a bit tricky.
        // First, we want to scale the whole bloomPlayer control by the scaleFactor we just computed
        // (relative to the top left). That's the two 'transform' rules.
        // Now, by default the player adjusts its width to the window. If we then scale that width,
        // the bloom page will fill the window, but the control will be wider or narrower, and
        // the right-hand page button will be inside the page or scrolled off to the right.
        // So we set the width of the bloom player to the width we just computed, which is calculated
        // to reverse the effect of the scaling we applied, so the scaling will make it fit the window.
        // Next problem is that some of the (not visible) pages may not have the same height as the
        // one(s) we are looking at, because we only adjust the orientation of the current page.
        // That can leave the overall height of the carousel determined by a portrait page even
        // though we're looking at it in landscape, resulting in scroll bars and misplaced
        // page turning buttons. So we force all the actual page previews to be no bigger than
        // the height we expect and hide their overflow to fix this problem.
        //
        // BL-8458: The 'translate' before the 'scale' in the transform rule should center the page
        // vertically after it is scaled (composite transforms are effectively applied in order from right
        // to left, according to 'https://developer.mozilla.org/en-US/docs/Web/CSS/transform').
        // So first the page is scaled, then moved down, though that is the opposite of the reading order.

        let translateString = "";
        if (doVerticalCentering) {
            const amountToMoveDown =
                (winHeight - actualPageHeight - controlsHeight) / 2; // don't count controlsHeight in what we move down
            if (amountToMoveDown > 0) {
                translateString = `translate(0, ${amountToMoveDown.toFixed(
                    0
                )}px) `;
                // console.log(`** translating down ${amountToMoveDown}px`);
                // console.log(`   winHeight ${winHeight}px`);
                // console.log(`   desiredPageHeight ${desiredPageHeight}px`);
                // console.log(`   actualPageHeight ${actualPageHeight}px`);
                // console.log(`   controlsHeight ${controlsHeight}px`);
                // console.log(`   scaleFactor ${scaleFactor}`);
            }
        }

        scaleStyleSheet.innerText = `.bloomPlayer {
            width: ${width}px;
            transform-origin: left top 0;
            transform: ${translateString}scale(${scaleFactor});
            margin-left: ${leftMargin}px;
        }
        @media (pointer: coarse) {
            .bloomPlayer.extraScalingForChrome85Bug:not(.showNavigationButtonsEvenOnTouchDevices) {
                margin-left:${leftMarginDevice}px;
                transform: ${translateString}scale(${scaleFactorDevice});
            }
        }
        .bloomPlayer-page {height: ${actualPageHeight /
            scaleFactor}px; overflow: hidden;}`;
        //alert("scale page to window completed");
        if (!pageScaled) {
            setPageScaled(true);
        }
    };

    useEffect(() => {
        if (browserForcedPaused && !paused) {
            setBrowserForcedPaused(false); // never show the big play button if not paused!
        }
        const root = document.getElementById("root");
        if (!root) {
            return; // try again some later render
        }
        // We don't want multiple functions listening for keydown
        // and doing the same thing. AddEventListener will not repeatedly
        // add the SAME function, but it will add new instances of a local
        // function. So we make a global, fixed function to use as the
        // event listener, but here we update what it really does
        // to use the necessary variables of the current render.
        // (It ought to be possible to accomplish this by returning a function
        // that removes the event listener, but I could not make it work
        // reliably. This would need another solution if we ever had two
        // instances of this control in the same browser window.)
        keydownFunction = (ev: KeyboardEvent) => {
            if (
                // Space always toggles pause. Right only does it in one
                // special case, when we're initially showing the big play
                // button because the browser wouldn't let us play.
                ev.key === " " ||
                (ev.key === "ArrowRight" && browserForcedPaused)
            ) {
                // space and right-arrow both advance to the next page by
                // swiper default. To prevent this we need to capture the event
                // and prevent other handling of it.
                ev.preventDefault();
                ev.stopImmediatePropagation();
                setPaused(!paused);
                setBrowserForcedPaused(false);
            }
        };
        root.addEventListener("keydown", listenForKeydown, { capture: true });
    });

    const handleLanguageChanged = (newActiveLanguageCode: string): void => {
        if (activeLanguageCode === newActiveLanguageCode) {
            return; // shouldn't happen now; leaving the check to be sure
        }
        LangData.selectNewLanguageCode(languageData, newActiveLanguageCode);
        setActiveLanguageCode(newActiveLanguageCode);
    };

    const updateControlsWhenOpeningNewBook = (
        bookLanguages: LangData[],
        bookHasImageDescriptions: boolean
    ): void => {
        let languageCode: string;

        // This is the case where the url specified an initial language
        if (
            props.initialLanguageCode &&
            bookLanguages.map(l => l.Code).includes(props.initialLanguageCode)
        ) {
            languageCode = props.initialLanguageCode;
            LangData.selectNewLanguageCode(bookLanguages, languageCode);
        }
        // this is the case where no initial language was specified in the url
        else {
            languageCode =
                bookLanguages.length > 0 ? bookLanguages[0].Code : "";
        }
        setActiveLanguageCode(languageCode);
        setLanguageData(bookLanguages);
        setBookHasImageDescriptions(bookHasImageDescriptions);
    };

    const playString = LocalizationManager.getTranslation(
        "Audio.Play",
        preferredLanguages,
        "Play"
    );
    const readAloudString = LocalizationManager.getTranslation(
        "Audio.ReadAloud",
        preferredLanguages,
        "Read Aloud"
    );
    const playLabel = hasAudio ? readAloudString : playString;

    const {
        allowToggleAppBar,
        showBackButton,
        initiallyShowAppBar,
        locationOfDistFolder,
        hideFullScreenButton,
        ...rest
    } = props;
    // We can do a stylesheet trick to make the icon itself white, but the only way I can find
    // to also affect the hover shadow is to make a very local theme that just applies to the
    // overlay button.
    const bigButtonOverlayTheme = createMuiTheme({
        palette: {
            primary: { main: "#000", contrastText: "#FFF" },
            secondary: { main: "#FFF" }
        }
    });
    return (
        <div
            className="reactRoot"
            // gives an error when react sees `paused`, which isn't an HtmlElement attribute {...rest} // Allow all standard div props
        >
            {// If present, this needs to be the very first element so that,
            // without messing with tabindex, it will be the first thing a
            // screen reader comes to, since it's the most likely thing for
            // a blind reader to want to do when it's present.
            browserForcedPaused && (
                <React.Fragment>
                    <div className="bigButtonOverlay">
                        <ThemeProvider theme={bigButtonOverlayTheme}>
                            <IconButton
                                color="secondary"
                                onClick={() => {
                                    setBrowserForcedPaused(false);
                                    setPaused(false);
                                }}
                            >
                                <PlayCircleOutline
                                    titleAccess={playLabel}
                                    preserveAspectRatio="xMidYMid meet"
                                />
                            </IconButton>
                        </ThemeProvider>
                    </div>
                    <div className="behindBigButtonOverlay" />
                </React.Fragment>
            )}
            <ControlBar
                canGoBack={props.showBackButton}
                visible={showAppBar}
                paused={paused}
                pausedChanged={(p: boolean) => setPaused(p)}
                playLabel={playLabel}
                preferredLanguages={preferredLanguages}
                backClicked={() => onBackClicked()}
                showPlayPause={hasAudio || hasMusic || hasVideo}
                bookLanguages={languageData}
                onLanguageChanged={(isoCode: string) =>
                    handleLanguageChanged(isoCode)
                }
                canShowFullScreen={!props.hideFullScreenButton}
                extraButtons={props.extraButtons}
                bookHasImageDescriptions={bookHasImageDescriptions}
                readImageDescriptions={readImageDescriptions}
                onReadImageDescriptionToggled={() =>
                    setReadImageDescriptions(!readImageDescriptions)
                }
            />
            <BloomPlayerCore
                url={props.url}
                landscape={windowLandscape}
                showContextPages={props.showContextPages}
                paused={paused}
                pageStylesAreNowInstalled={() => {
                    setPageStylesInstalled(true);
                }}
                locationOfDistFolder={props.locationOfDistFolder}
                reportBookProperties={bookProps => {
                    const bookPropsObj = {
                        landscape: bookProps.landscape,
                        canRotate: bookProps.canRotate
                    };
                    // This method uses externalContext which handles both possible contexts:
                    // Android WebView and html iframe
                    reportBookProperties(bookPropsObj);
                    setPreferredLanguages(bookProps.preferredLanguages);
                }}
                controlsCallback={updateControlsWhenOpeningNewBook}
                setForcedPausedCallback={p => {
                    if (p) {
                        setPaused(p);
                        // This assumes that the only reason the core control pauses
                        // play is because the browser wouldn't let us play. If we start
                        // to have other reasons, such as letting a tap anywhere pause
                        // things, we'll need to distinguish a human-requested pause
                        // from a browser-forced one.
                        setBrowserForcedPaused(true);
                    } else {
                        // We're choosing NOT to end the paused state here. It was a forced
                        // pause where we would normally auto-play, but now the book is clearly
                        // in a paused state and it's not obvious that moving to a new page
                        // should end the pause. The user has several ways to start playback
                        // if that is wanted. However, we do need to hide the overlays that
                        // encourage the user to start the narration.
                        setBrowserForcedPaused(false);
                    }
                }}
                reportPageProperties={pageProps => {
                    setHasAudio(pageProps.hasAudio);
                    setHasMusic(pageProps.hasMusic);
                    setHasVideo(pageProps.hasVideo);
                }}
                onContentClick={e => {
                    if (props.allowToggleAppBar) {
                        setShowAppBar(!showAppBar);
                        // Note: we could get the useEffect() to run this by listing
                        // showAppBar in its array of things to watch, but we
                        // really need wait for the animation of hiding the bar to finish first.
                        const kCssTransitionTime = 300;
                        window.setTimeout(
                            rerunScalePageToWindow,
                            // just a moment after the animation is done
                            kCssTransitionTime + 50
                        );
                    }
                }}
                activeLanguageCode={activeLanguageCode}
                useOriginalPageSize={props.useOriginalPageSize}
                outsideButtonPageClass={outsideButtonPageClass}
                // We can helpfully reduce flicker if we don't actually show the real content until we
                // have scaled the player to fit the window. This doesn't hide the loading spinner.
                extraClassNames={pageScaled ? "" : "hidePlayer"}
                shouldReadImageDescriptions={readImageDescriptions}
            />
        </div>
    );
};

// The content of the extraButtons url param should be a string, created like:
// const extraButtonsObj = [{id:"fullScreen",
//    iconUrl: "https://s3.amazonaws.com/share.bloomlibrary.org/assets/Ic_fullscreen_48px_red.svg",
//    description: "full screen"}];
// extraButtonsParam = "extraButtons=" + encodeURIComponent(JSON.stringify(extraButtonsObj));
function getExtraButtons(): IExtraButton[] {
    const ebStringEncoded = getQueryStringParamAndUnencode("extraButtons");
    if (!ebStringEncoded) {
        return []; // if there are none it may well return undefined; don't need spurious errors in console.
    }
    const ebString = decodeURIComponent(ebStringEncoded);
    try {
        return JSON.parse(ebString) as IExtraButton[];
    } catch (e) {
        console.error("Failed to parse extra button info " + JSON.stringify(e));
        logError(
            "error decoding extraButtons param " + ebStringEncoded + ": " + e
        );
        return [];
    }
}
// a bit goofy...we need some way to get react called when this code is loaded into an HTML
// document (as part of bloomPlayerControlBundle.js). When that module is loaded, any
// not-in-a-class code gets called. So we arrange in bloom-player-root.ts to call this
// function which turns the element with id 'root' into a BloomPlayerControls.
export function InitBloomPlayerControls() {
    ReactDOM.render(
        <ThemeProvider theme={theme}>
            <BloomPlayerControls
                url={getQueryStringParamAndUnencode("url")}
                allowToggleAppBar={getBooleanUrlParam(
                    "allowToggleAppBar",
                    false
                )}
                showBackButton={getBooleanUrlParam("showBackButton", false)}
                initiallyShowAppBar={getBooleanUrlParam(
                    "initiallyShowAppBar",
                    true
                )}
                centerVertically={getBooleanUrlParam("centerVertically", true)}
                initialLanguageCode={getQueryStringParamAndUnencode("lang")}
                paused={false}
                locationOfDistFolder={""}
                useOriginalPageSize={getBooleanUrlParam(
                    "useOriginalPageSize",
                    false
                )}
                hideFullScreenButton={getBooleanUrlParam(
                    "hideFullScreenButton",
                    false
                )}
                extraButtons={getExtraButtons()}
            />
        </ThemeProvider>,
        document.getElementById("root")
    );
}
