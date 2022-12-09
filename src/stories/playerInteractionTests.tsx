import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";
import { within, userEvent, waitFor } from "@storybook/testing-library";
import { expect } from "@storybook/jest";
import { BloomPlayerControls } from "../bloom-player-controls";

// Function to emulate pausing between interactions
const sleep = (ms: number): Promise<unknown> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

// The format of the tests here is from https://storybook.js.org/docs/react/writing-stories/play-function
export default {
    title: "Interaction Tests/Player",
    component: BloomPlayerControls
} as ComponentMeta<typeof BloomPlayerControls>;

const MotionBookTemplate: ComponentStory<typeof BloomPlayerControls> = args => (
    <BloomPlayerControls
        {...args}
        showBackButton={true}
        initiallyShowAppBar={true}
        allowToggleAppBar={true}
        paused={false}
        locationOfDistFolder={"/dist/"}
        hideFullScreenButton={true}
        useOriginalPageSize={true}
        url={
            "https://s3.amazonaws.com/bloomharvest/bloom.bible.stories%40gmail.com%2faf30a7ce-d146-4f07-8aa4-d11de08c4665/bloomdigital%2findex.htm"
        }
        initialLanguageCode="fr"
        autoplay={"motion"}
    />
);

// Why this bind() and what does defining play() do?
// See comments on ControlBarButtonTest in controlBarInteractionTests.tsx
export const MotionPlayerTest = MotionBookTemplate.bind({});

MotionPlayerTest.play = async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const header = canvas.getByRole("banner");
    await expect(header.id).toBe("control-bar");

    // Not all buttons are displayed immediately. WaitFor waits until the language menu button shows up.
    await waitFor(() =>
        expect(canvas.getByTitle("Choose Language")).toBeInTheDocument()
    );
    const languageMenuButton = await canvas.getByTitle("Choose Language");

    // simulate user interactions; bring up language menu
    await userEvent.click(languageMenuButton);

    // Now the header buttons should be hidden.
    // The term "hidden" in this context means it has aria-hidden="true", which just means it's
    // inaccessible to user interaction, not that it can't be seen. The MuiDialog does this automatically
    // to the background as part of its modal operation.
    const hiddenButtons = await canvas.getAllByRole("button", { hidden: true });
    await expect(hiddenButtons.length).toEqual(3);
    await expect(hiddenButtons[0]).toHaveAccessibleName("More Menu");
    await expect(hiddenButtons[1]).toHaveAccessibleName("Choose Language");
    await expect(hiddenButtons[2]).toHaveAccessibleName("PlayPause");
};

const DavidAndGoliathTemplate: ComponentStory<typeof BloomPlayerControls> = args => (
    <BloomPlayerControls
        {...args}
        showBackButton={true}
        initiallyShowAppBar={true}
        allowToggleAppBar={true}
        locationOfDistFolder={"/dist/"}
        useOriginalPageSize={true}
        url={
            "https://s3.amazonaws.com/bloomharvest/benjamin%40aconnectedplanet.org%2f130b6829-5367-4e5c-80d7-ec588aae5281/bloomdigital%2findex.htm"
        }
        initialLanguageCode="en"
    />
);

export const DavidAndGoliathPlayerTest = DavidAndGoliathTemplate.bind({});

DavidAndGoliathPlayerTest.play = async ({ canvasElement }) => {
    const canvas = within(canvasElement.querySelector("div.reactRoot"));

    let pageNumberControl = await canvasElement.querySelector(
        "#pageNumberControl"
    );
    await waitFor(() => expect(pageNumberControl).not.toBeNull());

    // findByX methods combine the equivalent getByX() and waitFor().
    const playerContent = await canvas.findByLabelText(
        "Player Content",
        undefined,
        {
            // need some extra time to get all the player pages loaded
            timeout: 3000,
            interval: 200
        }
    );
    expect(playerContent).toBeInTheDocument();
    const playerDOM = within(playerContent);
    // At the beginning of the book, there is only one visible swiper button (Next).
    // By default, findByRole only finds accessible items.
    const nextButton = await playerDOM.findByRole("button");
    expect(nextButton).toBeInTheDocument();
    expect(nextButton.parentElement!.classList).toContain("swiper-button-next");
    // There should be a hidden button (Previous).
    // Adding the "hidden" option just makes buttons that are present but inaccessible get added
    // to the query.
    const allButtons = await playerDOM.findAllByRole("button", {
        hidden: true
    });
    expect(allButtons.length).toEqual(2);
    expect(allButtons[0]).not.toBeVisible();

    // I was having a problem where stepping through the test in the debugger worked fine, but just
    // letting it run by itself was swiping the page, but not updating the slider. Adding a bit of
    // timeout before the click fixes that interaction... not sure why.
    await sleep(500);
    // Click the next button.
    await userEvent.click(nextButton);

    // Now there should be 2 visible buttons.
    const buttons = await playerDOM.findAllByRole("button");
    expect(buttons.length).toEqual(2);
    expect(
        playerContent.querySelector("div.swiper-button-prev button")
    ).toBeEnabled();

    // Let's check on the page control slider
    const pageNumberCtrlDOM = within(pageNumberControl as HTMLElement);

    const sliderControl = await pageNumberCtrlDOM.getByRole("slider");
    expect(sliderControl).toBeInTheDocument();
    expect(sliderControl.innerText).toEqual("1");
    expect(sliderControl).toHaveAttribute("aria-valuemax", "40");
};
