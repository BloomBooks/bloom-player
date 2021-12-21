import { ActivityContext } from "../ActivityContext";
// tslint:disable-next-line: no-submodule-imports
/* Not using. See comment below:
    const activityCss = require("!!raw-loader!./multipleChoiceDomActivity.css")
    .default;*/

// This class is intentionally very generic. All it needs is that the html of the
// page it is given should have some objects (translation groups or images) that have
// a data-activityRole of either "correct-answer" or "wrong-answer".

// Note that you won't find any code using this directly. Instead,
// it gets used by the ActivityManager as the default export of this module.
export default class MultipleChoiceDomActivity {
    private activityContext: ActivityContext;
    // When a page that has this activity becomes the selected one, the bloom-player calls this.
    // We need to connect any listeners, start animation, etc. Here,
    // we are using a javascript class to make sure that we get a fresh start,
    // which is important because the user could be either
    // coming back to this page, or going to another instance of this activity
    // in a subsequent page.
    // eslint-disable-next-line no-unused-vars
    constructor(pageElement: HTMLElement) {}

    public start(activityContext: ActivityContext) {
        this.activityContext = activityContext;

        activityContext.pageElement
            .querySelectorAll(".chosen-correct, .chosen-wrong")
            .forEach((choiceElement: HTMLElement) => {
                choiceElement.classList.remove("chosen-correct");
                choiceElement.classList.remove("chosen-wrong");
            });
        /* I decided that it's too rigid to bake the css into the version of Bloom-Player
        at this point. It prevents someone improving it without us, and could lead to migration
        headaches in the future with things like how much room is alloted for various elements.
         Instead, we're going to keep the styling in the template book that is used to make the book.
        activityContext.addActivityStylesForPage(activityCss);*/
        activityContext.pageElement
            // actual buttons are problematic in the editing mode, so we wrap things with a div.buttonish and then at runtime, replace with a real button
            .querySelectorAll(".buttonish")
            .forEach((choiceElement: HTMLElement) => {
                // add a button around the translation group or image container
                const correct =
                    choiceElement.getAttribute("data-activityRole") ===
                    "correct-answer";
                let button = choiceElement;
                /*
                TODO

                let button = choiceElement.parentNode as HTMLElement;
                if (button.tagName !== "BUTTON") {
                    button = choiceElement.ownerDocument!.createElement(
                        "button"
                    );
                    choiceElement.parentNode!.insertBefore(
                        button,
                        choiceElement
                    );
                    button.appendChild(choiceElement);
                }
*/
                // wire up events
                this.activityContext.addEventListener(
                    "click",
                    button,
                    correct ? this.onCorrectClick : this.onWrongClick
                );
            });
        //this.shuffleButtons();
    }
    // private shuffleButtons(string selector){
    //      (selector ? this.querySelector(selector) : this)
    //          .parent()
    //          .each(function() {
    //              document
    //                  .querySelector(this)
    //                  .children(selector)
    //                  .sort(function() {
    //                      return Math.random() - 0.5;
    //                  })
    //                  .detach()
    //                  .appendTo(this);
    //          });
    // }
    private onCorrectClick = (evt: Event) => {
        (evt.currentTarget as HTMLElement).classList.add("chosen-correct");
        this.activityContext.playCorrect();
    };
    private onWrongClick = (evt: Event) => {
        (evt.currentTarget as HTMLElement).classList.add("chosen-wrong");
        this.activityContext.playWrong();
    };

    // When our page is not the selected one, the bloom-player calls this.
    // It will also tell our context to stop, which will disconnect the listeners we registered with it
    public stop() {}
}

export function activityRequirements() {
    return {
        dragging: true, // we don't actually use dragging, but we are getting accidental drags... maybe the swiper needs to be less sensitive
        clicking: true, // enhance: maybe when we say we have clicking, the swiper then becomes less sensitive?
        typing: false
    };
}
