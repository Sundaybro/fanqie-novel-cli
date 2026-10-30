import fs from "node:fs";
import path from "node:path";
import { articles, novels, shortStories, tasks, newId, nowIso } from "../core/store.js";
import { DATA_DIR, EXPORT_DIR, PROJECT_ROOT, ensureDir, resolveLoosePath } from "../core/paths.js";
import { countCjk, toPlainText, pad2, cleanChapterTitle } from "../core/text.js";
import { logger } from "../core/logger.js";
import type { Article, Novel, PublishTask } from "../types.js";
import { uploadChapter } from "./chapter.js";
import { analyzeOriginality } from "./originality.js";
import { sleep } from "../browser/driver.js";
import { NEXT_STEP_CHAPTER_PUBLISHED } from "../core/reminders.js";
export function writeExportFile(fileName: string, content: string): string {
    const dir = path.join(DATA_DIR, "export");
    ensureDir(dir);
    const safe = fileName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "article";
    const file = path.join(dir, `${safe}-${Date.now()}.txt`);
    fs.writeFileSync(file, content, "utf-8");
    return file;
}
export function resolveContent(content?: string, filePath?: string): {
    text: string;
    source: string;
} {
    if (filePath) {
        if (!fs.existsSync(filePath))
            throw new Error(`正文文件不存在：${filePath}`);
        return { text: fs.readFileSync(filePath, "utf-8"), source: filePath };
    }
    if (content && content.trim())
        return { text: content, source: "inline" };
    throw new Error("缺少正文：请提供 content 或 file_path。");
}
export function missingArticleMessage(id: string): string {
    return `本地文稿库未找到 article_id=${id}（article_id 只在当前 MCP 的文稿库内有效，跨平台请各自用 save_article 入库）`;
}
export interface SaveArticleInput {
    articleId?: string;
    kind?: "chapter" | "short";
    title?: string;
    content?: string;
    filePath?: string;
    novelId?: string;
    chapterNumber?: number;
    status?: "draft" | "published" | "failed";
    tomatoBookId?: string;
    tomatoItemId?: string;
}
export interface SaveArticleResult {
    ok: boolean;
    action: "created" | "updated" | "error";
    message: string;
    article?: Article;
}
export async function saveArticle(input: SaveArticleInput): Promise<SaveArticleResult> {
    if (input.articleId) {
        const existing = await articles.get(input.articleId);
        if (!existing)
            return { ok: false, action: "error", message: `未找到 article_id=${input.articleId}` };
        const patch: Partial<Article> = {};
        let source = "未改动正文";
        if (input.title?.trim())
            patch.title = input.title.trim();
        if (input.kind)
            patch.kind = input.kind === "short" ? "short" : "chapter";
        if ((input.content && input.content.trim()) || input.filePath) {
            try {
                const r = resolveContent(input.content, input.filePath);
                source = r.source;
                const plain = toPlainText(r.text);
                patch.content = plain;
                patch.wordCount = countCjk(plain);
            }
            catch (e) {
                return { ok: false, action: "error", message: (e as Error).message };
            }
        }
        if (input.novelId !== undefined)
            patch.novelId = input.novelId || undefined;
        if (input.chapterNumber !== undefined)
            patch.chapterNumber = input.chapterNumber;
        if (input.status)
            patch.status = input.status;
        if (input.tomatoBookId !== undefined)
            patch.tomatoBookId = input.tomatoBookId || undefined;
        if (input.tomatoItemId !== undefined)
            patch.tomatoItemId = input.tomatoItemId || undefined;
        if (!Object.keys(patch).length) {
            return { ok: false, action: "error", message: "没有提供任何要修改的字段（也要给 title / content / chapter_number 等）。" };
        }
        patch.updatedAt = nowIso();
        const updated = await articles.update(input.articleId, patch);
        logger.info(`[library] 更新 ${updated.kind} 《${updated.title}》 ${updated.wordCount} 字（来源 ${source}）`);
        return {
            ok: true,
            action: "updated",
            message: `已更新 article_id=${updated.id}《${updated.title}》（${updated.wordCount} 字，${Object.keys(patch).filter((k) => k !== "updatedAt").join("/")}）。`,
            article: updated,
        };
    }
    if (!input.title?.trim())
        return { ok: false, action: "error", message: "缺少标题 title。" };
    let text = "";
    let source = "";
    try {
        const r = resolveContent(input.content, input.filePath);
        text = r.text;
        source = r.source;
    }
    catch (e) {
        return { ok: false, action: "error", message: (e as Error).message };
    }
    const plain = toPlainText(text);
    const now = nowIso();
    const item: Article = {
        id: newId("art"),
        kind: input.kind === "short" ? "short" : "chapter",
        title: input.title.trim(),
        content: plain,
        wordCount: countCjk(plain),
        novelId: input.novelId,
        chapterNumber: input.chapterNumber,
        status: input.status ?? "draft",
        tomatoBookId: input.tomatoBookId,
        tomatoItemId: input.tomatoItemId,
        createdAt: now,
        updatedAt: now,
    };
    await articles.insert(item);
    logger.info(`[library] 入库 ${item.kind} 《${item.title}》 ${item.wordCount} 字（来源 ${source}）`);
    return { ok: true, action: "created", message: `已入库 article_id=${item.id}（${item.wordCount} 字）。`, article: item };
}
export interface ListArticlesFilter {
    kind?: "chapter" | "short";
    novelId?: string;
    status?: "draft" | "published" | "failed";
}
export async function listArticles(filter: ListArticlesFilter = {}): Promise<Article[]> {
    let items = await articles.all();
    if (filter.kind)
        items = items.filter((a) => a.kind === filter.kind);
    if (filter.novelId)
        items = items.filter((a) => a.novelId === filter.novelId);
    if (filter.status)
        items = items.filter((a) => a.status === filter.status);
    return items.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
}
export async function getArticle(id: string): Promise<Article | undefined> {
    return articles.get(id);
}
export async function deleteArticle(id: string, confirm?: boolean): Promise<{
    ok: boolean;
    action: "preview" | "deleted" | "error";
    message: string;
}> {
    const item = await articles.get(id);
    if (!item)
        return { ok: false, action: "error", message: `未找到 article_id=${id}` };
    if (!confirm) {
        return { ok: true, action: "preview", message: `将删除本地文稿「${item.title}」(${id})。confirm=true 才真正删除。` };
    }
    await articles.remove(id);
    return { ok: true, action: "deleted", message: `已删除本地文稿「${item.title}」(${id})。` };
}
export interface SyncPublishedResult {
    ok: boolean;
    articleId?: string;
    matchedBy: "article_id" | "tomato_item_id" | "title" | "none";
    otherCandidates?: string[];
    message: string;
}
export async function syncArticleAfterPublish(opts: {
    articleId?: string;
    itemId: string;
    title?: string;
    message?: string;
}): Promise<SyncPublishedResult> {
    const all = await articles.all();
    const now = nowIso();
    const sameItem = all.filter((a) => a.tomatoItemId && a.tomatoItemId === opts.itemId);
    const wantedTitle = (opts.title ?? "").trim();
    const sameTitle = wantedTitle
        ? all.filter((a) => a.kind === "short" && a.title.trim() === wantedTitle)
        : [];
    let target: Article | undefined;
    let matchedBy: SyncPublishedResult["matchedBy"] = "none";
    if (opts.articleId) {
        target = all.find((a) => a.id === opts.articleId);
        matchedBy = "article_id";
    }
    if (!target && sameItem.length) {
        target = sameItem.find((a) => a.status !== "published") ?? sameItem[0];
        matchedBy = "tomato_item_id";
    }
    if (!target && sameTitle.length) {
        target = sameTitle.find((a) => a.status !== "published" || !a.tomatoItemId) ?? sameTitle[0];
        matchedBy = "title";
    }
    if (!target) {
        return {
            ok: false,
            matchedBy: "none",
            otherCandidates: [...new Set([...sameItem, ...sameTitle].map((a) => a.id))],
            message: `⚠️ 发布成功但未能回写本地文稿库：没有 article_id=${opts.articleId ?? "-"}、` +
                `tomatoItemId=${opts.itemId}、标题《${wantedTitle || "?"}》(kind=short) 任意一项能匹配到本地记录。` +
                `请在下次发布时带上 article_id（或在发布成功后用 save_article 手工同步 status/tomato_item_id），` +
                `避免本地库一直显示 draft 导致重复发布。`,
        };
    }
    const others = [...new Set([...sameItem, ...sameTitle].map((a) => a.id))].filter((id) => id !== target!.id);
    await articles.update(target.id, {
        status: "published",
        tomatoItemId: opts.itemId,
        publishTime: target.publishTime ?? now,
        ...(opts.message ? { lastMessage: opts.message } : {}),
        updatedAt: now,
    });
    return {
        ok: true,
        articleId: target.id,
        matchedBy,
        otherCandidates: others.length ? others : undefined,
        message: `已回写本地文稿库：article_id=${target.id}《${target.title}》status=published / tomatoItemId=${opts.itemId}（按 ${matchedBy} 匹配）。`,
    };
}
export interface ExportArticleInput {
    articleId: string;
    format?: "txt" | "md";
    includeNovelTitle?: boolean;
    exportDir?: string;
}
export interface ExportArticleResult {
    ok: boolean;
    message: string;
    filePath?: string;
    format?: string;
    wordCount?: number;
    preview?: string;
}
function safeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|\n\r\t]/g, "_").slice(0, 80) || "article";
}
export async function exportArticle(input: ExportArticleInput): Promise<ExportArticleResult> {
    const art = await articles.get(input.articleId);
    if (!art)
        return { ok: false, message: `未找到 article_id=${input.articleId}` };
    const fmt = input.format === "md" ? "md" : "txt";
    const dir = input.exportDir || EXPORT_DIR;
    ensureDir(dir);
    const novel = art.novelId ? await novels.get(art.novelId) : undefined;
    const base = typeof art.chapterNumber === "number" && art.chapterNumber > 0
        ? `${String(art.chapterNumber).padStart(3, "0")}-${safeFileName(art.title)}`
        : `${safeFileName(art.title)}-${art.id}`;
    const filePath = path.join(dir, `${base}.${fmt}`);
    const head = input.includeNovelTitle !== false && novel ? `《${novel.title}》\n` : "";
    const body = fmt === "md" ? `${head}# ${art.title}\n\n${art.content}\n` : `${head}${art.title}\n\n${art.content}\n`;
    await fs.promises.writeFile(filePath, body, "utf-8");
    return {
        ok: true,
        message: `已导出到 ${filePath}`,
        filePath,
        format: fmt,
        wordCount: art.wordCount,
        preview: body.slice(0, 300),
    };
}
export interface OriginalityCheckInput {
    articleId?: string;
    content?: string;
    threshold?: number;
}
export async function checkOriginality(input: OriginalityCheckInput) {
    let text = input.content && input.content.trim() ? input.content : "";
    let articleId: string | undefined;
    if (!text && input.articleId) {
        const art = await articles.get(input.articleId);
        if (!art)
            return { ok: false as const, message: `未找到 article_id=${input.articleId}` };
        text = art.content;
        articleId = art.id;
    }
    if (!text.trim())
        return { ok: false as const, message: "需要提供 article_id 或 content。" };
    const all = await articles.all();
    const corpus = all.filter((a) => a.id !== articleId).map((a) => ({ id: a.id, text: a.content }));
    const threshold = typeof input.threshold === "number" && Number.isFinite(input.threshold) ? input.threshold : 0.25;
    const report = analyzeOriginality(text, corpus, threshold);
    return {
        ok: true as const,
        message: report.passed
            ? `相似度 ${report.similarity}（阈值 ${threshold}），通过。`
            : `相似度 ${report.similarity} 超过阈值 ${threshold}，建议按 findings 修改。`,
        article_id: articleId,
        similarity: report.similarity,
        passed: report.passed,
        threshold: report.threshold,
        metrics: report.metrics,
        findings: report.findings,
        suggestions: report.suggestions,
        compared_with: corpus.length,
    };
}
export interface BatchPublishOptions {
    novelId?: string;
    bookId?: string;
    articleIds?: string[];
    limit?: number;
    intervalSeconds?: number;
    detection?: "basic" | "full";
    useAI?: boolean;
    confirm?: boolean;
    headless?: boolean;
}
export interface BatchPublishResult {
    ok: boolean;
    message: string;
    total: number;
    succeeded: number;
    failed: number;
    results: {
        articleId: string;
        title: string;
        ok: boolean;
        action: string;
        message: string;
    }[];
}
export async function batchPublishChapters(opts: BatchPublishOptions): Promise<BatchPublishResult> {
    let bookId = opts.bookId;
    if (!bookId && opts.novelId) {
        const novel = await novels.get(opts.novelId);
        bookId = novel?.tomatoBookId;
    }
    if (!bookId) {
        return {
            ok: false,
            message: "缺少番茄书 ID：请提供 book_id，或在本地小说登记里绑定 tomatoBookId（novel_id）。",
            total: 0,
            succeeded: 0,
            failed: 0,
            results: [],
        };
    }
    let targets = await listArticles({ kind: "chapter" });
    if (opts.articleIds?.length) {
        const set = new Set(opts.articleIds);
        targets = targets.filter((a) => set.has(a.id));
    }
    else {
        targets = targets.filter((a) => a.status === "draft" && (!opts.novelId || a.novelId === opts.novelId));
        targets = targets.filter((a) => !a.tomatoBookId || a.tomatoBookId === bookId);
    }
    const limit = opts.limit && opts.limit > 0 ? opts.limit : targets.length;
    targets = targets.slice(0, limit);
    if (targets.length === 0) {
        return { ok: true, message: "没有符合条件的待发布章节。", total: 0, succeeded: 0, failed: 0, results: [] };
    }
    const interval = Math.max(0, opts.intervalSeconds ?? 5) * 1000;
    const results: BatchPublishResult["results"] = [];
    for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        const isPreviewOnly = !opts.confirm && i > 0;
        if (isPreviewOnly)
            break;
        const task: PublishTask = {
            id: newId("task"),
            kind: "chapter",
            targetId: a.id,
            title: a.title,
            status: "pending",
            mode: "batch",
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        await tasks.insert(task);
        const r = await uploadChapter({
            bookId,
            title: a.title,
            content: a.content,
            chapterNumber: a.chapterNumber,
            detection: opts.detection,
            useAI: opts.useAI,
            confirm: opts.confirm,
            headless: opts.headless,
        });
        const published = r.action === "published" || r.action === "scheduled";
        await tasks.update(task.id, {
            status: published ? "done" : r.ok ? "pending" : "failed",
            message: `${r.action}: ${r.message}`,
            screenshotPath: r.screenshotPath,
            updatedAt: nowIso(),
        });
        if (published) {
            await articles.update(a.id, {
                status: "published",
                publishTime: nowIso(),
                tomatoBookId: bookId,
                lastMessage: r.message,
                updatedAt: nowIso(),
            });
        }
        else if (!r.ok) {
            await articles.update(a.id, { status: "failed", lastMessage: r.message, updatedAt: nowIso() });
        }
        results.push({ articleId: a.id, title: a.title, ok: published || (r.ok && !opts.confirm), action: r.action, message: r.message });
        if (i < targets.length - 1 && interval > 0)
            await sleep(interval);
    }
    const succeeded = results.filter((x) => x.ok).length;
    const failed = results.length - succeeded;
    return {
        ok: failed === 0,
        message: opts.confirm
            ? `批量上传完成：成功 ${succeeded} / 失败 ${failed}（共 ${results.length} 章）。${NEXT_STEP_CHAPTER_PUBLISHED}`
            : `演练模式（confirm=false）：仅对第 1 章做了「填表不提交」预览，共待发布 ${targets.length} 章。`,
        total: results.length,
        succeeded,
        failed,
        results,
    };
}
const CHAPTER_HEADING_RE = /^#{1,6}\s*第\s*([0-9一二两三四五六七八九十百零]+)\s*章[\s:：、.、_\-—]*(.*)$/;
const ANY_HEADING_RE = /^#{1,6}\s+(.+?)\s*$/;
const RANGE_FILE_RE = /^第\s*\d+\s*[-–—~至]\s*\d+\s*章/;
const SINGLE_FILE_RE = /^第\s*(\d+)\s*章\s*(?:[-–—_.\s]+)?(.*)$/;
const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnToNumber(s: string): number | null {
    if (/^\d+$/.test(s))
        return Number(s);
    let total = 0;
    let digit: number | null = null;
    for (const ch of s) {
        if (ch in CN_DIGITS) {
            digit = CN_DIGITS[ch];
            continue;
        }
        if (ch === "十") {
            total += (digit ?? 1) * 10;
            digit = null;
            continue;
        }
        if (ch === "百") {
            total += (digit ?? 1) * 100;
            digit = null;
            continue;
        }
        return null;
    }
    return total + (digit ?? 0);
}
function stripLeadingMeta(lines: string[]): string[] {
    const out = [...lines];
    while (out.length && !out[0].trim())
        out.shift();
    while (out.length && /^\s*>/.test(out[0]))
        out.shift();
    while (out.length && (!out[0].trim() || /^\s*-{3,}\s*$/.test(out[0])))
        out.shift();
    return out;
}
function sectionToContent(lines: string[]): string {
    return toPlainText(stripLeadingMeta(lines).join("\n"));
}
function splitChaptersFromText(text: string): {
    chapterNumber: number;
    title: string;
    content: string;
}[] {
    const sections: {
        num: number;
        title: string;
        lines: string[];
    }[] = [];
    let current: {
        num: number;
        title: string;
        lines: string[];
    } | null = null;
    for (const line of text.split(/\r?\n/)) {
        if (ANY_HEADING_RE.test(line)) {
            const m = CHAPTER_HEADING_RE.exec(line);
            const num = m ? cnToNumber(m[1]) : null;
            if (m && num !== null) {
                current = { num, title: cleanChapterTitle((m[2] || "").trim()) || `第${num}章`, lines: [] };
                sections.push(current);
            }
            else {
                current = null;
            }
            continue;
        }
        if (current)
            current.lines.push(line);
    }
    return sections
        .map((s) => ({ chapterNumber: s.num, title: s.title, content: sectionToContent(s.lines) }))
        .filter((s) => s.content.length > 0);
}
function normalizeName(s: string): string {
    return s.replace(/[，,。.、·！!？?：:；;「」《》\s]/g, "");
}
function guessNovelDirs(novel: Novel | undefined): string[] {
    if (!novel)
        return [];
    const base = process.env.FANQIE_NOVEL_DIR || path.join(PROJECT_ROOT, "..", "小说");
    const out: string[] = [];
    const push = (dir: string) => out.push(path.join(dir, "章节"), dir);
    for (const n of [novel.tomatoBookId ? `${novel.title}_${novel.tomatoBookId}` : "", novel.title].filter(Boolean)) {
        push(path.join(base, n));
    }
    try {
        const want = normalizeName(novel.title);
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const byId = !!novel.tomatoBookId && entry.name.includes(novel.tomatoBookId);
            const byName = normalizeName(entry.name.split("_")[0]) === want;
            if (byId || byName)
                push(path.join(base, entry.name));
        }
    }
    catch {
    }
    return out;
}
export interface ImportArticlesInput {
    dir?: string;
    novelId?: string;
    kind?: "chapter" | "short";
    status?: "draft" | "published" | "failed";
    updateExisting?: boolean;
    confirm?: boolean;
}
export interface ImportArticlesResult {
    ok: boolean;
    action: "preview" | "imported" | "error";
    message: string;
    dir?: string;
    novelId?: string;
    scannedFiles?: number;
    created: number;
    updated: number;
    planned: {
        file: string;
        chapterNumber?: number;
        title: string;
        wordCount: number;
        action: "create" | "update";
        articleId?: string;
    }[];
    warnings?: string[];
}
export async function importArticlesFromDir(input: ImportArticlesInput): Promise<ImportArticlesResult> {
    const warnings: string[] = [];
    const empty = { created: 0, updated: 0, planned: [] as ImportArticlesResult["planned"] };
    let novel: Novel | undefined;
    if (input.novelId) {
        novel = await novels.get(input.novelId);
        if (!novel)
            return { ok: false, action: "error", message: `未找到本地小说 novel_id=${input.novelId}`, ...empty };
    }
    let dir = input.dir ? resolveLoosePath(input.dir) : "";
    if (!dir) {
        dir = guessNovelDirs(novel).find((c) => fs.existsSync(c)) ?? "";
        if (!dir) {
            return {
                ok: false,
                action: "error",
                message: "未提供 dir，且未能按本地小说推断出章节目录。请显式传 dir（如 小说/<书名>_<书号>/章节 的绝对路径）。",
                ...empty,
            };
        }
    }
    if (!fs.existsSync(dir))
        return { ok: false, action: "error", message: `目录不存在：${dir}`, dir, ...empty };
    if (path.basename(dir) !== "章节" && fs.existsSync(path.join(dir, "章节")))
        dir = path.join(dir, "章节");
    const kind = input.kind ?? "chapter";
    const files = fs
        .readdirSync(dir)
        .filter((f) => /\.(md|txt)$/i.test(f))
        .sort();
    const found: {
        file: string;
        chapterNumber?: number;
        title: string;
        content: string;
    }[] = [];
    for (const f of files) {
        if (RANGE_FILE_RE.test(f)) {
            warnings.push(`已跳过合稿文件「${f}」（一个文件含多章，避免与单章文件重复）；如需导入请单独放到一个目录。`);
            continue;
        }
        const text = fs.readFileSync(path.join(dir, f), "utf-8");
        const parts = splitChaptersFromText(text);
        if (parts.length) {
            for (const p of parts)
                found.push({ file: f, ...p });
            continue;
        }
        const base = f.replace(/\.(md|txt)$/i, "");
        const m = SINGLE_FILE_RE.exec(base);
        const lines = text.split(/\r?\n/);
        const firstHeading = lines.findIndex((l) => ANY_HEADING_RE.test(l));
        const content = sectionToContent(firstHeading >= 0 ? lines.slice(firstHeading + 1) : lines);
        if (m && content) {
            const num = Number(m[1]);
            found.push({ file: f, chapterNumber: num, title: cleanChapterTitle(m[2].trim()) || `第${num}章`, content });
        }
        else {
            warnings.push(`已跳过「${f}」：未识别到「第N章」标题。`);
        }
    }
    const existing = (await articles.all()).filter((a) => a.kind === kind && (!novel || a.novelId === novel.id));
    const byNumber = new Map<number, Article>();
    const byTitle = new Map<string, Article>();
    for (const a of existing) {
        if (typeof a.chapterNumber === "number" && !byNumber.has(a.chapterNumber))
            byNumber.set(a.chapterNumber, a);
        if (!byTitle.has(a.title))
            byTitle.set(a.title, a);
    }
    const items: (ImportArticlesResult["planned"][number] & {
        content: string;
    })[] = [];
    const seen = new Set<number>();
    for (const f of found) {
        const num = f.chapterNumber;
        if (typeof num === "number") {
            if (seen.has(num)) {
                warnings.push(`第 ${num} 章在多处出现，已跳过「${f.file}」（保留先出现的）。`);
                continue;
            }
            seen.add(num);
        }
        const title = typeof num === "number" ? `第${pad2(num)}章 ${f.title}` : f.title;
        const hit = typeof num === "number" ? byNumber.get(num) : byTitle.get(title);
        if (hit && input.updateExisting === false) {
            warnings.push(`已存在「${hit.title}」(${hit.id})，按 update_existing=false 跳过。`);
            continue;
        }
        items.push({
            file: f.file,
            chapterNumber: num,
            title,
            wordCount: countCjk(f.content),
            action: hit ? "update" : "create",
            articleId: hit?.id,
            content: f.content,
        });
    }
    const created = items.filter((i) => i.action === "create").length;
    const updated = items.length - created;
    const planned = items.map(({ content, ...rest }) => rest);
    if (!input.confirm) {
        return {
            ok: true,
            action: "preview",
            message: `预览（confirm=false）：扫描「${dir}」${files.length} 个文件，识别 ${found.length} 章；待新建 ${created} 章、待更新 ${updated} 章。确认后传 confirm=true 写入本地文稿库。`,
            dir,
            novelId: novel?.id,
            scannedFiles: files.length,
            created,
            updated,
            planned,
            warnings: warnings.length ? warnings : undefined,
        };
    }
    const now = nowIso();
    for (const it of items) {
        if (it.action === "update" && it.articleId) {
            const patch: Partial<Article> = { title: it.title, content: it.content, wordCount: it.wordCount, updatedAt: now };
            if (it.chapterNumber !== undefined)
                patch.chapterNumber = it.chapterNumber;
            if (novel?.tomatoBookId)
                patch.tomatoBookId = novel.tomatoBookId;
            await articles.update(it.articleId, patch);
        }
        else {
            await articles.insert({
                id: newId("art"),
                kind,
                title: it.title,
                content: it.content,
                wordCount: it.wordCount,
                novelId: novel?.id,
                chapterNumber: it.chapterNumber,
                status: input.status ?? "draft",
                tomatoBookId: novel?.tomatoBookId,
                createdAt: now,
                updatedAt: now,
            });
        }
    }
    logger.info(`[library] 从 ${dir} 导入：新建 ${created} / 更新 ${updated}`);
    return {
        ok: true,
        action: "imported",
        message: `已写入本地文稿库：新建 ${created} 章、更新 ${updated} 章（共 ${items.length} 章）。`,
        dir,
        novelId: novel?.id,
        scannedFiles: files.length,
        created,
        updated,
        planned,
        warnings: warnings.length ? warnings : undefined,
    };
}
