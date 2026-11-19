"useStrict";

export function activityRequirements() {
    return {
        dragging: false,
        clicking: true,
        typing: false
    };
}

// This widget hides the navigation buttons (Next/Prev) and has its own buttons on the page that
// go forward to the next page (which contains another page with the same widget) or back to the
// previous page. This tests a widget's ability to control navigation from the ActivityContext.
export default class WidgetTestActivity {
    // Called once when the book loads, on a copy of the page's html: add the buttons.
    initializePageHtml(activityContext) {
        const activityContainer = activityContext.pageElement.getElementsByClassName(
            "putMeHere"
        )[0];
        const buttonCss =
            "margin:20px;padding:5px;display:block;max-width:120px";
        const div = document.createElement("div");
        div.setAttribute("style", "height:100%;width:100%;display:table");
        for (const label of ["Forward", "Back"]) {
            const button = document.createElement("button");
            button.textContent = label;
            button.setAttribute("style", buttonCss);
            div.append(button);
        }
        activityContainer.append(div);
    }

    // Called each time the page becomes the current one, on the real DOM: wire up the buttons.
    showingPage(activityContext) {
        console.log("WidgetTestActivity.showingPage()");
        const [forward, back] = activityContext.pageElement.querySelectorAll(
            ".putMeHere button"
        );
        forward.onclick = () => activityContext.navigateToNextPage();
        back.onclick = () => activityContext.navigateToPreviousPage();
    }

    stop() {
        console.log("WidgetTestActivity.stop()");
        // Unattach listeners? Nope. Done automatically.
    }
}
