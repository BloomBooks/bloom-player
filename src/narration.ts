import LiteEvent from "./event";
import { BloomPlayerCore, PlaybackMode } from "./bloom-player-core";
import { sortAudioElements, ISetHighlightParams } from "./narrationUtils";
import { SwiperInstance } from "react-id-swiper";

const kSegmentClass = "bloom-highlightSegment";
const kMinDuration = 3.0; // seconds

// Even though these can now encompass more than strict sentences,
// we continue to use this class name for backwards compatability reasons.
const kAudioSentence = "audio-sentence";

const kImageDescriptionClass = "bloom-imageDescription";

// Handles implementation of narration, including playing the audio and
// highlighting the currently playing text.
// Enhance: There's code here to support PageNarrationComplete for auto-advance,
// but that isn't implemented yet so it may not be complete.
// May need to copy more pieces from old BloomPlayer.
// Enhance: Pause is a prop for this control, but somehow we need to
// notify the container if we are paused forcibly by Chrome refusing to
// let us play until the user interacts with the page.
export default class Narration {
    public playerPage: HTMLElement;
    public swiperInstance: SwiperInstance | null = null;
    public urlPrefix: string;
    // The time we started to play the current page (set in computeDuration, adjusted for pauses)
    private startPlay: Date;
    private startPause: Date;
    private fakeNarrationAborted: boolean = false;
    private fakeNarrationTimer: number;
    public pageNarrationCompleteTimer: number;
    private segmentIndex: number;

    private segments: HTMLElement[];

    private currentAudioId: string;

    // The first one to play should be at the end for all of these
    private elementsToPlayConsecutivelyStack: HTMLElement[] = []; // The audio-sentence elements (ie those with actual audio files associated with them) that should play one after the other
    private subElementsWithTimings: Array<[Element, number]> = [];

    // delay responding if there is no narration to play (to give animation fixed time to display)
    public PageNarrationComplete: LiteEvent<HTMLElement>;
    public PageDurationAvailable: LiteEvent<HTMLElement>;
    // respond immediately if there is no narration to play.
    public PlayCompleted: LiteEvent<HTMLElement>;
    public PlayFailed: LiteEvent<HTMLElement>;
    public PageDuration: number;

    // We want Narration to inform its controllers when we start/stop reading
    // image descriptions.
    public ToggleImageDescription: LiteEvent<boolean>;

    // A Session Number that keeps track of each time playAllSentences started.
    // This is used to determine whether the page has been changed or not.
    private currentAudioSessionNum: number = 0;

    private includeImageDescriptions: boolean = true;

    // This represents the start time of the current playing of the audio. If the user presses pause/play, it will be reset.
    // This is used for analytics reporting purposes
    private audioPlayCurrentStartTime: number | null = null; // milliseconds (since 1970/01/01, from new Date().getTime())

    public setSwiper(newSwiperInstance: SwiperInstance | null) {
        this.swiperInstance = newSwiperInstance;
    }

    // Roughly equivalent to BloomDesktop's AudioRecording::listen() function.
    // As long as there is audio on the page, this method will play it.
    public playAllSentences(page: HTMLElement | null): void {
        if (!page && !this.playerPage) {
            return; // this shouldn't happen
        }
        if (page) {
            this.playerPage = page;
        }
        const mediaPlayer = this.getPlayer();
        if (mediaPlayer) {
            mediaPlayer.pause();
            mediaPlayer.currentTime = 0;
        }

        // Invalidate old ID, even if there's no new audio to play.
        // (Deals with the case where you are on a page with audio, switch to a page without audio, then switch back to original page)
        ++this.currentAudioSessionNum;

        // Sorted into the order we want to play them, then reversed so we
        // can more conveniently pop the next one to play from the end of the stack.
        this.elementsToPlayConsecutivelyStack = sortAudioElements(
            this.getPageAudioElements()
        ).reverse();

        const stackSize = this.elementsToPlayConsecutivelyStack.length;
        if (stackSize === 0) {
            // Nothing to play. Wait the standard amount of time anyway, in case we're autoadvancing.
            if (this.PageNarrationComplete) {
                this.pageNarrationCompleteTimer = window.setTimeout(() => {
                    this.PageNarrationComplete.raise();
                }, kMinDuration * 1000);
            }
            if (this.PlayCompleted) {
                this.PlayCompleted.raise();
            }
            return;
        }

        const firstElementToPlay = this.elementsToPlayConsecutivelyStack[
            stackSize - 1
        ]; // Remember to pop it when you're done playing it. (i.e., in playEnded)

        this.setSoundAndHighlight(firstElementToPlay, true);
        this.playCurrentInternal();
        return;
    }

    private playCurrentInternal() {
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.AudioPlaying) {
            const mediaPlayer = this.getPlayer();
            if (mediaPlayer) {
                const element = this.playerPage.querySelector(
                    `#${this.currentAudioId}`
                );
                if (!element || !this.canPlayAudio(element)) {
                    this.playEnded();
                    return;
                }

                // Regardless of whether we end up using timingsStr or not,
                // we should reset this now in case the previous page used it and was still playing
                // when the user flipped to the next page.
                this.subElementsWithTimings = [];

                const timingsStr: string | null = element.getAttribute(
                    "data-audioRecordingEndTimes"
                );
                if (timingsStr) {
                    const childSpanElements = element.querySelectorAll(
                        `span.${kSegmentClass}`
                    );
                    const fields = timingsStr.split(" ");
                    const subElementCount = Math.min(
                        fields.length,
                        childSpanElements.length
                    );

                    for (let i = subElementCount - 1; i >= 0; --i) {
                        const durationSecs: number = Number(fields[i]);
                        if (isNaN(durationSecs)) {
                            continue;
                        }
                        this.subElementsWithTimings.push([
                            childSpanElements.item(i),
                            durationSecs
                        ]);
                    }
                } else {
                    // No timings string available.
                    // No need for us to do anything. The correct element is already highlighted by playAllSentences() (which needed to call setCurrent... anyway to set the audio player source).
                    // We'll just proceed along, start playing the audio, and playNextSubElement() will return immediately because there are no sub-elements in this case.
                }

                const currentSegment = element as HTMLElement;
                if (currentSegment && this.ToggleImageDescription) {
                    this.ToggleImageDescription.raise(
                        this.isImageDescriptionSegment(currentSegment)
                    );
                }

                const promise = mediaPlayer.play();
                ++this.currentAudioSessionNum;
                this.audioPlayCurrentStartTime = new Date().getTime();
                this.highlightNextSubElement(this.currentAudioSessionNum);
                this.handlePlayPromise(promise);
            }
        }
    }

    private isImageDescriptionSegment(segment: HTMLElement): boolean {
        return segment.closest("." + kImageDescriptionClass) !== null;
    }

    private handlePlayPromise(promise: Promise<void>) {
        // In newer browsers, play() returns a promise which fails
        // if the browser disobeys the command to play, as some do
        // if the user hasn't 'interacted' with the page in some
        // way that makes the browser think they are OK with it
        // playing audio. In Gecko45, the return value is undefined,
        // so we mustn't call catch.
        if (promise && promise.catch) {
            promise.catch((reason: any) => {
                // There is an error handler here, but the HTMLMediaElement also has an error handler (which will end up calling playEnded()).
                // This promise.catch error handler is the only one that handles NotAllowedException (that is, playback not started because user has not interacted with the page yet).
                // However, older versions of browsers don't support promise from HTMLMediaElement.play(). So this cannot be the only error handler.
                // Thus we need both the promise.catch error handler as well as the HTMLMediaElement's error handler.
                //
                // In many cases (such as NotSupportedError, which happens when the audio file isn't found), both error handlers will run.
                // That is a little annoying but if the two don't conflict with each other it's not problematic.

                console.log("could not play sound: " + reason);

                if (
                    reason &&
                    reason
                        .toString()
                        .includes(
                            "The play() request was interrupted by a call to pause()."
                        )
                ) {
                    // We were getting this error Aug 2020. I tried wrapping the line above which calls mediaPlayer.play()
                    // (currently `promise = mediaPlayer.play();`) in a setTimeout with 0ms. This seemed to fix the bug (with
                    // landscape books not having audio play initially -- BL-8887). But the root cause was actually that
                    // we ended up calling playAllSentences twice when the book first loaded.
                    // I fixed that in bloom-player-core. But I wanted to document the possible setTimeout fix here
                    // in case this issue ever comes up for a different reason.
                    console.log(
                        "See comment in narration.ts for possibly useful information regarding this error."
                    );
                }

                // Don't call removeAudioCurrent() here. The HTMLMediaElement's error handler will call playEnded() and calling removeAudioCurrent() here will mess up playEnded().
                // this.removeAudioCurrent();

                // With some kinds of invalid sound file it keeps trying and plays over and over.
                this.getPlayer().pause();
                // if (this.Pause) {
                //     this.Pause.raise();
                // }

                // Get all the state (and UI) set correctly again.
                // Not entirely sure about limiting this to NotAllowedError, but that's
                // the one kind of play error that is fixed by the user just interacting.
                // If there's some other reason we can't play, showing as paused may not
                // be useful. See comments on the similar code in music.ts
                if (reason.name === "NotAllowedError" && this.PlayFailed) {
                    this.PlayFailed.raise();
                }
            });
        }
    }

    // Moves the highlight to the next sub-element
    // originalSessionNum: The value of this.currentAudioSessionNum at the time when the audio file started playing.
    //     This is used to check in the future if the timeouts we started are for the right session
    // startTimeInSecs is an optional fallback that will be used in case the currentTime cannot be determined from the audio player element.
    private highlightNextSubElement(
        originalSessionNum: number,
        startTimeInSecs: number = 0
    ) {
        // the item should not be popped off the stack until it's completely done with.
        const subElementCount = this.subElementsWithTimings.length;

        if (subElementCount <= 0) {
            return;
        }

        const topTuple = this.subElementsWithTimings[subElementCount - 1];
        const element = topTuple[0];
        const endTimeInSecs: number = topTuple[1];

        this.setHighlightTo({
            newElement: element,
            shouldScrollToElement: true,
            disableHighlightIfNoAudio: false
        });

        const mediaPlayer: HTMLMediaElement = document.getElementById(
            "bloom-audio-player"
        )! as HTMLMediaElement;
        let currentTimeInSecs: number = mediaPlayer.currentTime;
        if (currentTimeInSecs <= 0) {
            currentTimeInSecs = startTimeInSecs;
        }

        // Handle cases where the currentTime has already exceeded the nextStartTime
        //   (might happen if you're unlucky in the thread queue... or if in debugger, etc.)
        // But instead of setting time to 0, set the minimum highlight time threshold to 0.1 (this threshold is arbitrary).
        const durationInSecs = Math.max(endTimeInSecs - currentTimeInSecs, 0.1);

        setTimeout(() => {
            this.onSubElementHighlightTimeEnded(originalSessionNum);
        }, durationInSecs * 1000);
    }

    // Handles a timeout indicating that the expected time for highlighting the current subElement has ended.
    // If we've really played to the end of that subElement, highlight the next one (if any).
    // originalSessionNum: The value of this.currentAudioSessionNum at the time when the audio file started playing.
    //     This is used to check in the future if the timeouts we started are for the right session
    private onSubElementHighlightTimeEnded(originalSessionNum: number) {
        // Check if the user has changed pages since the original audio for this started playing.
        // Note: Using the timestamp allows us to detect switching to the next page and then back to this page.
        //       Using this.playerPage (HTMLElement) does not detect that.
        if (originalSessionNum !== this.currentAudioSessionNum) {
            return;
        }
        // Seems to be needed to prevent jumping to the next subelement when not permitted to play by browser.
        // Not sure why the check below on mediaPlayer.currentTime does not prevent this.
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.AudioPaused) {
            return;
        }

        const subElementCount = this.subElementsWithTimings.length;
        if (subElementCount <= 0) {
            return;
        }

        const mediaPlayer: HTMLMediaElement = document.getElementById(
            "bloom-audio-player"
        )! as HTMLMediaElement;
        if (mediaPlayer.ended || mediaPlayer.error) {
            // audio playback ended. No need to highlight anything else.
            // (No real need to remove the highlights either, because playEnded() is supposed to take care of that.)
            return;
        }
        const playedDurationInSecs: number | undefined | null =
            mediaPlayer.currentTime;

        // Peek at the next sentence and see if we're ready to start that one. (We might not be ready to play the next audio if the current audio got paused).
        const subElementWithTiming = this.subElementsWithTimings[
            subElementCount - 1
        ];
        const nextStartTimeInSecs = subElementWithTiming[1];

        if (
            playedDurationInSecs &&
            playedDurationInSecs < nextStartTimeInSecs
        ) {
            // Still need to wait. Exit this function early and re-check later.
            const minRemainingDurationInSecs =
                nextStartTimeInSecs - playedDurationInSecs;
            setTimeout(() => {
                this.onSubElementHighlightTimeEnded(originalSessionNum);
            }, minRemainingDurationInSecs * 1000);

            return;
        }

        this.subElementsWithTimings.pop();

        this.highlightNextSubElement(originalSessionNum, nextStartTimeInSecs);
    }

    // Removes the .ui-audioCurrent class from all elements (also ui-audioCurrentImg)
    // Equivalent of removeAudioCurrentFromPageDocBody() in BloomDesktop.
    private removeAudioCurrent() {
        // Note that HTMLCollectionOf's length can change if you change the number of elements matching the selector.
        const audioCurrentCollection: HTMLCollectionOf<Element> = document.getElementsByClassName(
            "ui-audioCurrent"
        );

        // Convert to an array whose length won't be changed
        const audioCurrentArray: Element[] = Array.from(audioCurrentCollection);

        for (let i = 0; i < audioCurrentArray.length; i++) {
            audioCurrentArray[i].classList.remove("ui-audioCurrent");
        }
        const currentImg = document.getElementsByClassName(
            "ui-audioCurrentImg"
        )[0];
        if (currentImg) {
            currentImg.classList.remove("ui-audioCurrentImg");
        }
    }

    private setSoundAndHighlight(
        newElement: Element,
        disableHighlightIfNoAudio: boolean,
        oldElement?: Element | null | undefined
    ) {
        this.setHighlightTo({
            newElement,
            shouldScrollToElement: true, // Always true in bloom-player version
            disableHighlightIfNoAudio,
            oldElement
        });
        this.setSoundFrom(newElement);
    }

    private setHighlightTo({
        newElement,
        shouldScrollToElement,
        disableHighlightIfNoAudio,
        oldElement
    }: ISetHighlightParams) {
        // This should happen even if oldElement and newElement are the same.
        if (shouldScrollToElement) {
            // Wrap it in a try/catch so that if something breaks with this minor/nice-to-have feature of scrolling,
            // the main responsibilities of this method can still proceed
            try {
                this.scrollElementIntoView(newElement);
            } catch (e) {
                console.error(e);
            }
        }

        if (oldElement === newElement) {
            // No need to do much, and better not to, so that we can avoid any temporary flashes as the highlight is removed and re-applied
            return;
        }

        this.removeAudioCurrent();

        if (disableHighlightIfNoAudio) {
            const mediaPlayer = this.getPlayer();
            const isAlreadyPlaying = mediaPlayer.currentTime > 0;

            // If it's already playing, no need to disable (Especially in the Soft Split case, where only one file is playing but multiple sentences need to be highlighted).
            if (!isAlreadyPlaying) {
                // Start off in a highlight-disabled state so we don't display any momentary highlight for cases where there is no audio for this element.
                // In react-based bloom-player, canPlayAudio() can't trivially identify whether or not audio exists,
                // so we need to incorporate a derivative of Bloom Desktop's disableHighlight code
                newElement.classList.add("disableHighlight");
                mediaPlayer.addEventListener("playing", event => {
                    newElement.classList.remove("disableHighlight");
                });
            }
        }

        newElement.classList.add("ui-audioCurrent");
        // If the current audio is part of a (currently typically hidden) image description,
        // highlight the image.
        // it's important to check for imageDescription on the translationGroup;
        // we don't want to highlight the image while, for example, playing a TOP box content.
        const translationGroup = newElement.closest(".bloom-translationGroup");
        if (
            translationGroup &&
            translationGroup.classList.contains(kImageDescriptionClass)
        ) {
            const imgContainer = translationGroup.closest(
                ".bloom-imageContainer"
            );
            if (imgContainer) {
                imgContainer.classList.add("ui-audioCurrentImg");
            }
        }
    }

    // Scrolls an element into view.
    private scrollElementIntoView(element: Element) {
        // In Bloom Player, scrollIntoView can interfere with page swipes,
        // so Bloom Player needs some smarts about when to call it...
        if (this.isSwipeInProgress()) {
            // This alternative implementation doesn't use scrollIntoView (Which interferes with swiper).
            // Since swiping is only active at the beginning (usually while the 1st element is playing)
            // it should generally be good enough just to reset the scroll of the scroll parent to the top.

            // Assumption: Assumes the editable is the scrollbox.
            // If this is not the case, you can use JQuery's scrollParent() function or other equivalent
            const scrollAncestor = this.getEditable(element);
            if (scrollAncestor) {
                scrollAncestor.scrollTop = 0;
            }
            return;
        }

        element.scrollIntoView({
            // Animated instead of sudden
            behavior: "smooth",

            // "nearest" setting does lots of smarts for us (compared to us deciding when to use "start" or "end")
            // Seems to reduce unnecessary scrolling compared to start (aka true) or end (aka false).
            // Refer to https://drafts.csswg.org/cssom-view/#scroll-an-element-into-view,
            // which seems to imply that it won't do any scrolling if the two relevant edges are already inside.
            block: "nearest"

            // horizontal alignment is controlled by "inline". We'll leave it as its default ("nearest")
        });
    }

    // Returns true if swiping to this page is still in progress.
    private isSwipeInProgress(): boolean {
        return this.swiperInstance && this.swiperInstance.animating;
    }

    private getEditable(element: Element): Element | null {
        if (element.classList.contains("bloom-editable")) {
            return element;
        } else {
            return element.closest(".bloom-editable"); // Might be null
        }
    }

    private setSoundFrom(element: Element) {
        const firstAudioSentence = this.getFirstAudioSentenceWithinElement(
            element
        );
        const id: string = firstAudioSentence
            ? firstAudioSentence.id
            : element.id;
        this.setCurrentAudioId(id);
    }

    public getFirstAudioSentenceWithinElement(
        element: Element | null
    ): Element | null {
        const audioSentences = this.getAudioSegmentsWithinElement(element);
        if (!audioSentences || audioSentences.length === 0) {
            return null;
        }

        return audioSentences[0];
    }

    public getAudioSegmentsWithinElement(element: Element | null): Element[] {
        const audioSegments: Element[] = [];

        if (element) {
            if (element.classList.contains(kAudioSentence)) {
                audioSegments.push(element);
            } else {
                const collection = element.getElementsByClassName(
                    kAudioSentence
                );
                for (let i = 0; i < collection.length; ++i) {
                    const audioSentenceElement = collection.item(i);
                    if (audioSentenceElement) {
                        audioSegments.push(audioSentenceElement);
                    }
                }
            }
        }

        return audioSegments;
    }

    // Setter for currentAudio
    public setCurrentAudioId(id: string) {
        if (!this.currentAudioId || this.currentAudioId !== id) {
            this.currentAudioId = id;
            this.updatePlayerStatus();
        }
    }

    private updatePlayerStatus() {
        const player = this.getPlayer();
        if (!player) {
            return;
        }
        // Any time we change the src, the player will pause.
        // So if we're playing currently, we'd better report whatever time
        // we played.
        if (player.currentTime > 0 && !player.paused && !player.ended) {
            this.reportPlayDuration();
        }
        player.setAttribute(
            "src",
            this.currentAudioUrl(this.currentAudioId) +
                "?nocache=" +
                new Date().getTime()
        );
    }

    private currentAudioUrl(id: string): string {
        return this.urlPrefix + "/audio/" + id + ".mp3";
    }

    private playEndedFunction = () => {
        this.playEnded();
    };

    private getPlayer(): HTMLMediaElement {
        const audio = this.getAudio("bloom-audio-player", audio => {});
        // We used to do this in the init call, but sometimes the function didn't get called.
        // Suspecting that there are cases, maybe just in storybook, where a new instance
        // of the narration object gets created, but the old audio element still exists.
        // Make sure the current instance has our end function.
        // Because it is a fixed function for the lifetime of this object, addEventListener
        // will not add it repeatedly.
        audio.addEventListener("ended", this.playEndedFunction);
        audio.addEventListener("error", this.playEndedFunction);
        return audio;
    }

    public playEnded(): void {
        // Not sure if this is necessary, since both 'playCurrentInternal()' and 'reportPlayEnded()'
        // will toggle image description already, but if we've just gotten to the end of our "stack",
        // it may be needed.
        if (this.ToggleImageDescription) {
            this.ToggleImageDescription.raise(false);
        }
        this.reportPlayDuration();
        if (
            this.elementsToPlayConsecutivelyStack &&
            this.elementsToPlayConsecutivelyStack.length > 0
        ) {
            this.elementsToPlayConsecutivelyStack.pop(); // get rid of the last one we played
            const newStackCount = this.elementsToPlayConsecutivelyStack.length;
            if (newStackCount > 0) {
                // More items to play
                const nextElement = this.elementsToPlayConsecutivelyStack[
                    newStackCount - 1
                ];
                this.setSoundAndHighlight(nextElement, true);
                this.playCurrentInternal();
            } else {
                // Nothing left to play
                this.reportPlayEnded();
            }
        }
    }

    private reportPlayEnded() {
        this.elementsToPlayConsecutivelyStack = [];
        this.subElementsWithTimings = [];

        this.removeAudioCurrent();
        if (this.PageNarrationComplete) {
            this.PageNarrationComplete.raise(this.playerPage);
        }
        if (this.PlayCompleted) {
            this.PlayCompleted.raise();
        }
    }

    private reportPlayDuration() {
        if (!this.audioPlayCurrentStartTime) {
            return;
        }
        const currentTime = new Date().getTime();
        const duration = (currentTime - this.audioPlayCurrentStartTime) / 1000;
        BloomPlayerCore.storeAudioAnalytics(duration);
    }

    private getAudio(id: string, init: (audio: HTMLAudioElement) => void) {
        let player: HTMLAudioElement | null = document.querySelector(
            "#" + id
        ) as HTMLAudioElement;
        if (player && !player.play) {
            player.remove();
            player = null;
        }
        if (!player) {
            player = document.createElement("audio") as HTMLAudioElement;
            player.setAttribute("id", id);
            document.body.appendChild(player);
            init(player);
        }
        return player as HTMLMediaElement;
    }

    public canPlayAudio(current: Element): boolean {
        return true; // currently no way to check
    }

    public setIncludeImageDescriptions(includeImageDescriptions: boolean) {
        this.includeImageDescriptions = includeImageDescriptions;
    }

    // Returns all elements that match CSS selector {expr} as an array.
    // Querying can optionally be restricted to {container}’s descendants
    // If includeSelf is true, it includes both itself as well as its descendants.
    // Otherwise, it only includes descendants.
    // Also filters out imageDescriptions if we aren't supposed to be reading them.
    private findAll(
        expr: string,
        container: HTMLElement,
        includeSelf: boolean = false
    ): HTMLElement[] {
        // querySelectorAll checks all the descendants
        const allMatches: HTMLElement[] = [].slice.call(
            (container || document).querySelectorAll(expr)
        );

        // Now check itself
        if (includeSelf && container && container.matches(expr)) {
            allMatches.push(container);
        }

        return this.includeImageDescriptions
            ? allMatches
            : allMatches.filter(
                  match => !this.isImageDescriptionSegment(match)
              );
    }

    private getPlayableDivs(container: HTMLElement) {
        // We want to play any audio we have from divs the user can see.
        // This is a crude test, but currently we always use display:none to hide unwanted languages.
        return this.findAll(".bloom-editable", container).filter(
            e => window.getComputedStyle(e).display !== "none"
        );
    }

    // Optional param is for use when 'playerPage' has NOT been initialized.
    // Not using the optional param assumes 'playerPage' has been initialized
    private getPagePlayableDivs(page?: HTMLElement): HTMLElement[] {
        return this.getPlayableDivs(page ? page : this.playerPage);
    }

    // Optional param is for use when 'playerPage' has NOT been initialized.
    // Not using the optional param assumes 'playerPage' has been initialized
    private getPageAudioElements(page?: HTMLElement): HTMLElement[] {
        return [].concat.apply(
            [],
            this.getPagePlayableDivs(page).map(x =>
                this.findAll(".audio-sentence", x, true)
            )
        );
    }

    public pageHasAudio(page: HTMLElement): boolean {
        return this.getPageAudioElements(page).length ? true : false;
    }

    public play() {
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.AudioPlaying) {
            return; // no change.
        }
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.AudioPlaying;
        // I'm not sure how getPlayer() can return null/undefined, but have seen it happen
        // typically when doing something odd like trying to go back from the first page.
        if (this.segments.length && this.getPlayer()) {
            if (this.elementsToPlayConsecutivelyStack.length) {
                this.handlePlayPromise(this.getPlayer().play());

                // Resuming play. Only currentStartTime needs to be adjusted, but originalStartTime shouldn't be changed.
                this.audioPlayCurrentStartTime = new Date().getTime();
            } else {
                // Pressing the play button in this case is triggering a replay of the current page,
                // so we need to reset the highlighting.
                this.playAllSentences(null);
                return;
            }
        }
        // adjust startPlay by the elapsed pause. This will cause fakePageNarrationTimedOut to
        // start a new timeout if we are depending on it to fake PageNarrationComplete.
        const pause = new Date().getTime() - this.startPause.getTime();
        this.startPlay = new Date(this.startPlay.getTime() + pause);
        //console.log("paused for " + pause + " and adjusted start time to " + this.startPlay);
        if (this.fakeNarrationAborted) {
            // we already paused through the timeout for normal advance.
            // This call (now we are not paused and have adjusted startPlay)
            // will typically start a new timeout. If we are very close to
            // the desired duration it may just raise the event at once.
            // Either way we should get the event raised exactly once
            // at very close to the right time, allowing for pauses.
            this.fakeNarrationAborted = false;
            this.fakePageNarrationTimedOut(this.playerPage);
        }
        // in case we're resuming play, we need a new timout when the current subelement is finished
        this.highlightNextSubElement(this.currentAudioSessionNum);
    }

    public pause() {
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.AudioPaused) {
            return;
        }
        this.pausePlaying();
        this.startPause = new Date();

        // Note that neither music.pause() nor animations.PauseAnimations() check the state.
        // If that changes, then this state setting will have to be moved to BloomPlayerCore.
        BloomPlayerCore.currentPlaybackMode = PlaybackMode.AudioPaused;
    }

    // This pauses the current player without setting the "AudioPaused" state or setting the
    // startPause timestamp.  If this method is called when resumption is possible, the calling
    // method must take care of these values (as in the pause method directly above).
    // Note that there's no "stop" method on player, only a "pause" method.  This method is
    // used both when "pausing" the narration while viewing a page and when stopping narration
    // when changing pages.
    private pausePlaying() {
        const player = this.getPlayer();
        if (this.segments && this.segments.length && player) {
            // Before reporting duration, try to check that we really are playing.
            // a separate report is sent if play ends.
            if (player.currentTime > 0 && !player.paused && !player.ended) {
                this.reportPlayDuration();
            }
            player.pause();
        }
    }

    public computeDuration(page: HTMLElement): void {
        this.playerPage = page;
        this.segments = this.getPageAudioElements();
        this.PageDuration = 0.0;
        this.segmentIndex = -1; // so pre-increment in getNextSegment sets to 0.
        this.startPlay = new Date();
        //console.log("started play at " + this.startPlay);
        // in case we are already paused (but did manual advance), start computing
        // the pause duration from the beginning of this page.
        this.startPause = this.startPlay;
        if (this.segments.length === 0) {
            this.PageDuration = kMinDuration;
            if (this.PageDurationAvailable) {
                this.PageDurationAvailable.raise(page);
            }
            // Since there is nothing to play, we will never get an 'ended' event
            // from the player. If we are going to advance pages automatically,
            // we need to raise PageNarrationComplete some other way.
            // A timeout allows us to raise it after the arbitrary duration we have
            // selected. The tricky thing is to allow it to be paused.
            clearTimeout(this.fakeNarrationTimer);
            this.fakeNarrationTimer = window.setTimeout(
                () => this.fakePageNarrationTimedOut(page),
                this.PageDuration * 1000
            );
            this.fakeNarrationAborted = false;
            return;
        }
        // trigger first duration evaluation. Each triggers another until we have them all.
        this.getNextSegment();
        //this.getDurationPlayer().setAttribute("src", this.currentAudioUrl(this.segments[0].getAttribute("id")));
    }

    private getNextSegment() {
        this.segmentIndex++;
        if (this.segmentIndex < this.segments.length) {
            const attrDuration = this.segments[this.segmentIndex].getAttribute(
                "data-duration"
            );
            if (attrDuration) {
                // precomputed duration available, use it and go on.
                this.PageDuration += parseFloat(attrDuration);
                this.getNextSegment();
                return;
            }
            // Replace this with the commented code to have ask the browser for duration.
            // (Also uncomment the getDurationPlayer method)
            // However, this doesn't work in apps.
            this.getNextSegment();
            // this.getDurationPlayer().setAttribute("src",
            //     this.currentAudioUrl(this.segments[this.segmentIndex].getAttribute("id")));
        } else {
            if (this.PageDuration < kMinDuration) {
                this.PageDuration = kMinDuration;
            }
            if (this.PageDurationAvailable) {
                this.PageDurationAvailable.raise(this.playerPage);
            }
        }
    }

    private fakePageNarrationTimedOut(page: HTMLElement) {
        if (BloomPlayerCore.currentPlaybackMode === PlaybackMode.AudioPaused) {
            this.fakeNarrationAborted = true;
            clearTimeout(this.fakeNarrationTimer);
            return;
        }
        // It's possible we experienced one or more pauses and therefore this timeout
        // happened too soon. In that case, this.startPlay will have been adjusted by
        // the pauses, so we can detect that here and start a new timeout which will
        // occur at the appropriately delayed time.
        const duration =
            (new Date().getTime() - this.startPlay.getTime()) / 1000;
        if (duration < this.PageDuration - 0.01) {
            // too soon; try again.
            clearTimeout(this.fakeNarrationTimer);
            this.fakeNarrationTimer = window.setTimeout(
                () => this.fakePageNarrationTimedOut(page),
                (this.PageDuration - duration) * 1000
            );
            return;
        }
        if (this.PageNarrationComplete) {
            this.PageNarrationComplete.raise(page);
        }
    }

    public hidingPage() {
        this.pausePlaying(); // Doesn't set AudioPaused state.  Caller sets NewPage state.
    }
}
