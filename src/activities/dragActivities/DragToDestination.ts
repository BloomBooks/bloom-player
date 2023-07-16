import { ActivityContext } from "../ActivityContext";
import { IActivityObject, IActivityRequirements } from "../activityManager";
import { prepareActivity, undoPrepareActivity } from "./dragActivityRuntime";
// tslint:disable-next-line: no-submodule-imports
/* Not using. See comment below:
    const activityCss = require("!!raw-loader!./multipleChoiceDomActivity.css")
    .default;*/

// This class is intentionally very generic. All it needs is that the html of the
// page it is given should have some objects (typically bloom-textOverPicture) that have
// data-correct-position. These objects are made draggable...[Todo: document more of this as we implement]

// Note that you won't find any code using this directly. Instead,
// it gets used by the ActivityManager as the default export of this module.
export default class DragToDestinationActivity implements IActivityObject {
    private activityContext: ActivityContext;
    // When a page that has this activity becomes the selected one, the bloom-player calls this.
    // We need to connect any listeners, start animation, etc. Here,
    // we are using a javascript class to make sure that we get a fresh start,
    // which is important because the user could be either
    // coming back to this page, or going to another instance of this activity
    // in a subsequent page.
    // eslint-disable-next-line no-unused-vars
    public constructor(public pageElement: HTMLElement) {}

    public showingPage(activityContext: ActivityContext) {
        this.activityContext = activityContext;
        this.prepareToDisplayActivityEachTime(activityContext);
    }

    // Do just those things that we only want to do once per read of the book.
    // In the current implementation of activityManager, this is operating on a copy of the page html,
    // NOT the real DOM the user will eventually interact with.
    public initializePageHtml(activityContext: ActivityContext) {}

    // The context removes event listeners each time the page is shown, so we have to put them back.
    private prepareToDisplayActivityEachTime(activityContext: ActivityContext) {
        this.activityContext = activityContext;
        // These classes are added one layer outside the page body. This is an element that is a wrapper
        // for our scoped styles...the furthest out element we can put classes on and have them work
        // properly with scoped styles. It's a good place to put classes that affect the state of everything
        // in the page.
        activityContext.pageElement.parentElement?.classList.add(
            "drag-activity-try-it",
            "drag-activity-start"
        );
        prepareActivity(activityContext.pageElement, next => {
            // Move to the next or previous page.
            if (next) {
                activityContext.navigateToNextPage();
            } else {
                activityContext.navigateToPreviousPage();
            }
        });
    }

    // When our page is not the selected one, the bloom-player calls this.
    // It will also tell our context to stop, which will disconnect the listeners we registered with it
    public stop() {
        if (this.activityContext) {
            undoPrepareActivity(this.activityContext.pageElement);
            this.activityContext.pageElement.parentElement?.classList.remove(
                "drag-activity-try-it",
                "drag-activity-start",
                "drag-activity-correct",
                "drag-activity-wrong"
            );
        }
    }
}

export function activityRequirements(): IActivityRequirements {
    return {
        dragging: true, // this activity is all about dragging things around, we don't want dragging to change pages
        clicking: true, // not sure we need this, but can we actually support dragging without supporting clicking?
        typing: false,
        soundManagement: true // many sounds played only after specific events.
    };
}
