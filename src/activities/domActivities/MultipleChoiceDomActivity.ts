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
        activityContext.addActivityStylesForPage(this.pageElement, activityCss);
        this.pageElement
            .querySelectorAll("[data-activityRole]")
            .forEach((choiceElement: HTMLElement) => {
                // add a button around the translation group or image container
                const correct =
                    choiceElement.getAttribute("data-activityRole") ===
                    "correct-answer";

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
        dragging: true, // we don't actually use dragging, but we are getting accidental drags... maybe the swiper needs to be less sensitive
        clicking: true, // enhance: maybe when we say we have clicking, the swiper then becomes less sensitive?
        typing: false
    };
}
