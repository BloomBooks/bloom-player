import { TransientPageDataSingleton } from "./transientPageData";

/* Functions
 * For getting information about our url parameters
 * For sending and receving messages with our container.
 *       These messages are currently only being exchanged with the Bloom Reader
 *       app that is showing us in the webview; if we are showing in an iframe in
 *       a browser or Bloom Publish preview, there's no one listening and that's fine.
 */

export function getBookParam(paramName: string): string {
    const vars = {}; // deceptive, we don't change the ref, but do change the content
    //  if this runs into edge cases, try an npm library like https://www.npmjs.com/package/qs
    window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m, key, value) => {
        vars[key] = value;
        return "";
    });
    return vars[paramName];
}

// Ask the parent window, if any, to store this key/value pair persistently.
export function storePageDataExternally(key: string, value: string) {
    // If we're in an iframe, window.parent is the parent window, which may (but
    // probably won't) try to store the data. If we're in a WebView, window.parent
    // is the WebView itself (same as plain 'window') but the React Native code
    // receives the message.
    window.parent.postMessage(
        JSON.stringify({ messageType: "storePageData", key, value }),
        "*" // any window may receive
    );
}

export function reportAnalytics(event: string, params: any) {
    // See storePageDataExternally for why we use window.parent here.
    window.parent.postMessage(
        JSON.stringify({ messageType: "sendAnalytics", event, params }),
        "*"
    );
}

interface IBookStats {
    totalNumberedPages: number;
    questionCount: number;
    contentLang: string;
    signLanguage: boolean;
    motion: boolean;
    blind: boolean; // technically, whether it has image descriptions not in xmatter
}

export function reportBookStats(stats: IBookStats) {
    const args = { messageType: "bookStats", ...stats };
    postMessageWhenReady(JSON.stringify(args));
}

export function reportPageShown(
    pageHasAudio: boolean,
    audioWillPlay: boolean,
    lastNumberedPageWasRead: boolean
) {
    postMessageWhenReady(
        JSON.stringify({
            messageType: "pageShown",
            pageHasAudio,
            audioWillPlay,
            lastNumberedPageWasRead
        })
    );
}

export function reportAudioPlayed(
    duration: number // seconds
) {
    postMessageWhenReady(
        JSON.stringify({
            messageType: "audioPlayed",
            duration
        })
    );
}

export function reportVideoPlayed(
    duration: number // seconds
) {
    postMessageWhenReady(
        JSON.stringify({
            messageType: "videoPlayed",
            duration
        })
    );
}

let pendingMessages: string[] = [];
let gotCapabilities = false;

// Post a message which the host may not yet be ready to receive.
// We detect that the host is ready to receive when it sends a capabilities
// message. Hosts that don't do this are assumed not interested in any
// of the delayable messages.
// See the comments in requestCapabilities for why this is needed.
// Note that this mechanism depends on something calling requestCapabilities.
function postMessageWhenReady(message: string) {
    if (gotCapabilities) {
        window.parent.postMessage(message, "*");
    } else {
        pendingMessages.push(message);
    }
}

export function onBackClicked() {
    window.parent.postMessage(
        JSON.stringify({ messageType: "backButtonClicked" }),
        "*"
    );
}

export function logError(logMessage: string) {
    window.postMessage(
        JSON.stringify({ messageType: "logError", message: logMessage }),
        "*"
    );
}

let capabilitiesCallback: ((data: any) => void) | null = null;

function requestCapabilitiesOnce(callback: (data: any) => void) {
    capabilitiesCallback = callback;
    window.parent.postMessage(
        JSON.stringify({ messageType: "requestCapabilities" }),
        "*"
    );
}

// Request the container to report what it's capable of doing.
// If it doesn't respond it's assumed not capable of anything we care about.
// It is expected to respond by posting a message to our window with a stringified object.
// Currently, we are looking for "canGoBack" to be true, indicating that we may
// show the Back button (and expect calling onBackClicked to do something).
// Also, the returned object must have messageType: "capabilities" to distinguish
// it from any other messages the host can send us.
// Note: because of some logic added to handle delays in the host starting to listen,
// capabilities may be requested more than once, and it is just possible that
// the callback will be called more than once in response to a single request.
// Note: currently we can only keep track of ONE caller that wants to be notified
// when capabilities arrive. We can enhance that when needed.
export function requestCapabilities(callback: (data: any) => void) {
    // There appears to be a bug in react native message handling where the listener
    // does not receive messages until some undefined time after the view is launched.
    // https://github.com/facebook/react-native/issues/17337
    // In my testing, a single 100ms wait is enough; but I have no way to be sure
    // what the maximum needed time might be, so keep trying until we get it
    // (or, after a second or so, assume we're in a context where no one is ever going
    // to listen, and give up).
    // Note: it seems that although we stop sending requests as soon as we get a response,
    // we can still get several responses; the only explanation I can see is that
    // something starts to queue up window messages some time before it starts to
    // process them. But it's definitely not enough to just request once immediately.
    let retryLimit = 20;
    const receiveCapabilities = data => {
        if (!gotCapabilities) {
            gotCapabilities = true;
            pendingMessages.forEach(message =>
                window.parent.postMessage(message, "*")
            );
            pendingMessages = []; // currently redundant, but they aren't pending any more.
        }
        callback(data);
    };
    const timeoutFunc = () => {
        if (gotCapabilities || retryLimit-- <= 0) {
            return;
        }
        requestCapabilitiesOnce(receiveCapabilities);
        window.setTimeout(() => {
            timeoutFunc();
        }, 50);
    };
    timeoutFunc();
}

// When bloom-player starts up inside Bloom Reader (or other interactive parent) it should pass us
// all the stuff that should be in transientPageData, by posting a message with an object containing
// each of the values we stored as key and the corresponding values as values.
// Note: not yet tested, when we implement this in some parent, probably BR, we may need to fine tune it.
document.addEventListener("message", data => {
    const message = JSON.parse((data as any).data);
    const messageType = message.messageType;
    if (messageType === "restorePageData") {
        TransientPageDataSingleton.setData(message.pageData);
    }
    if (messageType === "capabilities" && capabilitiesCallback) {
        capabilitiesCallback(message);
    }
});
