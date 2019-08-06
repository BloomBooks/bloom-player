import { BloomPlayerCore } from "./bloom-player-core";

// class Music contains functionality to get background music to play properly in bloom-player

export class Music {
    public urlPrefix: string;
    private paused: boolean = false;
    private currentPage: HTMLDivElement;

    public static documentHasMusic(): boolean {
        return [].slice
            .call(document.body.getElementsByClassName("bloom-page"))
            .find((p: HTMLElement) => Music.pageHasMusic(p));
    }

    public static pageHasMusic(page: HTMLElement): boolean {
        return page.attributes["data-backgroundaudio"];
    }

    public HandlePageVisible(bloomPage: HTMLElement) {
        this.currentPage = bloomPage as HTMLDivElement;
        if (!this.currentPage || !Music.pageHasMusic(this.currentPage)) {
            return;
        }
        this.setMusicSource();
        if (!this.paused) {
            this.play();
        }
    }

    public hidingPage() {
        this.pause();
    }

    public play() {
        if (!this.currentPage || !Music.pageHasMusic(this.currentPage)) {
            return;
        }
        this.getPlayer().play();
        this.paused = false;
    }

    public pause() {
        if (!this.currentPage || !Music.pageHasMusic(this.currentPage)) {
            return;
        }
        this.getPlayer().pause();
        this.paused = true;
    }

    private getPlayer(): HTMLAudioElement {
        let player = document.querySelector(
            "#music-player"
        ) as HTMLAudioElement;
        if (!player) {
            player = document.createElement("audio") as HTMLAudioElement;
            if (!this.currentPage) {
                console.log(
                    "Music.getPlayer() called when currentPage wasn't set."
                );
                player.volume = 1;
            } else {
                const volume = this.currentPage.attributes[
                    "data-backgroundaudiovolume"
                ];
                player.volume = volume && volume.value ? volume.value : 1;
            }
            player.setAttribute("id", "music-player");
            document.body.appendChild(player);

            // if we just pass the function, it has the wrong "this"
            player.addEventListener("ended", () => this.playEnded());
        }
        return player as HTMLAudioElement;
    }

    // Gecko has no way of knowing that we've created or modified the audio file,
    // so it will cache the previous content of the file or
    // remember if no such file previously existed. So we add a bogus query string
    // based on the current time so that it asks the server for the file again.
    private setMusicSource(): void {
        const player = this.getPlayer();
        const url = this.currentMusicUrl(
            this.currentPage.attributes["data-backgroundaudio"].value +
                "?nocache=" +
                new Date().getTime()
        );
        player.setAttribute("src", url);
    }

    private currentMusicUrl(filename: string): string {
        return this.urlPrefix + "/audio/" + filename;
    }

    private playEnded() {
        // just start playing all over again.
        this.play();
    }
}
