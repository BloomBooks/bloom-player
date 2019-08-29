import { loadDynamically } from "./loadDynamically";
import { LegacyQuestionHandler } from "./legacyQuizHandling/LegacyQuizHandler";

export interface IActivityScript {
    name: string;
    module: any;
    runningObject: any;
}

export class ActivityManager {
    private previousActivity: IActivityScript | undefined;
    private loadedActivityScripts: { [name: string]: IActivityScript } = {};

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
                this.loadedActivityScripts[name] = {
                    name,
                    module,
                    runningObject: null
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
        if (this.previousActivity && this.previousActivity.module) {
            this.previousActivity.runningObject.stop();
            this.previousActivity.runningObject = undefined;
        }
        this.previousActivity = undefined;

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
                this.previousActivity = activity;
                activity.runningObject = new activity.module.default();
            }
        }
    }
}
