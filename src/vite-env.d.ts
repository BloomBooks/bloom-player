// For CSS modules and other Vite-specific import formats
declare module "*.css?inline" {
    const content: string;
    export default content;
}

declare module "*.tsv?raw" {
    const content: string;
    export default content;
}

// For importing CSS modules normally
declare module "*.css" {
    const classes: { [key: string]: string };
    export default classes;
}

// For other file types that might be imported with Vite's ?raw suffix
declare module "*?raw" {
    const content: string;
    export default content;
}

// For URL imports
declare module "*?url" {
    const src: string;
    export default src;
}

// For asset imports
declare module "*.svg" {
    const content: string;
    export default content;
}

declare module "*.mp3" {
    const src: string;
    export default src;
}

declare module "*.png" {
    const content: string;
    export default content;
}

declare module "*.jpg" {
    const content: string;
    export default content;
}
