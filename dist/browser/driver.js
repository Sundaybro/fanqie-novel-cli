import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../core/logger.js";
const PUPPETEER = "puppeteer";
const PUPPETEER_CORE = "puppeteer-core";
const require_ = createRequire(import.meta.url);
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function browserEnabled() {
    const v = (process.env.FANQIE_ENABLE_BROWSER ?? "").toLowerCase();
    return !(v === "0" || v === "false" || v === "off");
}
const BROWSER_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    path.join(os.homedir(), "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
export function detectBrowser() {
    if (process.env.FANQIE_CHROME_PATH)
        return process.env.FANQIE_CHROME_PATH;
    for (const p of BROWSER_CANDIDATES) {
        if (fs.existsSync(p))
            return p;
    }
    return undefined;
}
export async function loadPuppeteer() {
    try {
        const mod = (await import(PUPPETEER)).default;
        return { mod };
    }
    catch {
    }
    try {
        const mod = (await import(PUPPETEER_CORE)).default;
        const executablePath = detectBrowser();
        if (!executablePath) {
            throw new Error("未找到本机浏览器。设置 FANQIE_CHROME_PATH 指向 Chrome/Edge 可执行文件，或安装 puppeteer（自带 Chromium）。");
        }
        return { mod, executablePath };
    }
    catch (e) {
        throw new Error(`缺少浏览器驱动：${e.message}\n` +
            "解决方式（任选一）：npm i puppeteer-core 并确保本机有 Chrome/Edge，或 npm i puppeteer。");
    }
}
export function puppeteerAvailable() {
    try {
        require_.resolve(PUPPETEER);
        return true;
    }
    catch {
        try {
            require_.resolve(PUPPETEER_CORE);
            return Boolean(detectBrowser());
        }
        catch {
            return false;
        }
    }
}
export function driverName() {
    try {
        require_.resolve(PUPPETEER);
        return "puppeteer";
    }
    catch {
        try {
            require_.resolve(PUPPETEER_CORE);
            return `puppeteer-core + ${detectBrowser() ?? "未找到浏览器"}`;
        }
        catch {
            return "未安装";
        }
    }
}
export const LAUNCH_ARGS = [
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
];
export async function launchBrowser(headless, driver) {
    const d = driver ?? (await loadPuppeteer());
    logger.debug(`启动浏览器 headless=${headless} driver=${d.executablePath ?? "内置 Chromium"}`);
    return d.mod.launch({
        headless,
        executablePath: d.executablePath,
        protocolTimeout: 180000,
        args: LAUNCH_ARGS,
    });
}
export async function shot(page, tag) {
    try {
        const { SHOT_DIR, ensureDir } = await import("../core/paths.js");
        ensureDir(SHOT_DIR);
        const file = path.join(SHOT_DIR, `${tag}-${Date.now()}.png`);
        await page.screenshot({ path: file });
        return file;
    }
    catch {
        return "";
    }
}
