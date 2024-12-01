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

export function BloomPlayerIframe({ bookUrl, bookPageIndex }) {
    if (!useBuildIsReady()) {
        return <div>Waiting for Bloom Player to build...</div>;
    }

    return (
        <iframe
            src={`/bloomplayer.htm?url=${encodeURIComponent(bookUrl)}&start-page=${bookPageIndex}`}
            style={{ width: "100%", height: "500px" }}
        />
    );
}
