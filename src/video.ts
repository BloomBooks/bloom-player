import LiteEvent from "./event";
import { BloomPlayerCore, PlaybackMode } from "./bloom-player-core";
import { isMacOrIOS } from "./utilities/osUtils";

// class Video contains functionality to get videos to play properly in bloom-player

export interface IPageVideoComplete {
    page: HTMLElement;
    video: HTMLElement;
}

export class Video {
    private currentPage: HTMLDivElement;
    private currentVideoElement: HTMLVideoElement | undefined;

    public PageVideoComplete: LiteEvent<IPageVideoComplete>;

    public static pageHasVideo(page: HTMLElement): boolean {
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
            this.reportVideoPlayed(
                (ev.target as HTMLVideoElement).currentTime -
                    this.videoStartTime
            );
            if (this.PageVideoComplete) {
                this.PageVideoComplete.raise({
                    page: bloomPage,
                    video: this.currentVideoElement!
                });
            }
        };
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.VideoPaused) {
            this.currentVideoElement.pause();
        } else {
            const videoElement = this.currentVideoElement;
            if (!isMacOrIOS()) {
                // Delay the start of the video by a little bit so the user can get oriented (BL-6985)
                window.setTimeout(() => {
                    this.playVideoCallback(videoElement, bloomPage);
                }, 1000);
            } else {
                // To auto-play a video w/sound on Apple Webkit browsers, the JS that invokes video.play()
                // "must have directly resulted from a handler for touchend, click, doubleclick, or keydown"
                // (See https://webkit.org/blog/6784/new-video-policies-for-ios/)
                // The setTimeout delay in the other branch is nice to have,
                // but it prevents the video from auto-playing in Apple Webkit browsers (BL-9383).
                //
                // Currently, this code goes down this path for all videos, regardless of if they have an audio track or not.
                // In theory, videos w/o an audio track can go down the normal path instead.
                // However, when I tried to detect audio tracks, it didn't detect the correct result
                // the first time a video with audio was loaded, even when I tried checking the readyState.
                // So, for now we'll just do this for all videos on Mac or iOS, even if they don't have audio tracks.
                this.playVideoCallback(videoElement, bloomPage);
            }
        }
    }

    private playVideoCallback(
        videoElement: HTMLVideoElement,
        bloomPage: HTMLElement
    ) {
        // When we go to a new page with a video on it, we delay 1 second to allow the user to get
        // oriented to the new page. During that second, it's just possible that the user went on to
        // another page. Better check and not play the video, if that's the case.
        // Storybook "General video with audio" can be used to test this.
        if (this.currentPage !== bloomPage) {
            return;
        }
        this.videoStartTime = videoElement.currentTime;
        const promise = videoElement.play();
        if (promise) {
            promise.catch(reason => {
                console.log(reason);
                if (this.PageVideoComplete) {
                    this.PageVideoComplete.raise({
                        page: bloomPage,
                        video: videoElement
                    });
                }
            });
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
        if (BloomPlayerCore.currentPlaybackMode == PlaybackMode.VideoPlaying) {
            return; // no change.
        }
        const videoElement = this.currentVideoElement;
        if (!videoElement) {
            return; // no change
        }
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.VideoPlaying;
        // If it has ended, it's going to replay from the beginning, even though
        // (to prevent an abrupt visual effect) we didn't reset currentTime when it ended.
        this.videoStartTime = this.videoEnded ? 0 : videoElement.currentTime;
        videoElement.play();
    }

    public pause() {
        if (BloomPlayerCore.currentPlaybackMode == PlaybackMode.VideoPaused) {
            return;
        }
        this.pauseCurrentVideo();
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.VideoPaused;
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
            this.reportVideoPlayed(
                videoElement.currentTime - this.videoStartTime
            );
        }
        videoElement.pause();
    }

    private reportVideoPlayed(duration: number) {
        BloomPlayerCore.storeVideoAnalytics(duration);
    }

    public hidingPage() {
        this.pauseCurrentVideo(); // but don't set paused state.
    }
}
