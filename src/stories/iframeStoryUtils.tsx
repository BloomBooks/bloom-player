import React, { useState, useEffect } from "react";

export function useBuildIsReady() {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const checkAvailability = async () => {
            try {
                const response = await fetch("/bloomplayer.htm");
                if (response.ok) {
                    setIsReady(true);
                } else {
                    setTimeout(checkAvailability, 500);
                }
            } catch {
                setTimeout(checkAvailability, 500);
            }
        };
        checkAvailability();
    }, []);

    return isReady;
}

export function BloomPlayerIframe({ bookUrl, bookPageIndex, showBackButton }) {
    if (!useBuildIsReady()) {
        return (
            <div>
                Waiting for Bloom Player to build. See "yarn buildForStorybook"
            </div>
        );
    }

    const backButtonParam = showBackButton ? "&showBackButton=true" : "";
    return (
        <iframe
            src={`/bloomplayer.htm?url=${encodeURIComponent(bookUrl)}&start-page=${bookPageIndex}${backButtonParam}`}
            style={{ width: "100%", height: "500px" }}
        />
    );
}
