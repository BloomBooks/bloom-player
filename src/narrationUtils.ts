import LiteEvent from "./event";

export interface ISetHighlightParams {
    newElement: Element;
    shouldScrollToElement: boolean;
    disableHighlightIfNoAudio?: boolean;
    oldElement?: Element | null | undefined; // Optional. Provides some minor optimization if set.
}

export enum PlaybackMode {
    NewPage, // starting a new page ready to play
    NewPageMediaPaused, // starting a new page in the "paused" state
    VideoPlaying, // video is playing
    VideoPaused, // video is paused
    AudioPlaying, // narration and/or animation are playing (or possibly finished)
    AudioPaused, // narration and/or animation are paused
    MediaFinished // video, narration, and/or animation has played (possibly no media to play)
    // Note that music can be playing when the state is either AudioPlaying or MediaFinished.
}

export let currentPlaybackMode: PlaybackMode;
export function setCurrentPlaybackMode(mode: PlaybackMode) {
    currentPlaybackMode = mode;
}

// These functions support allowing a client (typically BloomPlayerCore) to register as
// the object that wants to receive notification of how long audio was played.
// Duration is in seconds.
export let durationReporter: (duration: number) => void;
export function listenForPlayDuration(reporter: (duration: number) => void) {
    durationReporter = reporter;
}

// A client may configure a function which can be called to find out whether a swipe
// is in progress...in BloomPlayerCore, this is implemented by a test on SWiper.
// It is currently only used when we need to scroll the content of a field we are
// playing. Bloom Desktop does not need to set it.
export let isSwipeInProgress: () => boolean;
export function setTestIsSwipeInProgress(tester: () => boolean) {
    isSwipeInProgress = tester;
}

// A client may configure a function which is passed the URL of each audio file narration plays.
export let logNarration: (src: string) => void;
export function setLogNarration(logger: (src: string) => void) {
    logNarration = logger;
}

let playerUrlPrefix = "";
// In bloom player, figuring the url prefix is more complicated. We pass it in.
// In Bloom desktop, we don't call this at all. The code that would naturally do it
// is in the wrong iframe and it's a pain to get it to the right one.
// But there, the urlPrevix function works fine.
export function setPlayerUrlPrefix(prefix: string) {
    playerUrlPrefix = prefix;
}

export function urlPrefix(): string {
    if (playerUrlPrefix) {
        return playerUrlPrefix;
    }
    const bookSrc = window.location.href;
    const index = bookSrc.lastIndexOf("/");
    const bookFolderUrl = bookSrc.substring(0, index);
    return bookFolderUrl;
}

// We need to sort these by the tabindex of the containing bloom-translationGroup element.
// We need a stable sort, which array.sort() does not provide: elements in the same
// bloom-translationGroup, or where the translationGroup does not have a tabindex,
// should remain in their current order.
// This function was extracted from the narration.ts file for testing:
// I was not able to import the narration file into the test suite because
// MutationObserver is not emulated in the test environment.
// It's not obvious what should happen to TGs with no tabindex when others have it.
// At this point we're going with the approach that no tabindex is equivalent to tabindex 999.
// This should cause text with no tabindex to sort to the bottom, if other text has a tabindex;
// It should also not affect order in situations where no text has a tabindex
// (An earlier algorithm attempted to preserve document order for the no-tab-index case
// by comparing any two elements using document order if either lacks tabindex.
// This works well for many cases, but if there's a no-tabindex element between two
// that get re-ordered (e.g., ABCDEF where the only tabindexes are C=2 and E=1),
// the function is not transitive (e.g. C < D < E but E < C) which will produce
// unpredictable results.
export function sortAudioElements(input: HTMLElement[]): HTMLElement[] {
    const keyedItems = input.map((item, index) => {
        return { tabindex: getTgTabIndex(item), index, item };
    });
    keyedItems.sort((x, y) => {
        // If either is not in a translation group with a tabindex,
        // order is determined by their original index.
        // Likewise if the tabindexes are the same.
        if (!x.tabindex || !y.tabindex || x.tabindex === y.tabindex) {
            return x.index - y.index;
        }
        // Otherwise, determined by the numerical order of tab indexes.
        return parseInt(x.tabindex, 10) - parseInt(y.tabindex, 10);
    });
    return keyedItems.map(x => x.item);
}

function getTgTabIndex(input: HTMLElement): string | null {
    let tg: HTMLElement | null = input;
    while (tg && !tg.classList.contains("bloom-translationGroup")) {
        tg = tg.parentElement;
    }
    if (!tg) {
        return "999";
    }
    return tg.getAttribute("tabindex") || "999";
}

// ------migrated from dragActivityNarration, common in narration.ts

// Even though these can now encompass more than strict sentences,
// we continue to use this class name for backwards compatability reasons.
export const kAudioSentence = "audio-sentence";
const kSegmentClass = "bloom-highlightSegment";
const kImageDescriptionClass = "bloom-imageDescription";
// Indicates that highlighting is briefly/temporarily suppressed,
// but may become highlighted later.
// For example, audio highlighting is suppressed until the related audio starts playing (to avoid flashes)
const kSuppressHighlightClass = "ui-suppressHighlight";
// This event allows Narration to inform its controllers when we start/stop reading
// image descriptions. It is raised for each segment we read and passed true if the one
// we are about to read is an image description, false otherwise.
// Todo: wants a better name, it's not about toggling whether something is an image description,
// but about possibly updating the UI to reflect whether we are reading one.
export const ToggleImageDescription = new LiteEvent<boolean>();
const PageDurationAvailable = new LiteEvent<HTMLElement>;

// On a typical page with narration, these are raised at the same time, when the last narration
// on the page finishes. But if there is no narration at all, PlayCompleted will be raised
// immediately (useful for example to disable a pause button), but PageNarrationComplete will
// be raised only after the standard delay for non-audio page (useful for auto-advancing to the next page).
export const PageNarrationComplete = new LiteEvent<HTMLElement>;
export const PlayCompleted = new LiteEvent<HTMLElement>;
// Raised when we can't play narration, specifically because the browser won't allow it until
// the user has interacted with the page.
export const PlayFailed = new LiteEvent<HTMLElement>;
let currentAudioId = "";

// The first one to play should be at the end for both of these
let elementsToPlayConsecutivelyStack: HTMLElement[] = [];
let subElementsWithTimings: Array<[Element, number]> = [];

let startPause: Date;
let segments: HTMLElement[];

// A Session Number that keeps track of each time playAllAudio started.
// This might be needed to keep track of changing pages, or when we start new audio
// that will replace something already playing.
let currentAudioSessionNum: number = 0;

// This represents the start time of the current playing of the audio. If the user presses pause/play, it will be reset.
// This is used for analytics reporting purposes
let audioPlayCurrentStartTime: number | null = null; // milliseconds (since 1970/01/01, from new Date().getTime())

let currentPlayPage: HTMLElement | null = null;
// Unused in Bloom desktop, but in Bloom player, current page might change while a series of sounds
// is playing. This lets us avoid starting the next sound if the page has changed in the meantime.
export function setCurrentPage(page: HTMLElement) {
    currentPlayPage = page;
}
export function getCurrentPage(): HTMLElement {
    return currentPlayPage!;
}

function playCurrentInternal() {
    if (currentPlaybackMode === PlaybackMode.AudioPlaying) {
        let mediaPlayer = getPlayer();
        if (mediaPlayer) {
            const element = getCurrentPage().querySelector(
                `#${currentAudioId}`
            );
            if (!element || !canPlayAudio(element)) {
                playEnded();
                return;
            }

            // I didn't comment this at the time, but my recollection is that making a new player
            // each time helps with some cases where the old one was in a bad state,
            // such as in the middle of pausing.
            const src = mediaPlayer.getAttribute("src") ?? "";
            mediaPlayer.remove();
            mediaPlayer = getPlayer();
            mediaPlayer.setAttribute("src", src);

            // Regardless of whether we end up using timingsStr or not,
            // we should reset this now in case the previous page used it and was still playing
            // when the user flipped to the next page.
            subElementsWithTimings = [];

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
                    subElementsWithTimings.push([
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
            if (currentSegment) {
                ToggleImageDescription.raise(
                    isImageDescriptionSegment(currentSegment)
                );
            }

            gotErrorPlaying = false;
            console.log("playing " + currentAudioId + "..." + mediaPlayer.src);
            const promise = mediaPlayer.play();
            ++currentAudioSessionNum;
            audioPlayCurrentStartTime = new Date().getTime();
            highlightNextSubElement(currentAudioSessionNum);
            handlePlayPromise(promise);
        }
    }
}

function isImageDescriptionSegment(segment: HTMLElement): boolean {
    return segment.closest("." + kImageDescriptionClass) !== null;
}

function canPlayAudio(current: Element): boolean {
    return true; // currently no way to check
}

// Moves the highlight to the next sub-element
// originalSessionNum: The value of currentAudioSessionNum at the time when the audio file started playing.
// This is used to check in the future if the timeouts we started are for the right session.
// startTimeInSecs is an optional fallback that will be used in case the currentTime cannot be determined from the audio player element.
function highlightNextSubElement(
    originalSessionNum: number,
    startTimeInSecs: number = 0
) {
    // the item should not be popped off the stack until it's completely done with.
    const subElementCount = subElementsWithTimings.length;

    if (subElementCount <= 0) {
        return;
    }

    const topTuple = subElementsWithTimings[subElementCount - 1];
    const element = topTuple[0];
    const endTimeInSecs: number = topTuple[1];

    setHighlightTo({
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
        onSubElementHighlightTimeEnded(originalSessionNum);
    }, durationInSecs * 1000);
}

function handlePlayPromise(promise: Promise<void>, player?: HTMLMediaElement) {
    // In newer browsers, play() returns a promise which fails
    // if the browser disobeys the command to play, as some do
    // if the user hasn't 'interacted' with the page in some
    // way that makes the browser think they are OK with it
    // playing audio. In Gecko45, the return value is undefined,
    // so we mustn't call catch.
    if (promise && promise.catch) {
        promise.catch((reason: any) => {
            // There is an error handler here, but the HTMLMediaElement also has an error handler (which may end up calling playEnded()).
            // In case it doesn't, we make sure here that it happens
            handlePlayError();
            // This promise.catch error handler is the only one that handles NotAllowedException (that is, playback not started because user has not interacted with the page yet).
            // However, older versions of browsers don't support promise from HTMLMediaElement.play(). So this cannot be the only error handler.
            // Thus we need both the promise.catch error handler as well as the HTMLMediaElement's error handler.
            //
            // In many cases (such as NotSupportedError, which happens when the audio file isn't found), both error handlers will run.
            // That is a little annoying but if the two don't conflict with each other it's not problematic.

            const playingWhat = player?.getAttribute("src") ?? "unknown";
                console.log(
                    "could not play sound: " + reason + " " + playingWhat
                );

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
            // removeAudioCurrent();

            // With some kinds of invalid sound file it keeps trying and plays over and over.
            // But when we move on to play another sound, a pause here will mess things up.
            // So instead I put a pause after we run out of sounds to try to play.
            //getPlayer().pause();
            // if (Pause) {
            //     Pause.raise();
            // }

            // Get all the state (and UI) set correctly again.
            // Not entirely sure about limiting this to NotAllowedError, but that's
            // the one kind of play error that is fixed by the user just interacting.
            // If there's some other reason we can't play, showing as paused may not
            // be useful. See comments on the similar code in music.ts
            if (reason.name === "NotAllowedError") {
                PlayFailed.raise();
            }
        });
    }
}

// Handles a timeout indicating that the expected time for highlighting the current subElement has ended.
// If we've really played to the end of that subElement, highlight the next one (if any).
// originalSessionNum: The value of currentAudioSessionNum at the time when the audio file started playing.
// This is used to check in the future if the timeouts we started are for the right session
function onSubElementHighlightTimeEnded(originalSessionNum: number) {
    // Check if the user has changed pages since the original audio for this started playing.
    // Note: Using the timestamp allows us to detect switching to the next page and then back to this page.
    //       Using playerPage (HTMLElement) does not detect that.
    if (originalSessionNum !== currentAudioSessionNum) {
        return;
    }
    // Seems to be needed to prevent jumping to the next subelement when not permitted to play by browser.
    // Not sure why the check below on mediaPlayer.currentTime does not prevent this.
    if (currentPlaybackMode === PlaybackMode.AudioPaused) {
        return;
    }

    const subElementCount = subElementsWithTimings.length;
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
    const subElementWithTiming = subElementsWithTimings[subElementCount - 1];
    const nextStartTimeInSecs = subElementWithTiming[1];

    if (playedDurationInSecs && playedDurationInSecs < nextStartTimeInSecs) {
        // Still need to wait. Exit this function early and re-check later.
        const minRemainingDurationInSecs =
            nextStartTimeInSecs - playedDurationInSecs;
        setTimeout(() => {
            onSubElementHighlightTimeEnded(originalSessionNum);
        }, minRemainingDurationInSecs * 1000);

        return;
    }

    subElementsWithTimings.pop();

    highlightNextSubElement(originalSessionNum, nextStartTimeInSecs);
}

function setSoundFrom(element: Element) {
    const firstAudioSentence = getFirstAudioSentenceWithinElement(element);
    const id: string = firstAudioSentence ? firstAudioSentence.id : element.id;
    setCurrentAudioId(id);
}

function setCurrentAudioId(id: string) {
    if (!currentAudioId || currentAudioId !== id) {
        currentAudioId = id;
        updatePlayerStatus();
    }
}

function updatePlayerStatus() {
    const player = getPlayer();
    if (!player) {
        return;
    }
    // Any time we change the src, the player will pause.
    // So if we're playing currently, we'd better report whatever time
    // we played.
    if (player.currentTime > 0 && !player.paused && !player.ended) {
        reportPlayDuration();
    }
    const url = currentAudioUrl(currentAudioId);
    logNarration(url);
    player.setAttribute("src", url + "?nocache=" + new Date().getTime());
}

function getPlayer(): HTMLMediaElement {
    const audio = getAudio("bloom-audio-player", _ => {});
    // We used to do this in the init call, but sometimes the function didn't get called.
    // Suspecting that there are cases, maybe just in storybook, where a new instance
    // of the narration object gets created, but the old audio element still exists.
    // Make sure the current instance has our end function.
    // Because it is a fixed function for the lifetime of this object, addEventListener
    // will not add it repeatedly.
    audio.addEventListener("ended", playEnded);
    audio.addEventListener("error", handlePlayError);
    // If we are suppressing hiliting something until we confirm that the audio really exists,
    // we can stop doing so: the audio is playing.
    audio.addEventListener("playing", removeHighlightSuppression);
    return audio;
}
function removeHighlightSuppression() {
    Array.from(
        document.getElementsByClassName(kSuppressHighlightClass)
    ).forEach(newElement =>
        newElement.classList.remove(kSuppressHighlightClass)
    );
}

function currentAudioUrl(id: string): string {
    const result = urlPrefix() + "/audio/" + id + ".mp3";
    console.log("trying to play " + result);
    return result;
}

function getAudio(id: string, init: (audio: HTMLAudioElement) => void) {
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

function playEnded(): void {
    // Not sure if this is necessary, since both 'playCurrentInternal()' and 'reportPlayEnded()'
    // will toggle image description already, but if we've just gotten to the end of our "stack",
    // it may be needed.
    if (ToggleImageDescription) {
        ToggleImageDescription.raise(false);
    }
    reportPlayDuration();
    if (
        elementsToPlayConsecutivelyStack &&
        elementsToPlayConsecutivelyStack.length > 0
    ) {
        elementsToPlayConsecutivelyStack.pop(); // get rid of the last one we played
        const newStackCount = elementsToPlayConsecutivelyStack.length;
        if (newStackCount > 0) {
            // More items to play
            const nextElement =
                elementsToPlayConsecutivelyStack[newStackCount - 1];
            setSoundAndHighlight(nextElement, true);
            playCurrentInternal();
        } else {
            reportPlayEnded();
            removeAudioCurrent();
            // In some error conditions, we need to stop repeating attempts to play.
            getPlayer().pause();
        }
    }
}

function reportPlayEnded() {
    elementsToPlayConsecutivelyStack = [];
    subElementsWithTimings = [];

    removeAudioCurrent();
    PageNarrationComplete.raise(currentPlayPage!);
    PlayCompleted.raise();
}

function reportPlayDuration() {
    if (!audioPlayCurrentStartTime || !durationReporter) {
        return;
    }
    const currentTime = new Date().getTime();
    const duration = (currentTime - audioPlayCurrentStartTime) / 1000;
    durationReporter(duration);
}

function setSoundAndHighlight(
    newElement: Element,
    disableHighlightIfNoAudio: boolean,
    oldElement?: Element | null | undefined
) {
    setHighlightTo({
        newElement,
        shouldScrollToElement: true, // Always true in bloom-player version
        disableHighlightIfNoAudio,
        oldElement
    });
    setSoundFrom(newElement);
}

function setHighlightTo({
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
            scrollElementIntoView(newElement);
        } catch (e) {
            console.error(e);
        }
    }

    if (oldElement === newElement) {
        // No need to do much, and better not to, so that we can avoid any temporary flashes as the highlight is removed and re-applied
        return;
    }

    removeAudioCurrent();

    if (disableHighlightIfNoAudio) {
        const mediaPlayer = getPlayer();
        const isAlreadyPlaying = mediaPlayer.currentTime > 0;

        // If it's already playing, no need to disable (Especially in the Soft Split case, where only one file is playing but multiple sentences need to be highlighted).
        if (!isAlreadyPlaying) {
            // Start off in a highlight-disabled state so we don't display any momentary highlight for cases where there is no audio for this element.
            // In react-based bloom-player, canPlayAudio() can't trivially identify whether or not audio exists,
            // so we need to incorporate a derivative of Bloom Desktop's .ui-suppressHighlight code
            newElement.classList.add(kSuppressHighlightClass);
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
        const imgContainer = translationGroup.closest(".bloom-imageContainer");
        if (imgContainer) {
            imgContainer.classList.add("ui-audioCurrentImg");
        }
    }
}

// Removes the .ui-audioCurrent class from all elements (also ui-audioCurrentImg)
// Equivalent of removeAudioCurrentFromPageDocBody() in BloomDesktop.
function removeAudioCurrent() {
    // Note that HTMLCollectionOf's length can change if you change the number of elements matching the selector.
    const audioCurrentCollection: HTMLCollectionOf<Element> = document.getElementsByClassName(
        "ui-audioCurrent"
    );

    // Convert to an array whose length won't be changed
    const audioCurrentArray: Element[] = Array.from(audioCurrentCollection);

    for (let i = 0; i < audioCurrentArray.length; i++) {
        audioCurrentArray[i].classList.remove("ui-audioCurrent");
    }
    const currentImg = document.getElementsByClassName("ui-audioCurrentImg")[0];
    if (currentImg) {
        currentImg.classList.remove("ui-audioCurrentImg");
    }
}

// Scrolls an element into view.
function scrollElementIntoView(element: Element) {
    // In Bloom Player, scrollIntoView can interfere with page swipes,
    // so Bloom Player needs some smarts about when to call it...
    if (isSwipeInProgress?.()) {
        // This alternative implementation doesn't use scrollIntoView (Which interferes with swiper).
        // Since swiping is only active at the beginning (usually while the 1st element is playing)
        // it should generally be good enough just to reset the scroll of the scroll parent to the top.

        // Assumption: Assumes the editable is the scrollbox.
        // If this is not the case, you can use JQuery's scrollParent() function or other equivalent
        const scrollAncestor = getEditable(element);
        if (scrollAncestor) {
            scrollAncestor.scrollTop = 0;
        }
        return;
    }

    let mover = element as HTMLElement; // by default make the element itself scrollIntoView
    if (window.getComputedStyle(element.parentElement!).position !== "static") {
        // We can make a new element absolutely positioned and it will be relative to the parent.
        // The idea is to make an element much narrower than the element we are
        // trying to make visible, since we don't want horizontal movement. Quite possibly,
        // as in BL-11038, only some white space is actually off-screen. But even if the author
        // has positioned a bubble so some text is cut off, we don't want horizontal scrolling,
        // which inside swiper will weirdly pull in part of the next page.
        // (In the pathological case that the bubble is more than half hidden, we'll do the
        // horizontal scroll, despite the ugliness of possibly showing part of the next page.)
        // Note that elt may be a span, when scrolling chunks of text into view to play.
        // I thought about using scrollWidth/Height to include any part of the element
        // that is scrolled out of view, but for some reason these are always zero for spans.
        // OffsetHeight seems to give the full height, though docs seem to indicate that it
        // should not include invisible areas.
        const elt = element as HTMLElement;
        mover = document.createElement("div");
        mover.style.position = "absolute";
        mover.style.top = elt.offsetTop + "px";

        // now we need what for a block would be offsetLeft. However, for a span, that
        // yields the offset of the top left corner, which may be in the middle
        // of a line.
        const bounds = elt.getBoundingClientRect();
        const parent = elt.parentElement;
        const parentBounds = parent?.getBoundingClientRect();
        const scale = parentBounds!.width / parent!.offsetWidth;
        const leftRelativeToParent = (bounds.left - parentBounds!.left) / scale;

        mover.style.left = leftRelativeToParent + elt.offsetWidth / 2 + "px";
        mover.style.height = elt.offsetHeight + "px";
        mover.style.width = "0";
        element.parentElement?.insertBefore(mover, element);
    }

    mover.scrollIntoView({
        // Animated instead of sudden
        behavior: "smooth",

        // "nearest" setting does lots of smarts for us (compared to us deciding when to use "start" or "end")
        // Seems to reduce unnecessary scrolling compared to start (aka true) or end (aka false).
        // Refer to https://drafts.csswg.org/cssom-view/#scroll-an-element-into-view,
        // which seems to imply that it won't do any scrolling if the two relevant edges are already inside.
        block: "nearest"

        // horizontal alignment is controlled by "inline". We'll leave it as its default ("nearest")
        // which typically won't move things at all horizontally
    });
    if (mover !== element) {
        mover.parentElement?.removeChild(mover);
    }
}

function getEditable(element: Element): Element | null {
    if (element.classList.contains("bloom-editable")) {
        return element;
    } else {
        return element.closest(".bloom-editable"); // Might be null
    }
}

// If something goes wrong playing a media element, typically that we don't actually have a recording
// for a particular one, we seem to sometimes get an error event, while other times, the promise returned
// by play() is rejected. Both cases call handlePlayError, which calls playEnded, but in case we get both,
// we don't want to call playEnded twice.
let gotErrorPlaying = false;

function handlePlayError() {
    if (gotErrorPlaying) {
        console.log("Already got error playing, not handling again");
        return;
    }
    gotErrorPlaying = true;
    console.log("Error playing, handling");
    setTimeout(() => {
        playEnded();
    }, 100);
}

function getFirstAudioSentenceWithinElement(
    element: Element | null
): Element | null {
    const audioSentences = getAudioSegmentsWithinElement(element);
    if (!audioSentences || audioSentences.length === 0) {
        return null;
    }

    return audioSentences[0];
}

function getAudioSegmentsWithinElement(element: Element | null): Element[] {
    const audioSegments: Element[] = [];

    if (element) {
        if (element.classList.contains(kAudioSentence)) {
            audioSegments.push(element);
        } else {
            const collection = element.getElementsByClassName(kAudioSentence);
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

// --------- migrated from narration.ts, not in dragActivityNarration

let durationOfPagesWithoutNarration = 3.0; // seconds
export function setDurationOfPagesWithoutNarration(d: number) {
    durationOfPagesWithoutNarration = d;
}
let includeImageDescriptions: boolean = true;
export function setIncludeImageDescriptions(b: boolean) {
    includeImageDescriptions = b;
}
let startPlay: Date;
let fakeNarrationAborted: boolean = false;
let fakeNarrationTimer: number;
export let PageDuration: number;

export function pause() {
    if (currentPlaybackMode === PlaybackMode.AudioPaused) {
        return;
    }
    pausePlaying();
    startPause = new Date();

    // Note that neither music.pause() nor animations.PauseAnimations() check the state.
    // If that changes, then this state setting might need attention.
    setCurrentPlaybackMode(PlaybackMode.AudioPaused);
}

// This pauses the current player without setting the "AudioPaused" state or setting the
// startPause timestamp.  If this method is called when resumption is possible, the calling
// method must take care of these values (as in the pause method directly above).
// Note that there's no "stop" method on player, only a "pause" method.  This method is
// used both when "pausing" the narration while viewing a page and when stopping narration
// when changing pages.
function pausePlaying() {
    const player = getPlayer();
    if (segments && segments.length && player) {
        // Before reporting duration, try to check that we really are playing.
        // a separate report is sent if play ends.
        if (player.currentTime > 0 && !player.paused && !player.ended) {
            reportPlayDuration();
        }
        player.pause();
    }
}

export function hidingPage() {
    pausePlaying(); // Doesn't set AudioPaused state.  Caller sets NewPage state.
    clearTimeout(pageNarrationCompleteTimer);
}

 // Roughly equivalent to BloomDesktop's AudioRecording::listen() function.
    // As long as there is audio on the page, this method will play it.
    export function playAllSentences(page: HTMLElement | null): void {
        if (!page && !currentPlayPage) {
            return; // this shouldn't happen
        }
        if (page) {
            currentPlayPage = page; // Review: possibly redundant? Do all callers set currentPlayPage independently?
        }
        const mediaPlayer = getPlayer();
        if (mediaPlayer) {
            mediaPlayer.pause();
            mediaPlayer.currentTime = 0;
        }

        // Invalidate old ID, even if there's no new audio to play.
        // (Deals with the case where you are on a page with audio, switch to a page without audio, then switch back to original page)
        ++currentAudioSessionNum;

        fixHighlighting();

        // Sorted into the order we want to play them, then reversed so we
        // can more conveniently pop the next one to play from the end of the stack.
        elementsToPlayConsecutivelyStack = sortAudioElements(
            getPageAudioElements()
        ).reverse();

        const stackSize = elementsToPlayConsecutivelyStack.length;
        if (stackSize === 0) {
            // Nothing to play. Wait the standard amount of time anyway, in case we're autoadvancing.
            if (PageNarrationComplete) {
                pageNarrationCompleteTimer = window.setTimeout(() => {
                    PageNarrationComplete.raise();
                }, durationOfPagesWithoutNarration * 1000);
            }
            if (PlayCompleted) {
                PlayCompleted.raise();
            }
            return;
        }

        const firstElementToPlay = elementsToPlayConsecutivelyStack[
            stackSize - 1
        ]; // Remember to pop it when you're done playing it. (i.e., in playEnded)

        setSoundAndHighlight(firstElementToPlay, true);
        playCurrentInternal();
        return;
    }

    let pageNarrationCompleteTimer: number;
// Indicates that the element should be highlighted.
const kEnableHighlightClass = "ui-enableHighlight";
// Indicates that the element should NOT be highlighted.
// For example, some elements have highlighting prevented at this level
// because its content has been broken into child elements, only some of which show the highlight
const kDisableHighlightClass = "ui-disableHighlight";
// Match space or &nbsp; (\u00a0). Must have three or more in a row to match.
// Note: Multi whitespace text probably contains a bunch of &nbsp; followed by a single normal space at the end.
const multiSpaceRegex = /[ \u00a0]{3,}/;
const multiSpaceRegexGlobal = new RegExp(multiSpaceRegex, "g");
/**
 * Finds and fixes any elements on the page that should have their audio-highlighting disabled.
 */
function fixHighlighting() {
    // Note: Only relevant when playing by sentence (but note, this can make Record by Text Box -> Split or Record by Sentence, Play by Sentence)
    // Play by Text Box highlights the whole paragraph and none of this really matters.
    // (the span selector won't match anyway)
    const audioElements = getPageAudioElements();
    audioElements.forEach(audioElement => {
        // FYI, don't need to process the bloom-linebreak spans. Nothing bad happens, just unnecessary.
        const matches = findAll(
            "span:not(.bloom-linebreak)",
            audioElement,
            true
        );
        matches.forEach(element => {
            // Simple check to help ensure that elements that don't need to be modified will remain untouched.
            // This doesn't consider whether text that shouldn't be highlighted is already in inside an
            // element with highlight disabled, but that's ok. The code down the stack checks that.
            const containsNonHighlightText = !!element.innerText.match(
                multiSpaceRegex
            );

            if (containsNonHighlightText) {
                fixHighlightingInNode(element, element);
            }
        });
    });
}

/**
 * Recursively fixes the audio-highlighting within a node (whether element node or text node)
 * @param node The node to recursively fix
 * @param startingSpan The starting span, AKA the one that will receive .ui-audioCurrent in the future.
 */
function fixHighlightingInNode(node: Node, startingSpan: HTMLSpanElement) {
    if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).classList.contains(kDisableHighlightClass)
    ) {
        // No need to process bloom-highlightDisabled elements (they've already been processed)
        return;
    } else if (node.nodeType === Node.TEXT_NODE) {
        // Leaf node. Fix the highlighting, then go back up the stack.
        fixHighlightingInTextNode(node, startingSpan);
        return;
    } else {
        // Recursive case
        const childNodesCopy = Array.from(node.childNodes); // Make a copy because node.childNodes is being mutated
        childNodesCopy.forEach(childNode => {
            fixHighlightingInNode(childNode, startingSpan);
        });
    }
}

/**
 * Analyzes a text node and fixes its highlighting.
 */
function fixHighlightingInTextNode(
    textNode: Node,
    startingSpan: HTMLSpanElement
) {
    if (textNode.nodeType !== Node.TEXT_NODE) {
        throw new Error(
            "Invalid argument to fixMultiSpaceInTextNode: node must be a TextNode"
        );
    }

    if (!textNode.nodeValue) {
        return;
    }

    // string.matchAll would be cleaner, but not supported in all browsers (in particular, FF60)
    // Use RegExp.exec for greater compatibility.
    multiSpaceRegexGlobal.lastIndex = 0; // RegExp.exec is stateful! Need to reset the state.
    const matches: {
        text: string;
        startIndex: number;
        endIndex: number; // the index of the first character to exclude
    }[] = [];
    let regexResult: RegExpExecArray | null;
    while (
        (regexResult = multiSpaceRegexGlobal.exec(
            textNode.nodeValue
        )) != null
    ) {
        regexResult.forEach(matchingText => {
            matches.push({
                text: matchingText,
                startIndex:
                    multiSpaceRegexGlobal.lastIndex -
                    matchingText.length,
                endIndex: multiSpaceRegexGlobal.lastIndex // the index of the first character to exclude
            });
        });
    }

    // First, generate the new DOM elements with the fixed highlighting.
    const newNodes: Node[] = [];
    if (matches.length === 0) {
        // No matches
        newNodes.push(makeHighlightedSpan(textNode.nodeValue));
    } else {
        let lastMatchEndIndex = 0; // the index of the first character to exclude of the last match
        for (let i = 0; i < matches.length; ++i) {
            const match = matches[i];

            const preMatchText = textNode.nodeValue.slice(
                lastMatchEndIndex,
                match.startIndex
            );
            lastMatchEndIndex = match.endIndex;
            newNodes.push(makeHighlightedSpan(preMatchText));

            newNodes.push(document.createTextNode(match.text));

            if (i === matches.length - 1) {
                const postMatchText = textNode.nodeValue.slice(
                    match.endIndex
                );
                if (postMatchText) {
                    newNodes.push(makeHighlightedSpan(postMatchText));
                }
            }
        }
    }

    // Next, replace the old DOM element with the new DOM elements
    const oldNode = textNode;
    if (oldNode.parentNode && newNodes && newNodes.length > 0) {
        for (let i = 0; i < newNodes.length; ++i) {
            const nodeToInsert = newNodes[i];
            oldNode.parentNode.insertBefore(nodeToInsert, oldNode);
        }

        oldNode.parentNode.removeChild(oldNode);

        // We need to set ancestor's background back to transparent (instead of highlighted),
        // and let each of the newNodes's styles control whether to be highlighted or transparent.
        // If ancestor was highlighted but one of its new descendant nodes was transparent,
        // all that would happen is the descendant would allow the ancestor's highlight color to show through,
        // which doesn't achieve what we want :(
        startingSpan.classList.add(kDisableHighlightClass);
    }
}

function makeHighlightedSpan(textContent: string) {
    const newSpan = document.createElement("span");
    newSpan.classList.add(kEnableHighlightClass);
    newSpan.appendChild(document.createTextNode(textContent));
    return newSpan;
}

    // Optional param is for use when 'playerPage' has NOT been initialized.
// Not using the optional param assumes 'playerPage' has been initialized
function getPageAudioElements(page?: HTMLElement): HTMLElement[] {
    return [].concat.apply(
        [],
        getPagePlayableDivs(page).map(x =>
            findAll(".audio-sentence", x, true)
        )
    );
}

    // Returns all elements that match CSS selector {expr} as an array.
// Querying can optionally be restricted to {container}’s descendants
// If includeSelf is true, it includes both itself as well as its descendants.
// Otherwise, it only includes descendants.
// Also filters out imageDescriptions if we aren't supposed to be reading them.
function findAll(
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

    return includeImageDescriptions
        ? allMatches
        : allMatches.filter(
                match => !isImageDescriptionSegment(match)
            );
}

function getPlayableDivs(container: HTMLElement) {
    // We want to play any audio we have from divs the user can see.
    // This is a crude test, but currently we always use display:none to hide unwanted languages.
    return findAll(".bloom-editable", container).filter(
        e => window.getComputedStyle(e).display !== "none"
    );
}

// Optional param is for use when 'playerPage' has NOT been initialized.
// Not using the optional param assumes 'playerPage' has been initialized
function getPagePlayableDivs(page?: HTMLElement): HTMLElement[] {
    return getPlayableDivs(page ? page : currentPlayPage!);
}

export function play() {
    if (currentPlaybackMode === PlaybackMode.AudioPlaying) {
        return; // no change.
    }
    setCurrentPlaybackMode(PlaybackMode.AudioPlaying);
    // I'm not sure how getPlayer() can return null/undefined, but have seen it happen
    // typically when doing something odd like trying to go back from the first page.
    if (segments.length && getPlayer()) {
        if (elementsToPlayConsecutivelyStack.length) {
            handlePlayPromise(getPlayer().play());

            // Resuming play. Only currentStartTime needs to be adjusted, but originalStartTime shouldn't be changed.
            audioPlayCurrentStartTime = new Date().getTime();
        } else {
            // Pressing the play button in this case is triggering a replay of the current page,
            // so we need to reset the highlighting.
            playAllSentences(null);
            return;
        }
    }
    // adjust startPlay by the elapsed pause. This will cause fakePageNarrationTimedOut to
    // start a new timeout if we are depending on it to fake PageNarrationComplete.
    const pause = new Date().getTime() - startPause.getTime();
    startPlay = new Date(startPlay.getTime() + pause);
    //console.log("paused for " + pause + " and adjusted start time to " + startPlay);
    if (fakeNarrationAborted) {
        // we already paused through the timeout for normal advance.
        // This call (now we are not paused and have adjusted startPlay)
        // will typically start a new timeout. If we are very close to
        // the desired duration it may just raise the event at once.
        // Either way we should get the event raised exactly once
        // at very close to the right time, allowing for pauses.
        fakeNarrationAborted = false;
        fakePageNarrationTimedOut(currentPlayPage!);
    }
    // in case we're resuming play, we need a new timout when the current subelement is finished
    highlightNextSubElement(currentAudioSessionNum);
}


function fakePageNarrationTimedOut(page: HTMLElement) {
    if (currentPlaybackMode === PlaybackMode.AudioPaused) {
        fakeNarrationAborted = true;
        clearTimeout(fakeNarrationTimer);
        return;
    }
    // It's possible we experienced one or more pauses and therefore this timeout
    // happened too soon. In that case, startPlay will have been adjusted by
    // the pauses, so we can detect that here and start a new timeout which will
    // occur at the appropriately delayed time.
    const duration =
        (new Date().getTime() - startPlay.getTime()) / 1000;
    if (duration < PageDuration - 0.01) {
        // too soon; try again.
        clearTimeout(fakeNarrationTimer);
        fakeNarrationTimer = window.setTimeout(
            () => fakePageNarrationTimedOut(page),
            (PageDuration - duration) * 1000
        );
        return;
    }
    if (PageNarrationComplete) {
        PageNarrationComplete.raise(page);
    }
}

// Figure out the total duration of the audio on the page.
// Currently has side effects of setting the current page and segments.
// I think that should be removed.
// An earlier version of this code (see narration.ts around November 2023)
// was designed to run asnychronously so that if we don't have audio
// durations in the file, it would try to get the actual duration of the audio
// from the server. However, comments indicated that this approach did not
// work in mobile apps, and bloompubs have now long shipped with the durations.
// So I decided to simplify.
export function computeDuration(page: HTMLElement): number {
    currentPlayPage = page;
    segments = getPageAudioElements();
    PageDuration = 0.0;
    startPlay = new Date();
    //console.log("started play at " + startPlay);
    // in case we are already paused (but did manual advance), start computing
    // the pause duration from the beginning of this page.
    startPause = startPlay;
    if (segments.length === 0) {
        PageDuration = durationOfPagesWithoutNarration;
        if (PageDurationAvailable) {
            PageDurationAvailable.raise(page);
        }
        // Since there is nothing to play, we will never get an 'ended' event
        // from the player. If we are going to advance pages automatically,
        // we need to raise PageNarrationComplete some other way.
        // A timeout allows us to raise it after the arbitrary duration we have
        // selected. The tricky thing is to allow it to be paused.
        clearTimeout(fakeNarrationTimer);
        fakeNarrationTimer = window.setTimeout(
            () => fakePageNarrationTimedOut(page),
            PageDuration * 1000
        );
        fakeNarrationAborted = false;
        return PageDuration;
    }

    segments.forEach((segment, index) => {
        const attrDuration = segment.getAttribute(
            "data-duration"
        );
        if (attrDuration) {
            // precomputed duration available, use it and go on.
            PageDuration += parseFloat(attrDuration);
        }
    });
    if (PageDuration < durationOfPagesWithoutNarration) {
        PageDuration = durationOfPagesWithoutNarration;
    }
    return PageDuration;
}

export function pageHasAudio(page: HTMLElement): boolean {
    return getPageAudioElements(page).length ? true : false;
}
