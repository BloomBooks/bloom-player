import React from "react";
import theme from "../bloomPlayerTheme";
import { Meta, StoryFn } from "@storybook/react";
import { ThemeProvider } from "@material-ui/styles";
import { BloomPlayerControls } from "../bloom-player-controls";
import {
    withKnobs,
    boolean as booleanKnob,
    button,
} from "@storybook/addon-knobs";
import Axios from "axios";
export default {
    title: "BloomCollection",
    component: () => <div>hello</div>,
};
// export default {
//     title: "Various books",
//     decorators: [withKnobs],
//     parameters: {
//         layout: "fullscreen",
//     },
//     component: BloomPlayerControls,
// } as Meta;

const stories: any[] = [];

const KNOB_TABS = {
    PROPS: "Props",
    EXTERNAL: "External",
};
const allowToggleAppBar = () =>
    booleanKnob("Allow Toggle App Bar", true, KNOB_TABS.PROPS) as boolean;
const showBackButton = () =>
    booleanKnob("Show Back Button", true, KNOB_TABS.PROPS) as boolean;
const initiallyShowAppBar = () =>
    booleanKnob("Initially Show App Bar", true, KNOB_TABS.PROPS) as boolean;
const hideFullScreenButton = () =>
    booleanKnob("Hide Full Screen Button", false, KNOB_TABS.PROPS) as boolean;
const paused = () => booleanKnob("Paused", false, KNOB_TABS.PROPS) as boolean;
const useOriginalPageSize = () =>
    booleanKnob("Original page size", false, KNOB_TABS.PROPS) as boolean;
const showExtraButtons = () =>
    booleanKnob("Show extra buttons", false, KNOB_TABS.PROPS) as boolean;

// Setting one of these as the ParentProxy of the window allows us to receive
// messages BP usually sends to a host window, without actually embedding it in an iframe.
class MessageReceiver {
    // data is what would be the data property of the event in a host window
    public receiveMessage(data: string) {
        try {
            const r = JSON.parse(data);
            if (r.messageType === "takePhoto") {
                alert("photo taken");
            } else if (r.messageType === "fullScreen") {
                alert("full screen request");
            }
        } catch (err) {
            console.log(`Got error with message: ${err}`);
        }
    }
}
