// The seam through which non-React modules (video.ts, page-api.ts) reach the
// live BloomPlayerCore instance, replacing the mutable statics that used to
// serve this purpose (react modernization, Phase 2). The player registers
// itself on mount and unregisters on unmount; runtime behavior is the same
// last-registered-wins arrangement as before, but the coupling is now an
// explicit, documented interface, and a dead player can no longer be reached.

export interface ICurrentPlayer {
    // The page currently being shown, if any.
    getCurrentPage(): HTMLElement | null;
    // Record that some video was watched, for the book-progress analytics report.
    storeVideoAnalytics(duration: number): void;
}

let currentPlayer: ICurrentPlayer | undefined;

export function registerCurrentPlayer(player: ICurrentPlayer): void {
    if (currentPlayer && currentPlayer !== player) {
        // Not necessarily wrong (a host could conceivably mount a new player
        // before unmounting the old), but worth noticing in development.
        console.warn(
            "bloom-player: registering a current player while another is still registered",
        );
    }
    currentPlayer = player;
}

export function unregisterCurrentPlayer(player: ICurrentPlayer): void {
    if (currentPlayer === player) {
        currentPlayer = undefined;
    }
}

export function getCurrentPlayer(): ICurrentPlayer | undefined {
    return currentPlayer;
}
