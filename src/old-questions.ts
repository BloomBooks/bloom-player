export class OldQuestionsConverter {

    public static convert(json: string, pageClass: string): HTMLElement[] {
        if (!json) {
            return [];
        }
        let questionsWrapper: any = json;
        if (typeof json === "string") {
            // in unit tests we pass strings. The result we get from axios is already parsed.
            questionsWrapper = JSON.parse(json); // a list containing one object, with property questions, also a list
        }
        const questions = questionsWrapper[0].questions;
        const lang = questionsWrapper[0].lang;

        const result: HTMLElement[] = [];
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const page = document.createElement("div");
            result.push(page);

            page.classList.add("bloom-page");
            page.classList.add("simple-comprehension-quiz");
            page.classList.add("bloom-smart-page");
            page.classList.add(pageClass);
            page.setAttribute("data-analytics", "Questions correct");

            const marginBox = this.appendElementWithClass("div", "marginBox", page);
            const quiz = this.appendElementWithClass("div", "quiz", marginBox);
            const group =this.appendElementWithClass("div", "bloom-translationGroup", quiz);
            const editable = this.appendElementWithClass("div", "bloom-editable", group);
            editable.classList.add("bloom-content1");
            editable.classList.add("bloom-visibility-code-on");
            editable.classList.add("QuizQuestion-style");
            editable.setAttribute("lang", lang);

            const para = this.appendElementWithClass("p", "", editable);
            para.textContent = question.question;

            const answers = question.answers;
            for (let j = 0; j < answers.length; j++) {
                const answer = answers[j];
                const answerText = answer.text as string;
                const answerDiv = this.appendElementWithClass("div", "checkbox-and-textbox-answer", quiz);

                this.appendElementWithClass("div", "styled-check-box", answerDiv);

                const hiddenCheck = this.appendElementWithClass("input", "hiddenCheckbox", answerDiv);
                hiddenCheck.setAttribute("name", "Correct");
                hiddenCheck.setAttribute("type", "checkbox");

                const answerGroup = this.appendElementWithClass("div", "bloom-translationGroup", answerDiv);
                const answerEditable = this.appendElementWithClass("div", "bloom-editable", answerGroup);
                answerEditable.classList.add("bloom-content1");
                answerEditable.classList.add("bloom-visibility-code-on");
                answerEditable.classList.add("QuizAnswer-style");
                answerEditable.setAttribute("lang", lang);
                const answerPara = this.appendElementWithClass("p", "", answerEditable);
                answerPara.textContent = answerText;

                if (answer.correct) {
                    answerDiv.classList.add("correct-answer");
                }
            }
            const script = this.appendElementWithClass("script", "", quiz);
            script.setAttribute("src", "simpleComprehensionQuiz.js");
        }
        return result;
    }

    private static appendElementWithClass(tag: string, className: string, parent: HTMLElement) : HTMLElement {
        const result = document.createElement(tag);
        if (className) {
            result.classList.add(className);
        }
        parent.appendChild(result);
        return result;
    }
}