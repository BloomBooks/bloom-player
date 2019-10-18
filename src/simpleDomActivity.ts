// A "DOM activity" is one that interacts with the html of a page

export default class SimpleDomActivity {
    private pageElement: HTMLElement;
    // When a page that has this activity becomes the selected one, the bloom-player calls this.
    // We need to connect any listeners, start animation, etc. Here,
    // we are using a javascript class to make sure that we get a fresh start,
    // which is important because the user could be either
    // coming back to this page, or going to another instance of this activity
    // in a subsequent page.
    // eslint-disable-next-line no-unused-vars
    constructor(pageElement: HTMLElement) {
        console.log("SimpleDomActivity activity constructed");
        this.pageElement = pageElement;
    }

    public start() {
        console.log("SimpleDomActivity activity start");

        // in the future, Bloom could offer some special style. For this experiment,
        // we're just reusing and existing one.
        const classForButtons = "bloom-borderstyle-black-round";
        this.pageElement
            .querySelectorAll("." + classForButtons)
            .forEach((div: HTMLElement) => {
                this.removeClass(div, classForButtons);
                const button = document.createElement("button");
                div.parentNode!.insertBefore(button, div);
                const x = div.cloneNode(true);
                button.appendChild(x);
                div.parentNode!.removeChild(div);
            });
    }

    public stop() {
        console.log("SimpleDomActivity activity stop");
    }

    private removeClass(el: HTMLElement, className: string) {
        if (el.classList) {
            el.classList.remove(className);
        } else {
            el.className = el.className.replace(
                new RegExp("\\b" + className + "\\b", "g"),
                ""
            );
        }
    }
}

export function activityRequirements() {
    return {
        dragging: false,
        clicking: true,
        typing: false
    };
}
