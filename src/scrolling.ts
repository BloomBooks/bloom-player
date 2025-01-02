import $ from "jquery";
import "jquery.nicescroll";
/// <reference path="../node_modules/@types/jquery.nicescroll/index.d.ts" />
import { BloomPlayerCore } from "./bloom-player-core";

export const kSelectorForPotentialNiceScrollElements =
    ".bloom-translationGroup:not(.bloom-imageDescription) .bloom-editable.bloom-visibility-code-on, " +
    ".scrollable"; // we added .scrollable for branding cases where the boilerplate text also needs to scroll

export function addScrollbarsToPage(bloomPage: Element): void {
    // Expected behavior for cover: "on the cover, which is has a very dynamic layout, we just don't do scrollbars"
    if (bloomPage.classList.contains("cover")) {
        return;
    }
    // ENHANCE: If you drag the scrollbar mostly horizontal instead of mostly vertical,
    // both the page swiping and the scrollbar will be operating, which is somewhat confusing
    // and not perfectly ideal, although it doesn't really break anything.
    // It'd be nice so that if you're dragging the scrollbar in any way, swiping is disabled.

    // on a browser so obsolete that it doesn't have IntersectionObserver (e.g., IE or Safari before 12.2),
    // we just won't get scrolling.
    if ("IntersectionObserver" in window) {
        // Attach overlaid scrollbar to all editables except textOverPictures (e.g. comics)
        // Expected behavior for comic bubbles:  "we want overflow to show, but not generate scroll bars"
        let scrollBlocks: HTMLElement[] = [];
        let countOfObserversExpectedToReport = 0;
        let countOfObserversThatHaveReported = 0;
        $(bloomPage)
            .find(kSelectorForPotentialNiceScrollElements)
            .each((index, elt) => {
                // Process the blocks that are possibly overflowing.
                // Blocks that are overflowing will be configured to use niceScroll
                // so the user can scroll and see everything. That is costly, because
                // niceScroll leaks event listeners every time it is called. So we don't
                // want to use it any more than we need to. Also, niceScroll
                // somehow fails to work when our vertical alignment classes are applied;
                // probably something to do with the bloom-editables being display:flex
                // to achieve vertical positioning. We can safely remove those classes
                // if the block is overflowing, because there's no excess white space
                // to distribute.
                // Note: there are complications Bloom desktop handles in determining
                // accurately whether a block is overflowing. We don't need those here.
                // If it is close enough to overflow to get a scroll bar, it's close
                // enough not to care whether extra white space is at the top, bottom,
                // or split (hence we can safely remove classes used for that).
                // And we'll risk sometimes adding niceScroll when we could (just)
                // have done without it.
                const firstChild = elt.firstElementChild;
                const lastChild = elt.lastElementChild;
                if (!lastChild) {
                    // no children, can't be overflowing
                    return;
                }
                // nicescroll doesn't properly scale the padding at the top and left of the
                // scrollable area of the languageGroup divs when the page is scaled.  This
                // code sets offset values to correct for this.  The scale is determined by
                // looking for a style element with an id of "scale-style-sheet" and extracting
                // the scale from the transform property.  See BL-13796.
                let scale = 1;
                const scaleStyle = document.querySelector(
                    "style#scale-style-sheet",
                );
                if (scaleStyle) {
                    const match = scaleStyle.innerHTML.match(
                        /transform:[a-z0-9, ()]* scale\((\d+(\.\d+)?)\)/,
                    );
                    if (match) {
                        scale = parseFloat(match[1]);
                    }
                }
                let { topAdjust, leftAdjust, cursorWidth } =
                    ComputeNiceScrollOffsets(scale, elt);
                // We don't really want continuous observation, but this is an elegant
                // way to find out whether each child is entirely contained within its
                // parent. Unlike computations involving coordinates, we don't have to
                // worry about whether borders, margins, and padding are included in
                // various measurements. We do need to check the first as well as the
                // last child, because if text is aligned bottom, any overflow will be
                // at the top.
                const observer = new IntersectionObserver(
                    (entries, ob) => {
                        // called more-or-less immediately for each child, but after the
                        // loop creates them all.
                        entries.forEach((entry) => {
                            countOfObserversThatHaveReported++;
                            ob.unobserve(entry.target); // don't want to keep getting them, or leak observers
                            // console.log("bounding: ");
                            // console.log(entry.boundingClientRect);
                            // console.log(entry.intersectionRect);
                            // console.log(entry.rootBounds);
                            // console.log(
                            //     "ratio: " + entry.intersectionRatio
                            // );
                            var isBubble = !!entry.target.closest(
                                ".bloom-textOverPicture",
                            );
                            // In bloom desktop preview, we set width to 200% and then scale down by 50%.
                            // This can lead to intersection ratios very slightly less than 1, probably due
                            // to pixel rounding of some sort, when in fact the content fits comfortably.
                            // For example, in one case we got a boundingClientRect 72.433 high
                            // and an intersectionRect 72.416, for a ratio of 0.9998.
                            // If a block is 1000 pixels high and really overflowing by 1 pixel, the ratio
                            // will be 0.999. I think it's safe to take anything closer to 1 than that as
                            // 'not overflowing'.
                            let overflowing = entry.intersectionRatio < 0.999;

                            if (overflowing && isBubble) {
                                // We want to be less aggressive about putting scroll bars on bubbles.
                                // Most of the time, a bubble is very carefully sized to just fit the
                                // text. But the intersection observer wants it to fit a certain amount
                                // of white space as well. We want a scroll bar if it's overflowing
                                // really badly for some reason, but that's much more the exception
                                // than the rule, so better a little clipping when the bubble is badly
                                // sized than a scroll bar that isn't needed in one that is just right.
                                // Example: a bubble which appears to fit perfectly, 3 lines high:
                                // its clientHeight is 72; containing bloom-editable's is 59;
                                // lineHeight is 24px. IntersectionRatio computes to 59/72,
                                // which makes the 'overflow' 13. A ratio of 0.5 as we originally
                                // proposed would give us a scroll bar we don't want.
                                let maxBubbleOverflowLineFraction = 0.6;
                                if (
                                    entry.target !=
                                        entry.target.parentElement
                                            ?.firstElementChild ||
                                    entry.target !=
                                        entry.target.parentElement!
                                            .lastElementChild
                                ) {
                                    // Bubbles are center-aligned vertically. If this is not the only
                                    // child,the first and last will overflow above and below by about the
                                    // same amount. So we're only really looking at half the overflow on this para,
                                    // and should reduce the threshold.
                                    maxBubbleOverflowLineFraction /= 2;
                                }
                                const overflow =
                                    (1 - entry.intersectionRatio) *
                                    entry.target.clientHeight;
                                const lineHeightPx = window.getComputedStyle(
                                    entry.target,
                                ).lineHeight;
                                const lineHeight = parseFloat(
                                    // remove the trailing "px"
                                    lineHeightPx.substring(
                                        0,
                                        lineHeightPx.length - 2,
                                    ),
                                );
                                overflowing =
                                    overflow >
                                    lineHeight * maxBubbleOverflowLineFraction;
                            }
                            if (
                                overflowing &&
                                scrollBlocks.indexOf(
                                    entry.target.parentElement!,
                                ) < 0
                            ) {
                                scrollBlocks.push(entry.target.parentElement!);
                                // remove classes incompatible with niceScroll
                                const group =
                                    entry.target.parentElement!.parentElement!;
                                group.classList.remove(
                                    "bloom-vertical-align-center",
                                );
                                group.classList.remove(
                                    "bloom-vertical-align-bottom",
                                );
                                if (isBubble) {
                                    // This is a way of forcing it not to be display-flex, which doesn't
                                    // work with the nice-scroll-bar library we're using.
                                    // That library messes with the element style, so it seemed safer
                                    // not to do that myself.
                                    entry.target.parentElement!.classList.add(
                                        "scrolling-bubble",
                                    );
                                }
                            }
                            if (
                                countOfObserversThatHaveReported ==
                                countOfObserversExpectedToReport
                            ) {
                                // configure nicescroll...ideally only once for all of them
                                $(scrollBlocks).niceScroll({
                                    autohidemode: false,
                                    railoffset: {
                                        top: -topAdjust,
                                        left: -leftAdjust,
                                    },
                                    cursorwidth: cursorWidth,
                                    cursorcolor: "#000000",
                                    cursoropacitymax: 0.1,
                                    cursorborderradius: cursorWidth, // Make the corner more rounded than the 5px default.
                                });
                                setupSpecialMouseTrackingForNiceScroll(
                                    bloomPage,
                                );
                                scrollBlocks = []; // Just in case it's possible to get callbacks before we created them all.
                            }
                        });
                    },
                    { root: elt },
                );
                countOfObserversExpectedToReport++;
                observer.observe(firstChild!);
                if (firstChild != lastChild) {
                    countOfObserversExpectedToReport++;
                    observer.observe(lastChild);
                }
            });
    }
}

// nicescroll doesn't properly scale the padding at the top and left of the
// scrollable area of the languageGroup divs when the page is scaled.  This
// method computes offset values to correct for this.  See BL-13796.
export function ComputeNiceScrollOffsets(scale: number, elt: HTMLElement) {
    let topAdjust = 0;
    let leftAdjust = 0;
    let cursorWidth = "12px";
    if (scale !== 1) {
        const parent2 = elt.parentElement?.parentElement;
        const parent3 = parent2?.parentElement;
        if (
            parent2?.classList.contains("split-pane-component-inner") &&
            parent3?.classList.contains("marginBox")
        ) {
            // The nicescroll elements are added outside the marginBox, and also
            // outside the #page-scaling-container. So we need to adjust for the
            // scaling of the scrollbar position and size ourselves. See BL-14112.
            cursorWidth = `${12 * scale}px`;
            const top = parent2.offsetTop;
            const right = parent2.offsetLeft + parent2.offsetWidth;
            topAdjust = -(top * (scale - 1));
            leftAdjust = -(right * (scale - 1));
        } else {
            const compStyles = window.getComputedStyle(elt.parentElement!);
            const topPadding =
                compStyles.getPropertyValue("padding-top") ?? "0";
            const leftPadding =
                compStyles.getPropertyValue("padding-left") ?? "0";
            topAdjust = parseFloat(topPadding) * (scale - 1);
            leftAdjust = parseFloat(leftPadding) * (scale - 1);
        }
    }
    return { topAdjust, leftAdjust, cursorWidth };
}

export function setupSpecialMouseTrackingForNiceScroll(bloomPage: Element) {
    bloomPage.removeEventListener("pointerdown", listenForPointerDown); // only want one!
    bloomPage.addEventListener("pointerdown", listenForPointerDown);
    // The purpose of this is to prevent Swiper causing the page to be moved or
    // flicked when the user is trying to scroll on the page.  See BL-14079.
    for (const eventName of ["pointermove", "pointerup"]) {
        bloomPage.ownerDocument.body.addEventListener(
            eventName,
            BloomPlayerCore.handlePointerMoveEvent,
            {
                capture: true,
            },
        );
    }
}

// nicescroll doesn't properly scale the padding at the top and left of the
// scrollable area of the languageGroup divs when the page is scaled.  This
// method sets offset values to correct for this.  It is called whenever the
// entire window resizes, which also scales the page before this is called.
// See BL-13796.
export function fixNiceScrollOffsets(page: HTMLElement, scale: number) {
    page.querySelectorAll(kSelectorForPotentialNiceScrollElements).forEach(
        (group) => {
            // The type definition is not correct for getNiceScroll; we expect it to return an array.
            const groupNiceScroll = $(group).getNiceScroll() as any;
            if (groupNiceScroll && groupNiceScroll.length > 0) {
                let { topAdjust, leftAdjust, cursorWidth } =
                    ComputeNiceScrollOffsets(scale, group as HTMLElement);
                groupNiceScroll[0].opt.railoffset.top = -topAdjust;
                groupNiceScroll[0].opt.railoffset.left = -leftAdjust;
                groupNiceScroll[0].opt.cursorwidth = cursorWidth;
                groupNiceScroll[0].resize();
            }
        },
    );
}

// If the mouse down is in the thumb of a NiceScroll, we don't want to get a click
// event later even if the mouse up is outside that element.  Also, we want the
// scrolling to follow the mouse movement even if the mouse cursor leaves the thumb
// before the mouse button is released.
function listenForPointerDown(ev: PointerEvent) {
    if (
        ev.target instanceof HTMLDivElement &&
        (ev.target as HTMLDivElement).classList.contains("nicescroll-cursors")
    ) {
        (ev.target as HTMLDivElement).setPointerCapture(ev.pointerId);
        if (ev.pointerType === "mouse") {
            // Investigation shows that Swiper uses pointer event handlers and NiceScroll
            // uses mouse event handlers, so stopping the propagation of pointer events
            // doesn't effect the scrolling, but does stop the swiping.  See BL-14079.
            // Pointer capture affects mouse events as well as pointer events.
            ev.stopPropagation();
        }
    }
}
