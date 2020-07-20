import React, { useState } from "react";

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
//tslint:disable-next-line:no-submodule-imports
import Language from "@material-ui/icons/Language";

import LanguageMenu from "./languageMenu";
import LangData from "./langData";
import { sendMessageToHost } from "./externalContext";

// react control (using hooks) for the bar of controls across the top of a bloom-player-controls

export interface IExtraButton {
    id: string; // passed as messageType param to postMessage when button is clicked
    iconUrl: string; // URL for displaying the button icon
    description?: string; // title to show with the icon; also aria attribute
    // enhance as needed: location:"farRight|nearRight|farLeft"; // default: farRight
}

interface IControlBarProps {
    visible: boolean; // will slide into / out of view based on this
    paused: boolean;
    pausedChanged?: (b: boolean) => void;
    showPlayPause: boolean;
    backClicked?: () => void;
    canGoBack: boolean;
    bookLanguages: LangData[];
    onLanguageChanged: (language: string) => void;
    extraButtons?: IExtraButton[];
}

export const ControlBar: React.FunctionComponent<IControlBarProps> = props => {
    const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

    // The "single" class triggers the change in color of the globe icon
    // in the LanguageMenu.
    const controlButtonClass =
        "button" + (props.bookLanguages.length < 2 ? " disabled" : "");

    const handleCloseLanguageMenu = (isoCode: string) => {
        setLanguageMenuOpen(false);
        if (isoCode !== "") {
            props.onLanguageChanged(isoCode);
        }
    };

    const playOrPause = props.paused ? (
        <PlayCircleOutline />
    ) : (
        <PauseCircleOutline />
    );

    const extraButtons = props.extraButtons
        ? props.extraButtons.map(eb => (
              <IconButton
                  key={eb.id}
                  color="secondary"
                  title={eb.description}
                  onClick={() => sendMessageToHost({ messageType: eb.id })}
              >
                  <img
                      style={{ maxHeight: "24px", maxWidth: "24px" }}
                      src={eb.iconUrl}
                  />
              </IconButton>
          ))
        : undefined;

    return (
        <AppBar
            color="primary"
            className={`control-bar ${props.visible ? ", visible" : ""}`}
            id="control-bar"
            elevation={0}
            position="relative" // Keeps the AppBar from floating
        >
            <Toolbar>
                {props.canGoBack && (
                    <IconButton
                        color="secondary"
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
                {props.bookLanguages.length > 1 && (
                    <IconButton
                        className={controlButtonClass}
                        color={"secondary"}
                        onClick={() => {
                            setLanguageMenuOpen(true);
                        }}
                    >
                        <Language />
                    </IconButton>
                )}
                {languageMenuOpen && (
                    <LanguageMenu
                        languages={props.bookLanguages}
                        onClose={handleCloseLanguageMenu}
                    />
                )}
                <IconButton
                    color="secondary"
                    onClick={() => {
                        if (props.pausedChanged) {
                            props.pausedChanged(!props.paused);
                        }
                    }}
                >
                    {props.showPlayPause ? playOrPause : null}
                </IconButton>
                {extraButtons}
            </Toolbar>
        </AppBar>
    );
};
