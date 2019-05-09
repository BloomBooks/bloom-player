// This file exists to import everything else (and potentially define the module exports, but there aren't any).
// It is the root for building the bundle.
import { BloomPlayerControls } from "./bloom-player-controls";

// Page-api defines all the functions that should be available to Javascript
// that is managing a page (typically a bloom-interactive-page). Exporting them from
// here (along with some magic in our webpack config, the output/library and output/libraryTarget
// and the fact that this file is specified as the exports entry)
// makes them accessible to such code by calling e.g. window.BloomPlayer.reportScoreForCurrentPage(...)
export * from "./page-api"

// When the module is loaded we call this to kick everything off.
BloomPlayerControls.init();