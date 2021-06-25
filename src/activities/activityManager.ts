import { loadDynamically } from "./loadDynamically";
import { ActivityContext } from "./ActivityContext";
const iframeModule = require("./iframeActivity.ts");
const multipleChoiceActivityModule = require("./domActivities/MultipleChoiceDomActivity.ts");
const simpleCheckboxQuizModule = require("./domActivities/SimpleCheckboxQuiz.ts");

// This is the module that the activity has to implement (the file must export these functions)
export interface IActivityModule {
    // this is a weird typescript thing... the activity just needs to export a class as its default export, and that
    // class should implement IActivityObject;
    default: IActivityObject;
    activityRequirements: () => IActivityRequirements;
}

// This is the class that the activity module has to implement
export interface IActivityObject {
    new (element: HTMLElement): object;
    start: (context: ActivityContext) => void;
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
    context: ActivityContext | undefined;
}

export class ActivityManager {
    private builtInActivities: { [id: string]: IActivityModule } = {};
    private previousPageElement: HTMLElement;
    private bookActivityGroupings: { [id: string]: number[] } = {};

    constructor() {
        this.builtInActivities["iframe"] = iframeModule as IActivityModule;
        this.builtInActivities[
            "multiple-choice"
        ] = multipleChoiceActivityModule as IActivityModule;
        this.builtInActivities[
            simpleCheckboxQuizModule.dataActivityID
        ] = simpleCheckboxQuizModule as IActivityModule;
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

    private getActivityIdOfPage(pageDiv: HTMLElement) {
        let activityID = pageDiv.getAttribute("data-activity") || "";

        // Handle "simple comprehension quizzes", which in 4.6 (and maybe into 4.7 and beyond?) don't have data-activity but
        // instead have a <script> tag. In the Bloom-Player context, that script doesn't do anything,
        // but it does tell us what the page is supposed to be, so we can just set the activityID
        // to what it would be if that page was designed with the current activity api.
        if (activityID === "" && this.hasLegacyQuizScriptTag(pageDiv)) {
            activityID = simpleCheckboxQuizModule.dataActivityID;
        }
        return activityID;
    }

    private getAnalyticsCategoryOfPage(pageDiv: HTMLElement) {
        return pageDiv.getAttribute("data-analyticsCategories") || "";
    }

    public processPage(
        bookUrlPrefix: string,
        // NOTE: this is not the same element we will get as a parameter in showingPage().
        // But it is clone of it, which is fine because we aren't storing it, we're only
        // looking for a data-activity attribute.
        pageDiv: HTMLElement
    ): void {
        const activityID = this.getActivityIdOfPage(pageDiv);
        //const knownActivities = [{id:"iframe", module:iframeModule as IActivityModule}, {id:""}];
        if (activityID && !this.loadedActivityScripts[activityID]) {
            if (this.builtInActivities[activityID]) {
                this.loadedActivityScripts[activityID] = {
                    name: activityID,
                    module: this.builtInActivities[activityID],
                    runningObject: undefined, // for now were just registering the module, not constructing the object
                    context: undefined,
                    requirements: this.builtInActivities[
                        activityID
                    ].activityRequirements()
                };
            }

            // Try to find the named activity js in the book's folder.
            else {
                // Even though we won't use the script until we get to the page,
                // at the moment we start loading them in the background. This
                // probably isn't necessary, we could probably wait.
                loadDynamically(bookUrlPrefix + "/" + activityID + ".js").then(
                    module => {
                        // if the same activity is encountered multiple times, we
                        // could still get here multiple times because the load
                        // is async
                        if (!this.loadedActivityScripts[activityID]) {
                            this.loadedActivityScripts[activityID] = {
                                name: activityID,
                                module,
                                runningObject: undefined, // for now were just registering the module, not constructing the object
                                context: undefined,
                                requirements: module.activityRequirements()
                            };
                        }
                    }
                );
            }
        }
    }

    // Showing a new page, so stop any previous activity and start any new one that might be on the new page.
    public showingPage(pageIndex: number, bloomPageElement: HTMLElement) {
        // At the moment bloom-player-core will always call us
        // twice if the book is landscape. Probably that could
        // be fixed but we might as well just protect ourselves
        // from starting the same activity twice without stopping it.
        if (this.previousPageElement === bloomPageElement) {
            return;
        }
        this.previousPageElement = bloomPageElement;

        // Regardless of what we're showing now, first lets stop any activity that
        // was running on the previous page:
        if (this.currentActivity && this.currentActivity.module) {
            this.currentActivity.runningObject!.stop();
            this.currentActivity.runningObject = undefined;
            this.currentActivity.context!.stop();
            this.currentActivity.context = undefined;
        }
        this.currentActivity = undefined;

        // OK, let's look at this page and see if has an activity:
        const activityID = this.getActivityIdOfPage(bloomPageElement);

        if (activityID) {
            // We should have learned about this activity when the book
            // was first loaded, and dynamically loaded its javascript,
            // so that it is waiting now to be run
            const activity = this.loadedActivityScripts[activityID];
            console.assert(
                activity,
                `Trying to start activity "${activityID}" but it wasn't previously loaded.`
            );
            if (activity) {
                this.currentActivity = activity;
                activity.runningObject = new activity.module!.default(
                    bloomPageElement
                ) as IActivityObject;
                // for use in styling things differently during playback versus book editing
                bloomPageElement.classList.add("bloom-activityPlayback");
                const analyticsCategory = this.getAnalyticsCategoryOfPage(
                    bloomPageElement
                );
                activity.context = new ActivityContext(
                    pageIndex,
                    bloomPageElement,
                    this.bookActivityGroupings[analyticsCategory]
                );
                activity.runningObject!.start(activity.context);
            }
        }
    }

    private hasLegacyQuizScriptTag(pageDiv: Element): boolean {
        const scripts = pageDiv.getElementsByTagName("script");
        const urls: string[] = [];
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].getAttribute("src");
            if (src && src.endsWith("simpleComprehensionQuiz.js")) {
                return true;
            }
        }
        return false;
    }

    public collectActivityContextForBook(pages: HTMLCollectionOf<Element>) {
        for (let index = 0; index < pages.length; index++) {
            const page = pages[index] as HTMLElement;
            // Enhance: actually page-api treats the analyticsCategory as a space-delimited string.
            // If we ever use that feature, we may need to update this collection and analytics processing.
            // Under the current code, pages would be grouped for analytics if they had the same combination
            // of category strings. So 'comprehension' pages would be reported separately from
            // pages with category (e.g.) 'comprehension signLanguage'.
            const analyticsCategory = this.getAnalyticsCategoryOfPage(page);
            if (analyticsCategory === "") {
                continue;
            }
            const existing = this.bookActivityGroupings[analyticsCategory];
            if (existing) {
                existing.push(index);
            } else {
                this.bookActivityGroupings[analyticsCategory] = [index];
            }
        }
    }
}
