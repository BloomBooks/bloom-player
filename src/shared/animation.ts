import { AspectRatio } from "@material-ui/icons";
import { DomHelper } from "../utilities/domHelper";
import { easing } from "jquery";
import { request } from "http";

// class Animation captures the logic needed to produce the Ken Burns effect
// of panning and zooming as specified in Bloom's motion tool.

// Defines the extra fields we expect to find in the dataset of an HTMLElement
// that has animation specified (to make TypeScript and TSLint happy).
interface IAnimation {
    initialrect: string;
    finalrect: string;
}

//NOTE: this class is functionally a singleton. There is NOT a separate instance created to animate each page of a bloom book.
export class Animation {
    public static pageHasAnimation(page: HTMLDivElement): boolean {
        return !!Animation.getAnimatableCanvas(page);
    }

    // Get the animatable clone of the animatable bloom canvas, if we already made it.
    public static getAnimationCanvas(page: HTMLElement): HTMLElement | null {
        if (
            page.firstElementChild &&
            page.firstElementChild.classList.contains(
                "bloom-animationBackground",
            )
        ) {
            const animationBackground = page.firstElementChild;
            if (
                animationBackground.firstElementChild &&
                animationBackground.firstElementChild.classList.contains(
                    Animation.wrapperClassName,
                )
            ) {
                const wrapperDiv = animationBackground.firstElementChild;
                if (
                    wrapperDiv.firstElementChild &&
                    wrapperDiv.firstElementChild.hasAttribute(
                        "data-initialrect",
                    )
                ) {
                    return wrapperDiv.firstElementChild as HTMLElement;
                }
            }
        }
        return null; // not made yet, or no image to make it from
    }

    // Search for a bloom-canvas that has the properties we need for animation.
    public static getAnimatableCanvas(page: HTMLElement): HTMLElement {
        const animatedCanvas = [].slice
            .call(page.getElementsByClassName("bloom-canvas"))
            .find(
                (v) =>
                    !v.closest(".bloom-animationBackground") &&
                    !!(v.dataset as IAnimation).initialrect,
            ) as HTMLElement;
        if (animatedCanvas) return animatedCanvas;
        return [].slice
            .call(page.getElementsByClassName("bloom-imageContainer"))
            .find(
                (v) => !!(v.dataset as IAnimation).initialrect,
            ) as HTMLElement;
    }

    private animationEngine: TransformBasedAnimator; // The animator for the most recently loaded page. This.createAndPlayAnimation stops any exisiting animation and overwrites the variable.
    public PlayAnimations: boolean; // true if animation should occur (only set by bloom-player core based on bookInfo)
    private currentPage: HTMLElement; // one we're currently showing
    private lastDurationPage: HTMLElement; // one we most recently obtained a duration for
    private static wrapperClassName = "bloom-ui-animationWrapper";
    private animationDuration: number = 3000; // ms (3000 ifs default)

    constructor() {
        // 200 is designed to make sure this happens AFTER we adjust the scale.
        // Note that if we are not currently animating, this.currentPage may be null or
        // obsolete. It is only used if we need to turn OFF the animation.
        window.addEventListener("orientationchange", () =>
            window.setTimeout(
                () => this.adjustAnimationWrapper(this.currentPage),
                200,
            ),
        );
    }

    public HandlePageBeforeVisible(page: HTMLElement) {
        if (!this.shouldAnimate(page)) {
            // may have left-over wrappers from when page previously played.
            this.removeAnimationWrappers(page);
        }
    }

    // What we need to do when the page becomes visible (possibly start the animation,
    // if we already have the duration).
    public HandlePageVisible(page: HTMLElement) {
        if (this.shouldAnimate(page)) {
            //if we've already gotten this page's duration, set up the animation
            this.currentPage = page;
            this.animatableCanvas = Animation.getAnimatableCanvas(page);
            if (this.currentPage === this.lastDurationPage) {
                // already got the corresponding durationAvailable event
                this.setupAnimation(page, false);
            }
        }
    }

    // What we need to do when we get the duration of a page (possibly start the animation,
    // if the page is already visible).
    public HandlePageDurationAvailable(page: HTMLElement, duration: number) {
        if (this.shouldAnimate(page)) {
            this.animationDuration = duration;
            //if the page is already visible, set up the animation
            this.lastDurationPage = page;
            if (this.currentPage === this.lastDurationPage) {
                // already got the corresponding pageVisible event
                this.setupAnimation(page, false);
            }
        }
    }

    // Only applicable to resuming paused animation
    // May be called when we are not paused;should do nothing if so.
    public resumeAnimation() {
        if (!this.PlayAnimations || !this.animationEngine) {
            return;
        }
        this.animationEngine.resume();
    }

    // May be called when already paused;if so do nothing.
    // Not yet tested in bloom preview context;have not yet decided affordance for pausing
    public PauseAnimation() {
        if (!this.PlayAnimations || !this.animationEngine) {
            return;
        }
        this.animationEngine.pause();
    }

    public PauseOnFirstFrame() {
        if (!this.PlayAnimations || !this.animationEngine) {
            return;
        }
        this.animationEngine.showInitialState();
        this.animationEngine.pause();
    }

    public animatableCanvas: HTMLElement | null = null;

    private setupAnimation(page: HTMLElement, beforeVisible: boolean): void {
        if (!this.PlayAnimations) {
            return;
        }

        if (!this.animatableCanvas) {
            return; // no image to animate
        }

        // We expect to see something like this:
        // <div class="bloom-canvas bloom-leadingElement bloom-has-canvas-element bloom-background-image-in-style-attr swiper-lazy swiper-lazy-loaded"
        // data-imgsizebasedon="320,180"
        // style="background-image:url('1.jpg')"
        // data-title="..."
        // data-initialrect="0.3615 0.0977 0.6120 0.6149"
        // data-finalrect="0.0000 0.0800 0.7495 0.7526"
        // data-duration="5" />
        //      ... children with
        // </div>
        //
        // We want to make something like this:
        //      <div class="bloom-canvas bloom-leadingElement bloom-has-canvas-element bloom-background-image-in-style-attr swiper-lazy swiper-lazy-loaded bloom-animationBackground">
        //          <div class="bloom-ui-animationWrapper" style = "width: 100%;height: 100%;overflow: hidden;background-color: white;">
        //              <div ... the entire bloom-canvas (as outlined above) or bloom-ImageContainer (if running an obsolete book)/>
        //          </div>
        //      </div>
        // and insert it into the bloom-page div as the first element.

        let animationBackground = page.firstElementChild as HTMLDivElement;
        let animationWrapper: HTMLElement | null = null;

        // We don't already have an animationBackground and need to make it.
        if (
            !animationBackground ||
            !animationBackground.classList.contains("bloom-animationBackground")
        ) {
            // Note that this copies all the classes, so we need to be careful that css based
            // on the classes works as expected
            // It's of particular note that properly hiding the page's regular contents depends on
            //      the bloom-animationBackground class in ./src/bloom-player-content.less
            animationBackground = document.createElement("div");
            for (let i = 0; i < this.animatableCanvas.classList.length; i++) {
                animationBackground.classList.add(
                    this.animatableCanvas.classList[i],
                );
            }
            animationBackground.classList.add("bloom-animationBackground");

            const animationCanvas = this.animatableCanvas.cloneNode(
                true,
            ) as HTMLDivElement;

            //in old books, if you change pages very quickly, the animationCanvas will be cloned before the animatableCanvas has its background image style applied.
            //in that case, keep asking for url of the animatableCanvas's background image until it's present.
            //I'm unsure why this is happening at all, but my best guess is it's related to swiper's handling of lazy-load.
            //Enhance: consider disabling swiper's lazy-load. It's likely unnecessary anyway, as our code never makes it possible to load more than three pages at a time anyway
            const checkForBackgroundImage = () => {
                const backgroundImage =
                    this.animatableCanvas.style.backgroundImage;
                if (backgroundImage) {
                    animationCanvas.style.backgroundImage = backgroundImage;
                } else {
                    requestAnimationFrame(checkForBackgroundImage);
                }
            };
            if (!animationCanvas.hasAttribute("data-imgsizebasedon")) {
                requestAnimationFrame(checkForBackgroundImage);
            }

            animationWrapper = document.createElement("div");
            animationWrapper.classList.add(Animation.wrapperClassName);
            animationWrapper.appendChild(animationCanvas);
            // hide it until we can set its size and the transform rule for its child properly.
            animationWrapper.style.visibility = "hidden";
            animationBackground.appendChild(animationWrapper);

            page.insertBefore(animationBackground, page.firstChild);

            //calculates the aspect ratio of the canvas, sets the animationWrapper's aspect ratio field to that value, calls placeAnimationWrapper, then calls createAndPlayAnimation
            this.applyCanvasAspectRatioToAnimationWrapper(
                page,
                animationWrapper,
                animationCanvas,
            );
        } else {
            // We already made the animation div, just retrieve the animationWrapper from inside it.
            animationWrapper =
                animationBackground.firstElementChild as HTMLElement;

            if (animationWrapper.hasAttribute("data-aspectRatio")) {
                // if we have the animation wrapper and have already determined its aspect ratio,
                // it might still be wrongly positioned if we changed orientation
                // since it was computed.
                this.placeAnimationWrapper(animationWrapper);
                this.createAndPlayAnimation(page);
            } else {
                //we haven't yet determined its aspect ratio.
                this.applyCanvasAspectRatioToAnimationWrapper(
                    page,
                    animationWrapper,
                    animationWrapper.firstElementChild as HTMLElement,
                );
            }
        }
    }

    private createAndPlayAnimation(page: HTMLElement) {
        const animationCanvas = Animation.getAnimationCanvas(page);

        //stop the old engine's animation so it doesn't compete with the new animation
        if (this.animationEngine) this.animationEngine.endAnimation();

        if (animationCanvas) {
            const initialRect =
                animationCanvas.getAttribute("data-initialrect");
            const finalRect = animationCanvas.getAttribute("data-finalrect");
            this.animationEngine = new TransformBasedAnimator(
                initialRect,
                finalRect,
                this.animationDuration,
                animationCanvas,
            );
            this.animationEngine.startAnimation();
        }
    }

    private applyCanvasAspectRatioToAnimationWrapper(
        page: HTMLElement,
        animationWrapper: HTMLElement,
        canvas: HTMLElement,
    ): void {
        if (page.hasAttribute("data-aspectRatio")) {
            //if the task we started before loading has already found the aspect ratio:
            this.placeAnimationWrapper(animationWrapper);
            this.createAndPlayAnimation(page);
        }
        //if the canvas has this attribute, it's trivial to find the aspect ratio
        else if (canvas.hasAttribute("data-imgsizebasedon")) {
            const canvasDimensions = canvas
                .getAttribute("data-imgsizebasedon")
                .split(",")
                .map(parseFloat);
            animationWrapper.setAttribute(
                "data-aspectRatio",
                (canvasDimensions[0] / canvasDimensions[1]).toString(),
            );
            this.placeAnimationWrapper(animationWrapper);
            this.createAndPlayAnimation(page);
        }
        //if there's no imgSizeBasedOn attribute, default to the old method of looking at the background image
        //however, the animation canvas's background image may not have been loaded yet. In that case, wait until it exists.
        //This is a consequence of checkForBackgroundImage within setupAnimation, which appears to be a consequence of swiper's lazy loading
        else {
            const waitForImageAndSetAspectRatio = () => {
                if (canvas.style.backgroundImage) {
                    const virtualImage = new Image();
                    virtualImage.addEventListener("load", () => {
                        animationWrapper.setAttribute(
                            "data-aspectRatio",
                            (
                                virtualImage.naturalWidth /
                                virtualImage.naturalHeight
                            ).toString(),
                        );
                        this.placeAnimationWrapper(animationWrapper);
                        this.createAndPlayAnimation(page);
                    });
                    virtualImage.src =
                        DomHelper.getActualUrlFromCSSPropertyValue(
                            canvas.style.backgroundImage,
                        );
                } else {
                    requestAnimationFrame(waitForImageAndSetAspectRatio);
                }
            };
            requestAnimationFrame(waitForImageAndSetAspectRatio);
        }
    }

    // Enhance: some of the calculations here may require adjustment if we ever do
    // animation while scaled. Currently we use a different system to make the
    // bloom canvas fill the viewport when animating, and suppress scaling.
    // So we can ignore that factor.
    private placeAnimationWrapper(animationWrapper: HTMLElement) {
        const imageAspectRatio = parseFloat(
            animationWrapper.getAttribute("data-aspectRatio")!,
        );
        const animationBackground = animationWrapper.parentElement;
        const viewWidth = animationBackground.clientWidth; // getBoundingClientRect().width;
        const viewHeight = animationBackground.clientHeight; // getBoundingClientRect().height;
        const viewAspectRatio = viewWidth / viewHeight;
        if (imageAspectRatio < viewAspectRatio) {
            // black bars on side
            const imageWidth = viewHeight * imageAspectRatio;
            animationWrapper.style.height = "100%";
            animationWrapper.style.width = `${imageWidth}px`;
            animationWrapper.style.left = `${(viewWidth - imageWidth) / 2}px`;
        } else {
            // black bars top and bottom
            const imageHeight = viewWidth / imageAspectRatio;
            animationWrapper.style.width = "100%";
            animationWrapper.style.height = `${imageHeight}px`;
            animationWrapper.style.top = `${(viewHeight - imageHeight) / 2}px`;
        }
        animationWrapper.style.overflow = "hidden";
        animationWrapper.style.visibility = "visible";

        this.placeCanvasByScale(
            animationWrapper,
            animationWrapper.firstElementChild as HTMLElement,
        );
    }

    //the SVGs and text boxes from an overlay are positioned by absolute pixel values.
    //By default, our canvas size is 100% of the animation wrapper. That doesn't rescale the overlays to fit the canvas.
    //Instead, we want to start the canvas at the size those overlays expect, and then rescale everything to the size of the animation wrapper
    private placeCanvasByScale(
        animationWrapper: HTMLElement,
        canvas: HTMLElement,
    ): void {
        if (canvas.hasAttribute("data-imgsizebasedon")) {
            const originalDimensions = canvas
                .getAttribute("data-imgsizebasedon")
                .split(",")
                .map(parseFloat);
            const animationWrapperDimensions = [
                animationWrapper.clientWidth,
                animationWrapper.clientHeight,
            ];

            canvas.style.width = `${originalDimensions[0]}px`;
            canvas.style.height = `${originalDimensions[1]}px`;
            canvas.style.scale = `${animationWrapperDimensions[0] / originalDimensions[0]}`;

            //after applying the scale, the canvas will be centered in the same place. Move its top left corner to coincide with the canvas's top left corner.
            //our top left corner moved half the difference between the original canvas's dimensions and the animation wrapper's dimensions
            canvas.style.top = `${(animationWrapperDimensions[1] - originalDimensions[1]) / 2}px`;
            canvas.style.left = `${(animationWrapperDimensions[0] - originalDimensions[0]) / 2}px`;
        }
    }

    // Adjust the animation wrapper for a change of orientation. The name is slightly obsolete
    // since currently we don't continue the animation if we change to portrait mode,
    // where animation is disabled. And if we change to landscape mode, we don't try
    // to start up the animation in the middle of the narration. So all it really
    // has to do currently is REMOVE the animation stuff if changing to portrait.
    // However, since everything else is built around shouldAnimatePage, it seemed
    // worth keeping the logic that adjusts things if we ever go from one animated
    // orientation to another. Note, however, that the 'page' argument passed is not
    // currently valid if turning ON animation. Thus, we will need to do more to get
    // the right page if we want to turn animation ON while switching to horizontal.
    private adjustAnimationWrapper(page: HTMLElement): void {
        if (!page) {
            return;
        }
        if (!this.shouldAnimate(page)) {
            // we may have a left-over animationWrapper from animating in the other orientation,
            // which could confuse things.
            this.removeAnimationWrappers(page);
            return;
        }
        // Nothing to do if we don't have an animation wrapper currently.
        const animationWrapper = this.getAnimationWrapper(page);
        if (!animationWrapper) {
            return;
        }
        this.placeAnimationWrapper(animationWrapper);
    }

    private getAnimationWrapper(page: HTMLElement): HTMLElement | null {
        if (!page) {
            return null;
        }
        const animationDiv = Animation.getAnimationCanvas(page);
        if (!animationDiv || animationDiv.children.length !== 1) {
            return null;
        }
        const animationWrapper = animationDiv.firstElementChild as HTMLElement;
        if (!animationWrapper.classList.contains(Animation.wrapperClassName)) {
            return null;
        }
        return animationWrapper;
    }

    private removeAnimationWrappers(page: HTMLElement) {
        if (
            page.firstElementChild &&
            page.firstElementChild.classList.contains(
                "bloom-animationBackground",
            )
        ) {
            page.removeChild(page.firstElementChild);
        }
    }

    //returns true if:
    //  bloom player core has set this.PlayAnimations to true (this.PlayAnimations = bookInfo.playAnimations)
    //  AND the page in question is in landscape orientation
    //  Notably, this is NOT a check for whether the animation is currently paused, just whether an animation should be applied to the page.
    public shouldAnimate(page: HTMLElement): boolean {
        return (
            this.PlayAnimations &&
            page.getAttribute("class")!.indexOf("Landscape") >= 0
        );
    }
}

//Important note: the HTML element sent to this class's constructor must have a parent with overflow set to hidden.
//      The parent must be the desired size and shape of the image to be displayed, and the element sent in should start at that same size and shape.
//Also note that the aspect ratio is determined by that parent container. Therefore, only one of the height or width on (intitial/final)rect will have an effect: the one which requires a higher level of zoom.
export class TransformBasedAnimator {
    private initialScale: number;
    private finalScale: number;
    private initialLeft: number;
    private finalLeft: number;
    private initialTop: number;
    private finalTop: number;

    private canvasToAnimate: HTMLElement;

    private lastFrameTime: number;
    private totalElapsedTime: number;
    private duration: number; //stored in milliseconds

    private paused: boolean;

    //initial and final rect strings come in as space-separated "left top width height"
    //      all four of these parameters are reperesented as fractions of the canvas
    //duration is the length of the animation in seconds
    //canvasToAnimate is the whole canvas containing the images to be animated.
    //      note that canvasToAnimate needs to be the child of an element that has the correct aspect ratio, has overflow set to hidden, AND has a transform applied
    //      the parent's transform can just be translateZ(0), but it needs to be moved out of the page stacking context in the same way as its child in order for overflow:hidden to have any effect
    constructor(
        initialRect: string,
        finalRect: string,
        duration: number,
        canvasToAnimate: HTMLElement,
    ) {
        this.duration = duration * 1000; //this.duration is stored in milliseconds
        this.totalElapsedTime = 0;
        this.lastFrameTime = Date.now();

        this.paused = true;

        this.canvasToAnimate = canvasToAnimate;

        const initialVals = initialRect.split(" ").map(parseFloat);
        const finalVals = finalRect.split(" ").map(parseFloat);

        //error handling: if any inputs attempt to do anything that will result in any part of the animation box being blank at any time,
        //set class variables such that no animation plays
        if (
            initialVals.length != 4 ||
            finalVals.length != 4 ||
            Math.min(...finalVals) < 0 ||
            Math.min(...initialVals) < 0 ||
            initialVals[0] + initialVals[2] > 1 ||
            initialVals[1] + initialVals[3] > 1 ||
            finalVals[0] + finalVals[2] > 1 ||
            finalVals[1] + finalVals[3] > 1
        ) {
            this.initialScale = 1;
            this.finalScale = 1;
            this.initialLeft = 0;
            this.finalLeft = 0;
            this.initialTop = 0;
            this.finalTop = 0;
        } else {
            const initialLeftFrac = initialVals[0];
            const finalLeftFrac = finalVals[0];
            const initialTopFrac = initialVals[1];
            const finalTopFrac = finalVals[1];
            //for now, we'll let scale default to the more zoomed-in of width or height.
            //By just changing scale, we maintain the original aspect ratio.
            this.initialScale = 1 / Math.min(initialVals[2], initialVals[3]);
            if (this.initialScale == 1) this.initialScale = 1.0001; //avoid edge case where scale=1 and we divide by zero below
            this.finalScale = 1 / Math.min(finalVals[2], finalVals[3]);
            if (this.finalScale == 1) this.finalScale = 1.0001;

            //the amount we need to move the top left corner relative to the center is 50% - (1/2 width + position)
            this.initialLeft =
                this.initialScale *
                100 *
                (0.5 - (0.5 * initialVals[2] + initialVals[0]));
            this.initialTop =
                this.initialScale *
                100 *
                (0.5 - (0.5 * initialVals[3] + initialVals[1]));
            this.finalLeft =
                this.finalScale *
                100 *
                (0.5 - (0.5 * finalVals[2] + finalVals[0]));
            this.finalTop =
                this.finalScale *
                100 *
                (0.5 - (0.5 * finalVals[3] + finalVals[1]));
        }
    }

    //Enhance: changing scale while changing left/top can result in slightly choppy motion if the direction of apparent motion from scaling is opposite the direction of motion from left and/or top
    //this is noticeable at low speeds.
    //consider coordinating scale with left/top somehow
    private getScaleAndPosition(): {
        scale: number;
        left: number;
        top: number;
    } {
        let fractionComplete = this.totalElapsedTime / this.duration;
        fractionComplete = Math.min(1, Math.max(0, fractionComplete)); //paranoia
        const easingFactor = this.easingFunction(fractionComplete);
        const currentScale =
            this.initialScale +
            (this.finalScale - this.initialScale) * easingFactor;
        const currentLeft =
            this.initialLeft +
            (this.finalLeft - this.initialLeft) * easingFactor;
        const currentTop =
            this.initialTop + (this.finalTop - this.initialTop) * easingFactor;

        return {
            scale: currentScale,
            left: currentLeft,
            top: currentTop,
        };
    }

    //make the animation smoother by applying a non-linear transformation.
    //progress must be between 0 and 1, and this function returns a number between 0 and 1
    private easingFunction(progress: number): number {
        //ease in and out with a cosine function
        return (-1 * (Math.cos(progress * Math.PI) - 1)) / 2;
    }

    private advanceAnimation() {
        //only advance the animation if we aren't paused.
        if (this.paused) return;

        const currentTime = Date.now();
        this.totalElapsedTime += currentTime - this.lastFrameTime;

        // Only advance the animation until the duration is up.
        // The endAnimation method relies on this guard statement to prevent changes to the canvas state after the animation is done.
        //      That's necessary because there can still be one more call to this method after endAnimation has been called.
        if (this.totalElapsedTime >= this.duration) return;

        const { scale, left, top } = this.getScaleAndPosition();
        this.canvasToAnimate.style.transform = `translate(${left}%, ${top}%) scale(${scale})`;

        this.lastFrameTime = currentTime;

        requestAnimationFrame(() => this.advanceAnimation());
    }

    public pause() {
        this.paused = true;
    }

    public resume() {
        this.paused = false;
        this.lastFrameTime = Date.now();
        this.advanceAnimation();
    }

    public startAnimation() {
        this.paused = false;
        this.totalElapsedTime = 0;
        this.lastFrameTime = Date.now();
        this.advanceAnimation();
    }

    //After end animation is called, there may be one more call to advanceAnimation,
    // which will see that the duration has been exceeded and do nothing.
    public endAnimation() {
        this.totalElapsedTime = this.duration + 1;
    }

    public showInitialState() {
        this.canvasToAnimate.style.transform = `translate(${this.initialLeft}%, ${this.initialTop}%) scale(${this.initialScale})`;
    }
}
