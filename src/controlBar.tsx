import * as React from "react";
// TsLint wants me to combine this with the line above but I can't figure out how.
// tslint:disable-next-line: no-duplicate-imports
import { useState, useEffect } from "react";
import { requestCapabilities } from "./externalContext";
// We'd prefer to use this more elegant form of import:
//import { AppBar, Toolbar, IconButton } from "@material-ui/core";
// import {
//     ArrowBack,
//     PlayCircleOutline,
//     PauseCircleOutline
// } from "@material-ui/icons";
// However, @material-ui doc indicates that the second-level imports are supported,
// and using the first-level ones has unfortunate consequences on build times and sizes.
// It takes roughly twice as long to build our bundles, and they end up roughly
// ten times bigger, and the extra time to load those bigger bundles is definitely
// noticeable.
// The latter two effects probably indicate that I have not yet figured out how to
// configure webpack to really do tree-shaking, even in our production build.

//tslint:disable-next-line:no-submodule-imports
import AppBar from "@material-ui/core/AppBar";
//tslint:disable-next-line:no-submodule-imports
import Toolbar from "@material-ui/core/Toolbar";
//tslint:disable-next-line:no-submodule-imports
import IconButton from "@material-ui/core/IconButton";
//tslint:disable-next-line:no-submodule-imports
import ArrowBack from "@material-ui/icons/ArrowBack";
//tslint:disable-next-line:no-submodule-imports
import PlayCircleOutline from "@material-ui/icons/PlayCircleOutline";
//tslint:disable-next-line:no-submodule-imports
import PauseCircleOutline from "@material-ui/icons/PauseCircleOutline";

// react control (using hooks) for the bar of controls across the top of a bloom-player-controls

interface IControlBarProps {
    paused: boolean;
    pausedChanged?: (b: boolean) => void;
    backClicked?: () => void;
}

export const ControlBar: React.SFC<IControlBarProps> = props => {
    const [canGoBack, setCanGoBack] = useState(false);
    useEffect(() => {
        requestCapabilities(data => {
            if (data.canGoBack) {
                setCanGoBack(true);
            }
        });
    }, []);
    return (
        <div>
            <AppBar className="control-bar" id="control-bar" elevation={0}>
                <Toolbar>
                    {!canGoBack || (
                        <IconButton
                            onClick={() => {
                                if (props.backClicked) {
                                    props.backClicked();
                                }
                            }}
                        >
                            <ArrowBack />
                        </IconButton>
                    )}
                    <div
                        className="filler" // this is set to flex-grow, making the following icons right-aligned.
                    />
                    <IconButton
                        onClick={() => {
                            if (props.pausedChanged) {
                                props.pausedChanged(!props.paused);
                            }
                        }}
                    >
                        {props.paused ? (
                            <PlayCircleOutline />
                        ) : (
                            <PauseCircleOutline />
                        )}
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Toolbar // The AppBar floats. This occupies the same space (under it, unless scrolling occurs).
            />
        </div>
    );
};
