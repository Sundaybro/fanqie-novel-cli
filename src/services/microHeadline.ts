import fs from "node:fs";
import { sleep, shot } from "../browser/driver.js";
import { automationReadiness } from "./auth.js";
import { openSession, isError, apiGet, apiPostQuery, API, shortRecommendUrl } from "../browser/endpoints.js";
import { toPlainText, stripHtml } from "../core/text.js";
import { logger } from "../core/logger.js";
import { NEXT_STEP_WTT_PUBLISHED } from "../core/reminders.js";
export const WTT_MIN_CHARS = 10;
export const WTT_MAX_CHARS = 1500;
export const WTT_HINT_CHARS = 500;
export const WTT_MAX_IMAGES = 3;
export const WTT_DAILY_LIMIT = 10;
export const MICRO_SELECTORS = {
    newButtonText: "新建微头条",
    drawer: ".arco-drawer",
    drawerTitle: ".tt-drawer-header-title-text",
    content: 'textarea[placeholder*="在此输入正文"]',
    contentCount: ".tt-drawer-header-status-count",
    pickShortText: "选择短篇",
    cardModal: ".arco-modal.short-modal",
    cardItem: ".short-select-item",
    cardItemSelected: ".short-select-item-selected",
    pickedCard: ".short-item",
    pagerItem: ".arco-pagination-item",
    imageInput: 'input[type="file"][accept*="image"]',
    imagePreview: ".byte-upload-list img",
    saveDraftText: "存草稿",
    publishText: "发布",
} as const;
export interface MicroHeadlineListItem {
    itemId: string;
    content: string;
    status: number;
    cardBookId?: string;
    cardTitle?: string;
    cardThumbUri?: string;
    imageUriList: string[];
    readCount?: number;
    showCount?: number;
    cardReadCount?: number;
    canModify?: boolean;
    canDelete?: boolean;
    cantModifyReason?: string;
    createTime?: string;
    modifyTime?: string;
}
function mapWttItem(x: any): MicroHeadlineListItem {
    return {
        itemId: String(x?.item_id ?? ""),
        content: String(x?.content ?? ""),
        status: Number(x?.status ?? 0),
        cardBookId: x?.card_book_id !== undefined ? String(x.card_book_id) : undefined,
        cardTitle: x?.card_title !== undefined ? String(x.card_title) : undefined,
        cardThumbUri: x?.card_thumb_uri !== undefined ? String(x.card_thumb_uri) : undefined,
        imageUriList: Array.isArray(x?.image_uri_list) ? x.image_uri_list.map(String) : [],
        readCount: x?.read_count,
        showCount: x?.show_count,
        cardReadCount: x?.card_read_count,
        canModify: x?.can_modify,
        canDelete: x?.can_delete,
        cantModifyReason: x?.cant_modify_reason,
        createTime: x?.create_time,
        modifyTime: x?.modify_time,
    };
}
async function readWttItems(page: any, drafts: boolean, pageCount = 50): Promise<{
    items: MicroHeadlineListItem[];
    total?: number;
    code: number;
    message: string;
}> {
    const data = await apiGet(page, drafts ? API.shortArticleWttDraftList : API.shortArticleWttList, {
        page_count: pageCount,
        page_index: 0,
        ...(drafts ? {} : { status: -1 }),
        image_fmt_list: "600x600",
        card_image_fmt_list: "600x600",
    });
    const items = (data?.data?.item_list ?? []).map(mapWttItem);
    return {
        items,
        total: data?.data?.total_count !== undefined ? Number(data.data.total_count) : undefined,
        code: Number(data?.code ?? -1),
        message: String(data?.message ?? ""),
    };
}
export async function listMicroHeadlines(opts: {
    headless?: boolean;
} = {}): Promise<{
    ok: boolean;
    message: string;
    items?: MicroHeadlineListItem[];
    total?: number;
}> {
    const readiness = automationReadiness();
    if (!readiness.ready)
        return { ok: false, message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    const session = await openSession(opts.headless ?? true, shortRecommendUrl());
    if (isError(session))
        return { ok: false, message: session.error };
    const { browser, page } = session;
    try {
        const r = await readWttItems(page, false);
        await browser.close().catch(() => { });
        if (r.code !== 0)
            return { ok: false, message: `接口返回 code=${r.code} message=${r.message}` };
        return { ok: true, message: `共 ${r.total ?? r.items.length} 条微头条`, items: r.items, total: r.total };
    }
    catch (e) {
        await browser.close().catch(() => { });
        return { ok: false, message: `读取微头条列表失败: ${(e as Error).message}` };
    }
}
export async function listMicroHeadlineDrafts(opts: {
    headless?: boolean;
} = {}): Promise<{
    ok: boolean;
    message: string;
    items?: MicroHeadlineListItem[];
    total?: number;
}> {
    const readiness = automationReadiness();
    if (!readiness.ready)
        return { ok: false, message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    const session = await openSession(opts.headless ?? true, shortRecommendUrl());
    if (isError(session))
        return { ok: false, message: session.error };
    const { browser, page } = session;
    try {
        const r = await readWttItems(page, true);
        await browser.close().catch(() => { });
        if (r.code !== 0)
            return { ok: false, message: `接口返回 code=${r.code} message=${r.message}` };
        return { ok: true, message: `草稿箱共 ${r.total ?? r.items.length} 条微头条草稿`, items: r.items, total: r.total };
    }
    catch (e) {
        await browser.close().catch(() => { });
        return { ok: false, message: `读取微头条草稿箱失败: ${(e as Error).message}` };
    }
}
export interface MicroHeadlineCard {
    bookId: string;
    title: string;
    thumbUri?: string;
    coverUrl?: string;
}
export async function fetchMicroHeadlineCards(page: any, pageCount = 20): Promise<MicroHeadlineCard[]> {
    const cards: MicroHeadlineCard[] = [];
    let pageIndex = 0;
    for (; pageIndex < 10; pageIndex++) {
        const data = await apiPostQuery(page, API.shortArticleWttCardList, {
            page_count: pageCount,
            page_index: pageIndex,
            image_fmt_list: "450x800",
        });
        if (data?.code !== 0) {
            logger.warn(`[micro] card_list 返回 code=${data?.code} message=${data?.message}`);
            break;
        }
        const list: any[] = data?.data?.item_list ?? [];
        for (const c of list) {
            cards.push({
                bookId: String(c?.book_id ?? ""),
                title: String(c?.card_title ?? ""),
                thumbUri: c?.card_thumb_uri !== undefined ? String(c.card_thumb_uri) : undefined,
                coverUrl: c?.card_thumb_url?.[0]?.main_url,
            });
        }
        const total = Number(data?.data?.total_count ?? 0);
        if (!list.length || cards.length >= total)
            break;
    }
    return cards;
}
export const MICRO_PREFIX = "#故事推荐#";
function normTitle(s: string): string {
    return (s || "").replace(/[\s《》「」"']/g, "");
}
function cutAtSentence(text: string, limit: number): string {
    if (text.length <= limit)
        return text;
    const win = text.slice(0, limit);
    const m = win.match(/[\s\S]*[。！？!?…]["”』」）)]?/);
    return (m && m[0].trim().length >= limit * 0.4 ? m[0] : win).trim();
}
function toParagraphs(content: string): string[] {
    const paras = toPlainText(stripHtml(content || ""))
        .replace(/^#{1,6}\s*/gm, "")
        .split(/\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && !/^(第\s*[0-9一二三四五六七八九十百零]+\s*章|大纲|简介|设定)/.test(p));
    while (paras.length > 1 && paras[0].length <= 2)
        paras.shift();
    return paras;
}
export function buildMicroHeadlineDraft(opts: {
    title?: string;
    content?: string;
    maxChars?: number;
}): {
    content: string;
    chars: number;
    warnings: string[];
} {
    const warnings: string[] = [];
    const title = (opts.title || "").trim();
    const maxChars = opts.maxChars ?? WTT_HINT_CHARS;
    const closing = title ? `短篇《${title}》，点开卡片读全文。` : "点开卡片读全文。";
    const tags = [title ? `#${title}#` : "", "#短篇故事推荐#", "#小说推荐#"].filter(Boolean).join(" ");
    const rawParas = toParagraphs(opts.content || "");
    if (!rawParas.length) {
        warnings.push("未拿到短故事正文，只生成了「作品卡点」版引导语，发布前建议人工补一段开篇节选。");
    }
    const rawExcerpt = rawParas.join("\n\n");
    const budget = Math.max(40, maxChars - MICRO_PREFIX.length - closing.length - tags.length - 6);
    const excerpt = cutAtSentence(rawExcerpt, budget);
    if (rawExcerpt.length > excerpt.length)
        warnings.push("开篇节选按字数上限做了截断（留白卡点），可人工调整卡点位置。");
    const content = [MICRO_PREFIX, excerpt, closing, tags].filter(Boolean).join("\n\n").trim();
    const chars = content.length;
    if (rawParas.length) {
        warnings.push("引导语为「开篇节选」自动生成，平台按内容质量给量（小流量推荐 → 热推中），发布前建议人工润色。");
    }
    if (chars > WTT_HINT_CHARS)
        warnings.push(`正文 ${chars} 字，超过官方教程建议的 ${WTT_HINT_CHARS} 字。`);
    if (chars > WTT_MAX_CHARS)
        warnings.push(`正文 ${chars} 字，超过前端硬上限 ${WTT_MAX_CHARS} 字，发布会被拦下。`);
    if (chars < WTT_MIN_CHARS)
        warnings.push(`正文 ${chars} 字，低于前端下限 ${WTT_MIN_CHARS} 字，发布会被拦下。`);
    return { content, chars, warnings };
}
async function clickButtonByText(page: any, label: string): Promise<boolean> {
    const box = await page
        .evaluate((t: string) => {
        const btns = Array.from(document.querySelectorAll("button")) as any[];
        const hit = btns.filter((b) => (b.textContent || "").trim() === t && b.getClientRects().length).pop();
        if (!hit)
            return null;
        hit.setAttribute("data-autopub-btn", "1");
        const b = hit.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, label)
        .catch(() => null);
    if (!box)
        return false;
    await page.mouse.click(box.x, box.y);
    await page
        .evaluate(() => document.querySelector('[data-autopub-btn="1"]')?.removeAttribute("data-autopub-btn"))
        .catch(() => { });
    return true;
}
async function clickAnyByText(page: any, label: string): Promise<boolean> {
    const box = await page
        .evaluate((t: string) => {
        const els = Array.from(document.querySelectorAll("div,span,a,button")) as any[];
        const hit = els
            .filter((e) => (e.textContent || "").trim() === t && e.getClientRects().length && e.children.length === 0)
            .pop();
        if (!hit)
            return null;
        hit.setAttribute("data-autopub-el", "1");
        const b = hit.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, label)
        .catch(() => null);
    if (!box)
        return false;
    await page.mouse.click(box.x, box.y);
    await page
        .evaluate(() => document.querySelector('[data-autopub-el="1"]')?.removeAttribute("data-autopub-el"))
        .catch(() => { });
    return true;
}
async function waitFor<T>(cond: () => Promise<T | null | false>, timeoutMs = 15000, stepMs = 600): Promise<T | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const v = await cond().catch(() => null);
        if (v)
            return v as T;
        await sleep(stepMs);
    }
    return null;
}
async function readToasts(page: any): Promise<string[]> {
    return page
        .evaluate(() => (Array.from(document.querySelectorAll('[class*="arco-message"], [class*="arco-alert"]')) as any[])
        .map((e: any) => (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120))
        .filter(Boolean))
        .catch(() => []);
}
export interface CreateMicroHeadlineOptions {
    itemId?: string;
    title?: string;
    content?: string;
    imagePaths?: string[];
    draft?: boolean;
    confirm?: boolean;
    headless?: boolean;
}
export interface MicroHeadlineResult {
    ok: boolean;
    action: "filled-not-submitted" | "draft-saved" | "published" | "aborted" | "error";
    message: string;
    wttItemId?: string;
    card?: {
        bookId: string;
        title: string;
    };
    content?: string;
    chars?: number;
    url?: string;
    screenshotPath?: string;
    warnings?: string[];
}
export async function createMicroHeadline(opts: CreateMicroHeadlineOptions): Promise<MicroHeadlineResult> {
    const readiness = automationReadiness();
    if (!readiness.ready) {
        return { ok: false, action: "aborted", message: `前置条件未满足：\n- ${readiness.reasons.join("\n- ")}` };
    }
    if (!opts.itemId && !opts.title?.trim()) {
        return { ok: false, action: "aborted", message: "需提供 item_id（短故事 id），或与后台作品名一致的 title。" };
    }
    const warnings: string[] = [];
    const images = (opts.imagePaths ?? []).filter(Boolean);
    if (images.length > WTT_MAX_IMAGES) {
        return { ok: false, action: "aborted", message: `图片最多 ${WTT_MAX_IMAGES} 张（页面限制），收到 ${images.length} 张。` };
    }
    for (const p of images) {
        if (!fs.existsSync(p))
            return { ok: false, action: "aborted", message: `图片文件不存在：${p}` };
    }
    const session = await openSession(opts.headless ?? true, shortRecommendUrl());
    if (isError(session))
        return { ok: false, action: "aborted", message: session.error };
    const { browser, page } = session;
    try {
        let title = (opts.title || "").trim();
        let storyText = "";
        if (opts.itemId) {
            const detail = await apiGet(page, API.shortArticleEditV1, { item_id: opts.itemId, image_fmt_list: "270x480" });
            if (detail?.code === 0) {
                title = title || String(detail?.data?.multi_title ?? "").trim();
                storyText = String(detail?.data?.content ?? "");
            }
            else {
                warnings.push(`读取短故事详情失败（code=${detail?.code}），改用传入的 title/正文。`);
            }
        }
        if (!title) {
            const file = await shot(page, "micro-title-missing");
            return {
                ok: false,
                action: "aborted",
                message: "拿不到短故事名称：请传 title，或确认 item_id 有效。",
                url: page.url(),
                screenshotPath: file,
            };
        }
        const draft = opts.content?.trim()
            ? { content: opts.content.trim(), chars: opts.content.trim().length, warnings: [] as string[] }
            : buildMicroHeadlineDraft({ title, content: storyText });
        warnings.push(...draft.warnings);
        if (draft.chars < WTT_MIN_CHARS) {
            return { ok: false, action: "aborted", message: `微头条正文 ${draft.chars} 字，低于平台下限 ${WTT_MIN_CHARS} 字。` };
        }
        if (draft.chars > WTT_MAX_CHARS) {
            return {
                ok: false,
                action: "aborted",
                message: `微头条正文 ${draft.chars} 字，超过平台上限 ${WTT_MAX_CHARS} 字（前端会直接拦下）。`,
            };
        }
        const cards = await fetchMicroHeadlineCards(page);
        const wanted = normTitle(title);
        const card = cards.find((c) => normTitle(c.title) === wanted) ||
            cards.find((c) => normTitle(c.title).includes(wanted) || wanted.includes(normTitle(c.title)));
        if (!card) {
            const file = await shot(page, "micro-card-missing");
            return {
                ok: false,
                action: "aborted",
                message: `「插入短篇」里没有《${title}》这张卡片（可选：${cards.map((c) => c.title).join("、") || "无"}）。` +
                    `多为该短篇未发布/未过审，或标题不一致；请核对后再试。`,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        logger.info(`[createMicroHeadline] 关联卡片《${card.title}》book_id=${card.bookId}`);
        if (!(await clickButtonByText(page, MICRO_SELECTORS.newButtonText))) {
            const file = await shot(page, "micro-new-button-missing");
            return { ok: false, action: "aborted", message: "未找到「新建微头条」按钮（页面可能改版）。", url: page.url(), screenshotPath: file };
        }
        const editorReady = await waitFor(async () => (await page.$(MICRO_SELECTORS.content)) !== null, 15000, 700);
        if (!editorReady) {
            const file = await shot(page, "micro-editor-missing");
            return { ok: false, action: "aborted", message: "未打开微头条编辑抽屉（未找到正文输入框）。", url: page.url(), screenshotPath: file };
        }
        await sleep(800);
        await page.evaluate((sel: string, value: string) => {
            const el: any = document.querySelector(sel);
            if (!el)
                return false;
            const proto = (window as any).HTMLTextAreaElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (setter)
                setter.call(el, value);
            else
                el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            return true;
        }, MICRO_SELECTORS.content, draft.content);
        await sleep(800);
        if (!(await clickAnyByText(page, MICRO_SELECTORS.pickShortText))) {
            const file = await shot(page, "micro-pick-missing");
            return { ok: false, action: "aborted", message: "未找到「选择短篇」入口。", url: page.url(), screenshotPath: file };
        }
        const modalReady = await waitFor(async () => (await page.$$(MICRO_SELECTORS.cardItem)).length > 0, 12000, 700);
        if (!modalReady) {
            const file = await shot(page, "micro-modal-empty");
            return { ok: false, action: "aborted", message: "「插入短篇」弹窗没有候选作品。", url: page.url(), screenshotPath: file };
        }
        let picked = false;
        for (let pageIdx = 0; pageIdx < 10 && !picked; pageIdx++) {
            if (pageIdx > 0) {
                const next = await page
                    .evaluate((n: number, sel: string) => {
                    const items = Array.from(document.querySelectorAll(sel)) as any[];
                    const hit = items.find((e) => (e.textContent || "").trim() === String(n) && e.getClientRects().length);
                    if (!hit)
                        return null;
                    hit.setAttribute("data-autopub-page", "1");
                    const b = hit.getBoundingClientRect();
                    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
                }, pageIdx + 1, MICRO_SELECTORS.pagerItem)
                    .catch(() => null);
                if (!next)
                    break;
                await page.mouse.click(next.x, next.y);
                await sleep(1500);
            }
            picked = await page
                .evaluate((t: string, itemSel: string, selSel: string) => {
                const norm = (s: string) => (s || "").replace(/\s+/g, "").replace(/[《》]/g, "");
                const items = Array.from(document.querySelectorAll(itemSel)) as any[];
                const hit = items.find((e) => norm(e.textContent) === norm(t)) ||
                    items.find((e) => norm(e.textContent).includes(norm(t))) ||
                    items.find((e) => norm(t).includes(norm(e.textContent)));
                if (!hit || !hit.getClientRects().length)
                    return false;
                hit.setAttribute("data-autopub-card", "1");
                return true;
            }, card.title, MICRO_SELECTORS.cardItem, MICRO_SELECTORS.cardItemSelected)
                .catch(() => false);
        }
        if (!picked) {
            const file = await shot(page, "micro-card-not-found");
            return {
                ok: false,
                action: "aborted",
                message: `弹窗里没点到《${card.title}》。`,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        await page.click('[data-autopub-card="1"]').catch(() => { });
        await sleep(600);
        const selected = await page
            .evaluate((sel: string) => !!document.querySelector(sel), MICRO_SELECTORS.cardItemSelected)
            .catch(() => false);
        if (!selected)
            warnings.push("短篇卡片点击后未读到选中态，可能未真正选中。");
        const okClicked = await page
            .evaluate(() => {
            const m = document.querySelector(".arco-modal.short-modal");
            if (!m)
                return false;
            const b = (Array.from(m.querySelectorAll("button")) as any[]).find((x: any) => (x.textContent || "").trim() === "确定" && !x.disabled);
            if (!b)
                return false;
            b.click();
            return true;
        })
            .catch(() => false);
        if (!okClicked)
            warnings.push("未能点到「插入短篇」弹窗的「确定」。");
        await sleep(1200);
        const pickedTitle = await page
            .evaluate((sel: string) => (document.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40), MICRO_SELECTORS.pickedCard)
            .catch(() => "");
        if (pickedTitle && !pickedTitle.includes(card.title.slice(0, 6))) {
            warnings.push(`已选卡片回读为「${pickedTitle}」，与目标《${card.title}》不一致，请人工核对。`);
        }
        if (images.length) {
            for (const p of images) {
                const input = await page.$('input[type="file"][accept*="image"]');
                if (!input) {
                    warnings.push(`未找到配图上传入口，已跳过 ${images.length} 张图。`);
                    break;
                }
                await input.uploadFile(p).catch(() => warnings.push(`图片上传失败：${p}`));
                await sleep(2500);
            }
        }
        if (!opts.confirm) {
            const file = await shot(page, "micro-filled");
            return {
                ok: true,
                action: "filled-not-submitted",
                message: `已填好微头条表单（**未提交**，confirm=false）：关联短篇《${card.title}》，正文 ${draft.chars} 字。` +
                    `请把 content 交给用户过目，确认后带 confirm=true 再调一次（content 可原样回传或省略，生成是确定性的）。`,
                card: { bookId: card.bookId, title: card.title },
                content: draft.content,
                chars: draft.chars,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        const respPromise = new Promise<{
            code: number;
            message: string;
            data: any;
        }>((resolve) => {
            const onResp = async (resp: any) => {
                if (!resp.url().includes(API.shortArticlePublishWtt))
                    return;
                try {
                    const j = JSON.parse(await resp.text());
                    resolve({ code: Number(j?.code), message: String(j?.message ?? ""), data: j?.data });
                }
                catch {
                    resolve({ code: -1, message: "响应解析失败", data: null });
                }
            };
            page.on("response", onResp);
            setTimeout(() => resolve({ code: -999, message: "超时未收到 publish_wtt 响应", data: null }), 30000);
        });
        const label = opts.draft ? MICRO_SELECTORS.saveDraftText : MICRO_SELECTORS.publishText;
        if (!(await clickButtonByText(page, label))) {
            const file = await shot(page, "micro-submit-missing");
            return {
                ok: false,
                action: "aborted",
                message: `未找到「${label}」按钮。表单已填好但未提交。`,
                card: { bookId: card.bookId, title: card.title },
                content: draft.content,
                chars: draft.chars,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        const r = await respPromise;
        await sleep(2000);
        const file = await shot(page, r.code === 0 ? "micro-submitted" : "micro-submit-result");
        if (r.code === -999) {
            const toasts = (await readToasts(page)).join(" / ");
            return {
                ok: false,
                action: "error",
                message: `点了「${label}」但没等到提交响应${toasts ? `（页面提示：${toasts}）` : ""}。多为正文/短篇卡片未通过前端校验。`,
                content: draft.content,
                chars: draft.chars,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        if (r.code !== 0) {
            return {
                ok: false,
                action: "error",
                message: `提交被拒：code=${r.code} message=${r.message}`,
                content: draft.content,
                chars: draft.chars,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        const wttItemId = r.data?.item_id !== undefined ? String(r.data.item_id) : undefined;
        const verify = await readWttItems(page, !!opts.draft).catch(() => ({ items: [] as MicroHeadlineListItem[], code: -1, message: "" }));
        const hit = verify.items.find((i) => (wttItemId && i.itemId === wttItemId) || i.content.startsWith(draft.content.slice(0, 20)));
        if (!hit) {
            warnings.push(opts.draft
                ? "草稿箱里没复核到这条草稿，请到「作品推荐 → 草稿箱」确认。"
                : "列表里没复核到这条微头条，请到「作品推荐」确认。");
        }
        if (opts.draft) {
            return {
                ok: true,
                action: "draft-saved",
                message: `已把微头条存进草稿箱${hit ? "（已复核）" : ""}：关联短篇《${card.title}》，正文 ${draft.chars} 字。` +
                    `要发布请到「作品推荐」列表操作，或重跑本工具传 draft=false + confirm=true。`,
                wttItemId: hit?.itemId ?? wttItemId,
                card: { bookId: card.bookId, title: card.title },
                content: draft.content,
                chars: draft.chars,
                url: page.url(),
                screenshotPath: file,
                warnings: warnings.length ? warnings : undefined,
            };
        }
        return {
            ok: true,
            action: "published",
            message: `已发布微头条${hit ? `（已复核，item_id=${hit.itemId}，status=${hit.status}）` : ""}：` +
                `关联短篇《${card.title}》，正文 ${draft.chars} 字。` +
                `⚠️ 推荐状态由内容质量决定（小流量推荐 → 热推中 / 审核不通过），每天最多发 ${WTT_DAILY_LIMIT} 条，超出不再分发。` +
                NEXT_STEP_WTT_PUBLISHED,
            wttItemId: hit?.itemId ?? wttItemId,
            card: { bookId: card.bookId, title: card.title },
            content: draft.content,
            chars: draft.chars,
            url: page.url(),
            screenshotPath: file,
            warnings: warnings.length ? warnings : undefined,
        };
    }
    catch (e) {
        logger.error(`新建微头条异常: ${(e as Error).message}`);
        return { ok: false, action: "error", message: `新建微头条失败: ${(e as Error).message}` };
    }
    finally {
        await browser.close().catch(() => { });
    }
}
