// This file exists to import everything else (and potentially define the module exports, but there aren't any).
// It is the root for building the bundle.
import { BloomPlayerControls } from "./bloom-player-controls";

// When the module is loaded we call this to kick everything off.
BloomPlayerControls.init();