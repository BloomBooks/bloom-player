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

interface DiagnosticInfoControlProps {
    bookInstanceId?: string;
}

export const DiagnosticInfoControl: React.FC<DiagnosticInfoControlProps> = ({
    bookInstanceId,
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
