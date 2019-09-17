import { loadDynamically } from "./loadDynamically";
import { LegacyQuestionHandler } from "./legacyQuizHandling/LegacyQuizHandler";

interface IActivityRequirements {
    dragging?: boolean;
    clicking?: boolean;
    typing?: boolean;
}
export interface IActivity {
    name: string;
    module: any;
    runningObject: any;
    requirements: IActivityRequirements;
}

export class ActivityManager {
    public getActivityAbsorbsDragging(): boolean {
        return (
            !!this.currentActivity &&
            !!this.currentActivity.requirements.dragging
        );
    }
    public getActivityAbsorbsClicking(): boolean {
        return (
            !!this.currentActivity &&
            !!this.currentActivity.requirements.clicking
        );
    }
    public getActivityAbsorbsTyping(): boolean {
        return (
            !!this.currentActivity && !!this.currentActivity.requirements.typing
        );
    }
    private currentActivity: IActivity | undefined;
    private loadedActivityScripts: { [name: string]: IActivity } = {};

    public processPage(
        bookUrlPrefix: string,
        pageDiv: Element,
        legacyQuestionHandler: LegacyQuestionHandler
    ): void {
        const name = pageDiv.getAttribute("data-activity");
        if (name) {
            // Even though we won't use the script until we get to the page,
            // at the moment we start loading them in the background. This
            // probably isn't necessary, we could probably wait.
            loadDynamically(bookUrlPrefix + "/" + name + ".js").then(module => {
                const requirements = module.activityRequirements();
                this.loadedActivityScripts[name] = {
                    name,
                    module,
                    runningObject: null,
                    requirements
                };
            });
        } else {
            legacyQuestionHandler.processPage(
                pageDiv,
                this.loadedActivityScripts
            );
        }
    }

    public showingPage(bloomPage) {
        // Regardless of what we're showing now, first lets stop any activity that
        // was running on the previous page:
        if (this.currentActivity && this.currentActivity.module) {
            this.currentActivity.runningObject.stop();
            this.currentActivity.runningObject = undefined;
        }
        this.currentActivity = undefined;

        // OK, let's look at this page and see if has an activity:
        const name = bloomPage!.getAttribute("data-activity");
        if (name) {
            // We should have learned about this activity when the book
            // was first loaded, and dynamically loaded its javascript,
            // so that it is waiting now to be run
            const activity = this.loadedActivityScripts[name];
            console.assert(
                activity,
                `Trying to start activity "${name}" but it wasn't previously loaded.`
            );
            if (activity) {
                this.currentActivity = activity;
                activity.runningObject = new activity.module.default();
                activity.runningObject.start();
            }
        }
    }
}
