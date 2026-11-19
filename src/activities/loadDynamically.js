import dynamicImportPolyfill from "dynamic-import-polyfill";

// This needs to be done before any dynamic imports are used.
dynamicImportPolyfill.initialize({
    importFunctionName: "polyfill_import", // Defaults to '__import__'
});

// Resolves src the way the book's other files are resolved (relative to the document), so the
// result is always an absolute url, which is a valid module specifier.
export function toModuleSpecifier(src, baseUrl) {
    return new URL(src, baseUrl).href;
}

// Note that loading a script as a module needs Chrome 61 or later, which may be newer than the
// oldest engine the player otherwise supports.
export function loadDynamically(src) {
    // eslint-disable-next-line no-undef
    return polyfill_import(toModuleSpecifier(src, document.baseURI));
}
