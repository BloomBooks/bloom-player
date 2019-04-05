// This file exists to import everything else and define the module exports
import { BloomPlayerCore } from "./bloom-player-core";
import { BloomPlayerControls } from "./bloom-player-controls";
import { Animation } from "./animation";
import * as React from "react";
import * as ReactDOM from "react-dom";

export { BloomPlayerCore, BloomPlayerControls };

export function init() {
    BloomPlayerControls.init();
}
// And call it when the script is loaded!
init();