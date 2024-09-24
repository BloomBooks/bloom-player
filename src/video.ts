import LiteEvent from "./event";
import { BloomPlayerCore } from "./bloom-player-core";
import { isMacOrIOS } from "./utilities/osUtils";
import {
    currentPlaybackMode,
    setCurrentPlaybackMode,
    PlaybackMode
} from "./narration";
import { LocalizationManager } from "./l10n/localizationManager";

// class Video contains functionality to get videos to play properly in bloom-player

export interface IPageVideoComplete {
    page: HTMLElement;
    videos: HTMLVideoElement[];
}

const uiLang = LocalizationManager.getBloomUiLanguage();
const preferredUiLanguages = uiLang === "en" ? [uiLang] : [uiLang, "en"];

const badVideoMessage = LocalizationManager.getTranslation(
    "Video.BadVideoMessage",
    preferredUiLanguages,
    "Sorry, this video cannot be played in this browser."
);

export class Video {
    private currentPage: HTMLDivElement;
    private currentVideoElement: HTMLVideoElement | undefined;
    private currentVideoStartTime: number = 0;
    private isPlayingSingleVideo: boolean = false;

    public PageVideoComplete: LiteEvent<IPageVideoComplete>;

    public static pageHasVideo(page: HTMLElement): boolean {
        return !!Video.getVideoElements(page).length;
    }

    // Work we prefer to do before the page is visible. This makes sure that when the video
    // is loaded it will begin to play automatically.
    public HandlePageBeforeVisible(page: HTMLElement) {
        this.currentPage = page as HTMLDivElement;
        if (!Video.pageHasVideo(this.currentPage)) {
            this.currentVideoElement = undefined;
            return;
        }
        this.getVideoElements().forEach(videoElement => {
            videoElement.setAttribute("controls", "controls");
            videoElement.setAttribute("disablepictureinpicture", "true");
            videoElement.setAttribute(
                "controlsList",
                "noplaybackrate nofullscreen nodownload noremoteplayback"
            );
            if (!videoElement.hasAttribute("playsinline")) {
                videoElement.setAttribute("playsinline", "true");
            }
            if (videoElement.currentTime !== 0) {
                // in case we previously played this video and are returning to this page...
                videoElement.currentTime = 0;
            }
        });
    }

    public HandlePageVisible(bloomPage: HTMLElement) {
        this.currentPage = bloomPage as HTMLDivElement;
        if (!Video.pageHasVideo(this.currentPage)) {
            this.currentVideoElement = undefined;
            return;
        }
        if (currentPlaybackMode === PlaybackMode.VideoPaused) {
            this.currentVideoElement?.pause();
        } else {
            if (!isMacOrIOS()) {
                // Delay the start of the video by a little bit so the user can get oriented (BL-6985)
                window.setTimeout(() => {
                    this.playAllVideo(this.getVideoElements());
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
                this.playAllVideo(this.getVideoElements());
            }
        }
    }

    private static getVideoElements(page: HTMLElement): HTMLVideoElement[] {
        return Array.from(page.getElementsByClassName("bloom-videoContainer"))
            .map(container => container.getElementsByTagName("video")[0])
            .filter(video => video !== undefined);
    }
    private getVideoElements(): HTMLVideoElement[] {
        return Video.getVideoElements(this.currentPage);
    }

    public play() {
        if (currentPlaybackMode === PlaybackMode.VideoPlaying) {
            return; // no change.
        }
        setCurrentPlaybackMode(PlaybackMode.VideoPlaying);
        if (this.isPlayingSingleVideo)
            this.playAllVideo([this.currentVideoElement!]);
        else this.resumePlayAllVideo();
    }

    private resumePlayAllVideo() {
        const allVideoElements = this.getVideoElements();
        let videoElements = allVideoElements;
        if (this.currentVideoElement) {
            // get subset of allVideoElements starting with currentVideoElement
            const startIndex = allVideoElements.indexOf(
                this.currentVideoElement
            );
            videoElements = allVideoElements.slice(startIndex);
        }
        this.playAllVideo(videoElements);
    }

    public pause() {
        if (currentPlaybackMode == PlaybackMode.VideoPaused) {
            return;
        }
        this.pauseCurrentVideo();
        setCurrentPlaybackMode(PlaybackMode.VideoPaused);
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
                videoElement.currentTime - this.currentVideoStartTime
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

    public replaySingleVideo(video: HTMLVideoElement) {
        this.isPlayingSingleVideo = true;
        this.playAllVideo([video]);
    }

    // Play the specified elements, one after the other. When the last completes, raise the PageVideoComplete event.
    //
    // Note, there is a very similar function in narration.ts. It would be nice to combine them, but
    // this one must be here and must be part of the Video class so it can handle play/pause, analytics, etc.
    public playAllVideo(elements: HTMLVideoElement[]) {
        if (elements.length === 0) {
            this.currentVideoElement = undefined;
            this.isPlayingSingleVideo = false;
            if (this.PageVideoComplete) {
                this.PageVideoComplete.raise({
                    page: this.currentPage,
                    videos: this.getVideoElements()
                });
            }
            return;
        }

        const video = elements[0];

        // If we somehow get into a state where the video is not on the current page, don't continue.
        const pageForVideo = video.closest(".bloom-page") as HTMLDivElement;
        if (this.currentPage !== pageForVideo) {
            this.currentVideoElement = undefined;
            return;
        }
        this.currentVideoElement = video;

        // If there is an error, try to continue with the next video.
        if (
            video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE &&
            video.readyState === HTMLMediaElement.HAVE_NOTHING
        ) {
            showVideoError(video);
            this.playAllVideo(elements.slice(1));
        } else {
            hideVideoError(video);
            setCurrentPlaybackMode(PlaybackMode.VideoPlaying);
            this.currentVideoStartTime = video.currentTime || 0;
            const promise = video.play();
            promise
                .then(() => {
                    // The promise resolves when the video starts playing. We want to know when it ends.
                    video.addEventListener(
                        "ended",
                        () => {
                            this.reportVideoPlayed(
                                video.currentTime - this.currentVideoStartTime
                            );
                            this.playAllVideo(elements.slice(1));
                        },
                        { once: true }
                    );
                })
                .catch(reason => {
                    console.error("Video play failed", reason);
                    showVideoError(video);
                    this.playAllVideo(elements.slice(1));
                });
        }
    }
}

export function showVideoError(video: HTMLVideoElement): void {
    const parent = video.parentElement;
    if (parent) {
        const divs = parent.getElementsByClassName("video-error-message");
        if (divs.length === 0) {
            const msgDiv = parent.ownerDocument.createElement("div");
            msgDiv.className = "video-error-message normal-style";
            msgDiv.textContent = badVideoMessage;
            msgDiv.style.display = "block";
            msgDiv.style.color = "white";
            msgDiv.style.position = "absolute";
            msgDiv.style.left = "10%";
            msgDiv.style.top = "10%";
            msgDiv.style.width = "80%";
            parent.appendChild(msgDiv);
        }
    }
}
export function hideVideoError(video: HTMLVideoElement): void {
    const parent = video.parentElement;
    if (parent) {
        const divs = parent.getElementsByClassName("video-error-message");
        while (divs.length > 1) parent.removeChild(divs[0]);
    }
}
