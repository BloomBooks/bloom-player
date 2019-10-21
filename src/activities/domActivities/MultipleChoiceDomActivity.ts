import { ActivityContext } from "../ActivityContext";
// tslint:disable-next-line: no-submodule-imports
const activityCss = require("!!raw-loader!./multipleChoiceDomActivity.css")
    .default;

// This class is intentionally very generic. All it needs is that the html of the
// page it is given should have some objects (translation groups or images) that have
// a data-activityRole of either "correct-answer" or "wrong-answer".

export default class MultipleChoiceDomActivity {
    private listeners = new Array<{
        name: string;
        target: Element;
        listener: EventListener;
    }>();

    private pageElement: HTMLElement;
    private activityContext: ActivityContext;
    // When a page that has this activity becomes the selected one, the bloom-player calls this.
    // We need to connect any listeners, start animation, etc. Here,
    // we are using a javascript class to make sure that we get a fresh start,
    // which is important because the user could be either
    // coming back to this page, or going to another instance of this activity
    // in a subsequent page.
    // eslint-disable-next-line no-unused-vars
    constructor(pageElement: HTMLElement) {
        this.pageElement = pageElement;
    }

    public start(activityContext: ActivityContext) {
        this.activityContext = activityContext;
        activityContext.addPlayerStyles(this.pageElement, activityCss);
        // const "data-preparedForActivtyRuntime"
        // const x  =(this.pageElement.hasAttribute());

        this.pageElement
            .querySelectorAll("[data-activityRole]")
            .forEach((translationGroup: HTMLElement) => {
                // add a button around the translation group or image container
                const correct =
                    translationGroup.getAttribute("data-activityRole") ===
                    "correct-answer";

                let button = translationGroup.parentNode as HTMLElement;
                if (button.tagName !== "BUTTON") {
                    button = document.createElement("button");
                    translationGroup.parentNode!.insertBefore(
                        button,
                        translationGroup
                    );
                    // review: this clone and the removeChild shouldn't be needed, but they are
                    const clone = translationGroup.cloneNode(true);
                    button.appendChild(clone);
                    translationGroup.parentNode!.removeChild(translationGroup);
                }

                // wire up events
                this.addEventListener(
                    "click",
                    button,
                    correct ? this.onCorrectClick : this.onWrongClick
                );
            });
    }
    private onCorrectClick = (evt: Event) => {
        (evt.currentTarget as HTMLElement).classList.add("chosen-correct");
        this.activityContext.playCorrect();
    };
    private onWrongClick = (evt: Event) => {
        (evt.currentTarget as HTMLElement).classList.add("chosen-wrong");
        this.activityContext.playWrong();
    };

    private addEventListener(
        name: string,
        target: Element,
        listener: EventListener
    ) {
        this.listeners.push({ name, target, listener });
        target.addEventListener(name, listener);
    }
    // When our page is not the selected one, the bloom-player calls this.
    // We need to disconnect any listeners.
    public stop() {
        this.listeners.forEach(l =>
            l.target.removeEventListener(l.name, l.listener)
        );
    }
}

export function activityRequirements() {
    return {
        dragging: true, // we don't actually get dragging, but we are getting accidental drags... maybe the swiper needs to be less sensitive
        clicking: true,
        typing: false
    };
}
