import { loadDynamically } from "./loadDynamically";
import { ActivityContext } from "./ActivityContext";
const iframeModule = require("./iframeActivity.ts");
const simpleDomChoiceActivityModule = require("./domActivities/SimpleDomChoice.ts");
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
    prepare: (context: ActivityContext) => void;
    showingPage: (context: ActivityContext) => void;
    stop: () => void;
}
// Constructing stuff from interfaces has problems with typescript at the moment.
// The class should have this constructor, but should not claim this interface.
// See https://stackoverflow.com/a/13408029/723299.
export interface IActivityObjectConstructable {
    new (element: HTMLElement): IActivityObject;
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
            "simple-dom-choice"
        ] = simpleDomChoiceActivityModule as IActivityModule;
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

    private getAnalyticsCategoryOfPage(pageDiv: HTMLElement): string {
        // About "categories" vs. "category". No great excuse... some day we might
        // really need to differentiate between, for example,
        // picture-choose-word and word-choose-picture, while at the same time
        // being able to combine these scores. Maybe even combine them with
        // other kinds of tests. It's just not clear yet what is YAGNI. So at
        // the moment the html data-analyticscategories attribute is plural,
        // but here in code we know that we currently only handle the whole
        // thing as a single string, so we just call it "category".
        return (
            pageDiv.getAttribute("data-analyticscategories") ||
            pageDiv.getAttribute("data-analyticsCategories") ||
            ""
        );
    }

    public processPage(
        bookUrlPrefix: string,
        pageDiv: HTMLElement,
        pageIndex: number
    ): void {
        const activityID = this.getActivityIdOfPage(pageDiv);
        //const knownActivities = [{id:"iframe", module:iframeModule as IActivityModule}, {id:""}];

        if (!activityID) return; // Not an activity

        if (!this.loadedActivityScripts[activityID])
            this.prepareActivityType(bookUrlPrefix, activityID);

        this.prepareActivityInstance(pageIndex, pageDiv);
    }

    // Do any setup needed per activity type (activity ID)
    private prepareActivityType(bookUrlPrefix: string, activityID: string) {
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

    // Do one-time setup needed per activity instance
    private prepareActivityInstance(
        pageIndex: number,
        pageDiv: HTMLElement
    ): void {
        const activity = this.getActivityOfPage(pageDiv);
        if (!activity) return;

        if (!pageDiv.hasAttribute("data-activity-state")) {
            // for use in styling things differently during playback versus book editing
            pageDiv.classList.add("bloom-activityPlayback");

            const activityPage = new ((activity.module!
                .default as unknown) as IActivityObjectConstructable)(
                pageDiv
            ) as IActivityObject;
            const activityContext = this.getActivityContext(pageIndex, pageDiv);
            activityPage.prepare(activityContext);
            activityContext.pageElement.setAttribute(
                "data-activity-state",
                "prepared"
            );
        }
    }

    // Showing a new page, so stop any previous activity and start any new one that might be on the new page.
    // returns true if this is a page where we are going to have state in the DOM so that the
    // container needs to be careful not to get rid of it to save memory.
    public showingPage(
        pageIndex: number,
        bloomPageElement: HTMLElement
    ): boolean | undefined {
        // At the moment bloom-player-core will always call us
        // twice if the book is landscape. Probably that could
        // be fixed but we might as well just protect ourselves
        // from starting the same activity twice without stopping it.
        if (this.previousPageElement === bloomPageElement) {
            return undefined;
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
        const activity = this.getActivityOfPage(bloomPageElement);
        if (activity) {
            this.currentActivity = activity;
            // constructing stuff like this has problems with typescript at the moment.
            // see https://stackoverflow.com/a/13408029/723299
            // Then the "as unknown" step is make eslint relax
            activity.runningObject = new ((activity.module!
                .default as unknown) as IActivityObjectConstructable)(
                bloomPageElement
            ) as IActivityObject;

            activity.context = this.getActivityContext(
                pageIndex,
                bloomPageElement
            );
            activity.runningObject!.showingPage(activity.context);
        }
        return !!activity; // return true if this is an activity
    }

    private getActivityOfPage(
        bloomPageElement: HTMLElement
    ): IActivityInformation | undefined {
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
            return activity;
        }
        return undefined;
    }

    private getActivityContext(
        pageIndex: number,
        bloomPageElement: HTMLElement
    ): ActivityContext {
        const analyticsCategory = this.getAnalyticsCategoryOfPage(
            bloomPageElement
        );
        return new ActivityContext(
            pageIndex,
            bloomPageElement,
            analyticsCategory,
            this.bookActivityGroupings[analyticsCategory]
        );
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
