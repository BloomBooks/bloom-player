// at the moment this just plays sounds, but the idea is that it would also handle scoring
export class ActivityContext {
    public playCorrect() {
        // NB: if this stops working in storybook; the file should be found because the package.json
        // script that starts storybook has a "--static-dir" option that should include the folder
        // containing the standard activity sounds.
        this.playSound("right_answer.mp3");
    }
    public playWrong() {
        this.playSound("wrong_answer.mp3");
    }
    private getPagePlayer(): any {
        let player = document.querySelector("#activity-sound-player") as any;
        if (player && !player.play) {
            player.remove();
            player = null;
        }
        if (!player) {
            player = document.createElement("audio");
            player.setAttribute("id", "#activity-sound-player");
            document.body.appendChild(player);
        }
        return player;
    }
    public playSound(url) {
        const player = this.getPagePlayer();
        player.setAttribute("src", url);
        player.play();
    }

    public addPlayerStyles(element: HTMLElement, css: string) {
        const style = document.createElement("style");
        style.setAttribute("scoped", "true");
        style.innerText = css;
        element.insertBefore(style, element.firstChild); //NB: will be added even if firstChild is null
    }
}
