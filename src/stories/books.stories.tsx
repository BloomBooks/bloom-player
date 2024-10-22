import React, { useEffect, useState } from "react";
import theme from "../bloomPlayerTheme";
import { Meta, StoryFn, StoryObj } from "@storybook/react";
import { ThemeProvider } from "@material-ui/styles";
import { BloomPlayerControls } from "../bloom-player-controls";
import { fn } from "@storybook/test";

const meta = {
    title: "Various books",
    component: BloomPlayerControls,
    parameters: {
        layout: "fullscreen",
    },
    //decorators: [withKnobs],
    // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
    args: { onClick: fn() },
} satisfies Meta<typeof BloomPlayerControls>;
export default meta;
type Story = StoryObj<typeof meta>;

/* TODO: I don't know what this is about
// Setting one of these as the ParentProxy of the window allows us to receive
// messages BP usually sends to a host window, without actually embedding it in an iframe.
class MessageReceiver {
    // data is what would be the data property of the event in a host window
    public receiveMessage(data: string) {
        try {
            const r = JSON.parse(data);
            if (r.messageType === "takePhoto") {
                alert("photo taken");
            } else if (r.messageType === "fullScreen") {
                alert("full screen request");
            }
        } catch (err) {
            console.log(`Got error with message: ${err}`);
        }
    }
}
*/

const Template = (args) => <BloomPlayerControls {...args} />;

function AddBloomPlayerStory(
    label: string,
    // The URL should be a valid, well-formed URL, i.e. one you can copy/paste straight into your browser.
    // If the URL contains special chars, those should be encoded, but the additional encoding that is needed
    // to pass this URL into a query parameter of another URL should be decoded.
    // e.g. "Test #1" should be "src/test %231", not "src/test #1" nor "src%2ftest %231"
    url: string,
    languageCode?: string,
) {
    const urlThroughProxy = url.replace("s3/", "s3/");
    const commonArgs = {
        //showBackButton:{showBackButtonKnob},
        // initiallyShowAppBar:{initiallyShowAppBar()},
        // allowToggleAppBar:{allowToggleAppBar()},
        // paused:{paused()},
        url: urlThroughProxy,
        //locationOfDistFolder:{"/dist/"},
        //hideFullScreenButton:{hideFullScreenButton()},
        initialLanguageCode: { languageCode },
        //useOriginalPageSize:{useOriginalPageSize()},
        // useful for seeing what will happen in video preview/recording
        // hideSwiperButtons:{true},
        // autoplay:{"yes"},
        // skipActivities:{true},
        // videoPreviewMode:{true},
        autoplay: "motion",
        //extraButtons:{extraButtons},
        // startPage:{1},
        // autoplayCount:{3}
    };

    const story = Template.bind({});
    story.label = label;
    story.args = {
        ...commonArgs,
    };
    return story;
}

export const LiveFromBloomEditor = () => {
    const [url, setUrl] = useState("");

    useEffect(() => {
        async function fetchData() {
            const response = await fetch(
                "http://localhost:8089/bloom/CURRENT-BLOOMPUB-URL",
            );
            const data = await response.json();
            setUrl(data.url);
        }

        fetchData();
    }, []);
    if (!url) {
        return (
            <div style={{ color: "red" }}>
                Make sure Bloom is running, in the Publish/BloomPub Tab, and
                have a Preview open.
            </div>
        );
    }
    return (
        <BloomPlayerControls
            initiallyShowAppBar={true}
            centerVertically={true}
            initialLanguageCode={"en"}
            showBackButton={true}
            allowToggleAppBar={true}
            paused={false}
            locationOfDistFolder={""}
            autoplay="motion"
            hideFullScreenButton={false}
            url={url}
        />
    );
};

export const slq = AddBloomPlayerStory(
    "Activity/Landscape SL with Quiz",
    "s3/bloomharvest/educationforlife%40sil.org%2f6f6d82d5-e98d-445d-b4be-143df993c3c0/bloomdigital%2findex.htm",
);

export const comic = AddBloomPlayerStory(
    "Comic - A5Portrait",
    "s3/bloomharvest/hannah_hudson%40sil-lead.org%2f8ec6f115-a508-45e1-b820-bd560fdd5b3b/bloomdigital%2findex.htm",
);

export const BookNotFound = AddBloomPlayerStory(
    "Book not found",
    "file:///aVery/Long/FileName/That/Will/Never/Be/Found/Anywhere/At/All/To/See/How/It/Wraps.htm",
);

export const EmptyUrlParameter = AddBloomPlayerStory("Empty Url Parameter", "");
export const OverflowingPages = AddBloomPlayerStory(
    "Overflowing pages (some)",
    "s3/bloomharvest/benjamin%40aconnectedplanet.org%2f130b6829-5367-4e5c-80d7-ec588aae5281/bloomdigital%2findex.htm",
);

export const Talking = AddBloomPlayerStory(
    "Talking book with image descriptions",
    "s3/bloomharvest/chris_weber%40sil-lead.org%2fd7e8058e-c0cb-4b62-a030-e710fe8b7906/bloomdigital%2findex.htm",
);

export const DifficultForIOS = AddBloomPlayerStory(
    "Difficult book for IOS",
    "s3/share.bloomlibrary.org/debug/9144p2/bloomdigital/index.htm",
);

export const ForcedLargeTitleInOneLanguage = AddBloomPlayerStory(
    "Book with forced large title in one language",
    "s3/bloomharvest/lorrie%40blind.org.ph%2f5723926d-f75b-4b59-b2a6-578188e07e80/bloomdigital%2findex.htm",
);

export const Music = AddBloomPlayerStory(
    "Music",
    "s3/bloomharvest-sandbox/bloom.bible.stories%40gmail.com/a70f135b-07b0-4bfb-962e-0aabb82f87ec/bloomdigital%2findex.htm",
);

export const ActivityThatLeadsToFF60SplitPage = AddBloomPlayerStory(
    "Activity/Activity that leads to FF60 split page",
    //"s3/bloomharvest-sandbox/stephen_mcconnel%40sil.org/eda23196-72e8-4701-8651-58f14ce2bcfd/bloomdigital/index.htm"
    "testBooks/Testing Away Again/index.htm",
);

export const multilingualMotion = AddBloomPlayerStory(
    "Multilingual motion book - default language",
    "s3/bloomharvest/bloom.bible.stories%40gmail.com%2faf30a7ce-d146-4f07-8aa4-d11de08c4665/bloomdigital%2findex.htm",
);

export const multilingualMotionKo = AddBloomPlayerStory(
    "Multilingual motion book - initial language set to 'ko'",
    "s3/bloomharvest/bloom.bible.stories%40gmail.com%2faf30a7ce-d146-4f07-8aa4-d11de08c4665/bloomdigital%2findex.htm",
    "ko",
);

export const bilingualBook = AddBloomPlayerStory(
    "Bilingual book, both recorded",
    "s3/bloomharvest/educationforlife%40sil.org%2fbb97ab6e-651f-4681-9caf-7c6ce542e3a0/bloomdigital%2findex.htm",
);

export const customFont = AddBloomPlayerStory(
    "Requires custom font",
    "s3/bloomharvest-sandbox/andrew_polk%40sil.org%2fa0a92e1b-ccad-4dbd-8ce5-2159aaee02aa/bloomdigital%2findex.htm",
);

export const choiceActivities = AddBloomPlayerStory(
    "Activity/Choice activities from Bloom 5.4",
    "testbooks/Bloom5.4-activities/Bloom5.4-activities.htm",
);

export const twoAudioSentences = AddBloomPlayerStory(
    "Book with two audio sentences on cover",
    "s3/bloomharvest/namitaj%40chetana.org.in/78c7e561-ce24-4e5d-ad0a-6af141d9d0af/bloomdigital%2findex.htm",
);

export const iframeActivity = AddBloomPlayerStory(
    "Activity/IFrame - Construct Runtime Game",
    "testbooks/sample-iframe-activity/index.htm",
);

export const activePresenterWidget = AddBloomPlayerStory(
    "Activity/ActivePresenter widget test",
    "testbooks/test-widget-iframe-messages/index.htm",
);

export const canvasGame = AddBloomPlayerStory(
    "Activity/Canvas Game - Snake",
    "testbooks/sample-canvas-activity/index.htm",
);

export const widgetControlledNavigation = AddBloomPlayerStory(
    "Activity/Test widget-controlled navigation",
    "testbooks/test-widget-message-activity/index.htm",
);

export const signLanguageWithTalking = AddBloomPlayerStory(
    "Sign language with talking & TOC",
    "testbooks/sign-language-with-talking-book/sign-language-with-talking-book.htm",
);

export const bookNotFound = AddBloomPlayerStory(
    "Book that isn't found",
    "s3/bloomharvest-sandbox/colin_suggett%40sil.org%2fe88a5f3f-b769-4af7-a05f-1b3a0a417c30/bloomdigital/NOTTHERE.htm",
);

export const encodingTest = AddBloomPlayerStory(
    "Encoding test with # and &",
    // note, I could not test :, /, or ? because they are not allowed as part of the filename anyways.
    "testbooks/test %231/test %26 play%232.htm",
);

export const signLanguageWithSound = AddBloomPlayerStory(
    "Sign Language with TalkingBook sound",
    "s3/share.bloomlibrary.org/debug/Is+it+the+End+of+the+World++-+SL/Is+it+the+End+of+the+World++-+SL.htm",
);

export const generalVideoWithAudio = AddBloomPlayerStory(
    "General video with audio",
    "s3/BloomLibraryBooks/joemin_maratin%40sil.org%2fe0e4f0e0-7afd-45a4-9ef6-4fdc83010621%2fBuuk+Tuni+Urup+Dang+Kimaragang++Draft%2f",
);
