import React, { useState, useEffect } from "react";
import packageJson from "../package.json";
import { bloomRed } from "./bloomPlayerTheme";

declare const __BUILD_DATE__: string;

export function getBloomPlayerVersion(): string {
    var version = (packageJson as any).version;
    if (!version || version === "0.0.0") {
        // We're running a dev build or in some weird state. Assume we can do everything.
        // (I don't think we'll get to version 99 in my lifetime, anyway...)
        return "99.99.99-dev";
    }
    return version;
}

interface IDiagnosticInfoControlProps {
    // This is a frustrating hack. When this was simply bookInstanceId and BloomPlayerControls
    // had [bookInstanceId, setBookInstanceId] = useState(""), calling setBookInstanceId
    // was causing a crash when displaying the book (or sometimes navigating to the next page).
    // I never could fully understand the issue. After hours trying, the best an AI could come up with
    // was an extremely convoluted way to delay calling setBookInstanceId until after a resize event.
    // So I punted and made this a function. See BL-15905.
    getBookInstanceId?: () => string;
}

export const DiagnosticInfoControl: React.FC<IDiagnosticInfoControlProps> = ({
    getBookInstanceId,
}) => {
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const version = getBloomPlayerVersion();
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

    const bookInstanceId = getBookInstanceId?.();
    return (
        <div
            className="diagnostic-info-control"
            style={{
                color: bloomRed,
                fontFamily: "sans-serif",
                padding: "5px",
                zIndex: 1000,
                lineHeight: "1.5",
            }}
        >
            <div>
                Bloom Player v{version} (built {buildDate})
            </div>
            <div>Book ID: {bookInstanceId ?? ""}</div>
        </div>
    );
};
