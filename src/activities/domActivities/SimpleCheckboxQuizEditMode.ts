export function setupForEditMode() {
    markEmptyChoices();
    const observer = new MutationObserver(markEmptyChoices);

    //TODO: I think this should only be observing this page?
    //TODO: do we need to stop the observing?
    observer.observe(document.body, {
        characterData: true,
        subtree: true
    });

    const choices = this.activityContext.pageElement.getElementsByClassName(
        "checkbox-and-textbox-choice"
    );
    Array.from(choices).forEach((choice: HTMLElement) => {
        const checkbox = this.getCheckBox(choice);
        const correct = choice.classList.contains("correct-answer");
        checkbox.addEventListener("click", handleEditModeClick);
        // Not sure why this doesn't get persisted along with the correct-answer class,
        // but glad it doesn't, because we don't want it to show up even as a flash
        // in reader mode.
        checkbox.checked = correct;
    });
}

function handleEditModeClick(evt) {
    const target = evt.target;
    if (!target) {
        return;
    }
    const wrapper = evt.currentTarget.parentElement;
    if (target.checked) {
        wrapper.classList.add("correct-answer");
    } else {
        wrapper.classList.remove("correct-answer");
    }
}
function markEmptyChoices(): void {
    const choices = document.getElementsByClassName(
        "checkbox-and-textbox-choice"
    );
    for (let i = 0; i < choices.length; i++) {
        if (hasVisibleContent(choices[i])) {
            choices[i].classList.remove("empty");
        } else {
            choices[i].classList.add("empty");
        }
    }
}
function hasVisibleContent(choice: Element): boolean {
    const editables = choice.getElementsByClassName("bloom-editable");

    return Array.from(editables).some(
        e =>
            e.classList.contains("bloom-visibility-code-on") &&
            (e.textContent || "").trim() !== ""
    );
}
