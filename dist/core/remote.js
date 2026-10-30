export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8765;
export const DEFAULT_PATH = "/mcp";
export function truthy(v) {
    const s = (v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
}
export function remoteRequested(argv = process.argv) {
    if (argv.includes("--http"))
        return true;
    return (process.env.FANQIE_TRANSPORT ?? "").trim().toLowerCase() === "http";
}
export function remoteOptions() {
    const host = (process.env.FANQIE_HTTP_HOST ?? "").trim() || DEFAULT_HOST;
    const token = (process.env.FANQIE_HTTP_TOKEN ?? "").trim();
    if (token && token.length < 16) {
        throw new Error(`FANQIE_HTTP_TOKEN 太短（当前 ${token.length} 字符）：远程端点可驱动真实浏览器写入，请至少 16 字符的随机串。`);
    }
    if (!token && !isLoopback(host)) {
        throw new Error(`绑定非回环地址 ${host} 时必须设置 FANQIE_HTTP_TOKEN（Bearer 鉴权）。\n` +
            "  只在本机使用的话：把 FANQIE_HTTP_HOST 设为 127.0.0.1（回环地址免鉴权），或删掉该变量。\n" +
            "  要对外暴露（反向代理 / 内网共享）则生成一个强随机 Token：\n" +
            '    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    const rawPath = (process.env.FANQIE_HTTP_PATH ?? "").trim() || DEFAULT_PATH;
    const parsedPort = Number.parseInt(process.env.FANQIE_HTTP_PORT ?? "", 10);
    return {
        host,
        port: Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : DEFAULT_PORT,
        path: rawPath.startsWith("/") ? rawPath : `/${rawPath}`,
        token: token || null,
        authRequired: Boolean(token),
        readonly: truthy(process.env.FANQIE_HTTP_READONLY),
    };
}
export function isLoopback(host) {
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}
const WRITE_TOOLS = new Set([
    "login_tomato",
    "set_tomato_cookies",
    "create_novel_tomato",
    "update_novel",
    "update_novel_info_tomato",
    "set_book_tags",
    "add_chapter_tomato",
    "update_chapter_tomato",
    "batch_publish_chapters",
    "create_short_story_tomato",
    "update_short_story_tomato",
    "publish_short_story_tomato",
    "set_short_story_cover_tomato",
    "delete_short_story_tomato",
    "create_micro_headline_tomato",
    "save_article",
    "delete_article",
    "export_article",
    "import_articles_from_dir",
]);
const WRITE_TOOL_PREFIX = /^(login|set|create|update|add|save|delete|publish|batch|import)_/;
export function isWriteTool(name) {
    return WRITE_TOOLS.has(name) || WRITE_TOOL_PREFIX.test(name);
}
export function describeRemote() {
    let parsed;
    let error;
    try {
        parsed = remoteOptions();
    }
    catch (e) {
        error = e.message.split("\n")[0];
    }
    return {
        requested: remoteRequested(),
        host: parsed?.host ?? process.env.FANQIE_HTTP_HOST ?? DEFAULT_HOST,
        port: parsed?.port ?? process.env.FANQIE_HTTP_PORT ?? DEFAULT_PORT,
        path: parsed?.path ?? process.env.FANQIE_HTTP_PATH ?? DEFAULT_PATH,
        readonly: parsed?.readonly ?? truthy(process.env.FANQIE_HTTP_READONLY),
        token_set: Boolean(parsed?.token),
        auth_mode: parsed ? (parsed.authRequired ? "bearer" : "none") : null,
        error: error ?? null,
    };
}
