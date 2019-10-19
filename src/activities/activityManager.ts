import { loadDynamically } from "./loadDynamically";
import { LegacyQuestionHandler } from "./legacyQuizHandling/LegacyQuizHandler";
import { ActivityContext } from "./ActivityContext";
const iframeModule = require("./iframeActivity.ts");
const simpleDomActivityModule = require("./simpleDomActivity.ts");

// This is the module that the activity has to implement (the file must export these functions)
export interface IActivityModule {
    // this is a weird typescript thing... the activity just needs to export a class as its default export, and that
    // class should implement IActivityObject;
    default: IActivityObject;
    activityRequirements: () => IActivityRequirements;
}

// This is the class that the activity module has to implement
export interface IActivityObject {
    new (HTMLElement): object;
    start: (soundPlayer: ActivityContext) => void;
    stop: () => void;
}

export interface IActivityRequirements {
    dragging?: boolean;
    clicking?: boolean;
    typing?: boolean;
}

// This is the object (implemented by us, not the activity) that represents our own
// record of what we know about the activity.
export interface IActivityInformation {
    name: string; // from data-activity attribute of the page
    module: IActivityModule | undefined; // the module of code we loaded from {name}.js
    runningObject: IActivityObject | undefined; // an instance of the default class exported by the module (but only if it's the current activity)
    requirements: IActivityRequirements; // returned by the module's activityRequirements() function
}

export class ActivityManager {
    private soundPlayer: ActivityContext;
    constructor() {
        this.soundPlayer = new ActivityContext();
    }
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
    private currentActivity: IActivityInformation | undefined;
    private loadedActivityScripts: {
        [name: string]: IActivityInformation;
    } = {};

    public processPage(
        bookUrlPrefix: string,
        // NOTE: this is not the same element we will get as a parameter in showingPage().
        // But it is clone of it, which is fine because we aren't storing it, we're only
        // looking for a data-activity attribute.
        pageDiv: Element,
        legacyQuestionHandler: LegacyQuestionHandler
    ): void {
        const name = pageDiv.getAttribute("data-activity");
        // if it has a an activity that we haven't already loaded the code for
        if (name && !this.loadedActivityScripts[name]) {
            // First handle iframe activities which is special in that the "iframeActivity" module
            // is built-in to bloom-player, rather than
            // being loaded dynamically from the book's folder (currently just iframe)
            if (name === "iframe") {
                this.loadedActivityScripts[name] = {
                    name,
                    module: iframeModule as IActivityModule,
                    runningObject: undefined, // for now were just registering the module, not constructing the object
                    requirements: iframeModule.activityRequirements()
                };
            } else if (name === "simple-dom") {
                this.loadedActivityScripts[name] = {
                    name,
                    module: simpleDomActivityModule as IActivityModule,
                    runningObject: undefined, // for now were just registering the module, not constructing the object
                    requirements: simpleDomActivityModule.activityRequirements()
                };
            }
            // Try to find the named activity js in the book's folder.
            else {
                // Even though we won't use the script until we get to the page,
                // at the moment we start loading them in the background. This
                // probably isn't necessary, we could probably wait.
                loadDynamically(bookUrlPrefix + "/" + name + ".js").then(
                    module => {
                        // if the same activity is encountered multiple times, we
                        // could still get here multiple times because the load
                        // is async
                        if (!this.loadedActivityScripts[name]) {
                            this.loadedActivityScripts[name] = {
                                name,
                                module,
                                runningObject: undefined, // for now were just registering the module, not constructing the object
                                requirements: module.activityRequirements()
                            };
                        }
                    }
                );
            }
        } else {
            legacyQuestionHandler.processPage(
                pageDiv,
                this.loadedActivityScripts
            );
        }
    }

    public showingPage(bloomPageElement: HTMLElement) {
        // Regardless of what we're showing now, first lets stop any activity that
        // was running on the previous page:
        if (this.currentActivity && this.currentActivity.module) {
            this.currentActivity.runningObject!.stop();
            this.currentActivity.runningObject = undefined;
        }
        this.currentActivity = undefined;

        // OK, let's look at this page and see if has an activity:
        const name = bloomPageElement.getAttribute("data-activity");

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
                activity.runningObject = new activity.module!.default(
                    bloomPageElement
                ) as IActivityObject;
                activity.runningObject!.start(this.soundPlayer);
            }
        }
    }
}
