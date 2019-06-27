import { reportVideoPlayed } from "./externalContext";

// class Video contains functionality to get videos to play properly in bloom-player

export class Video {
    private paused: boolean = false;
    private currentPage: HTMLDivElement;
    private currentVideoElement: HTMLVideoElement | undefined;

    public static pageHasVideo(page: HTMLDivElement): boolean {
        return !!page.getElementsByTagName("video").length;
    }

    private videoStartTime: number;
    private videoEnded: boolean;

    // Work we prefer to do before the page is visible. This makes sure that when the video
    // is loaded it will begin to play automatically.
    // Enhance: someday we may need to handle multiple videos per page?
    public HandlePageBeforeVisible(page: HTMLElement) {
        this.currentPage = page as HTMLDivElement;
        if (!Video.pageHasVideo(this.currentPage)) {
            this.currentVideoElement = undefined;
            return;
        }
        this.currentVideoElement = this.getFirstVideo() as HTMLVideoElement;
        if (this.currentVideoElement.hasAttribute("controls")) {
            this.currentVideoElement.removeAttribute("controls");
        }
        if (!this.currentVideoElement.hasAttribute("playsinline")) {
            this.currentVideoElement.setAttribute("playsinline", "true");
        }
        if (this.currentVideoElement.currentTime !== 0) {
            // in case we previously played this video and are returning to this page...
            this.currentVideoElement.currentTime = 0;
        }
    }

    public HandlePageVisible(bloomPage: HTMLElement) {
        this.currentPage = bloomPage as HTMLDivElement;
        if (!Video.pageHasVideo(this.currentPage)) {
            this.currentVideoElement = undefined;
            return;
        }
        this.currentVideoElement = this.getFirstVideo() as HTMLVideoElement;
        this.videoEnded = false;
        this.currentVideoElement.onended = (ev: Event) => {
            this.videoEnded = true;
            reportVideoPlayed(
                (ev.target as HTMLVideoElement).currentTime -
                    this.videoStartTime
            );
        };
        if (this.paused) {
            this.currentVideoElement.pause();
        } else {
            const videoElement = this.currentVideoElement;
            window.setTimeout(() => {
                this.videoStartTime = videoElement.currentTime;
                videoElement.play();
            }, 1000);
        }
    }

    // At this point anyway, we just play the first video on the page. I think we'll have other UI problems
    // to address before we get around to dealing with multiple videos on a page, so we'll just assume we play
    // the first one for now.
    private getFirstVideo(): HTMLVideoElement | undefined {
        const videoContainers = this.currentPage.getElementsByClassName(
            "bloom-videoContainer"
        );
        if (videoContainers.length === 0) {
            return undefined;
        }
        // There should only be one... but in any case we'll just play the first.
        const container = videoContainers[0];
        const videoElements = container.getElementsByTagName("video");
        return videoElements.length === 0 ? undefined : videoElements[0];
    }

    public play() {
        if (!this.paused) {
            return; // no change.
        }
        const videoElement = this.currentVideoElement;
        if (!videoElement) {
            return; // no change
        }
        // If it has ended, it's going to replay from the beginning, even though
        // (to prevent an abrupt visual effect) we didn't reset currentTime when it ended.
        this.videoStartTime = this.videoEnded ? 0 : videoElement.currentTime;
        videoElement.play();
        this.paused = false;
    }

    public pause() {
        if (this.paused) {
            return;
        }
        this.pauseCurrentVideo();
        this.paused = true;
    }

    private pauseCurrentVideo() {
        const videoElement = this.currentVideoElement;
        if (!videoElement) {
            return; // no change
        }
        if (
            videoElement.currentTime > 0 &&
            !videoElement.paused &&
            !videoElement.ended
        ) {
            // It's playing, and we're about to stop it...report how long it's been going.
            reportVideoPlayed(videoElement.currentTime - this.videoStartTime);
        }
        videoElement.pause();
    }

    public hidingPage() {
        this.pauseCurrentVideo(); // but don't set paused state.
    }
}
