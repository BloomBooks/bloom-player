import {
    reportScoreForCurrentPage,
    getPageData,
    storePageData
} from "../page-api";

// This is passed to an activity to give it things that it needs. It's mostly
// a wrapper so that activities don't have direct knowledge of how parts outside
// of them are arranged.
export class ActivityContext {
    public pageElement: HTMLElement;
    public pageIndex: number;
    // Typically, indices of all pages with the same analytics category.
    // (This is necessary to be able to report analytics for this category as a group.)
    public pagesToGroupForAnalytics: number[] | undefined;

    private listeners = new Array<{
        name: string;
        target: Element;
        listener: EventListener;
    }>();

    constructor(
        pageIndex: number,
        pageDiv: HTMLElement,
        pagesToGroupForAnalytics?: number[]
    ) {
        this.pageIndex = pageIndex;
        this.pageElement = pageDiv;
        this.pagesToGroupForAnalytics = pagesToGroupForAnalytics;
    }

    // report a score that can be used for analytics
    public reportScore(
        possiblePoints: number,
        actualPoints: number,
        analyticsCategory: string
    ) {
        // please leave this log in... if we could  make it only show in storybook, we would
        console.log(
            `ActivityContext.reportScoreForCurrentPage(<page>, ${possiblePoints}, ${actualPoints},${analyticsCategory})`
        );
        reportScoreForCurrentPage(
            this.pageIndex,
            possiblePoints,
            actualPoints,
            analyticsCategory,
            this.pagesToGroupForAnalytics
        );
    }

    // Get data used during this current reading of the book. The `key` parameter only needs to be
    // unique to the activity's page.
    public getSessionPageData(key: string): string {
        return getPageData(this.pageIndex, key);
    }

    // Set data used during this current reading of the book that you can read if the
    // they come back to this page. The `key` parameter only needs to be
    // unique to the activity's page.
    public storeSessionPageData(key: string, value: string) {
        // please leave this log in... if we could  make it only show in storybook, we would
        console.log(
            `ActivityContext.storePageData(<page>, '${key}', '${value}')`
        );
        storePageData(this.pageIndex, key, value);
    }

    public playCorrect() {
        // NB: if this stops working in storybook; the file should be found because the package.json
        // script that starts storybook has a "--static-dir" option that should include the folder
        // containing the standard activity sounds.
        this.playSound("right_answer.mp3");
    }

    public playWrong() {
        this.playSound("wrong_answer.mp3");
    }

    private getPagePlayer(): any {
        let player = document.querySelector("#activity-sound-player") as any;
        if (player && !player.play) {
            player.remove();
            player = null;
        }
        if (!player) {
            player = document.createElement("audio");
            player.setAttribute("id", "#activity-sound-player");
            document.body.appendChild(player);
        }
        return player;
    }

    public playSound(url) {
        const player = this.getPagePlayer();
        player.setAttribute("src", url);
        player.play();
    }

    public addActivityStylesForPage(css: string) {
        if (!this.pageElement.querySelector("[data-activity-stylesheet]")) {
            const style = this.pageElement.ownerDocument!.createElement(
                "style"
            );
            style.setAttribute("data-activity-stylesheet", ""); // value doesn't matter
            style.setAttribute("scoped", "true");
            style.innerText = css;
            this.pageElement.parentNode!.insertBefore(style, this.pageElement); //NB: will be added even if firstChild is null
        }
    }

    // Activities should use this to attach listeners so that we can detach them when the page is no longer
    // showing. Among other things, this prevents double-attaching.
    public addEventListener(
        name: string,
        target: Element,
        listener: EventListener,
        options?: AddEventListenerOptions | undefined
    ) {
        // store the info we need in order to detach the listener when we are stop()ed
        this.listeners.push({
            name,
            target,
            listener
        });
        target.addEventListener(name, listener, options);
    }

    // this is called by the activity manager after it stops the activity.
    public stop() {
        // detach all the listeners
        this.listeners.forEach(l =>
            l.target.removeEventListener(l.name, l.listener)
        );
    }
}
