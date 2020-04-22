import LiteEvent from "./event";
import { BloomPlayerCore } from "./bloom-player-core";
import { sortAudioElements } from "./narrationUtils";

const kSegmentClass = "bloom-highlightSegment";
const kMinDuration = 3.0; // seconds
const kAudioSentence = "audio-sentence"; // Even though these can now encompass more than strict sentences, we continue to use this class name for backwards compatability reasons

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
    private paused: boolean = false;
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

    public PageNarrationComplete: LiteEvent<HTMLElement>;
    public PageDurationAvailable: LiteEvent<HTMLElement>;
    public PageDuration: number;

    private audioPlayStartTime: number; // milliseconds (since 1970/01/01, from new Date().getTime())

    // Roughly equivalent to BloomDesktop's AudioRecording::listen() function.
    // As long as there is audio on the page, this method will play it.
    public playAllSentences(page: HTMLElement | null): void {
        if (!page && !this.playerPage) {
            return; // this shouldn't happen
        }
        if (page) {
            this.playerPage = page;
        }

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
            return;
        }

        this.paused = false;
        const firstElementToPlay = this.elementsToPlayConsecutivelyStack[
            stackSize - 1
        ]; // Remember to pop it when you're done playing it. (i.e., in playEnded)

        this.setSoundAndHighlight(firstElementToPlay, true);
        this.playCurrentInternal();
        return;
    }

    private playCurrentInternal() {
        if (!this.paused) {
            const mediaPlayer = this.getPlayer();
            if (mediaPlayer) {
                const element = this.playerPage.querySelector(
                    `#${this.currentAudioId}`
                );
                if (!element || !this.canPlayAudio(element)) {
                    this.playEnded();
                    return;
                }

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

                    this.subElementsWithTimings = [];
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

                const promise = mediaPlayer.play();
                this.audioPlayStartTime = new Date().getTime();
                this.highlightNextSubElement();

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

                        // Don't call removeAudioCurrent() here. The HTMLMediaElement's error handler will call playEnded() and calling removeAudioCurrent() here will mess up playEnded().
                        // this.removeAudioCurrent();

                        // With some kinds of invalid sound file it keeps trying and plays over and over.
                        this.getPlayer().pause();
                        // if (this.Pause) {
                        //     this.Pause.raise();
                        // }
                    });
                }
            }
        }
    }

    // Moves the highlight to the next sub-element
    // startTimeInSecs is an optional fallback that will be used in case the currentTime cannot be determined from the audio player element.
    private highlightNextSubElement(startTimeInSecs: number = 0) {
        // the item should not be popped off the stack until it's completely done with.
        const subElementCount = this.subElementsWithTimings.length;

        if (subElementCount <= 0) {
            return;
        }

        const topTuple = this.subElementsWithTimings[subElementCount - 1];
        const element = topTuple[0];
        const endTimeInSecs: number = topTuple[1];

        this.setHighlightTo(element, false);

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
            this.onSubElementHighlightTimeEnded();
        }, durationInSecs * 1000);
    }

    // Handles a timeout indicating that the expected time for highlighting the current subElement has ended.
    // If we've really played to the end of that subElement, highlight the next one (if any).
    private onSubElementHighlightTimeEnded() {
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
                this.onSubElementHighlightTimeEnded();
            }, minRemainingDurationInSecs * 1000);

            return;
        }

        this.subElementsWithTimings.pop();

        this.highlightNextSubElement(nextStartTimeInSecs);
    }

    // Removes the .ui-audioCurrent class from all elements (also ui-audioCurrentImg)
    // Equivalent of removeAudioCurrentFromPageDocBody() in BloomDesktop.
    private removeAudioCurrent() {
        // Note that HTMLCollectionOf's length can change if you change the number of elements matching the selector.
        const audioCurrentCollection: HTMLCollectionOf<
            Element
        > = document.getElementsByClassName("ui-audioCurrent");

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
        this.setHighlightTo(newElement, disableHighlightIfNoAudio, oldElement);
        this.setSoundFrom(newElement);
    }

    private setHighlightTo(
        newElement: Element,
        disableHighlightIfNoAudio: boolean,
        oldElement?: Element | null | undefined // Optional. Provides some minor optimization if set.
    ) {
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
            translationGroup.classList.contains("bloom-imageDescription")
        ) {
            const imgContainer = translationGroup.closest(
                ".bloom-imageContainer"
            );
            if (imgContainer) {
                imgContainer.classList.add("ui-audioCurrentImg");
            }
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

    private getPlayer(): HTMLMediaElement {
        return this.getAudio("bloom-audio-player", audio => {
            // if we just pass the function, it has the wrong "this"
            audio.addEventListener("ended", () => this.playEnded());
            audio.addEventListener("error", () => this.playEnded());
        });
    }

    public playEnded(): void {
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
    }

    private reportPlayDuration() {
        const currentTime = new Date().getTime();
        const duration = (currentTime - this.audioPlayStartTime) / 1000;
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

    // Returns all elements that match CSS selector {expr} as an array.
    // Querying can optionally be restricted to {container}’s descendants
    // If includeSelf is true, it includes both itself as well as its descendants.
    // Otherwise, it only includes descendants.
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

        return allMatches;
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
        if (!this.paused) {
            return; // no change.
        }
        // I'm not sure how getPlayer() can return null/undefined, but have seen it happen
        // typically when doing something odd like trying to go back from the first page.
        if (this.segments.length && this.getPlayer()) {
            if (this.elementsToPlayConsecutivelyStack.length) {
                this.getPlayer().play();
                this.audioPlayStartTime = new Date().getTime();
            } else {
                // Pressing the play button in this case is triggering a replay of the current page,
                // so we need to reset the highlighting.
                this.playAllSentences(null);
                return;
            }
        }
        this.paused = false;
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
    }

    public pause() {
        if (this.paused) {
            return;
        }
        const player = this.getPlayer();
        if (this.segments && this.segments.length && player) {
            // Before reporting duration, try to check that we really are playing.
            // a separate report is sent if play ends.
            if (player.currentTime > 0 && !player.paused && !player.ended) {
                this.reportPlayDuration();
            }
            player.pause();
        }
        this.paused = true;
        this.startPause = new Date();
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
        if (this.paused) {
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
}
