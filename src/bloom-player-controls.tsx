/* 
bloom-player-preview wraps bloom-player-core and adds just enough controls to preview the 
book inside of the Bloom:Publish:Android screen.
*/
import * as React from "react";
import { BloomPlayerCore } from "./bloom-player-core";
import * as ReactDOM from "react-dom";

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
}
export class BloomPlayerControls extends React.Component<
    IProps & React.HTMLProps<HTMLDivElement>,
    IState
> {
    public readonly state: IState = {
        paused: false
    };

    public render() {
        return (
            <div
                {...this.props} // Allow all standard div props
            >
                <button onClick={() => this.setState({ paused: false })}>
                    Play
                </button>
                <button onClick={() => this.setState({ paused: true })}>
                    Pause
                </button>
                <BloomPlayerCore
                    url={this.props.url}
                    landscape={false}
                    showContextPages={this.props.showContextPages}
                    paused={this.state.paused}
                />
            </div>
        );
    }

    public static applyToMarkedElements() {
        const roots = document.getElementsByClassName("bloom-player-controls");
        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];
            const url = root.getAttribute("data-url") || "";
            ReactDOM.render(<BloomPlayerControls url={url} />, roots[i]);
        }
    }

    private static retries = 0;

    // Assumes that we want the controls and player to fill a (typically device) window.
    // (The page is trying to be a standard height (in mm) for a predictable layout
    // that does not depend on how text of a particular point size fits onto a
    // screen of a particular size. But we don't want to have to scroll to see it all.)
    // We want to scale it so that it and the controls fit the window.
    // On a very large screen like a tablet this might even scale it bigger.
    public static scalePageToWindow() {
        const page = document.getElementsByClassName("bloom-page")[0];
        if (!page) {
            // may well be called before the book is sufficiently loaded
            // for a page to be found. If so, keep trying until one is.
            // We want to check pretty frequently so the oversize version of
            // the page doesn't actually get drawn.
            // In case we somehow have an empty book, we'll stop eventually
            // rather than drain the battery.
            // Enhance: possibly BloomPlayerCore could be enhanced with a call-back
            // that is invoked when the time is right for this method.
            // At least, after we load an actual book into the slider for the first
            // time we should be very nearly ready. It's conceivable that even 5s
            // is not long enough to load a big book.
            if (BloomPlayerControls.retries++ < 50) {
                window.setTimeout(
                    () => BloomPlayerControls.scalePageToWindow(),
                    100
                );
            }
            return; // can't do any useful scaling (yet)
        }
        const winHeight = window.innerHeight; // total physical space allocated to WebView
        const docHeight = document.body.scrollHeight; // height currently occupied by everything

        const pageHeight = page.clientHeight;
        // The current height of the controls that must share the page with the adjusted document
        const controlsHeight = docHeight - pageHeight;
        // How high the document needs to be to make it and the controls fit the window
        const desiredPageHeight = winHeight - controlsHeight;
        const scaleFactor = desiredPageHeight / pageHeight;
        // Now make a stylesheet that causes bloom pages to be that height.
        // Todo: something similar for landscape.
        const scaleStyleSheet = document.createElement("style");
        scaleStyleSheet.setAttribute("type", "text/css");
        scaleStyleSheet.setAttribute("id", "scaleSheet");
        scaleStyleSheet.innerText = `.bloomPlayer.bloomPlayer1 {transform-origin: left top 0; transform: scale(${scaleFactor})`;
        document.head!.appendChild(scaleStyleSheet);
    }
}

// a bit goofy...we need some way to get react called when this code is loaded into an HTML
// document (as part of bloomPlayerControlBundle.js). When that module is loaded, any
// not-in-a-class code gets called. So we arrange here for a bit of it to turn any element
// with class bloom-player-controls into a React element of that type.
