// Runs every book in public/testBooks in a real copy of the oldest Chromium bloom-player supports
// ("browserslist" in package.json) and pages through each, to catch what the static checks in
// e2e/bundle-browser-support.spec.ts can't, such as a missing array method. See the Preflight
// checks section of AGENTS.md for when to run it and what its output means. (BL-17113)
//
//   pnpm build:standalone && pnpm test:old-chromium
//
// The old Chromium comes from Google's public snapshot archive and is cached in
// node_modules/.cache/old-chromium.
import { chromium as playwrightChromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chromium snapshots are numbered by trunk position. The trunk is version N until N branches
// off, so the last snapshot before N's branch point is version N. Add a milestone here when the
// browserslist floor moves; see "Browser support" in AGENTS.md for everything that changes with
// it (https://chromiumdash.appspot.com/branches lists the branch points).
const branchPoints = { 54: 414607 }; // Win_x64 snapshots 414589 and 414607 both report 54.0.2840.0

const target = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).browserslist[0];
const milestone = Number(/^chrome (\d+)$/i.exec(target)?.[1]);
if (!branchPoints[milestone]) {
    throw new Error(
        `No Chromium branch point for browserslist "${target}"; add it to branchPoints`,
    );
}
const platform = { win32: "Win_x64", linux: "Linux_x64" }[process.platform];
if (!platform)
    throw new Error(`No Chromium snapshots set up for ${process.platform}`);
const currentChrome = playwrightChromium.executablePath();
if (!fs.existsSync(currentChrome)) {
    throw new Error(
        'Playwright\'s Chromium is missing; run "pnpm exec playwright install chromium"',
    );
}

const oldChrome = await getChromium(milestone);
const port = await freePort();
// stderr is passed through so the server can say why it didn't start (e.g. no dist/ build).
const server = spawn(
    process.execPath,
    [path.join(repoRoot, "e2e", "server.mjs")],
    {
        env: { ...process.env, BP_E2E_PORT: String(port) },
        stdio: ["ignore", "ignore", "inherit"],
    },
);
let failures = 0;
try {
    await waitFor(() =>
        fetch(`http://127.0.0.1:${port}/bloomplayer.htm`).then((r) => r.ok),
    );
    for (const book of testBooks()) {
        // These are the url params Bloom Reader passes (ReaderActivity.java). independent=false
        // keeps analytics with the host instead of loading third-party analytics scripts from
        // the web, which change on their own and already use newer syntax.
        const params = `url=${encodeURIComponent(book)}&centerVertically=true&hideFullScreenButton=true&independent=false&host=bloomreader`;
        const url = `http://127.0.0.1:${port}/bloomplayer.htm?${params}`;
        const { runProblems, errors } = await checkBook(
            oldChrome,
            milestone,
            url,
        );

        // A JavaScript error counts only if current Chromium doesn't throw it too (the book has
        // it in any browser), and only if it isn't from the book's own files (a game in an
        // iframe, say), which are the book's business. A problem with the run itself always counts.
        const errorsInCurrent = errors.length
            ? (await checkBook(currentChrome, 999, url)).errors.map(describe)
            : [];
        const bookFolder = new URL(
            book.slice(0, book.lastIndexOf("/") + 1),
            url,
        ).href;
        const oldOnly = errors.filter(
            (e) => !errorsInCurrent.includes(describe(e)),
        );
        const notes = oldOnly.filter((e) => e.url.startsWith(bookFolder));
        const problems = [
            ...runProblems,
            ...oldOnly.filter((e) => !notes.includes(e)).map(describe),
        ];

        console.log(`${problems.length ? "FAIL" : "ok  "} ${book}`);
        for (const problem of problems) console.log(`       ${problem}`);
        for (const note of notes)
            console.log(
                `       note, from the book's own files: ${describe(note)}`,
            );
        if (problems.length) failures++;
    }
} finally {
    server.kill();
}
console.log(
    failures
        ? `\n${failures} book(s) failed in Chrome ${milestone}.`
        : `\nAll books ran in Chrome ${milestone}.`,
);
process.exitCode = failures ? 1 : 0;

function describe(error) {
    const where = error.url
        ? ` (${new URL(error.url).pathname}:${error.line})`
        : "";
    return `error: ${error.text}${where}`;
}

// The url of each test book's html file, relative to the server root.
function testBooks() {
    const root = path.join(repoRoot, "public", "testBooks");
    return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
            const htm = fs
                .readdirSync(path.join(root, d.name))
                .find((f) => f.endsWith(".htm"));
            return htm && `/testBooks/${d.name}/${htm}`;
        })
        .filter(Boolean);
}

// Opens one book in the given Chromium (of the given major version) and pages to the end.
// Returns the JavaScript errors thrown, and any problem with the run itself (no page shown, a
// page turn that didn't happen, a browser that couldn't be driven).
async function checkBook(chromeExe, version, url) {
    const runProblems = [];
    const errors = [];
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "old-chromium-"));
    // Chrome this old can't report a debugging port it picks itself, so pick a free one for it.
    const debugPort = await freePort();
    // The full chrome binary got --headless in Chrome 59 (Linux) and 60 (Windows). Older ones
    // need a display: on Windows the window goes off screen; on Linux use xvfb-run if no display.
    const headless = version >= (process.platform === "win32" ? 60 : 59);
    const args = [
        headless ? "--headless" : "--window-position=-3000,0",
        "--disable-gpu",
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${debugPort}`,
        "--no-first-run",
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1024,768",
        "about:blank",
    ];
    const useXvfb =
        !headless && process.platform === "linux" && !process.env.DISPLAY;
    // On Linux the browser (or xvfb-run, with Xvfb and the browser under it) gets its own
    // process group, so stopBrowser can stop all of it.
    const detached = process.platform !== "win32";
    const browser = useXvfb
        ? spawn("xvfb-run", ["-a", chromeExe, ...args], {
              stdio: "ignore",
              detached,
          })
        : spawn(chromeExe, args, { stdio: "ignore", detached });
    const stopBrowser = () => {
        try {
            if (detached) process.kill(-browser.pid, "SIGTERM");
            else browser.kill();
        } catch {
            // already gone
        }
    };
    const exited = new Promise((resolve) => {
        browser.once("exit", resolve);
        browser.once("error", (e) => {
            runProblems.push(
                `could not start ${useXvfb ? "xvfb-run" : chromeExe}: ${e.message}`,
            );
            resolve();
        });
    });
    try {
        let pageTarget;
        await waitFor(async () => {
            const targets = await (
                await fetch(`http://127.0.0.1:${debugPort}/json`)
            ).json();
            pageTarget = targets.find((t) => t.type === "page");
            return !!pageTarget;
        });
        const cdp = await connect(
            pageTarget.webSocketDebuggerUrl,
            (method, params) => {
                if (method === "Runtime.exceptionThrown") {
                    const d = params.exceptionDetails;
                    errors.push({
                        text: (d.exception?.description || d.text).split(
                            "\n",
                        )[0],
                        url: d.url || "",
                        line: d.lineNumber + 1,
                    });
                }
            },
        );
        await cdp.send("Runtime.enable");
        const fullVersion = (await cdp.eval("navigator.userAgent")).match(
            /Chrome\/([\d.]+)/,
        )[1];
        await cdp.send("Network.enable");
        await cdp.send("Network.setUserAgentOverride", {
            userAgent: `Mozilla/5.0 (Linux; Android 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${fullVersion} Mobile Safari/537.36`,
        });
        await cdp.send("Page.navigate", { url });
        const showing = await waitFor(
            () =>
                cdp.eval(
                    `!!document.querySelector(".swiper-slide-active .bloom-page")`,
                ),
            15000,
        ).then(
            () => true,
            () => false,
        );
        if (!showing)
            runProblems.push(
                'never showed a page (stuck on "Loading Bloom Player..."?)',
            );
        else {
            await sleep(1500); // the player's start-up settling
            const activeIndex = `[].indexOf.call(document.querySelectorAll(".swiper-slide"), document.querySelector(".swiper-slide-active"))`;
            for (let i = 0; i < 30; i++) {
                const before = await cdp.eval(activeIndex);
                const moved = await cdp.eval(
                    `(function(){var b=document.querySelector(".swiper-button-next:not(.swiper-button-disabled)"); if(!b) return false; b.click(); return true;})()`,
                );
                if (!moved) break;
                // Wait for the page to change, then give its scripts a moment to run.
                const turned = await waitFor(
                    async () => (await cdp.eval(activeIndex)) !== before,
                    5000,
                ).then(
                    () => true,
                    () => false,
                );
                if (!turned) {
                    runProblems.push(
                        `the turn from page ${before} didn't happen`,
                    );
                    break;
                }
                await sleep(300);
            }
        }
        cdp.close();
    } catch (e) {
        runProblems.push(`could not drive the browser: ${e.message}`);
    } finally {
        stopBrowser();
        await exited;
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    }
    return { runProblems, errors };
}

// A minimal Chrome DevTools Protocol client. (Playwright and Puppeteer can't drive a Chrome
// this old.)
async function connect(wsUrl, onEvent) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", reject);
    });
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else if (message.method) onEvent(message.method, message.params);
    });
    const send = (method, params = {}) =>
        new Promise((resolve) => {
            pending.set(++id, resolve);
            ws.send(JSON.stringify({ id, method, params }));
        });
    return {
        send,
        eval: async (expression) =>
            (
                await send("Runtime.evaluate", {
                    expression,
                    returnByValue: true,
                })
            ).result?.result?.value,
        close: () => ws.close(),
    };
}

// The cached Chromium for this milestone, downloading it the first time.
async function getChromium(m) {
    const dir = path.join(
        repoRoot,
        "node_modules",
        ".cache",
        "old-chromium",
        `${platform}-${m}`,
    );
    const exe = path.join(
        dir,
        process.platform === "win32" ? "chrome.exe" : "chrome",
    );
    if (fs.existsSync(exe)) return exe;

    const branchPoint = branchPoints[m];
    let snapshot;
    for (const prefix of [
        String(branchPoint).slice(0, -2),
        String(branchPoint - 100).slice(0, -2),
    ]) {
        const listing = await (
            await fetch(
                `https://www.googleapis.com/storage/v1/b/chromium-browser-snapshots/o?prefix=${platform}/${prefix}&delimiter=/&fields=prefixes`,
            )
        ).json();
        const positions = (listing.prefixes || [])
            .map((p) => Number(p.split("/")[1]))
            .filter((p) => p <= branchPoint);
        if (positions.length) {
            snapshot = Math.max(...positions);
            break;
        }
    }
    if (!snapshot)
        throw new Error(
            `No ${platform} Chromium snapshot found just before position ${branchPoint}`,
        );

    // Older Windows snapshots are named chrome-win32.zip, newer ones chrome-win.zip.
    const names =
        process.platform === "win32"
            ? ["chrome-win32.zip", "chrome-win.zip"]
            : ["chrome-linux.zip"];
    // Unpack next to the cache folder, so the final rename stays on one filesystem.
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const tmp = fs.mkdtempSync(path.join(path.dirname(dir), "download-"));
    try {
        let zip;
        for (const name of names) {
            const response = await fetch(
                `https://storage.googleapis.com/chromium-browser-snapshots/${platform}/${snapshot}/${name}`,
            );
            if (response.ok) {
                zip = path.join(tmp, name);
                fs.writeFileSync(
                    zip,
                    Buffer.from(await response.arrayBuffer()),
                );
                break;
            }
        }
        if (!zip)
            throw new Error(
                `No Chromium download for ${platform} snapshot ${snapshot}`,
            );
        console.log(
            `Downloaded Chromium ${m} (${platform} snapshot ${snapshot}); unpacking to ${dir}`,
        );
        if (process.platform === "win32") {
            // Windows' own tar unpacks zips (Git Bash's GNU tar, if first on PATH, can't).
            const windowsTar = path.join(
                process.env.SystemRoot || "C:\\Windows",
                "System32",
                "tar.exe",
            );
            execFileSync(windowsTar, ["-xf", zip, "-C", tmp]);
        } else execFileSync("unzip", ["-q", zip, "-d", tmp]);
        const unpacked = fs
            .readdirSync(tmp)
            .find((f) => f.startsWith("chrome-") && !f.endsWith(".zip"));
        fs.renameSync(path.join(tmp, unpacked), dir);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    return exe;
}

async function waitFor(check, timeoutMs = 20000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
        try {
            if (await check()) return;
        } catch {
            // not ready yet
        }
        if (Date.now() > end) throw new Error("timed out");
        await sleep(200);
    }
}

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer().listen(0, () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}
