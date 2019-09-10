import { TransientPageDataSingleton } from "./transientPageData";

/* Functions
 * For getting information about our url parameters
 * For sending and receving messages with our container.
 *       These messages are currently only being exchanged with the Bloom Reader
 *       app that is showing us in the webview; if we are showing in an iframe in
 *       a browser or Bloom Publish preview, there's no one listening and that's fine.
 */

function postMessage(messageObj: object) {
    const message = JSON.stringify(messageObj);
    // If we're in a native Android WebView or similar, we could not get it to receive postMessage
    // messages, so instead it has to inject an object called ParentProxy to receive the message.
    if ((window as any).ParentProxy) {
        (window as any).ParentProxy.receiveMessage(message);
        return;
    }
    // If we're in an iframe, window.parent is the parent window, which may (but
    // probably won't) handle the message. If we're in a ReactNative WebView, window.parent
    // is the WebView itself (same as plain 'window') but the React Native code
    // receives the message.
    window.parent.postMessage(message, "*"); // any window may receive
}

// Ask the parent window, if any, to store this key/value pair persistently.
export function storePageDataExternally(key: string, value: string) {
    postMessage({ messageType: "storePageData", key, value });
}

let ambientAnalyticsProps = {};
export function setAmbientAnalyticsProperties(properties: any) {
    ambientAnalyticsProps = properties;
}

export function reportAnalytics(event: string, properties: any) {
    postMessage({
        messageType: "sendAnalytics",
        event,
        params: { ...ambientAnalyticsProps, ...properties }
    });
}

// When the player app pauses/quits or whatever else happens that it
// decides that now is the time to send the report on how much of
// this book was read, it will send the latest version of these props.
// That's why we call this "update" rather than "send".
export function updateBookProgressReport(event: string, properties: any) {
    postMessage({
        messageType: "updateBookProgressReport",
        event,
        params: { ...ambientAnalyticsProps, ...properties }
    });
}

let gotCapabilities = false;

export function onBackClicked() {
    postMessage({ messageType: "backButtonClicked" });
}

// For now anyway, this refers to the Android bottom navigation bar
export function showNavBar() {
    postMessage({ messageType: "showNavBar" });
}
export function hideNavBar() {
    postMessage({ messageType: "hideNavBar" });
}

export function logError(logMessage: string) {
    postMessage({ messageType: "logError", message: logMessage });
}

let capabilitiesCallback: ((data: any) => void) | null = null;

function requestCapabilitiesOnce(callback: (data: any) => void) {
    capabilitiesCallback = callback;
    postMessage({ messageType: "requestCapabilities" });
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

// This function receives communications from the context outside the BloomPlayer's iframe
// or WebView. It is intended to be called by a window message listener responding to a postMessage()
// call from the context. In the case of Android WebView, I can't find any way to invoke postMessage(),
// so instead, we make this function directly callable as one of the module's exports,
// and inject a block of Javascript to call it.
// Note that the data argument here is the actual stringified object we pass to either receiveMessage
// or postMessage; that makes it the data.data of the window message listener function.
export function receiveMessage(data: any) {
    let message: any = null;
    try {
        message = JSON.parse(data);
    } catch (e) {
        console.log(
            "receiveMessage failed to parse json: " +
                data +
                " with errror " +
                e.message
        );
        return;
    }
    const messageType = message.messageType;
    // When bloom-player starts up inside Bloom Reader (or other interactive parent) it should pass us
    // all the stuff that should be in transientPageData, by posting a message with an object containing
    // each of the values we stored as key and the corresponding values as values.
    // Note: not yet tested, when we implement this in some parent, probably BR, we may need to fine tune it.
    if (messageType === "restorePageData") {
        TransientPageDataSingleton.setData(message.pageData);
    }
    // This is the callback we requested by sending requestCapabilities
    if (messageType === "capabilities" && capabilitiesCallback) {
        capabilitiesCallback(message);
    }
}

// Listen for messages, typically from our parent window, but we're not doing anything security-critical,
// so no need to worry about origin.
// Note: it's clear from the documentation and by experiment that when hosted in a web page, we need
// window.addEventListener. However, for some time the code had document.addEventListener, and this
// apparently worked in BloomReader-RN. It's just possible we will need to do both when we resume
// work on that program.
window.addEventListener("message", data => {
    // something sends us an empty message, which we haven't figured out, but know we can ignore
    if (!data || !data.data || data.data.length === 0) {
        console.log("returning early");
        return;
    }
    receiveMessage((data as any).data);
});
