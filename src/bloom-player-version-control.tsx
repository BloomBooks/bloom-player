import React, { useState, useEffect } from "react";
import packageJson from "../package.json";
import { bloomRed } from "./bloomPlayerTheme";

declare const __BUILD_DATE__: string;

export const BloomPlayerVersionControl: React.FC = () => {
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const version = (packageJson as any).version || "unknown";
    const buildDate = new Date(__BUILD_DATE__).toLocaleDateString();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setIsCtrlPressed(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setIsCtrlPressed(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    if (!isCtrlPressed) return null;

    return (
        <div
            className="version-control"
            style={{
                color: bloomRed,
                fontFamily: "sans-serif",
                padding: "5px",
                zIndex: 1000,
            }}
        >
            Bloom Player v{version} (built {buildDate})
        </div>
    );
};
