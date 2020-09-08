export function getQueryStringParamAndUnencode(
    paramName: string,
    defaultValue?: any
): string {
    // const values = {}; // deceptive, we don't change the ref, but do change the content
    //  if this runs into edge cases, try an npm library like https://www.npmjs.com/package/qs
    // window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m, key, value) => {
    //     vars[key] = value;
    //     return "";
    // });
    const values = parseUriComponent(window.location.search);
    if (
        defaultValue !== undefined &&
        (values[paramName] === undefined || values[paramName] === null)
    ) {
        return defaultValue;
    }
    return values[paramName];
}

export function parseUriComponent(searchPortionOfLocation: string): object {
    const afterQuestionMark = searchPortionOfLocation.substring(1);
    return afterQuestionMark
        .replace(/\+/g, " ")
        .split("&")
        .filter(Boolean)
        .reduce((values, item) => {
            const ref = item.split("=");
            const key = decodeURIComponent(ref[0] || "");
            const val = decodeURIComponent(ref[1] || "");
            values[key] = val;
            return values;
        }, {});
}

export function getBooleanUrlParam(
    paramName: string,
    defaultValue: boolean
): boolean {
    return (
        getQueryStringParamAndUnencode(
            paramName,
            defaultValue ? "true" : "false"
        ) === "true"
    );
}
