import fs from "node:fs";
import { novels, nowIso } from "../core/store.js";
import { resolveLoosePath } from "../core/paths.js";
import { logger } from "../core/logger.js";
import type { Novel } from "../types.js";
export interface UpdateNovelInput {
    novelId: string;
    title?: string;
    gender?: number;
    abstract?: string;
    protagonist1?: string;
    protagonist2?: string;
    readingTags?: string[];
    contentTags?: Novel["contentTags"];
    tomatoBookId?: string;
    tomatoBookName?: string;
    genre?: string;
    synopsis?: string;
    outline?: string;
    worldSetting?: string;
    goldenHook?: string;
    characters?: Novel["characters"];
    targetWordsPerChapter?: number;
    status?: string;
    synopsisFile?: string;
    outlineFile?: string;
    worldSettingFile?: string;
    goldenHookFile?: string;
    charactersFile?: string;
}
export interface UpdateNovelResult {
    ok: boolean;
    action: "updated" | "error";
    message: string;
    novel?: Novel;
    changed?: string[];
    wordCounts?: Record<string, number>;
}
function readTextFile(file: string, label: string): string {
    const p = resolveLoosePath(file);
    if (!fs.existsSync(p))
        throw new Error(`${label}文件不存在：${p}`);
    return fs.readFileSync(p, "utf-8");
}
function countChars(text: string): number {
    return text.replace(/\s/g, "").length;
}
export async function updateNovel(input: UpdateNovelInput): Promise<UpdateNovelResult> {
    const novel = await novels.get(input.novelId);
    if (!novel)
        return { ok: false, action: "error", message: `未找到本地小说 novel_id=${input.novelId}` };
    const patch: Partial<Novel> = {};
    const changed: string[] = [];
    const wordCounts: Record<string, number> = {};
    const setIf = (key: keyof Novel, value: unknown): void => {
        if (value === undefined)
            return;
        (patch as Record<string, unknown>)[key] = value;
        changed.push(String(key));
        if (typeof value === "string" && value.length > 200)
            wordCounts[String(key)] = countChars(value);
    };
    try {
        setIf("title", input.title?.trim() || undefined);
        setIf("gender", input.gender);
        setIf("abstract", input.abstract);
        setIf("protagonist1", input.protagonist1);
        setIf("protagonist2", input.protagonist2);
        setIf("readingTags", input.readingTags);
        setIf("contentTags", input.contentTags);
        setIf("tomatoBookId", input.tomatoBookId);
        setIf("tomatoBookName", input.tomatoBookName);
        setIf("genre", input.genre);
        setIf("synopsis", input.synopsis ?? (input.synopsisFile ? readTextFile(input.synopsisFile, "synopsis") : undefined));
        setIf("outline", input.outline ?? (input.outlineFile ? readTextFile(input.outlineFile, "outline") : undefined));
        setIf("worldSetting", input.worldSetting ?? (input.worldSettingFile ? readTextFile(input.worldSettingFile, "worldSetting") : undefined));
        setIf("goldenHook", input.goldenHook ?? (input.goldenHookFile ? readTextFile(input.goldenHookFile, "goldenHook") : undefined));
        const characters = input.characters ?? (input.charactersFile ? (JSON.parse(readTextFile(input.charactersFile, "characters")) as Novel["characters"]) : undefined);
        setIf("characters", characters);
        setIf("targetWordsPerChapter", input.targetWordsPerChapter);
        setIf("status", input.status);
    }
    catch (e) {
        return { ok: false, action: "error", message: (e as Error).message };
    }
    if (!changed.length)
        return { ok: false, action: "error", message: "没有提供任何要修改的字段。" };
    patch.updatedAt = nowIso();
    const updated = await novels.update(input.novelId, patch);
    logger.info(`[localNovel] 更新 ${updated.id}《${updated.title}》字段：${changed.join(", ")}`);
    return {
        ok: true,
        action: "updated",
        message: `已更新本地小说《${updated.title}》字段：${changed.join(", ")}。`,
        novel: updated,
        changed,
        wordCounts: Object.keys(wordCounts).length ? wordCounts : undefined,
    };
}
