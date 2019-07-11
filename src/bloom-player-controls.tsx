/*
bloom-player-preview wraps bloom-player-core and adds just enough controls to preview the
book inside of the Bloom:Publish:Android screen.
*/
import * as React from "react";
import { BloomPlayerCore } from "./bloom-player-core";
import * as ReactDOM from "react-dom";
import { getBookParam, onBackClicked } from "./externalContext";
import { ControlBar } from "./controlBar";
import { ThemeProvider } from "@material-ui/styles";
import theme from "./bloomPlayerTheme";

// This component is designed to wrap a BloomPlayer with some controls
// for things like pausing audio and motion, hiding and showing
// image descriptions. The current version is pretty crude, just enough
// for testing the BloomPlayer narration functions.

interface IProps {
    url: string; // of the bloom book (folder)
    showContextPages?: boolean;
}
interface IState {
    paused: boolean;
    canRotate: boolean;
    windowLandscape: boolean;
}
export class BloomPlayerControls extends React.Component<
    IProps & React.HTMLProps<HTMLDivElement>,
    IState
> {
    public readonly state: IState = {
        paused: false,
        canRotate: false,
        windowLandscape: false
    };

    private bloomPlayer: BloomPlayerCore | null;

    public render() {
        return (
            <div
                {...this.props} // Allow all standard div props
            >
                <ControlBar
                    paused={this.state.paused}
                    pausedChanged={(p: boolean) => this.setState({ paused: p })}
                    backClicked={() => onBackClicked()}
                />
                <BloomPlayerCore
                    url={this.props.url}
                    landscape={this.state.windowLandscape}
                    showContextPages={this.props.showContextPages}
                    paused={this.state.paused}
                    reportBookProperties={bookProps =>
                        this.setBookProps(bookProps)
                    }
                    ref={bloomPlayer => (this.bloomPlayer = bloomPlayer)}
                />
            </div>
        );
    }

    private setBookProps(bookProps: {
        landscape: boolean;
        canRotate: boolean;
    }) {
        this.setState({ canRotate: bookProps.canRotate });
    }

    public static init() {
        ReactDOM.render(
            <ThemeProvider theme={theme}>
                <BloomPlayerControls url={getBookParam("url")} />
            </ThemeProvider>,
            document.body
        );
    }

    private retries = 0;

    public static pageStylesInstalled = false;

    private maxPageDimension: number;

    // Assumes that we want the controls and player to fill a (typically device) window.
    // (The page is trying to be a standard height (in mm) for a predictable layout
    // that does not depend on how text of a particular point size fits onto a
    // screen of a particular size. But we don't want to have to scroll to see it all.)
    // We want to scale it so that it and the controls fit the window.
    // On a very large screen like a tablet this might even scale it bigger.
    public scalePageToWindow() {
        // We need to work from the page that is currently visible. Others may not have the right
        // orientation class set.
        const currentSlickElt = document.getElementsByClassName(
            "slick-current"
        )[0] as HTMLElement;
        let page: HTMLElement | null = null;
        if (currentSlickElt) {
            page = currentSlickElt.getElementsByClassName(
                "bloom-page"
            )[0] as HTMLElement;
        }
        if (!page || !BloomPlayerControls.pageStylesInstalled) {
            // may well be called before the book is sufficiently loaded
            // for a page to be found (or before the styles are loaded that set its page size).
            // If so, keep trying until all is ready.
            // We want to check pretty frequently so the oversize version of
            // the page doesn't actually get drawn.
            // In case we somehow have an empty book, we'll stop eventually
            // rather than drain the battery.
            // Enhance: possibly BloomPlayerCore could be enhanced with a call-back
            // that is invoked when the time is right for this method.
            // At least, after we load an actual book into the slider for the first
            // time we should be very nearly ready. It's conceivable that even 5s
            // is not long enough to load a big book.
            if (this.retries++ < 50) {
                window.setTimeout(() => this.scalePageToWindow(), 100);
            }
            return; // can't do any useful scaling (yet)
        }

        // Make a stylesheet that causes bloom pages to be the size we want.
        let scaleStyleSheet = document.getElementById("scale-style-sheet");
        if (!scaleStyleSheet) {
            scaleStyleSheet = document.createElement("style");
            scaleStyleSheet.setAttribute("type", "text/css");
            scaleStyleSheet.setAttribute("id", "scale-style-sheet");
            document.head!.appendChild(scaleStyleSheet);
            // Some other one-time stuff:
            // Arrange for this to keep being called when the window size changes.
            window.onresize = () => this.scalePageToWindow();
            // I'm not sure if this is necessary, but capturing the page size in pixels on this
            // device before we start scaling and rotating it seems to make things more stable.
            this.maxPageDimension = Math.max(
                page.offsetHeight,
                page.offsetWidth
            );
        }
        const winHeight = window.innerHeight; // total physical space allocated to WebView/iframe
        const desiredWindowLandscape = window.innerWidth > winHeight;
        if (desiredWindowLandscape !== this.state.windowLandscape) {
            this.setState({ windowLandscape: desiredWindowLandscape });
            return; // will result in fresh call from componentDidUpdate.
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
            ? (this.maxPageDimension * 9) / 16
            : this.maxPageDimension;
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
        const appbar = document.getElementById("control-bar");
        if (appbar) {
            controlsHeight += appbar.offsetHeight;
        }
        // How high the document needs to be to make it and the controls fit the window
        const desiredPageHeight = winHeight - controlsHeight;
        let scaleFactor = desiredPageHeight / pageHeight;

        // Similarly compute how we'd have to scale to fit horizontally.
        // Not currently trying to allow for controls left or right of page.
        const pageWidth = landscape
            ? this.maxPageDimension
            : (this.maxPageDimension * 9) / 16;
        const desiredPageWidth = document.body.offsetWidth;
        const horizontalScaleFactor = desiredPageWidth / pageWidth;
        scaleFactor = Math.min(scaleFactor, horizontalScaleFactor);
        const actualPageHeight = pageHeight * scaleFactor;

        let width = (actualPageHeight * 9) / 16 / scaleFactor;
        if (landscape) {
            width = (actualPageHeight * 16) / 9 / scaleFactor;
        } else {
            // how much horizontal space do we have to spare, in the scaled pixels
            // which control the button size?
            const widthMargin = window.innerWidth / scaleFactor - width;
            var player = document.getElementsByClassName("bloomPlayer")[0];
            // The default positioning of the buttons (by the Slider) is 25px out on each side
            // Currently this test checks whether there is room for that; if so, we add this
            // class. Depending on exactly how we end up styling the buttons when outside,
            // we may need more or less than this.
            if (widthMargin > 50) {
                // We have two button widths to spare; can put buttons outside phone
                player.classList.add("outsideButtons");
            } else {
                player.classList.remove("outsideButtons");
            }
        }
        const leftMargin = Math.max(
            (window.innerWidth - pageWidth * scaleFactor) / 2,
            0
        );
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
        // the height we expect and hide their overflow to fix this.
        scaleStyleSheet.innerText = `.bloomPlayer {
            width: ${width}px;
            transform-origin: left top 0;
            transform: scale(${scaleFactor});
            margin-left: ${leftMargin}px;
        }
        .actual-page-preview {height: ${actualPageHeight /
            scaleFactor}px; overflow: hidden;}`;
    }

    public componentDidMount() {
        this.scalePageToWindow();
        this.setupPlayPause();
    }

    public componentDidUpdate() {
        this.scalePageToWindow();
    }

    private setupPlayPause() {
        if (!this.bloomPlayer || !this.bloomPlayer.getRootDiv()) {
            window.setTimeout(() => this.setupPlayPause(), 200);
            return;
        }
        const player = this.bloomPlayer.getRootDiv()!;
        // The final 'true' causes this listener to run on the 'capture' phase
        // of event handling, so that we can prevent the usual behavior of a click
        // in slick-carousel, which for some reason is to page backwards.
        // Fortunately this doesn't interfere with dragging. However, if we aren't
        // careful, we can intercept clicks on the forward/back buttons.
        player.addEventListener(
            "click",
            event => {
                const target = event.target as Element;
                if (
                    (target && target.classList.contains("slick-arrow")) ||
                    this.inInteractivePage(target)
                ) {
                    return; // don't interfere with these clicks!
                }
                this.setState({ paused: !this.state.paused });
                event.preventDefault();
                event.stopPropagation();
            },
            true
        );
    }

    // Tells whether the specified element is a child of one that is marked as a bloom interactive page
    // (e.g., a comprehension question page...typically a page that the reader can interact with).
    // One reason this is important is that, to allow the interaction, we must not intercept taps/clicks
    // and use them for pause/resume. Not sure what we will do if we ever have interactive pages with
    // behaviors that should be pausable...
    private inInteractivePage(target: Element): boolean {
        let test: Element | null = target;
        while (test) {
            if (test.classList.contains("bloom-interactive-page")) {
                return true;
            }
            test = test.parentElement;
        }
        return false;
    }
}

// a bit goofy...we need some way to get react called when this code is loaded into an HTML
// document (as part of bloomPlayerControlBundle.js). When that module is loaded, any
// not-in-a-class code gets called. So we arrange here for a bit of it to turn any element
// with class bloom-player-controls into a React element of that type.
