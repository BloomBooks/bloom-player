"use strict";
// The js generated from this file is used in the template page generated from simpleComprehensionQuiz.pug.
// It makes sure the body element has the editMode class (if the editMode stylesheet is loaded)
// and installs appropriate click handlers (depending on edit mode) which manipulate the classes
// of .checkbox-and-textbox-answer elements to produce the desired checking and dimming of right
// and wrong answers. It also adds an appropriate class to answers that are empty (to hide them or
// dim them) and plays appropriate sounds when a right or wrong answer is chosen.
// Eventually it will cooperate with reader code to handle analytics.
// The output is also part of the bloom-player, which creates instances of the new simpleComprehensionQuiz
// pages dynamically in order to handle old-style comprehension questions represented as json,
// and needs the associated JS to make them work.
// Master function, called when document is ready, initializes CQ pages
function init() {
    ensureEditModeStyleSheet();
    initAnswerWidgets();
}
//------------ Code involved in setting the editMode class on the body element when appropriate-----
function ensureEditModeStyleSheet() {
    if (!inEditMode()) {
        return;
    }
    // with future Bloom versions, this might already be there,
    // but it doesn't matter if it is.
    document.body.classList.add("editMode");
}
function inEditMode() {
    for (var i = 0; i < document.styleSheets.length; i++) {
        var href = document.styleSheets[i].href;
        if (href && href.endsWith("editMode.css")) {
            return true;
        }
    }
    return false;
}
//------------ Code for managing the answer widgets-------
// Initialize the answer widgets, arranging for the appropriate click actions
// and for maintaining the class that indicates empty answers.
// Assumes the code that sets up the editMode class on the body element if appropriate has already been run.
function initAnswerWidgets() {
    markEmptyAnswers();
    var observer = new MutationObserver(markEmptyAnswers);
    observer.observe(document.body, { characterData: true, subtree: true });
    var list = document.getElementsByClassName("styled-check-box");
    for (var i = 0; i < list.length; i++) {
        var x = list[i];
        if (document.body.classList.contains("editMode")) {
            x.addEventListener("click", handleEditModeClick);
        }
        else {
            x.parentElement.addEventListener("click", handleReadModeClick);
        }
    }
}
function handleEditModeClick(evt) {
    var target = evt.target;
    if (target && target.parentElement) {
        target.parentElement.classList.toggle("correct-answer");
    }
}
function handleReadModeClick(evt) {
    var currentTarget = evt.currentTarget;
    var classes = currentTarget.classList;
    classes.add("user-selected");
    var correct = classes.contains("correct-answer");
    var soundUrl = correct ? "right_answer.mp3" : "wrong_answer.mp3";
    playSound(soundUrl);
    // Make the state of the hidden input conform (for screen readers). Only if the
    // correct answer was clicked does the checkbox get checked.
    var checkBox = currentTarget.getElementsByClassName("hiddenCheckbox")[0];
    if (checkBox) {
        checkBox.checked = correct;
    }
}
function playSound(url) {
    var player = getPagePlayer();
    player.setAttribute("src", url);
    player.play();
}
function getPagePlayer() {
    var player = document.querySelector("#quiz-sound-player");
    if (player && !player.play) {
        player.remove();
        player = null;
    }
    if (!player) {
        player = document.createElement("audio");
        player.setAttribute("id", "#quiz-sound-player");
        document.body.appendChild(player);
    }
    return player;
}
function markEmptyAnswers() {
    var answers = document.getElementsByClassName("checkbox-and-textbox-answer");
    for (var i = 0; i < answers.length; i++) {
        if (hasContent(answers[i])) {
            answers[i].classList.remove("empty");
        }
        else {
            answers[i].classList.add("empty");
        }
    }
}
function hasContent(answer) {
    var editables = answer.getElementsByClassName("bloom-editable");
    for (var j = 0; j < editables.length; j++) {
        var editable = editables[j];
        if (editable.classList.contains("bloom-visibility-code-on") &&
            editable.textContent.trim()) {
            return true;
        }
    }
    return false;
}
//-------------- initialize -------------
// In some cases (loading into a bloom reader carousel, for example) the page may already be loaded.
if (document.readyState === "complete") {
    init();
}
else {
    window.addEventListener("load", function () {
        init();
    });
}
