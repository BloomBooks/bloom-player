import React from "react";
import theme from "../bloomPlayerTheme";
import { storiesOf } from "@storybook/react";

import { ThemeProvider } from "@material-ui/styles";
import { BloomPlayerControls } from "../bloom-player-controls";
import {
    withKnobs,
    boolean as booleanKnob,
    button
} from "@storybook/addon-knobs";
import { withA11y } from "@storybook/addon-a11y";

const stories = storiesOf("Various books", module);
stories.addDecorator(withKnobs);
stories.addDecorator(withA11y);
stories.addDecorator(storyFn => (
    <ThemeProvider theme={theme}>{storyFn()}</ThemeProvider>
));

const KNOB_TABS = {
    PROPS: "Props",
    EXTERNAL: "External"
};
const allowToggleAppBar = () =>
    booleanKnob("Allow Toggle App Bar", true, KNOB_TABS.PROPS) as boolean;
const showBackButton = () =>
    booleanKnob("Show Back Button", true, KNOB_TABS.PROPS) as boolean;
const initiallyShowAppBar = () =>
    booleanKnob("Initially Show App Bar", true, KNOB_TABS.PROPS) as boolean;
const paused = () => booleanKnob("Paused", false, KNOB_TABS.PROPS) as boolean;

function AddBloomPlayerStory(label: string, url: string) {
    stories.add(label, () => {
        button("Pause", pause, KNOB_TABS.EXTERNAL);
        button("Resume", resume, KNOB_TABS.EXTERNAL);
        button("Play", play, KNOB_TABS.EXTERNAL);
        return (
            <BloomPlayerControls
                showBackButton={showBackButton()}
                initiallyShowAppBar={initiallyShowAppBar()}
                allowToggleAppBar={allowToggleAppBar()}
                paused={paused()}
                url={url}
            />
        );
    });
}

function pause() {
    simulateExternalMessage('{ "messageType": "control", "pause": "true" }');
}
function resume() {
    simulateExternalMessage('{ "messageType": "control", "resume": "true" }');
}
function play() {
    simulateExternalMessage('{ "messageType": "control", "play": "true" }');
}

function simulateExternalMessage(message: string) {
    window.postMessage(message, "*");
}

AddBloomPlayerStory(
    "Landscape SL with Quiz",
    "https://s3.amazonaws.com/bloomharvest/educationforlife%40sil.org%2f6f6d82d5-e98d-445d-b4be-143df993c3c0/bloomdigital%2findex.htm"
);
AddBloomPlayerStory(
    "Book with some overflowing pages",
    "https://s3.amazonaws.com/bloomharvest/benjamin%40aconnectedplanet.org%2f130b6829-5367-4e5c-80d7-ec588aae5281/bloomdigital%2findex.htm"
);

AddBloomPlayerStory(
    "Talking book with image descriptions",
    "https://s3.amazonaws.com/bloomharvest/chris_weber%40sil-lead.org%2fd7e8058e-c0cb-4b62-a030-e710fe8b7906/bloomdigital%2findex.htm"
);

AddBloomPlayerStory(
    "Book with music",
    "https://s3.amazonaws.com/bloomharvest-sandbox/bloom.bible.stories%40gmail.com/a70f135b-07b0-4bfb-962e-0aabb82f87ec/bloomdigital%2findex.htm"
);
