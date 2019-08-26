// This is in a javascript file because this import needs this "magic comment", "webpackIgnore",
// in order to be truly runtime-dynamic.
// However when used in typescript, the comment is getting stripped so webpack doesn't see it,
// and I haven't been able to make it stop (e.g. in tsconfig).

export function loadDynamically(src) {
    // NB: src has to start with a slash https://stackoverflow.com/a/46739184/723299
    if (src.indexOf("/") !== 0) {
        src = "/" + src;
    }
    return import(/* webpackIgnore: true */ src);
}
