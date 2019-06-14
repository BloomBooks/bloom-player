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
    let gotCapabilities = false;
    let retryLimit = 20;
    const receiveCapabilities = data => {
        callback(data);
        gotCapabilities = true;
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
