import { AspectRatio } from "@material-ui/icons";
import { DomHelper } from "../utilities/domHelper";
import { easing } from "jquery";
import { request } from "http";

// class Animation captures the logic needed to produce the Ken Burns effect
// of panning and zooming as specified in Bloom's motion tool.

// Enhance: Jeffrey has some code from one of the hackathon students that
// makes the animation go at a more even pace
// Enhance: I think it might be possible to do the animation more simply with CSS transitions.

// Defines the extra fields we expect to find in the dataset of an HTMLElement
// that has animation specified (to make TypeScript and TSLint happy).
interface IAnimation {
    initialrect: string;
    finalrect: string;
}

//NOTE: this class is functionally a singleton. There is NOT a separate instance created to animate each page of a bloom book.
export class Animation {
    public static pageHasAnimation(page: HTMLDivElement): boolean {
        return !!Animation.getAnimatableImageContainer(page);
    }

    // Get the animatable clone of the animatable image container, if we already made it.
    public static getAnimationView(page: HTMLElement): HTMLElement | null {
        if (
            page.firstElementChild &&
            page.firstElementChild.classList.contains("hidePage")
        ) {
            const hidePageDiv = page.firstElementChild;
            if(
                hidePageDiv.firstElementChild &&
                hidePageDiv.firstElementChild.classList.contains(Animation.wrapperClassName)
            ){
                const wrapperDiv = hidePageDiv.firstElementChild;
                if(
                    wrapperDiv.firstElementChild &&
                    wrapperDiv.firstElementChild.hasAttribute("data-initialrect")
                ){
                    return wrapperDiv.firstElementChild as HTMLElement;
                }
            }
        }
        return null; // not made yet, or no image to make it from
    }

    // Search for an image container that has the properties we need for animation.
    public static getAnimatableImageContainer(page: HTMLElement): HTMLElement {
        const animatedCanvas = [].slice
            .call(page.getElementsByClassName("bloom-canvas"))
            .find(
                (v) => !!(v.dataset as IAnimation).initialrect,
            ) as HTMLElement;
        if (animatedCanvas) return animatedCanvas;
        return [].slice
            .call(page.getElementsByClassName("bloom-imageContainer"))
            .find(
                (v) => !!(v.dataset as IAnimation).initialrect,
            ) as HTMLElement;
    }

    private animationEngines : { [key:string]:TransformBasedAnimator } = {}; //we keep the animation engines in a map of "pageNumber":engine to avoid making a new one each time we load a page
    public PlayAnimations: boolean; // true if animation should occur
    private currentPage: HTMLElement; // one we're currently showing
    private lastDurationPage: HTMLElement; // one we most recently obtained a duration for
    // incremented for each animated div, to keep animation rules for each one distinct
    private static wrapperClassName = "bloom-ui-animationWrapper";
    private animationDuration: number = 3000; // ms (3000 ifs default)

    constructor() {
        // 200 is designed to make sure this happens AFTER we adjust the scale.
        // Note that if we are not currently animating, this.currentPage may be null or
        // obsolete. It is only used if we need to turn OFF the animation.
        window.addEventListener("orientationchange", () =>
            window.setTimeout(() => this.adjustWrapDiv(this.currentPage), 200)
        );
    }

    public HandlePageBeforeVisible(page: HTMLElement) {
        if (!this.shouldAnimate(page)){      
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
    // May be called when we are not paused; should do nothing if so.
    public PlayAnimation(page:HTMLElement) {
        const engine = this.animationEngines[page.getAttribute("data-page-number")];
        if (!this.PlayAnimations || !engine) {
            return;
        }
        engine.play();
    }

    // May be called when already paused; if so do nothing.
    // Not yet tested in bloom preview context; have not yet decided affordance for pausing
    public PauseAnimation(page:HTMLElement) {
        const engine = this.animationEngines[page.getAttribute("data-page-number")];
        if (!this.PlayAnimations || !engine) {
            return;
        }
        engine.pause();
    }

    public PauseOnFirstFrame(page:HTMLElement){
        const engine = this.animationEngines[page.getAttribute("data-page-number")];
        if (!this.PlayAnimations || !engine) {
            return;
        }
        engine.showInitialState();
        engine.pause();
    }

    private setupAnimation(page: HTMLElement, beforeVisible: boolean): void {
        if (!this.PlayAnimations) {
            return;
        }

        const animatableImageContainer =
            Animation.getAnimatableImageContainer(page);
        if (!animatableImageContainer) {
            return; // no image to animate
        }

        // We expect to see something like this:
        // <div class="bloom-imageContainer bloom-background-image-in-style-attr bloom-leadingElement"
        // style="background-image:url('1.jpg')"
        // title="..."
        // data-initialrect="0.3615 0.0977 0.6120 0.6149" data-finalrect="0.0000 0.0800 0.7495 0.7526"
        // data-duration="5" />
        // ...
        // </div>
        //
        // We want to make something like this:
        //      <div class="hidePage bloom-leadingElement swiper-lazy swiper-lazy-loaded">
        //          <div class="bloom-ui-animationWrapper" style = "width: 100%; height: 100%; overflow: hidden; background-color: white;">
        //              <div ... the entire bloom-canvas or bloom-ImageContainer/>
        //          </div>
        //      </div>
        // and insert it into the bloom-page div as the first element.

        let hidePageDiv = page.firstElementChild as HTMLDivElement;
        let wrapDiv: HTMLElement | null = null;

        // We don't already have a hidePageDiv and need to make it.
        if (!hidePageDiv || !hidePageDiv.classList.contains("hidePage")) {
            // Note that this copies all the classes, so we need to be careful that css based
            // on the classes works as expected with/without hidePage.
            hidePageDiv = document.createElement("div");
            for(let i = 0; i < animatableImageContainer.classList.length; i++){
                hidePageDiv.classList.add(animatableImageContainer.classList[i]);
            }
            hidePageDiv.classList.add("hidePage");

            const animationView = animatableImageContainer.cloneNode(true) as HTMLDivElement;

            //in old books, if you change pages very quickly, the animationView will be cloned before the animatableImageContainer has loaded its background image.
                //in that case, keep asking for the animatableImageContainer's background image until you get it.
            const checkForBackgroundImage = () => {
                const backgroundImage = animatableImageContainer.style.backgroundImage;
                if(backgroundImage){
                    animationView.style.backgroundImage = backgroundImage;
                }
                else{
                    requestAnimationFrame(checkForBackgroundImage);
                }
            }
            if(!animationView.hasAttribute("data-imgsizebasedon")){
                requestAnimationFrame(checkForBackgroundImage);
            }

            wrapDiv = document.createElement("div");
            wrapDiv.classList.add(Animation.wrapperClassName);
            wrapDiv.appendChild(animationView);
            // hide it until we can set its size and the transform rule for its child properly.
            wrapDiv.style.visibility = "hidden";
            hidePageDiv.appendChild(wrapDiv);            

            page.insertBefore(hidePageDiv, page.firstChild);

            //calculates the aspect ratio of the canvas, sets the wrapDiv's aspect ratio field to that value, calls placeWrapDiv, then calls createAndPlayAnimation
            this.applyCanvasAspectRatioToWrapDiv(page, wrapDiv, animationView);          
        } else {
            // We already made the animation div, just retrieve the wrapDiv from inside it.
            wrapDiv = hidePageDiv.firstElementChild as HTMLElement;

            if (wrapDiv.hasAttribute("data-aspectRatio")) {
                // if we have the wrap div and have already determined its aspect ratio,
                // it might still be wrongly positioned if we changed orientation
                // since it was computed.
                this.placeWrapDiv(wrapDiv);
                this.createAndPlayAnimation(page);
            }
            else{
                //we haven't yet determined its aspect ratio.
                this.applyCanvasAspectRatioToWrapDiv(page, wrapDiv, wrapDiv.firstElementChild as HTMLElement);
            }
        }
    }

    private createAndPlayAnimation(page:HTMLElement){
        const animationView = Animation.getAnimationView(page);

        //stop the old engine's animation so it can's compete with the new animation
        const oldEngine = this.animationEngines[page.getAttribute("data-page-number")];
        if(oldEngine) oldEngine.endAnimation();

        if(animationView){            
            const initialRect = animationView.getAttribute("data-initialrect");
            const finalRect = animationView.getAttribute("data-finalrect");
            this.animationEngines[page.getAttribute("data-page-number")] = new TransformBasedAnimator(initialRect, finalRect, this.animationDuration, animationView);
            this.animationEngines[page.getAttribute("data-page-number")].startAnimation();
        }
    }

    private applyCanvasAspectRatioToWrapDiv(page:HTMLElement, wrapDiv:HTMLElement, canvas:HTMLElement) : void{       
        if(page.hasAttribute("data-aspectRatio")){
            //if the task we started before loading has already found the aspect ratio:
            this.placeWrapDiv(wrapDiv);
            this.createAndPlayAnimation(page);
        }        
        //if the canvas has this attribute, it's trivial to find the aspect ratio
        else if(canvas.hasAttribute("data-imgsizebasedon")){
            const canvasDimensions = canvas.getAttribute("data-imgsizebasedon").split(",").map(parseFloat); 
            wrapDiv.setAttribute("data-aspectRatio", (canvasDimensions[0]/canvasDimensions[1]).toString());
            this.placeWrapDiv(wrapDiv);
            this.createAndPlayAnimation(page);
        }
        //if there's no imgSizeBasedOn attribute, default to the old method of looking at the background image
            //however, the animation canvas's background image may not have been loaded yet. In that case, wait until it exists.
        else{
            const waitForImageAndSetAspectRatio = ()=>{
                if(canvas.style.backgroundImage){
                    const virtualImage = new Image();
                    virtualImage.addEventListener("load", ()=>{
                        wrapDiv.setAttribute("data-aspectRatio", (virtualImage.naturalWidth / virtualImage.naturalHeight).toString());
                        this.placeWrapDiv(wrapDiv);
                        this.createAndPlayAnimation(page);
                    });
                    virtualImage.src = DomHelper.getActualUrlFromCSSPropertyValue(canvas.style.backgroundImage);
                }
                else{
                    requestAnimationFrame(waitForImageAndSetAspectRatio);
                }
            }
            requestAnimationFrame(waitForImageAndSetAspectRatio);
        }
    }

    // Enhance: some of the calculations here may require adjustment if we ever do
    // animation while scaled. Currently we use a different system to make the
    // image container fill the viewport when animating, and suppress scaling.
    // So we can ignore that factor.
    private placeWrapDiv(wrapDiv: HTMLElement) {
        const imageAspectRatio = parseFloat(
            wrapDiv.getAttribute("data-aspectRatio")!
        );
        const hidePageDiv = wrapDiv.parentElement;
        const viewWidth = hidePageDiv.clientWidth; // getBoundingClientRect().width;
        const viewHeight = hidePageDiv.clientHeight; // getBoundingClientRect().height;
        const viewAspectRatio = viewWidth / viewHeight;
        if (imageAspectRatio < viewAspectRatio) {
            // black bars on side
            const imageWidth = viewHeight * imageAspectRatio;
            wrapDiv.style.height = "100%";
            wrapDiv.style.width = `${imageWidth}px`;
            wrapDiv.style.left = `${(viewWidth - imageWidth)/2}px`
        } else {
            // black bars top and bottom
            const imageHeight = viewWidth / imageAspectRatio;
            wrapDiv.style.width = "100%";
            wrapDiv.style.height = `${imageHeight}px`;
            wrapDiv.style.top = `${(viewHeight - imageHeight)/2}px`
        }
        wrapDiv.style.overflow = "hidden";
        wrapDiv.style.visibility = "visible";

        this.placeCanvasByScale(wrapDiv, wrapDiv.firstElementChild as HTMLElement);
    }

    //the SVGs and text boxes from an overlay are positioned by absolute pixel values.
    //By default, our canvas size is 100% of the wrap div. That doesn't rescale the overlays to fit the canvas.
    //Instead, we want to start the canvas at the size those overlays expect, and then rescale everything to the size of the wrap div
    private placeCanvasByScale(wrapDiv:HTMLElement, canvas:HTMLElement):void{
        if(canvas.hasAttribute("data-imgsizebasedon")){
            const originalDimensions = canvas.getAttribute("data-imgsizebasedon").split(",").map(parseFloat);
            const wrapDivDimensions = [wrapDiv.clientWidth, wrapDiv.clientHeight];

            canvas.style.width = `${originalDimensions[0]}px`;
            canvas.style.height = `${originalDimensions[1]}px`;
            canvas.style.scale = `${wrapDivDimensions[0]/originalDimensions[0]}`;

            //after applying the scale, the canvas will be centered in the same place. Move its top left corner to coincide with the canvas's top left corner.
            //our top left corner moved half the difference between the original canvas's dimensions and the wrap div's dimensions
            canvas.style.top = `${(wrapDivDimensions[1] - originalDimensions[1])/2}px`;
            canvas.style.left = `${(wrapDivDimensions[0] - originalDimensions[0])/2}px`;
        }
    }

    // Adjust the wrap div for a change of orientation. The name is slightly obsolete
    // since currently we don't continue the animation if we change to portrait mode,
    // where animation is disabled. And if we change to landscape mode, we don't try
    // to start up the animation in the middle of the narration. So all it really
    // has to do currently is REMOVE the animation stuff if changing to portrait.
    // However, since everything else is built around shouldAnimatePage, it seemed
    // worth keeping the logic that adjusts things if we ever go from one animated
    // orientation to another. Note, however, that the 'page' argument passed is not
    // currently valid if turning ON animation. Thus, we will need to do more to get
    // the right page if we want to turn animation ON while switching to horizontal.
    private adjustWrapDiv(page: HTMLElement): void {
        if (!page) {
            return;
        }
        if (!this.shouldAnimate(page)) {
            // we may have a left-over wrapDiv from animating in the other orientation,
            // which could confuse things.
            this.removeAnimationWrappers(page);
            return;
        }
        // Nothing to do if we don't have a wrap div currently.
        const wrapDiv = this.getWrapDiv(page);
        if (!wrapDiv) {
            return;
        }
        this.placeWrapDiv(wrapDiv);
    }

    private getWrapDiv(page: HTMLElement): HTMLElement | null {
        if (!page) {
            return null;
        }
        const animationDiv = Animation.getAnimationView(page);
        if (!animationDiv || animationDiv.children.length !== 1) {
            return null;
        }
        const wrapDiv = animationDiv.firstElementChild as HTMLElement;
        if (!wrapDiv.classList.contains(Animation.wrapperClassName)) {
            return null;
        }
        return wrapDiv;
    }

    private removeAnimationWrappers(page: HTMLElement) {
        if (
            page.firstElementChild &&
            page.firstElementChild.classList.contains("hidePage")
        ) {
            page.removeChild(page.firstElementChild);
        }
    }

    public shouldAnimate(page: HTMLElement): boolean {
        return (
            this.PlayAnimations &&
            page.getAttribute("class")!.indexOf("Landscape") >= 0
        );
    }
}

//Important note: the HTML element sent to this class's constructor must have a parent with overflow set to hidden.
    //The parent must be the desired size and shape of the image to be displayed, and the element sent in should start at that same size and shape.
//Also note that the aspect ratio is determined by that parent container. Therefore, only one of the height or width on (intitial/final)rect will have an effect: the one which requires a higher level of zoom.
export class TransformBasedAnimator{
    private initialScale : number;
    private finalScale : number;
    private initialLeft:number;
    private finalLeft:number;
    private initialTop:number;
    private finalTop:number;

    private toAnimate : HTMLElement;

    private lastFrameTime : number;
    private totalElapsedTime : number;
    private duration : number;

    private paused : boolean;
    
    //initial and final rect strings come in as space-separated "left top width height"
        //all four parameters are reperesented as fractions of the canvas
    //duration is the length of the animation in seconds
    //toAnimate is the whole canvas containing the images to be animated.
        //note that toAnimate needs to be the child of an element that has the correct aspect ratio, has overflow set to hidden, AND has a transform applied
            //the parent's transform can just be translateZ(0), but it needs to be moved out of the page stacking context in the same way as its child in order for overflow:hidden to have any effect
    constructor(initialRect: string, finalRect: string, duration:number, toAnimate:HTMLElement){
        this.duration = duration * 1000; //this.duration is stored in milliseconds
        this.totalElapsedTime = 0;
        this.lastFrameTime = Date.now();

        this.paused = true;

        this.toAnimate = toAnimate;

        const initialVals = initialRect.split(" ").map(parseFloat);
        const finalVals = finalRect.split(" ").map(parseFloat);

        //error handling: if any inputs attempt to do anything that will result in any part of the animation box being blank at any time, 
        //set class variables such that no animation plays
        if(initialVals.length != 4 || finalVals.length != 4 || Math.min(...finalVals)<0 || Math.min(...initialVals)<0 || initialVals[0]+initialVals[2]>1 || initialVals[1]+initialVals[3]>1 || finalVals[0]+finalVals[2]>1 || finalVals[1]+finalVals[3]>1){
            this.initialScale = 1;
            this.finalScale = 1;
            this.initialLeft = 0;
            this.finalLeft = 0;
            this.initialTop = 0;
            this.finalTop = 0;
        }
        else{
            const initialLeftFrac = initialVals[0];
            const finalLeftFrac = finalVals[0];
            const initialTopFrac = initialVals[1];
            const finalTopFrac = finalVals[1];
            //for now, we'll let scale default to the more zoomed-in of width or height.
            //By just changing scale, we maintain the original aspect ratio.
            this.initialScale = 1 / Math.min(initialVals[2], initialVals[3]);
            if(this.initialScale == 1) this.initialScale = 1.0001; //avoid edge case where scale=1 and we divide by zero below
            this.finalScale = 1 / Math.min(finalVals[2], finalVals[3]);
            if(this.finalScale == 1) this.finalScale = 1.0001;

            //the amount we need to move the top left corner relative to the center is 50% - (1/2 width + position)
            this.initialLeft = this.initialScale * 100 * (0.5 - (0.5*initialVals[2] + initialVals[0]));
            this.initialTop = this.initialScale * 100 * (0.5 - (0.5*initialVals[3] + initialVals[1]));
            this.finalLeft = this.finalScale * 100 * (0.5 - (0.5*finalVals[2] + finalVals[0]));
            this.finalTop = this.finalScale * 100 * (0.5 - (0.5*finalVals[3] + finalVals[1]));
        }        
    }

    //Enhance: changing scale while changing left/top can result in slightly choppy motion if the direction of apparent motion from scaling is opposite the direction of motion from left and/or top
        //this is noticeable at low speeds.
        //consider coordinating scale with left/top somehow
    private getScaleAndPosition():{scale: number, left: number, top: number}{
        let fractionComplete = this.totalElapsedTime / this.duration; 
        fractionComplete = Math.min(1, Math.max(0, fractionComplete)); //paranoia
        const easingFactor = this.easingFunction(fractionComplete);
        const currentScale = this.initialScale + (this.finalScale - this.initialScale)*easingFactor;
        const currentLeft = this.initialLeft + (this.finalLeft - this.initialLeft)*easingFactor;
        const currentTop = this.initialTop + (this.finalTop - this.initialTop)*easingFactor;

        return{
            scale:currentScale, 
            left:currentLeft, 
            top:currentTop
        };
    }

    //make the animation smoother by applying a non-linear transformation.
    //progress must be between 0 and 1, and this function returns a number between 0 and 1
    private easingFunction(progress:number):number{
        //ease in and out with a cosine function
        return -1*(Math.cos(progress*Math.PI)-1)/2;
    }

    private advanceAnimation(){
        const currentTime = Date.now();

        //only advance the animation if we aren't paused
        if(!this.paused){
            this.totalElapsedTime += currentTime - this.lastFrameTime;
        
            const {scale, left, top} = this.getScaleAndPosition();
            this.toAnimate.style.transform = `translate(${left}%, ${top}%) scale(${scale})`;
        }

        this.lastFrameTime = currentTime;

        if(this.totalElapsedTime < this.duration) requestAnimationFrame(()=>this.advanceAnimation());
    }

    public pause(){
        this.paused = true;
    }

    public play(){
        this.paused = false;
    }

    public startAnimation(){
        this.totalElapsedTime = 0;
        this.paused = false;
        requestAnimationFrame(()=>this.advanceAnimation());
    }

    public endAnimation(){
        this.paused = true;
        this.totalElapsedTime = this.duration + 1;
    }

    public showInitialState(){
        this.toAnimate.style.transform = `translate(${this.initialLeft}%, ${this.initialTop}%) scale(${this.initialScale})`;
    }
}