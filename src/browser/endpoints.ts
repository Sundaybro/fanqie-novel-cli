import { logger } from "../core/logger.js";
export function authorApiBase(): string {
    return process.env.FANQIE_AUTHOR_API_BASE || "https://fanqienovel.com";
}
export function authorLoginUrl(): string {
    return process.env.FANQIE_AUTHOR_URL || "https://fanqienovel.com/main/writer/login";
}
export function bookManageUrl(): string {
    return `${authorApiBase()}/main/writer/book-manage`;
}
export function createBookUrl(): string {
    return `${authorApiBase()}/main/writer/create`;
}
export function shortManageUrl(): string {
    return process.env.FANQIE_SHORT_MANAGE_URL || `${authorApiBase()}/main/writer/short-manage`;
}
export function shortDraftUrl(): string {
    return `${authorApiBase()}/main/writer/short-draft`;
}
export function shortRecommendUrl(): string {
    return process.env.FANQIE_SHORT_RECOMMEND_URL || `${authorApiBase()}/main/writer/short-recommend`;
}
export function shortRecommendDraftUrl(): string {
    return `${authorApiBase()}/main/writer/short-recommend-draft`;
}
export function shortPublishUrl(itemId?: string | number): string {
    const base = `${authorApiBase()}/main/writer/publish-short/`;
    const tail = itemId !== undefined && itemId !== null && `${itemId}` !== "" ? String(itemId) : "";
    return `${base}${tail}?enter_from=NEWCHAPTER_1`;
}
export function chapterUrlTemplate(): string {
    return (process.env.FANQIE_CHAPTER_URL_TEMPLATE ||
        `${authorApiBase()}/main/writer/{bookId}/publish/?enter_from=newchapter_1`);
}
export function modifyChapterPath(bookId: string, chapterId: string): string {
    return `/main/writer/${bookId}/publish/${chapterId}/?enter_from=modifychapter`;
}
export const AID = process.env.FANQIE_AID || "2503";
export const APP_NAME = process.env.FANQIE_APP_NAME || "muye_novel";
export const API = {
    bookList: "/api/author/book/book_list/v0/",
    bookDetail: "/api/author/book/book_detail/v0/",
    bookCreate: "/api/author/book/create/v0/",
    bookCheckFrequency: "/app/book/check_frequency/v0/",
    chapterList: "/api/author/chapter/chapter_list/v1",
    shortArticleNew: "/api/author/short_article/new/v0/",
    shortArticleList: "/api/author/short_article/list/v0/",
    shortArticleDraftList: "/api/author/short_article/draft_list/v0/",
    shortArticleEditV1: "/api/author/short_article/edit/v1/",
    shortArticleEditV0: "/api/author/short_article/edit/v0/",
    shortArticlePublish: "/api/author/short_article/publish/v0/",
    shortArticleCover: "/api/author/short_article/cover/v0/",
    shortArticleCheckPre: "/api/author/short_article/check_pre/v0",
    shortArticleCategoryV1: "/api/author/short_article/get_category_list/v1/",
    shortArticleDelete: "/api/author/short_article/delete/v0/",
    shortArticleWttList: "/api/author/short_article/wtt_list/v0/",
    shortArticleWttDraftList: "/api/author/short_article/wtt_draft_list/v0/",
    shortArticleWttCardList: "/api/author/short_article/card_list/v0/",
    shortArticlePublishWtt: "/api/author/short_article/publish_wtt/v0/",
    shortArticleDeleteWtt: "/api/author/short_article/delete_wtt/v0/",
} as const;
export function withParams(pathname: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(authorApiBase() + pathname);
    url.searchParams.set("aid", AID);
    url.searchParams.set("app_name", APP_NAME);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && `${v}` !== "")
            url.searchParams.set(k, String(v));
    }
    return url.toString();
}
export interface AuthorSession {
    browser: any;
    page: any;
}
export type SessionResult = AuthorSession | {
    error: string;
};
export function onLoginPage(url: string): boolean {
    return /\/writer\/login|passport|sso/i.test(url);
}
export async function openSession(headless: boolean, targetPath: string, driverBundle?: any): Promise<SessionResult> {
    let browser: any;
    try {
        const { launchBrowser } = await import("./driver.js");
        browser = await launchBrowser(headless, driverBundle);
    }
    catch (e) {
        return { error: (e as Error).message };
    }
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        const { loadCookies } = await import("./cookies.js");
        const cookies = loadCookies();
        await page.goto("about:blank");
        await page.setCookie(...cookies);
        const url = targetPath.startsWith("http") ? targetPath : `${authorApiBase()}${targetPath}`;
        logger.debug(`打开页面: ${url}`);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        if (onLoginPage(page.url())) {
            await browser.close().catch(() => { });
            return { error: "cookies 已失效（被重定向到登录页）。请先执行 login_tomato 重新登录。" };
        }
        return { browser, page };
    }
    catch (e) {
        await browser.close().catch(() => { });
        return { error: `打开作者后台失败: ${(e as Error).message}` };
    }
}
export function isError(r: SessionResult): r is {
    error: string;
} {
    return (r as {
        error?: string;
    }).error !== undefined;
}
export async function apiGet(page: any, pathname: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const url = withParams(pathname, params);
    return page.evaluate(async (u: string) => {
        try {
            const r = await fetch(u, { credentials: "include" });
            return await r.json();
        }
        catch (e) {
            return { error: String(e) };
        }
    }, url);
}
export async function apiPostQuery(page: any, pathname: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const url = withParams(pathname, params);
    return page.evaluate(async (u: string) => {
        try {
            const r = await fetch(u, { method: "POST", credentials: "include" });
            return await r.json();
        }
        catch (e) {
            return { error: String(e) };
        }
    }, url);
}
