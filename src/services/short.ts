import fs from "node:fs";
import { sleep, shot } from "../browser/driver.js";
import { automationReadiness } from "./auth.js";
import { openSession, isError, apiGet, API, authorApiBase, shortPublishUrl } from "../browser/endpoints.js";
import { toPlainText, compareDraft } from "../core/text.js";
import { logger } from "../core/logger.js";
import { NEXT_STEP_SHORT_PUBLISHED } from "../core/reminders.js";
export const SHORT_MIN_WORDS = 6000;
export const SHORT_MAX_WORDS = 80000;
export interface ShortStoryListItem {
    itemId: string;
    title: string;
    wordNumber?: number;
    category?: number[];
    signType?: number;
    signStatus?: number;
    publishStatus?: number;
    displayStatus?: number;
    createTime?: string;
    modifyTime?: string;
}
function mapShortItem(s: any): ShortStoryListItem {
    return {
        itemId: String(s?.item_id ?? s?.itemId ?? ""),
        title: String(s?.multi_title ?? s?.title ?? ""),
        wordNumber: s?.word_number ?? s?.wordNumber,
        category: Array.isArray(s?.category) ? s.category : undefined,
        signType: s?.sign_type,
        signStatus: s?.sign_status,
        publishStatus: s?.publish_status,
        displayStatus: s?.display_status,
        createTime: s?.create_time ?? s?.createTime,
        modifyTime: s?.modify_time ?? s?.modifyTime,
    };
}
export async function listShortStories(opts: {
    status?: "all" | "draft";
    pageIndex?: number;
    pageCount?: number;
    headless?: boolean;
} = {}): Promise<{
    ok: boolean;
    message: string;
    stories?: ShortStoryListItem[];
    total?: number;
}> {
    const readiness = automationReadiness();
    if (!readiness.ready)
        return { ok: false, message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    const session = await openSession(opts.headless ?? true, "/main/writer/short-manage");
    if (isError(session))
        return { ok: false, message: session.error };
    const { browser, page } = session;
    try {
        const path = opts.status === "draft" ? API.shortArticleDraftList : API.shortArticleList;
        const data = await apiGet(page, path, {
            page_count: opts.pageCount ?? 50,
            page_index: opts.pageIndex ?? 0,
            status: 0,
            time_sort: 0,
            image_fmt_list: "450x800",
            book_image_fmt_list: "190x250",
            pack_type: 1,
        });
        await browser.close().catch(() => { });
        if (data?.code !== 0)
            return { ok: false, message: `接口返回 code=${data?.code} message=${data?.message}` };
        const raw: any[] = data?.data?.item_list ?? data?.data?.list ?? [];
        const stories = raw.map(mapShortItem);
        const total = Number(data?.data?.total_count ?? stories.length);
        return {
            ok: true,
            message: `共 ${total} 条${opts.status === "draft" ? "草稿" : "短故事"}`,
            stories,
            total,
        };
    }
    catch (e) {
        await browser.close().catch(() => { });
        return { ok: false, message: `读取短故事列表失败: ${(e as Error).message}` };
    }
}
export interface ShortStoryDetail {
    itemId: string;
    title: string;
    content: string;
    wordNumber: number;
    category: number[];
    categoryMaxCount?: number;
    thumbUri?: string;
    bookThumbUri?: string;
    signType?: number;
    signStatus?: number;
    publishStatus?: number;
    displayStatus?: number;
    latestVersion?: number;
    auditFailInfos?: any[];
}
export async function getShortStory(itemId: string, opts: {
    headless?: boolean;
} = {}): Promise<{
    ok: boolean;
    message: string;
    story?: ShortStoryDetail;
}> {
    const readiness = automationReadiness();
    if (!readiness.ready)
        return { ok: false, message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    if (!itemId)
        return { ok: false, message: "缺少 item_id。" };
    const session = await openSession(opts.headless ?? true, "/main/writer/short-manage");
    if (isError(session))
        return { ok: false, message: session.error };
    const { browser, page } = session;
    try {
        const data = await apiGet(page, API.shortArticleEditV1, { item_id: itemId, image_fmt_list: "270x480" });
        await browser.close().catch(() => { });
        if (data?.code !== 0)
            return { ok: false, message: `接口返回 code=${data?.code} message=${data?.message}` };
        const d = data?.data ?? {};
        const apiItemId = String(d.item_id ?? "");
        const resolvedItemId = apiItemId && apiItemId !== "0" ? apiItemId : itemId;
        return {
            ok: true,
            message: `读取成功：《${d.multi_title ?? ""}》${d.word_number ?? 0} 字`,
            story: {
                itemId: resolvedItemId,
                title: String(d.multi_title ?? ""),
                content: String(d.content ?? ""),
                wordNumber: Number(d.word_number ?? 0),
                category: Array.isArray(d.category) ? d.category : [],
                categoryMaxCount: d.category_max_count,
                thumbUri: d.thumb_uri,
                bookThumbUri: d.book_thumb_uri,
                signType: d.sign_type,
                signStatus: d.sign_status,
                publishStatus: d.publish_status,
                displayStatus: d.display_status,
                latestVersion: d.latest_version,
                auditFailInfos: d.audit_fail_infos,
            },
        };
    }
    catch (e) {
        await browser.close().catch(() => { });
        return { ok: false, message: `读取短故事详情失败: ${(e as Error).message}` };
    }
}
export async function listShortCategories(opts: {
    headless?: boolean;
} = {}): Promise<{
    ok: boolean;
    message: string;
    categories?: {
        categoryId: number;
        name: string;
        label?: string;
    }[];
}> {
    const readiness = automationReadiness();
    if (!readiness.ready)
        return { ok: false, message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    const session = await openSession(opts.headless ?? true, "/main/writer/short-manage");
    if (isError(session))
        return { ok: false, message: session.error };
    const { browser, page } = session;
    try {
        const data = await apiGet(page, API.shortArticleCategoryV1, {});
        await browser.close().catch(() => { });
        if (data?.code !== 0)
            return { ok: false, message: `接口返回 code=${data?.code} message=${data?.message}` };
        const categories = (data?.data?.category_list ?? []).map((c: any) => ({
            categoryId: Number(c.category_id),
            name: String(c.name ?? ""),
            label: c.label,
        }));
        return { ok: true, message: `共 ${categories.length} 个分类`, categories };
    }
    catch (e) {
        await browser.close().catch(() => { });
        return { ok: false, message: `读取分类失败: ${(e as Error).message}` };
    }
}
export const SHORT_SELECTORS = {
    title: [
        'textarea.serial-textarea[placeholder="请输入短故事名称"]',
        'textarea[placeholder*="短故事名称"]',
        "textarea.byte-textarea",
    ],
    body: [
        '.syl-editor-container [contenteditable="true"]',
        '.ProseMirror[contenteditable="true"]',
        ".syl-editor-container .ProseMirror:not(.payNode-helper-content)",
        ".serial-editor-content .ProseMirror",
    ],
    saveDraft: [".short-publish-save", 'button[data-apm-action="core_chain_short_story_save_draft"]'],
    next: [".publish-short-header .btn-primary-varian"],
} as const;
export const SHORT_PUBLISH_SELECTORS = {
    coverTrigger: '[class*="publish-short-config-book-cover-content"]',
    coverSet: '[class*="publish-short-config-book-cover-content-notempty"]',
    drawerTab: '[role="tab"]',
    paySetup: ".publish-short-config-pay-location-noicon",
    useAi: '[class*="publish_short_config_use_ai"]',
    licenseDesc: ".publish-short-config-checkdesc",
} as const;
const AUTH_WALL_TEXT_RE = /(请|需|未|先)[^。！？\n]{0,10}(实名|人脸|身份验证|身份认证)/;
async function authWallText(page: any): Promise<string | null> {
    return page
        .evaluate((src: string) => {
        const rx = new RegExp(src);
        const modals = Array.from(document.querySelectorAll(".arco-modal, .arco-drawer")) as any[];
        for (const m of modals) {
            if (m.getBoundingClientRect().height <= 40)
                continue;
            const t = (m.innerText || "").replace(/\s+/g, " ").trim();
            if (!t || /提交确认/.test(t))
                continue;
            if (rx.test(t))
                return t.slice(0, 120);
        }
        let text = document.body?.innerText || "";
        for (const ed of Array.from(document.querySelectorAll(".syl-editor-container, .serial-editor-content")) as any[]) {
            const et = ed.innerText || "";
            if (et)
                text = text.split(et).join("\n");
        }
        text = text.replace(/\s+/g, " ");
        const hit = text.match(rx);
        if (!hit)
            return null;
        const i = text.indexOf(hit[0]);
        return text.slice(Math.max(0, i - 30), i + 90);
    }, AUTH_WALL_TEXT_RE.source)
        .catch(() => null);
}
export const SHORT_CATEGORY_SELECTORS = {
    trigger: ".publish-short-category-select",
    pop: ".publish-short-category-select-pop",
    label: ".publish-short-category-select-label",
    itemList: ".publish-short-category-select-item-list",
    item: ".publish-short-category-select-item",
    selectedList: ".publish-short-category-select-selected-list",
    selected: ".publish-short-category-select-selected",
} as const;
async function firstMatch(page: any, selectors: readonly string[]): Promise<string | null> {
    for (const sel of selectors) {
        try {
            if (await page.$(sel))
                return sel;
        }
        catch {
        }
    }
    return null;
}
export async function currentShortItemId(page: any): Promise<string | null> {
    const m = String(page.url()).match(/publish-short\/(\d+)/);
    return m ? m[1] : null;
}
async function waitForItemId(page: any, timeoutMs = 25000): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const id = await currentShortItemId(page);
        if (id)
            return id;
        await sleep(700);
    }
    return await currentShortItemId(page);
}
async function fillTitle(page: any, sel: string, title: string): Promise<void> {
    await page.click(sel, { clickCount: 3 }).catch(() => { });
    await page.evaluate((s: string, v: string) => {
        const el: any = document.querySelector(s);
        if (!el)
            return;
        const proto = (window as any).HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter)
            setter.call(el, v);
        else
            el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
    }, sel, title);
}
async function fillBody(page: any, sel: string, text: string): Promise<void> {
    await page.click(sel, { clickCount: 2 }).catch(() => { });
    await page.evaluate((s: string, value: string) => {
        const el: any = document.querySelector(s);
        if (!el)
            return;
        el.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
        value.replace(/\r\n?/g, "\n").split("\n").forEach((line: string, i: number) => {
            if (i > 0)
                document.execCommand("insertParagraph", false, null);
            if (line)
                document.execCommand("insertText", false, line);
        });
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }, sel, text);
}
async function clickButtonByText(page: any, label: string): Promise<boolean> {
    const found = await page
        .evaluate((t: string) => {
        const btn = (Array.from(document.querySelectorAll("button")) as any[]).find((b: any) => b.offsetParent !== null && (b.textContent || "").trim() === t) as any;
        if (!btn)
            return false;
        btn.setAttribute("data-autopub-target", "1");
        return true;
    }, label)
        .catch(() => false);
    if (!found)
        return false;
    await page.click('[data-autopub-target="1"]').catch(() => { });
    await page
        .evaluate(() => document.querySelector('[data-autopub-target="1"]')?.removeAttribute("data-autopub-target"))
        .catch(() => { });
    return true;
}
const AI_YES_LABELS = ["是", "AI生成", "AI 生成", "含AI生成内容", "AI创作", "AI辅助创作", "人工智能生成"];
const AI_NO_LABELS = ["否", "非AI生成", "不是AI生成", "本人原创", "人工创作"];
async function chooseUseAI(page: any, useAI: boolean): Promise<boolean> {
    const labels = useAI ? AI_YES_LABELS : AI_NO_LABELS;
    const clicked = await page
        .evaluate((want: string[], sel: string) => {
        const norm = (s: string) => s.replace(/\s+/g, "");
        const boxes = Array.from(document.querySelectorAll(sel)) as any[];
        const box = boxes.find((b) => b.querySelectorAll("label").length > 0);
        if (!box)
            return null;
        const las = Array.from(box.querySelectorAll("label")) as any[];
        let lab: any = null;
        for (const t of want) {
            lab =
                las.find((l: any) => norm(l.textContent || "") === norm(t)) ||
                    las.find((l: any) => norm(t).length > 1 && norm(l.textContent || "").includes(norm(t)));
            if (lab)
                break;
        }
        if (!lab)
            return null;
        const input = lab.querySelector('input[type="radio"],input[type="checkbox"]');
        if (input)
            (input as any).click();
        lab.click();
        return norm(lab.textContent || "");
    }, labels, SHORT_PUBLISH_SELECTORS.useAi)
        .catch(() => null);
    if (!clicked)
        return false;
    await sleep(600);
    return page
        .evaluate((sel: string) => {
        const box = document.querySelector(sel);
        if (!box)
            return false;
        return (Array.from(box.querySelectorAll("label.arco-radio")) as any[]).some((l: any) => (l.querySelector("input") as any)?.checked);
    }, SHORT_PUBLISH_SELECTORS.useAi)
        .catch(() => false);
}
function categoryNames(requested?: string[], mainCategory?: string): string[] {
    const list = (requested ?? []).map((s) => s.trim()).filter(Boolean);
    const main = (mainCategory ?? "").trim();
    if (main && !list.includes(main))
        list.unshift(main);
    return list;
}
function mainCategoryHint(names: string[], mainOptions: string[]): string {
    const opts = mainOptions.slice(0, 12).join("/");
    return (`缺少主分类：传入的「${names.join("、")}」都不属于平台「主分类」组（发布硬要求，主分类必选，附加分类不能代替）。` +
        (opts ? `主分类可选：${opts}${mainOptions.length > 12 ? "…" : ""}。` : "请从后台作品分类浮层的「主分类」组里选一个。"));
}
async function selectCategories(page: any, names: string[]): Promise<{
    applied: string[];
    missing: string[];
    mainApplied: boolean;
    mainOptions: string[];
}> {
    const applied: string[] = [];
    const missing: string[] = [];
    const groupOf = new Map<string, number>();
    let mainIdx = 0;
    let mainOptions: string[] = [];
    if (!names.length)
        return { applied, missing, mainApplied: false, mainOptions };
    const S = SHORT_CATEGORY_SELECTORS;
    const ensurePop = async (): Promise<boolean> => {
        if (await page.$(S.pop))
            return true;
        await page.click(S.trigger).catch(() => { });
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            if (await page.$(S.pop))
                return true;
            await sleep(300);
        }
        return false;
    };
    if (!(await ensurePop())) {
        logger.warn("[selectCategories] 未能打开作品分类浮层");
        return { applied, missing: [...names], mainApplied: false, mainOptions };
    }
    const meta = await page
        .evaluate((s: any) => {
        const labels = Array.from(document.querySelectorAll(s.label)) as any[];
        const idx = labels.findIndex((l: any) => (l.textContent || "").includes("主分类"));
        const list = document.querySelectorAll(s.itemList)[idx >= 0 ? idx : 0] as any;
        const opts = list
            ? (Array.from(list.querySelectorAll(s.item)) as any[]).map((e: any) => (e.textContent || "").trim()).filter(Boolean)
            : [];
        return { mainIdx: idx >= 0 ? idx : 0, mainOptions: opts.slice(0, 40) };
    }, S)
        .catch(() => ({ mainIdx: 0, mainOptions: [] as string[] }));
    mainIdx = meta.mainIdx;
    mainOptions = meta.mainOptions;
    for (const name of names) {
        if (!(await ensurePop())) {
            missing.push(name);
            continue;
        }
        const groupIdx: number = await page
            .evaluate((t: string, s: any) => {
            const lists = Array.from(document.querySelectorAll(s.itemList)) as any[];
            for (let i = 0; i < lists.length; i++) {
                const hit = (Array.from(lists[i].querySelectorAll(s.item)) as any[]).some((e: any) => (e.textContent || "").trim() === t);
                if (hit)
                    return i;
            }
            return -1;
        }, name, S)
            .catch(() => -1);
        if (groupIdx < 0) {
            missing.push(name);
            continue;
        }
        groupOf.set(name, groupIdx);
        const labeled: boolean = await page
            .evaluate((i: number, s: any) => {
            const labels = document.querySelectorAll(s.label);
            const lab = labels[i];
            if (!lab)
                return false;
            lab.setAttribute("data-autopub-catlabel", "1");
            return true;
        }, groupIdx, S)
            .catch(() => false);
        if (!labeled) {
            missing.push(name);
            continue;
        }
        await page.hover('[data-autopub-catlabel="1"]').catch(() => { });
        await sleep(250);
        await page.click('[data-autopub-catlabel="1"]').catch(() => { });
        await page
            .evaluate(() => document.querySelector('[data-autopub-catlabel="1"]')?.removeAttribute("data-autopub-catlabel"))
            .catch(() => { });
        await sleep(500);
        const findItem = () => page
            .evaluate((t: string, s: any, i: number) => {
            const lists = document.querySelectorAll(s.itemList);
            const list = lists[i];
            if (!list)
                return false;
            const el = (Array.from(list.querySelectorAll(s.item)) as any[]).find((e: any) => (e.textContent || "").trim() === t);
            if (!el || el.offsetParent === null)
                return false;
            el.setAttribute("data-autopub-cat", "1");
            return true;
        }, name, S, groupIdx)
            .catch(() => false);
        let ready: boolean = await findItem();
        if (!ready) {
            await sleep(700);
            ready = await findItem();
        }
        if (!ready) {
            logger.warn(`[selectCategories] 组 #${groupIdx} 内未找到可见选项「${name}」`);
            missing.push(name);
            continue;
        }
        await page.click('[data-autopub-cat="1"]').catch(() => { });
        await page
            .evaluate(() => document.querySelector('[data-autopub-cat="1"]')?.removeAttribute("data-autopub-cat"))
            .catch(() => { });
        await sleep(400);
    }
    const selectedText: string = await page
        .evaluate((s: any) => (document.querySelector(s.selectedList)?.textContent || "").trim(), S)
        .catch(() => "");
    await closeCategoryPop(page);
    await sleep(300);
    for (const name of names) {
        if (selectedText.includes(name))
            applied.push(name);
        else
            missing.push(name);
    }
    const missingNames = [...new Set(missing)];
    if (applied.length)
        logger.info(`[selectCategories] 已选分类：${applied.join("、")}`);
    if (missingNames.length)
        logger.warn(`[selectCategories] 未选中：${missingNames.join("、")}（已选列表=${selectedText}）`);
    const mainApplied = applied.some((n) => groupOf.get(n) === mainIdx);
    if (!mainApplied) {
        logger.warn(`[selectCategories] 未选中主分类（主分类组可选：${mainOptions.slice(0, 12).join("/") || "未知"}）`);
    }
    const pruned = await pruneCategories(page, names);
    if (pruned.length)
        logger.info(`[selectCategories] 已移除多余分类：${pruned.join("、")}`);
    return { applied, missing: missingNames, mainApplied, mainOptions };
}
async function closeCategoryPop(page: any): Promise<boolean> {
    const opened = () => page
        .evaluate((s: string) => {
        const p: any = document.querySelector(s);
        return !!p && p.getBoundingClientRect().height > 0;
    }, SHORT_CATEGORY_SELECTORS.pop)
        .catch(() => false);
    if (!(await opened()))
        return true;
    await page.keyboard.press("Escape").catch(() => { });
    await sleep(300);
    if (await opened())
        await page.mouse.click(20, 300).catch(() => { });
    await sleep(500);
    const closed = !(await opened());
    if (!closed)
        logger.warn("[selectCategories] 分类浮层未能关闭（会遮挡后续真实鼠标点击）");
    return closed;
}
async function pruneCategories(page: any, keep: string[]): Promise<string[]> {
    const removed: string[] = [];
    const selectedNow = () => page
        .evaluate((s: any) => (document.querySelector(s.selectedList)?.textContent || "").trim(), SHORT_CATEGORY_SELECTORS)
        .catch(() => "");
    if (!(await closeCategoryPop(page)))
        return removed;
    for (let guard = 0; guard < 4; guard++) {
        const target: string | null = await page
            .evaluate((names: string[], sel: string) => {
            const tags = Array.from(document.querySelectorAll(sel)) as any[];
            for (const t of tags) {
                const name = (t.textContent || "").trim();
                if (!name || names.includes(name))
                    continue;
                const svg = t.querySelector("svg") as any;
                if (!svg || svg.getBoundingClientRect().height <= 0)
                    continue;
                svg.setAttribute("data-autopub-catclear", "1");
                return name;
            }
            return null;
        }, keep, SHORT_CATEGORY_SELECTORS.selected)
            .catch(() => null);
        if (!target)
            break;
        const clicked = await realClick(page, '[data-autopub-catclear="1"]');
        await page
            .evaluate(() => document.querySelector('[data-autopub-catclear="1"]')?.removeAttribute("data-autopub-catclear"))
            .catch(() => { });
        await sleep(600);
        if (!clicked || (await selectedNow()).includes(target)) {
            logger.warn(`[selectCategories] 分类「${target}」未能移除（点击未生效），请在后台手动核对`);
            break;
        }
        removed.push(target);
    }
    return removed;
}
export interface CreateShortStoryOptions {
    title: string;
    content?: string;
    categories?: string[];
    mainCategory?: string;
    coverPath?: string;
    useAI?: boolean;
    dividedChapters?: boolean;
    confirm?: boolean;
    headless?: boolean;
}
export interface ShortStoryResult {
    ok: boolean;
    action: "preview-local" | "filled-not-submitted" | "draft-saved" | "updated" | "saved-unverified" | "published" | "aborted" | "error";
    message: string;
    itemId?: string;
    title?: string;
    wordCount?: number;
    url?: string;
    screenshotPath?: string;
    warnings?: string[];
    verification?: {
        text: "matched" | "not-requested" | "mismatch";
        metadata: "unverified" | "not-requested";
    };
}
export function validateShortContent(content: string): {
    wordCount: number;
    warnings: string[];
} {
    const plain = toPlainText(content || "", { preserveBlankLines: true });
    const wordCount = Array.from(plain.replace(/\s/g, "")).length;
    const warnings: string[] = [];
    if (plain.length === 0)
        warnings.push("未提供正文（仅保存作品外壳/标题）。");
    else if (wordCount < SHORT_MIN_WORDS) {
        warnings.push(`正文字数 ${wordCount} 低于短故事下限 ${SHORT_MIN_WORDS}，可存草稿但发布会被拦截。`);
    }
    else if (wordCount > SHORT_MAX_WORDS) {
        warnings.push(`正文字数 ${wordCount} 超过短故事上限 ${SHORT_MAX_WORDS}，发布会被拦截。`);
    }
    return { wordCount, warnings };
}
export async function createShortStory(opts: CreateShortStoryOptions): Promise<ShortStoryResult> {
    if (!opts.title?.trim())
        return { ok: false, action: "aborted", message: "缺少短故事名称 title。" };
    const { wordCount, warnings } = validateShortContent(opts.content ?? "");
    if (!opts.confirm) {
        return {
            ok: true, action: "preview-local", title: opts.title.trim(), wordCount, warnings,
            message: "本地预览完成，未连接浏览器、未创建空草稿。confirm=true 才新建并保存草稿。",
        };
    }
    const readiness = automationReadiness();
    if (!readiness.ready) {
        return { ok: false, action: "aborted", message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    }
    const session = await openSession(opts.headless ?? true, "/main/writer/publish-short/?enter_from=NEWCHAPTER_1");
    if (isError(session))
        return { ok: false, action: "aborted", message: session.error };
    const { browser, page } = session;
    try {
        const itemId = await waitForItemId(page);
        if (!itemId) {
            const file = await shot(page, "short-itemid-missing");
            return {
                ok: false,
                action: "aborted",
                message: "未能在 /publish-short/ 上拿到 item_id（番茄未自动建草稿或改版）。请检查 cookies 与后台页面。",
                url: page.url(),
                screenshotPath: file,
            };
        }
        logger.info(`[createShortStory] item_id=${itemId}`);
        const titleSel = await firstMatch(page, SHORT_SELECTORS.title);
        const bodySel = await firstMatch(page, SHORT_SELECTORS.body);
        if (!titleSel) {
            const file = await shot(page, "short-title-missing");
            return { ok: false, action: "aborted", message: "未找到短故事名称输入框。", url: page.url(), screenshotPath: file, itemId };
        }
        await fillTitle(page, titleSel, opts.title.trim());
        if (opts.content && bodySel) {
            await fillBody(page, bodySel, toPlainText(opts.content, { preserveBlankLines: true }));
        }
        await sleep(800);
        if (typeof opts.useAI === "boolean")
            await chooseUseAI(page, opts.useAI);
        const catNames = categoryNames(opts.categories, opts.mainCategory);
        if (catNames.length) {
            const cat = await selectCategories(page, catNames);
            if (cat.missing.length)
                warnings.push(`未找到分类：${cat.missing.join("、")}`);
            if (!cat.mainApplied)
                warnings.push(mainCategoryHint(catNames, cat.mainOptions));
            if (cat.applied.length)
                logger.info(`[createShortStory] 已选分类：${cat.applied.join("、")}`);
        }
        if (opts.coverPath) {
            const okCover = await uploadCover(page, opts.coverPath);
            if (!okCover)
                warnings.push("封面文件未能上传（未找到上传入口或格式不支持）。");
        }
        await sleep(500);
        const saved = await saveDraft(page);
        const file = await shot(page, saved ? "short-draft-saved" : "short-draft-save-failed");
        if (!saved) {
            return {
                ok: false,
                action: "error",
                message: "未能点到「存草稿」按钮（可能页面结构变化）。草稿 item 可能已存在，请到草稿箱核对。",
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        await sleep(1500);
        const verify = await verifyDraft(page, itemId, { title: opts.title.trim(), content: opts.content === undefined ? undefined : toPlainText(opts.content, { preserveBlankLines: true }) });
        return {
            ok: verify.saved,
            action: verify.saved ? "draft-saved" : "error",
            message: verify.saved
                ? `已保存短故事草稿 item_id=${itemId}（已复核标题与完整正文），正文字数≈${wordCount}。`
                : `草稿 item_id=${itemId} 已尝试保存但核验失败：${verify.problems.join("；")}。请核查已有草稿，勿重复新建。`,
            itemId,
            title: opts.title.trim(),
            wordCount,
            url: page.url(),
            screenshotPath: file,
            warnings: warnings.length ? warnings : undefined,
        };
    }
    catch (e) {
        await browser.close().catch(() => { });
        logger.error(`新建短故事异常: ${(e as Error).message}`);
        return { ok: false, action: "error", message: `新建短故事失败: ${(e as Error).message}` };
    }
    finally {
        await browser.close().catch(() => { });
    }
}
export interface UpdateShortStoryOptions {
    itemId: string;
    title?: string;
    content?: string;
    categories?: string[];
    mainCategory?: string;
    coverPath?: string;
    useAI?: boolean;
    confirm?: boolean;
    headless?: boolean;
}
export async function updateShortStory(opts: UpdateShortStoryOptions): Promise<ShortStoryResult> {
    const readiness = automationReadiness();
    if (!readiness.ready) {
        return { ok: false, action: "aborted", message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    }
    if (!opts.itemId)
        return { ok: false, action: "aborted", message: "缺少 item_id。" };
    const hasField = [opts.title, opts.content].some((v) => v !== undefined && v.trim() !== "") ||
        (opts.categories?.length ?? 0) > 0 ||
        !!opts.coverPath ||
        typeof opts.useAI === "boolean";
    if (opts.confirm && !hasField) {
        return {
            ok: false,
            action: "aborted",
            message: "至少要提供一个要修改的字段（title / content / categories / cover_path / use_ai）。",
        };
    }
    const { wordCount, warnings } = opts.content
        ? validateShortContent(opts.content)
        : { wordCount: 0, warnings: [] as string[] };
    const session = await openSession(opts.headless ?? true, shortPublishUrl(opts.itemId));
    if (isError(session))
        return { ok: false, action: "aborted", message: session.error };
    const { browser, page } = session;
    try {
        const titleSel = await firstMatch(page, SHORT_SELECTORS.title);
        if (!titleSel) {
            const file = await shot(page, "short-update-editor-missing");
            return {
                ok: false,
                action: "aborted",
                message: `未找到短故事编辑页（item_id=${opts.itemId} 可能不存在、或该作品已发布不可编辑）。`,
                itemId: opts.itemId,
                url: page.url(),
                screenshotPath: file,
            };
        }
        await sleep(800);
        if (!opts.confirm) {
            const snap = await readShortInPage(page, opts.itemId);
            if (snap.error)
                return { ok: false, action: "error", itemId: opts.itemId, message: `读取草稿失败：${snap.error}` };
            const file = await shot(page, "short-update-preview");
            return {
                ok: true,
                action: "filled-not-submitted",
                message: `已打开 item_id=${opts.itemId} 的编辑页读现状（confirm=false，**未做任何填充**）：` +
                    `当前标题《${snap.title}》，正文≈${snap.wordNumber} 字。确认后传 confirm=true 保存修改（只存草稿，不发布）。`,
                itemId: opts.itemId,
                wordCount: snap.wordNumber,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        if (opts.title?.trim())
            await fillTitle(page, titleSel, opts.title.trim());
        if (opts.content) {
            const bodySel = await firstMatch(page, SHORT_SELECTORS.body);
            if (!bodySel)
                warnings.push("未找到正文编辑区，正文未改动。");
            else
                await fillBody(page, bodySel, toPlainText(opts.content, { preserveBlankLines: true }));
        }
        await sleep(800);
        const applicationErrors: string[] = [];
        if (typeof opts.useAI === "boolean" && !(await chooseUseAI(page, opts.useAI)))
            applicationErrors.push("未能选择是否使用AI");
        const catNames = categoryNames(opts.categories, opts.mainCategory);
        if (catNames.length) {
            const cat = await selectCategories(page, catNames);
            if (cat.missing.length)
                applicationErrors.push(`未找到分类：${cat.missing.join("、")}`);
            if (!cat.mainApplied)
                warnings.push(mainCategoryHint(catNames, cat.mainOptions));
            if (cat.applied.length)
                logger.info(`[updateShortStory] 已选分类：${cat.applied.join("、")}`);
        }
        if (opts.coverPath && !(await uploadCover(page, opts.coverPath))) {
            applicationErrors.push("封面文件未能上传（未找到上传入口或格式不支持）。");
        }
        if (applicationErrors.length)
            return {
                ok: false, action: "error", itemId: opts.itemId,
                message: `item_id=${opts.itemId} 请求字段未全部应用：${applicationErrors.join("；")}。未点击存草稿，请核查编辑器现状。`,
                screenshotPath: await shot(page, "short-update-apply-failed"), warnings,
            };
        const saved = await saveDraft(page);
        const file = await shot(page, saved ? "short-update-saved" : "short-update-save-failed");
        if (!saved) {
            return {
                ok: false,
                action: "error",
                message: "未能点到「存草稿」按钮（可能页面结构变化或该作品不可编辑）。请到作者后台核对。",
                itemId: opts.itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        await sleep(1500);
        const verify = await verifyDraft(page, opts.itemId, {
            title: opts.title?.trim() || undefined,
            content: opts.content ? toPlainText(opts.content, { preserveBlankLines: true }) : undefined,
        });
        const snap = verify.snap;
        const metadataRequested = typeof opts.useAI === "boolean" || catNames.length > 0 || !!opts.coverPath;
        const textRequested = !!opts.title?.trim() || !!opts.content;
        return {
            ok: verify.saved,
            action: verify.saved ? (metadataRequested ? "saved-unverified" : "updated") : "error",
            message: verify.saved ?
                `item_id=${opts.itemId} 已完成存草稿操作，未发布。` +
                    (textRequested ? `已复核传入的标题/完整正文，当前标题《${snap.title}》，正文≈${snap.wordNumber} 字。` : "本次未传标题/正文。") +
                    (metadataRequested ? "分类/封面/AI选项的持久化未核验，状态为 saved-unverified，请重新打开后台核查；AI选项可能不随草稿保存。" : "")
                : `草稿 item_id=${opts.itemId} 已尝试保存但核验失败：${verify.problems.join("；")}。请核查，不自动重试。`,
            verification: { text: !verify.saved ? "mismatch" : textRequested ? "matched" : "not-requested", metadata: metadataRequested ? "unverified" : "not-requested" },
            itemId: opts.itemId,
            title: snap.title,
            wordCount: snap.wordNumber,
            url: page.url(),
            screenshotPath: file,
            warnings: warnings.length ? warnings : undefined,
        };
    }
    catch (e) {
        await browser.close().catch(() => { });
        logger.error(`修改短故事异常: ${(e as Error).message}`);
        return { ok: false, action: "error", message: `修改短故事失败: ${(e as Error).message}` };
    }
    finally {
        await browser.close().catch(() => { });
    }
}
async function jsClickButton(page: any, label: string): Promise<boolean> {
    return page
        .evaluate((t: string) => {
        const b = (Array.from(document.querySelectorAll("button")) as any[]).find((x: any) => (x.textContent || "").trim() === t && x.getBoundingClientRect().height >= 0);
        if (!b)
            return false;
        b.scrollIntoView({ block: "center" });
        b.click();
        return true;
    }, label)
        .catch(() => false);
}
async function waitFor<T>(cond: () => Promise<T | null | false>, timeoutMs = 15000, stepMs = 800): Promise<T | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const v = await cond().catch(() => null);
        if (v)
            return v as T;
        await sleep(stepMs);
    }
    return null;
}
async function realClick(page: any, selector: string): Promise<boolean> {
    const handle = await page.$(selector).catch(() => null);
    if (!handle)
        return false;
    await handle.evaluate((el: any) => el.scrollIntoView({ block: "center" })).catch(() => { });
    await sleep(200);
    const box = await handle.boundingBox().catch(() => null);
    if (!box)
        return false;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return true;
}
async function realClickText(page: any, text: string): Promise<boolean> {
    const marked = await page
        .evaluate((t: string) => {
        const el = (Array.from(document.querySelectorAll("button, span, div")) as any[]).find((x: any) => (x.textContent || "").trim() === t && x.offsetParent !== null) as any;
        if (!el)
            return false;
        el.setAttribute("data-autopub-realtarget", "1");
        return true;
    }, text)
        .catch(() => false);
    if (!marked)
        return false;
    const clicked = await realClick(page, '[data-autopub-realtarget="1"]');
    await page
        .evaluate(() => document.querySelector('[data-autopub-realtarget="1"]')?.removeAttribute("data-autopub-realtarget"))
        .catch(() => { });
    return clicked;
}
async function readToasts(page: any): Promise<string[]> {
    return page
        .evaluate(() => (Array.from(document.querySelectorAll('[class*="arco-message"], [class*="arco-alert"]')) as any[])
        .map((e: any) => (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100))
        .filter(Boolean))
        .catch(() => []);
}
async function readContinuePublishTip(page: any): Promise<string> {
    return page
        .evaluate(() => {
        const modals = (Array.from(document.querySelectorAll(".arco-modal, .arco-drawer, [role=dialog]")) as any[])
            .filter((m: any) => m.getBoundingClientRect().height > 40)
            .map((m: any) => (m.innerText || "").replace(/\s+/g, " ").trim())
            .filter((t: string) => t.includes("继续发布"));
        return modals.length ? modals[0].slice(0, 200) : "";
    })
        .catch(() => "");
}
async function acceptPublishTerms(page: any): Promise<boolean> {
    const isChecked = () => page.evaluate(() => !!document.querySelector("label.arco-checkbox input")?.checked).catch(() => false);
    if (await isChecked())
        return true;
    const licenseModalUp = () => page
        .evaluate(() => Array.from(document.querySelectorAll(".arco-modal")).some((m: any) => m.getBoundingClientRect().height > 40 && /发布事项/.test(m.textContent || "")))
        .catch(() => false);
    for (let attempt = 1; attempt <= 3; attempt++) {
        await closeCategoryPop(page);
        await realClick(page, SHORT_PUBLISH_SELECTORS.licenseDesc);
        if (!(await waitFor(licenseModalUp, 8000, 600))) {
            logger.warn(`[short] 第 ${attempt} 次点「发布协议」文字没弹出「短故事发布事项」（疑似被浮层遮挡）`);
            continue;
        }
        await waitFor(() => realClickText(page, "我已阅读并同意"), 8000, 600);
        await sleep(1200);
        if (await isChecked())
            return true;
        logger.warn(`[short] 第 ${attempt} 次勾「发布协议」未生效`);
    }
    return false;
}
async function ensurePayNode(page: any): Promise<boolean> {
    const hasNode = () => page
        .evaluate(() => {
        try {
            return window.adapter.getExistNodes("payNode").length > 0;
        }
        catch {
            return false;
        }
    })
        .catch(() => false);
    if (await hasNode())
        return true;
    await clickButtonByText(page, "去设置");
    return !!(await waitFor(hasNode, 15000, 800));
}
async function coverIsSet(page: any): Promise<boolean> {
    return page.evaluate((sel: string) => !!document.querySelector(sel), SHORT_PUBLISH_SELECTORS.coverSet).catch(() => false);
}
async function readPublishGates(page: any): Promise<{
    cover: boolean;
    useAI: boolean;
    license: boolean;
    payNode: boolean;
}> {
    return page
        .evaluate((sel: {
        coverSet: string;
        useAi: string;
    }) => {
        const box = document.querySelector(sel.useAi);
        let payNode = false;
        try {
            payNode = window.adapter.getExistNodes("payNode").length > 0;
        }
        catch {
            payNode = false;
        }
        return {
            cover: !!document.querySelector(sel.coverSet),
            useAI: !!(box && (Array.from(box.querySelectorAll("label.arco-radio")) as any[]).some((l: any) => (l.querySelector("input") as any)?.checked)),
            license: !!document.querySelector("label.arco-checkbox input")?.checked,
            payNode,
        };
    }, { coverSet: SHORT_PUBLISH_SELECTORS.coverSet, useAi: SHORT_PUBLISH_SELECTORS.useAi })
        .catch(() => ({ cover: false, useAI: false, license: false, payNode: false }));
}
async function clickConfirmModalOk(page: any): Promise<boolean> {
    return !!(await waitFor(() => page.evaluate(() => {
        const m = (Array.from(document.querySelectorAll(".arco-modal")) as any[]).find((x: any) => x.getBoundingClientRect().height > 40 && /提交确认/.test(x.textContent || "")) as any;
        if (!m)
            return false;
        const visible = (bs: any[]) => bs.filter((b: any) => b.getBoundingClientRect().height > 0);
        const footer = visible(Array.from(m.querySelectorAll(".arco-modal-footer button")) as any[]);
        const pool = footer.length ? footer : visible(Array.from(m.querySelectorAll("button")) as any[]);
        const ok = pool.find((b: any) => /确定|确认|提交|发布/.test(b.textContent || "")) || pool[pool.length - 1];
        if (!ok)
            return false;
        ok.click();
        return true;
    }), 20000, 1200));
}
async function saveDraft(page: any): Promise<boolean> {
    const saveSel = await firstMatch(page, SHORT_SELECTORS.saveDraft);
    const done = new Promise<boolean>((resolve) => {
        const onResp = async (resp: any) => {
            if (resp.url().includes(API.shortArticleCover) && resp.request().method() === "POST") {
                try {
                    const j = JSON.parse(await resp.text());
                    resolve(j?.code === 0);
                }
                catch {
                    resolve(true);
                }
            }
        };
        page.on("response", onResp);
        setTimeout(() => resolve(false), 20000);
    });
    if (saveSel)
        await page
            .evaluate((sel: string) => {
            const el = document.querySelector(sel);
            if (el) {
                (el as any).scrollIntoView({ block: "center" });
                (el as any).click();
                return true;
            }
            return false;
        }, saveSel)
            .catch(() => { });
    else
        await jsClickButton(page, "存草稿");
    const ok = await done;
    await sleep(1000);
    return ok;
}
async function readShortInPage(page: any, itemId: string): Promise<{
    title: string;
    content: string;
    wordNumber: number;
    publishStatus: number;
    displayStatus: number;
    bookThumbUri: string;
    error?: string;
}> {
    return page
        .evaluate(async (id: string) => {
        try {
            const r = await fetch(`https://fanqienovel.com/api/author/short_article/edit/v1/?aid=2503&app_name=muye_novel&item_id=${id}&image_fmt_list=270x480`, { credentials: "include" });
            const j: any = await r.json();
            if (j?.code !== 0 || !j?.data)
                throw new Error(`详情接口 code=${j?.code}：${j?.message ?? "缺少 data"}`);
            return {
                title: String(j?.data?.multi_title ?? ""),
                content: String(j?.data?.content ?? ""),
                wordNumber: Number(j?.data?.word_number ?? 0),
                publishStatus: Number(j?.data?.publish_status ?? 0),
                displayStatus: Number(j?.data?.display_status ?? 0),
                bookThumbUri: String(j?.data?.book_thumb_uri ?? ""),
            };
        }
        catch (e) {
            return { title: "", content: "", wordNumber: 0, publishStatus: 0, displayStatus: 0, bookThumbUri: "", error: String(e) };
        }
    }, itemId)
        .catch((e: unknown) => ({ title: "", content: "", wordNumber: 0, publishStatus: 0, displayStatus: 0, bookThumbUri: "", error: String(e) }));
}
async function verifyDraft(page: any, itemId: string, expected: {
    title?: string;
    content?: string;
}) {
    const snap = await readShortInPage(page, itemId);
    const problems = snap.error ? [snap.error] : compareDraft(snap, expected);
    return { saved: problems.length === 0, problems, snap };
}
async function uploadCover(page: any, filePath: string): Promise<boolean> {
    try {
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (await coverIsSet(page))
                return true;
            await page
                .evaluate((sel: string) => {
                const el = document.querySelector(sel);
                if (el) {
                    (el as any).scrollIntoView({ block: "center" });
                    (el as any).click();
                }
            }, SHORT_PUBLISH_SELECTORS.coverTrigger)
                .catch(() => { });
            const tabOk = await waitFor(() => page.evaluate((sel: string) => {
                const t = (Array.from(document.querySelectorAll(sel)) as any[]).find((e: any) => /本地上传/.test(e.textContent || ""));
                if (!t)
                    return false;
                t.setAttribute("data-autopub-cover-tab", "1");
                return true;
            }, SHORT_PUBLISH_SELECTORS.drawerTab), 12000, 1000);
            if (!tabOk)
                continue;
            await page.click('[data-autopub-cover-tab="1"]').catch(() => { });
            const hasInput = await waitFor(async () => (await page.$('input[type="file"]')) !== null, 15000, 1000);
            if (!hasInput)
                continue;
            await waitFor(() => page.evaluate(() => {
                const lab = (Array.from(document.querySelectorAll("label.arco-checkbox")) as any[]).find((l: any) => /我已阅读并同意/.test(l.textContent || ""));
                if (!lab)
                    return false;
                const input = lab.querySelector("input");
                if (input && !input.checked)
                    input.click();
                return !!input?.checked;
            }), 12000, 1000);
            const inputs = await page.$$('input[type="file"]');
            if (!inputs.length)
                continue;
            await inputs[0].uploadFile(filePath);
            const uploaded = await waitFor(() => jsClickButton(page, "确认上传"), 30000, 1500);
            if (!uploaded)
                continue;
            await sleep(4000);
            if (await coverIsSet(page))
                return true;
            await jsClickButton(page, "确定");
            await sleep(3000);
            if (await coverIsSet(page))
                return true;
            logger.warn(`[short] 封面第 ${attempt} 次上传后仍未读到已设置状态，重试`);
        }
        return false;
    }
    catch (e) {
        logger.warn(`上传封面失败: ${(e as Error).message}`);
        return false;
    }
}
export interface PublishShortStoryOptions {
    itemId?: string;
    title?: string;
    content?: string;
    categories?: string[];
    mainCategory?: string;
    coverPath?: string;
    signType?: number;
    dividedChapters?: boolean;
    useAI?: boolean;
    confirm?: boolean;
    headless?: boolean;
}
export async function publishShortStory(opts: PublishShortStoryOptions): Promise<ShortStoryResult> {
    if (!opts.itemId && !opts.title?.trim()) {
        return { ok: false, action: "aborted", message: "需提供 item_id，或 title（+content）以新建并发布。" };
    }
    if (!opts.confirm) {
        const { wordCount, warnings } = validateShortContent(opts.content ?? "");
        return {
            ok: true, action: "preview-local", itemId: opts.itemId, title: opts.title,
            wordCount: opts.content ? wordCount : undefined,
            warnings: opts.content ? warnings : undefined,
            message: "本地预览完成，未连接浏览器、未填表或创建草稿。已有草稿现状可用 get_short_story_tomato 读取。confirm=true 才执行发布。",
        };
    }
    const readiness = automationReadiness();
    if (!readiness.ready) {
        return { ok: false, action: "aborted", message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    }
    const content = opts.content ?? "";
    const hasContent = content.trim().length > 0;
    const { wordCount, warnings } = hasContent
        ? validateShortContent(content)
        : { wordCount: 0, warnings: [] as string[] };
    const target = opts.itemId
        ? shortPublishUrl(opts.itemId)
        : "/main/writer/publish-short/?enter_from=NEWCHAPTER_1";
    const session = await openSession(opts.headless ?? true, target);
    if (isError(session))
        return { ok: false, action: "aborted", message: session.error };
    const { browser, page } = session;
    try {
        const itemId = opts.itemId ?? (await waitForItemId(page));
        if (!itemId) {
            const file = await shot(page, "short-publish-itemid-missing");
            return { ok: false, action: "aborted", message: "未拿到 item_id。", url: page.url(), screenshotPath: file };
        }
        if (opts.title?.trim()) {
            const titleSel = await firstMatch(page, SHORT_SELECTORS.title);
            if (titleSel)
                await fillTitle(page, titleSel, opts.title.trim());
        }
        if (content) {
            const bodySel = await firstMatch(page, SHORT_SELECTORS.body);
            if (bodySel)
                await fillBody(page, bodySel, toPlainText(content, { preserveBlankLines: true }));
        }
        await sleep(800);
        const catNames = categoryNames(opts.categories, opts.mainCategory);
        let mainApplied: boolean | undefined;
        let mainOptions: string[] = [];
        if (catNames.length) {
            const cat = await selectCategories(page, catNames);
            mainApplied = cat.mainApplied;
            mainOptions = cat.mainOptions;
            if (cat.missing.length)
                warnings.push(`未找到分类：${cat.missing.join("、")}`);
            if (!cat.mainApplied)
                warnings.push(mainCategoryHint(catNames, cat.mainOptions));
        }
        const useAI = opts.useAI === true;
        if (catNames.length && mainApplied === false) {
            const file = await shot(page, "short-main-category-missing");
            return {
                ok: false,
                action: "aborted",
                message: `${mainCategoryHint(catNames, mainOptions)} ` +
                    `本次未提交发布${opts.itemId ? `（item_id=${itemId} 未做改动）` : ""}。` +
                    `把 main_category 传成主分类组里的名字（或从 categories 里换掉附加分类）再重试。`,
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        if (!(await acceptPublishTerms(page)))
            warnings.push("未能勾上「发布协议」，发布可能被拦（已重试 3 次）。");
        if (!(await chooseUseAI(page, useAI)))
            warnings.push("未能选中「是否使用AI」（默认取「否」）。");
        if (!(await ensurePayNode(page)))
            warnings.push("未能设置「试读比例」（点「去设置」后未出现试读线）。");
        if (opts.coverPath && !(await uploadCover(page, opts.coverPath))) {
            warnings.push("封面文件未能上传。");
        }
        await saveDraft(page);
        await sleep(1500);
        const gates = await readPublishGates(page);
        const missingGates: string[] = [];
        if (!gates.license)
            missingGates.push("发布协议未勾选");
        if (!gates.useAI)
            missingGates.push("是否使用AI 未选");
        if (!gates.payNode)
            missingGates.push("试读比例未设置");
        if (!gates.cover)
            missingGates.push("未上传封面（传 cover_path 上传）");
        if (missingGates.length) {
            const file = await shot(page, "short-gates-missing");
            return {
                ok: false,
                action: "aborted",
                message: `发布必填项未补齐：${missingGates.join("；")}。正文/信息已存草稿（item_id=${itemId}），补齐后再发布。`,
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        let precheck: string | null = null;
        const onPrecheck = async (resp: any) => {
            if (!/short_article\/check_pre/.test(resp.url()))
                return;
            try {
                const j = JSON.parse(await resp.text());
                const hit = (j?.data?.check_resp_list || []).find((c: any) => c?.is_hit);
                if (hit)
                    precheck = String(hit.hit_message || "前置校验未通过");
            }
            catch {
            }
        };
        page.on("response", onPrecheck);
        const clickedNext = (await jsClickButton(page, "下一步")) || (await clickNextBySelector(page));
        if (!clickedNext) {
            page.off("response", onPrecheck);
            const file = await shot(page, "short-next-missing");
            return {
                ok: false,
                action: "aborted",
                message: "未找到「下一步」按钮，无法进入发布确认。正文已存草稿，可到草稿箱手动发布。",
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        await sleep(2500);
        const gateToasts = (await readToasts(page)).filter((t) => !/审核工作时间/.test(t));
        if (gateToasts.length)
            warnings.push(`发布前页面提示：${gateToasts.join(" / ")}`);
        page.off("response", onPrecheck);
        if (precheck) {
            const file = await shot(page, "short-precheck-blocked");
            return {
                ok: false,
                action: "aborted",
                message: `发布前置校验未通过：${precheck}。正文/信息已存草稿（item_id=${itemId}），` +
                    `改掉该项后再发布（例如换标题），或用 publish_short_story_tomato 传新 title 重试。`,
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        const tipText = await waitFor(() => readContinuePublishTip(page), 5000, 1000);
        if (await waitFor(async () => (await jsClickButton(page, "继续发布")) || (await clickButtonByText(page, "继续发布")), 10000, 1000)) {
            warnings.push(tipText
                ? `平台弹出「发布提示」：${tipText}（已点「继续发布」继续）。`
                : "平台弹出「发布提示」（章节格式/错别字自检，未取到弹窗原文），已点「继续发布」继续。");
            await sleep(6000);
        }
        const wallText = await authWallText(page);
        if (wallText) {
            const file = await shot(page, "short-realname-required");
            return {
                ok: false,
                action: "aborted",
                message: `发布流程疑似要求实名/人脸验证，已停止自动提交。请在浏览器中手动完成验证后再发布。（命中文案：${wallText}）`,
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        if (!(await clickConfirmModalOk(page))) {
            const file = await shot(page, "short-confirm-missing");
            return {
                ok: false,
                action: "aborted",
                message: `未等到「提交确认」弹窗，未提交发布。` +
                    `正文/信息已存草稿（item_id=${itemId}），可到草稿箱手动完成发布（草稿箱 → 下一步 → 确定）。`,
                itemId,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        const verified = await waitFor(async () => {
            const snap = await readShortInPage(page, itemId);
            return snap.publishStatus === 1 ? snap : null;
        }, 30000, 3000);
        const file = await shot(page, verified ? "short-published" : "short-publish-result");
        const draftNote = verified && opts.itemId && !hasContent ? `本次未传正文，沿用草稿内正文（回读 ${verified.wordNumber} 字）。` : "";
        return {
            ok: !!verified,
            action: verified ? "published" : "error",
            message: verified
                ? `已发布 item_id=${itemId}（后台 publish_status=1）。${draftNote}` +
                    `⚠️ 番茄审核工作时间 7:00-24:00：夜间提交会卡在「审核中」直至次日早上 7-9 点。` +
                    NEXT_STEP_SHORT_PUBLISHED
                : `发布流程已走完，但 edit/v1 的 publish_status 仍未变为 1，请到短故事列表/草稿箱核对。`,
            itemId,
            title: verified?.title,
            url: page.url(),
            screenshotPath: file,
            warnings: warnings.length ? warnings : undefined,
        };
    }
    catch (e) {
        await browser.close().catch(() => { });
        logger.error(`发布短故事异常: ${(e as Error).message}`);
        return { ok: false, action: "error", message: `发布短故事失败: ${(e as Error).message}` };
    }
    finally {
        await browser.close().catch(() => { });
    }
}
async function clickNextBySelector(page: any): Promise<boolean> {
    const sel = await firstMatch(page, SHORT_SELECTORS.next);
    if (!sel)
        return false;
    await page.click(sel).catch(() => { });
    return true;
}
export async function setShortStoryCover(itemId: string, opts: {
    coverPath: string;
    confirm?: boolean;
    headless?: boolean;
}): Promise<ShortStoryResult> {
    const readiness = automationReadiness();
    if (!readiness.ready) {
        return { ok: false, action: "aborted", message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    }
    if (!itemId)
        return { ok: false, action: "aborted", message: "缺少 item_id。" };
    if (!opts.coverPath)
        return { ok: false, action: "aborted", message: "缺少 cover_path（本地图片路径）。" };
    if (!fs.existsSync(opts.coverPath))
        return { ok: false, action: "aborted", message: `封面文件不存在：${opts.coverPath}` };
    const session = await openSession(opts.headless ?? true, shortPublishUrl(itemId));
    if (isError(session))
        return { ok: false, action: "aborted", message: session.error };
    const { browser, page } = session;
    try {
        await sleep(2000);
        const uploaded = await uploadCover(page, opts.coverPath);
        if (!uploaded) {
            const file = await shot(page, "short-cover-missing");
            return {
                ok: false,
                action: "aborted",
                message: "封面未能上传（重试 3 次仍失败）。多为「封面设置 → 本地上传」抽屉结构变化，或图片格式/尺寸不符。",
                itemId,
                url: page.url(),
                screenshotPath: file,
            };
        }
        if (!opts.confirm) {
            const file = await shot(page, "short-cover-uploaded");
            return {
                ok: true,
                action: "filled-not-submitted",
                message: `已上传封面图片但未保存（confirm=false）。确认后传 confirm=true 保存草稿以持久化封面。`,
                itemId,
                url: page.url(),
                screenshotPath: file,
            };
        }
        const saved = await saveDraft(page);
        const file = await shot(page, saved ? "short-cover-saved" : "short-cover-save-failed");
        return {
            ok: saved,
            action: saved ? "draft-saved" : "error",
            message: saved ? `封面已上传并保存草稿 item_id=${itemId}。` : "封面已上传，但「存草稿」未成功，请手动保存。",
            itemId,
            url: page.url(),
            screenshotPath: file,
        };
    }
    catch (e) {
        return { ok: false, action: "error", message: `设置封面失败: ${(e as Error).message}` };
    }
    finally {
        await browser.close().catch(() => { });
    }
}
export async function deleteShortStory(itemId: string, opts: {
    confirm?: boolean;
    headless?: boolean;
} = {}): Promise<{
    ok: boolean;
    action: "preview" | "deleted" | "error";
    message: string;
    screenshotPath?: string;
}> {
    if (!itemId)
        return { ok: false, action: "error", message: "缺少 item_id。" };
    if (!opts.confirm) {
        return {
            ok: true,
            action: "preview",
            message: `将删除短故事 item_id=${itemId}（confirm=false，未执行）。确认后传 confirm=true。`,
        };
    }
    const readiness = automationReadiness();
    if (!readiness.ready)
        return { ok: false, action: "error", message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    const session = await openSession(opts.headless ?? true, "/main/writer/short-draft");
    if (isError(session))
        return { ok: false, action: "error", message: session.error };
    const { browser, page } = session;
    try {
        await sleep(4000);
        const list = await apiGet(page, API.shortArticleDraftList, {
            page_count: 200,
            page_index: 0,
            time_sort: 0,
            image_fmt_list: "450x800",
            book_image_fmt_list: "190x250",
            pack_type: 1,
        });
        const ids: string[] = (list?.data?.item_list ?? []).map((x: any) => String(x.item_id));
        if (!ids.includes(itemId)) {
            const file = await shot(page, "short-delete-not-found");
            return {
                ok: false,
                action: "error",
                message: `草稿箱中没有 item_id=${itemId}（可能是已发布作品，请到「我的短故事」删除）。当前草稿：${ids.join("、") || "无"}`,
                screenshotPath: file,
            };
        }
        const rect = await page.evaluate((id: string) => {
            const rows = Array.from(document.querySelectorAll(".short-draft-table-item")) as any[];
            const hit = rows.find((r) => Array.from(r.querySelectorAll("a")).some((a: any) => String(a.getAttribute("href") || "").includes(id)));
            if (!hit)
                return null;
            hit.scrollIntoView({ block: "center" });
            const icon = hit.querySelector(".serial-icon-general_delete");
            if (!icon)
                return null;
            const b = icon.getBoundingClientRect();
            if (b.width === 0 && b.height === 0)
                return null;
            return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        }, itemId);
        if (!rect) {
            const file = await shot(page, "short-delete-icon-missing");
            return {
                ok: false,
                action: "error",
                message: "未找到该草稿的删除图标（选择器 .serial-icon-general_delete）。",
                screenshotPath: file,
            };
        }
        const respPromise = new Promise<{
            code: number;
            message: string;
        }>((resolve) => {
            const onResp = async (resp: any) => {
                if (resp.url().includes(API.shortArticleDelete)) {
                    try {
                        const j = JSON.parse(await resp.text());
                        resolve({ code: j?.code, message: j?.message });
                    }
                    catch {
                        resolve({ code: -1, message: "响应解析失败" });
                    }
                }
            };
            page.on("response", onResp);
            setTimeout(() => resolve({ code: -999, message: "超时未收到删除响应" }), 20000);
        });
        await page.mouse.move(rect.x, rect.y);
        await sleep(400);
        await page.mouse.click(rect.x, rect.y);
        await sleep(1200);
        const confirmed = await clickModalConfirm(page);
        if (confirmed)
            await sleep(1500);
        const r = await respPromise;
        const file = await shot(page, r.code === 0 ? "short-delete-ok" : "short-delete-result");
        if (r.code === 0) {
            return { ok: true, action: "deleted", message: `已删除短故事 item_id=${itemId}。`, screenshotPath: file };
        }
        return {
            ok: false,
            action: "error",
            message: `删除未成功：code=${r.code} message=${r.message}${confirmed ? "" : "（未出现确认弹窗）"}。请在草稿箱手动删除。`,
            screenshotPath: file,
        };
    }
    catch (e) {
        return { ok: false, action: "error", message: `删除失败: ${(e as Error).message}` };
    }
    finally {
        await browser.close().catch(() => { });
    }
}
async function clickModalConfirm(page: any): Promise<boolean> {
    const labels = ["确认", "确定", "确认删除", "确定删除", "删除", "是的"];
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const has = await page
            .evaluate((ls: string[]) => {
            const btns = Array.from(document.querySelectorAll("button")) as any[];
            return btns.some((b) => b.offsetParent !== null && ls.includes((b.textContent || "").trim()));
        }, labels)
            .catch(() => false);
        if (has)
            break;
        await sleep(400);
    }
    return page
        .evaluate((ls: string[]) => {
        const scopes = Array.from(document.querySelectorAll('.arco-modal:not(.arco-modal-mask),.arco-modal-wrapper,[role="dialog"]')) as any[];
        for (const scope of scopes) {
            if (!scope.getClientRects().length)
                continue;
            const btns = Array.from(scope.querySelectorAll("button")) as any[];
            for (const l of ls) {
                const b = btns.find((x: any) => x.offsetParent !== null && (x.textContent || "").trim() === l);
                if (b) {
                    b.click();
                    return true;
                }
            }
        }
        return false;
    }, labels)
        .catch(() => false);
}
export async function countShortStories(): Promise<number | undefined> {
    const r = await listShortStories({ pageCount: 200 });
    return r.ok ? r.total : undefined;
}
export function shortManageLink(): string {
    return `${authorApiBase()}/main/writer/short-manage`;
}
