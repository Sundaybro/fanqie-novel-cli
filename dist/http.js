import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./core/logger.js";
import { isLoopback, isWriteTool, remoteOptions } from "./core/remote.js";
const MAX_BODY_BYTES = 8 * 1024 * 1024;
export async function startRemoteServer(makeServer, info) {
    const opts = remoteOptions();
    const sessions = new Map();
    const handle = async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
            return sendJson(res, 200, {
                ok: true,
                name: info.name,
                version: info.version,
                transport: "streamable-http",
                readonly: opts.readonly,
            });
        }
        if (url.pathname !== opts.path) {
            return sendJson(res, 404, { error: `未知路径 ${url.pathname}；MCP 端点是 ${opts.path}（探活：/health）` });
        }
        if (opts.token && !authorized(req.headers.authorization, opts.token)) {
            res.setHeader("WWW-Authenticate", 'Bearer realm="fanqie-autopub-mcp"');
            return sendJson(res, 401, rpcError(null, -32001, "未授权：请求头需要 Authorization: Bearer <FANQIE_HTTP_TOKEN>"));
        }
        if (req.method === "POST") {
            let body;
            try {
                body = await readJsonBody(req);
            }
            catch (e) {
                return sendJson(res, 400, rpcError(null, -32700, `请求体解析失败：${e.message}`));
            }
            const blocked = blockedWriteTool(body, opts.readonly);
            if (blocked) {
                logger.warn(`只读模式拦截写工具调用：${blocked}`);
                return sendJson(res, 403, rpcError(rpcId(body), -32003, `远程端点当前为只读模式（FANQIE_HTTP_READONLY=1），已拦截写工具 ${blocked}`));
            }
            return handlePost(req, res, body, sessions, makeServer);
        }
        if (req.method === "GET" || req.method === "DELETE") {
            const sessionId = headerValue(req.headers["mcp-session-id"]);
            const transport = sessionId ? sessions.get(sessionId) : undefined;
            if (!transport) {
                return sendJson(res, 400, rpcError(null, -32000, `${req.method} 需要有效的 mcp-session-id（缺失或会话已过期）`));
            }
            return transport.handleRequest(req, res);
        }
        res.setHeader("Allow", "GET, POST, DELETE");
        return sendJson(res, 405, { error: `不支持的请求方法：${req.method ?? "?"}` });
    };
    const server = http.createServer((req, res) => {
        handle(req, res).catch((e) => {
            logger.error(`远程请求处理失败: ${e.stack ?? e.message}`);
            if (!res.headersSent)
                sendJson(res, 500, { error: "服务内部错误" });
            else
                res.end();
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(opts.port, opts.host, resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : opts.port;
    const shownHost = opts.host === "0.0.0.0" || opts.host === "::" ? "127.0.0.1" : opts.host;
    logger.info(`远程端点已就绪: http://${shownHost}:${port}${opts.path}（${opts.token ? "Bearer 鉴权" : "本机免鉴权"} / ${opts.readonly ? "只读模式" : "可写模式"}）`);
    if (!opts.token) {
        logger.warn(`本机免鉴权模式（FANQIE_HTTP_HOST=${opts.host}）：同机任何进程都能调用该端点（含写工具）。不要改绑非回环地址——那会因缺 Token 直接拒绝启动。`);
    }
    if (!isLoopback(opts.host)) {
        logger.warn(`已绑定非回环地址 ${opts.host}：该端点能驱动真实浏览器执行写操作，请确保 FANQIE_HTTP_TOKEN 足够强，并置于反向代理 / 防火墙之后。`);
    }
    const shutdown = async (signal) => {
        logger.info(`收到 ${signal}，正在关闭远程端点…`);
        for (const t of sessions.values())
            await t.close().catch(() => { });
        sessions.clear();
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    return server;
}
async function handlePost(req, res, body, sessions, makeServer) {
    const sessionId = headerValue(req.headers["mcp-session-id"]);
    let transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
        if (sessionId) {
            return sendJson(res, 404, rpcError(rpcId(body), -32001, `会话不存在或已过期：${sessionId}，请重新初始化`));
        }
        if (!isInitializeRequest(body)) {
            return sendJson(res, 400, rpcError(rpcId(body), -32600, "缺少 mcp-session-id，且请求不是 initialize"));
        }
        const created = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
                sessions.set(sid, created);
                logger.debug(`远程会话已建立：${sid}`);
            },
            onsessionclosed: (sid) => {
                sessions.delete(sid);
                logger.debug(`远程会话已关闭：${sid}`);
            },
        });
        created.onclose = () => {
            const sid = created.sessionId;
            if (sid)
                sessions.delete(sid);
        };
        await makeServer().connect(created);
        transport = created;
    }
    await transport.handleRequest(req, res, body);
}
function blockedWriteTool(body, readonly) {
    if (!readonly)
        return null;
    for (const msg of Array.isArray(body) ? body : [body]) {
        const m = msg;
        if (m?.method === "tools/call" && typeof m.params?.name === "string" && isWriteTool(m.params.name)) {
            return m.params.name;
        }
    }
    return null;
}
function rpcId(body) {
    const first = Array.isArray(body) ? body[0] : body;
    return first?.id ?? null;
}
function rpcError(id, code, message) {
    return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
    });
    res.end(body);
}
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error(`请求体超过 ${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB 上限`));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8").trim();
            if (!raw)
                return resolve(undefined);
            try {
                resolve(JSON.parse(raw));
            }
            catch (e) {
                reject(new Error(e.message));
            }
        });
        req.on("error", reject);
    });
}
function headerValue(v) {
    return Array.isArray(v) ? v[0] : v;
}
function authorized(header, token) {
    const m = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
    if (!m)
        return false;
    const a = createHash("sha256").update(m[1].trim()).digest();
    const b = createHash("sha256").update(token).digest();
    return timingSafeEqual(a, b);
}
