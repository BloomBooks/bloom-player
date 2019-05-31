import * as React from "react";
import { AppBar, Toolbar, IconButton } from "@material-ui/core";
import {
    ArrowBack,
    PlayCircleOutline,
    PauseCircleOutline
} from "@material-ui/icons";

// react control (using hooks) for the bar of controls across the top of a bloom-player-controls

interface IControlBarProps {
    paused: boolean;
    pausedChanged?: (b: boolean) => void;
    backClicked?: () => void;
}
export const ControlBar: React.SFC<IControlBarProps> = props => {
    return (
        <div>
            <AppBar className="control-bar" id="control-bar">
                <Toolbar>
                    <IconButton
                        onClick={() => {
                            if (props.backClicked) {
                                props.backClicked();
                            }
                        }}
                    >
                        <ArrowBack />
                    </IconButton>
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
