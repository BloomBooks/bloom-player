import { ActivityContext } from "../ActivityContext";
import { setupForEditMode } from "./SimpleCheckboxQuizEditMode";

// The value we store to indicate that at some point the user
// chose this answer. We don't really need the value, because if the key for
// that answer has a value, it will be this. But may as well
// be consistent, in case we later add other options.
const kChoiceWasSelectedAtOnePoint = "wasSelectedAtOnePoint";

export default class SimpleCheckboxQuiz {
    private activityContext: ActivityContext;
    // When a page that has this activity becomes the selected one, the bloom-player calls this.
    // We need to connect any listeners, start animation, etc. Here,
    // we are using a javascript class to make sure that we get a fresh start,
    // which is important because the user could be either
    // coming back to this page, or going to another instance of this activity
    // in a subsequent page.
    // eslint-disable-next-line no-unused-consts
    constructor(pageElement: HTMLElement) {}

    public start(activityContext: ActivityContext) {
        console.log("SimpleCheckboxQuiz.start()");
        this.activityContext = activityContext;
        // tslint:disable-next-line: no-submodule-imports
        activityContext.addActivityStylesForPage(
            require("!!raw-loader!./SimpleCheckboxQuiz.css").default
        );

        //------------ Code for managing the choice radio buttons -------
        // Initialize the choice radio buttons, arranging for the appropriate click actions
        // and for maintaining the class that indicates empty choice.
        // Assumes the code that sets up the editMode class on the body element if appropriate has already been run.

        if (activityContext.editMode) {
            setupForEditMode();
            return;
        }
        const choices = this.activityContext.pageElement.getElementsByClassName(
            "checkbox-and-textbox-choice"
        );
        Array.from(choices).forEach((choice: HTMLElement) => {
            const checkbox = this.getCheckBox(choice);
            this.activityContext.addEventListener(
                "click",
                choice,
                e => this.handleReadModeClick(e),
                {
                    capture: true
                }
            );
            const key = this.getStorageKeyForChoice(choice);
            if (
                activityContext.getSessionPageData(key) ===
                kChoiceWasSelectedAtOnePoint
            ) {
                this.choiceWasClicked(choice);
            } else {
                checkbox.checked = false; // just to make sure
            }
        });
    }
    private handleReadModeClick(event: Event) {
        // prevent the browser messing with the check box checked state
        event.stopPropagation();
        event.preventDefault();
        const currentTarget = event.currentTarget as HTMLElement;
        this.choiceWasClicked(currentTarget);
        const correct = currentTarget!.classList.contains("correct-answer");
        if (correct) {
            this.activityContext.playCorrect();
        } else {
            this.activityContext.playWrong();
        }
        // The ui shows items that were (selected but wrong) differently than
        // items that were never tried.
        const choiceKey = this.getStorageKeyForChoice(currentTarget);

        this.activityContext.storeSessionPageData(
            choiceKey,
            kChoiceWasSelectedAtOnePoint
        );

        this.activityContext.reportScore(
            1 /*total possible on page*/,
            correct ? 1 : 0 /*score*/,
            "comprehension"
        );
    }

    // it was either clicked just now, or we're loading from storage
    // and we need to make it look like it looked last time we were on this
    // page
    private choiceWasClicked(choice) {
        choice.classList.add(kChoiceWasSelectedAtOnePoint);
        // Make the state of the hidden input conform. Only if the
        // correct answer was clicked does the checkbox get checked.
        const checkBox = this.getCheckBox(choice);
        // at this point, we only actually make the check happen if
        // this was the correct answer
        if (checkBox) {
            const desiredState1 = choice.classList.contains("correct-answer");
            checkBox.checked = desiredState1;
            // Something I can't track down resets it to unchecked
            // if the user clicks on the input itself. Even with zero delay,
            // this makes something happen in the next event cycle that
            // keeps it the way we want.
            window.setTimeout(() => {
                return (checkBox.checked = desiredState1);
            }, 0);
        }
    }
    private getCheckBox(holder) {
        return holder.firstElementChild;
    }
    // When our page is not the selected one, the bloom-player calls this.
    // It will also tell our context to stop, which will disconnect the listeners we registered with it.
    public stop() {}

    // Get a key for a checkbox. It only needs to be unique on this page.
    // Enhance: If a new version of the book is downloaded with a different
    // set of choices on this page, this sort of positional ID could select
    // the wrong one. To fix this, we could make something generate a persistent
    // id for a choice; but the author could still edit the text of the choice,
    // making the stored choice invalid. Better: find a way to clear the relevant
    // storage when downloading a new version of a book.
    private getStorageKeyForChoice(choice: HTMLElement): string {
        // what is my index among the other choices on the page
        const choices = Array.from(
            this.activityContext.pageElement.getElementsByClassName(
                "checkbox-and-textbox-choice"
            )
        );
        const choiceIndex = choices.indexOf(choice);
        return "cbstate_" + choiceIndex;
    }
}
export const dataActivityID = "simple-checkbox-quiz";
export function activityRequirements() {
    return {
        dragging: false,
        clicking: true,
        typing: false
    };
}
