import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(MODULE_DIR, "..", "..");
export const PACKAGE_VERSION: string = (() => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")) as {
            version?: string;
        };
        return pkg.version ?? "0.0.0";
    }
    catch {
        return "0.0.0";
    }
})();
export const USER_DATA_DIR = path.join(os.homedir(), ".fanqie-autopub");
export type DataDirSource = "env" | "project" | "user";
function resolveDataDir(): {
    dir: string;
    source: DataDirSource;
} {
    const explicit = process.env.FANQIE_DATA_DIR;
    if (explicit)
        return { dir: explicit, source: "env" };
    const inProject = path.join(PROJECT_ROOT, "data");
    if (fs.existsSync(inProject))
        return { dir: inProject, source: "project" };
    return { dir: USER_DATA_DIR, source: "user" };
}
const DATA_RESOLVED = resolveDataDir();
export const DATA_DIR = DATA_RESOLVED.dir;
export const DATA_DIR_SOURCE = DATA_RESOLVED.source;
export const EXPORT_DIR = process.env.FANQIE_EXPORT_DIR || path.join(DATA_DIR, "export");
export const SHOT_DIR = path.join(DATA_DIR, "screenshots");
export function ensureDir(dir: string): void {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
export function ensureDirs(): void {
    ensureDir(DATA_DIR);
    ensureDir(EXPORT_DIR);
    ensureDir(SHOT_DIR);
}
export function resolveLoosePath(p: string): string {
    if (path.isAbsolute(p))
        return p;
    const candidates = [path.resolve(PROJECT_ROOT, p), path.resolve(PROJECT_ROOT, "..", p)];
    return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}
