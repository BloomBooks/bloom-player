import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";
import { within, userEvent } from "@storybook/testing-library";
import { expect } from "@storybook/jest";
import { ControlBar } from "../controlBar";
import LangData from "../langData";

export default {
    title: "Interaction Tests/Control Bar",
    component: ControlBar
} as ComponentMeta<typeof ControlBar>;

const Template: ComponentStory<typeof ControlBar> = args => (
    <ControlBar
        {...args}
        visible={true}
        paused
        showPlayPause
        playLabel="Grind On"
        bookLanguages={[
            new LangData("Sokoro", "sok"),
            new LangData("Englishy", "en"),
            new LangData("frenchy", "fr")
        ]}
        activeLanguageCode="fr"
        canGoBack={true}
        preferredLanguages={["en", "fr"]}
    />
);

export const ControlBarButtonTest = Template.bind({});

ControlBarButtonTest.play = async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Not all buttons are displayed immediately. 'findBy' waits until the language menu button shows up.
    const languageButton = await canvas.findByTitle("Choose Language");
    const buttons = await canvas.getAllByRole("img"); // 3 of 'em?
    expect(buttons.length).toEqual(3);
    // (User) interactions
    await userEvent.click(buttons[0]); // back button
    await userEvent.click(buttons[2]); // play button
    await userEvent.click(languageButton); // brings up language menu

    // The language menu is not "within" this canvasElement, so this test can't detect it.

    // However, because it pops up and makes the control bar buttons inaccessible, we CAN test
    // this state because the browser sets the entire canvas to aria-hidden=true.
    const hiddenButtons = canvas.getAllByRole("img", { hidden: true });
    await expect(hiddenButtons.length).toEqual(3);
};
