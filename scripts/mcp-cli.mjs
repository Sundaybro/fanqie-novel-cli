#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, "dist", "index.js")],
    env: process.env,
    stderr: "inherit",
});
const client = new Client({ name: "mcp-cli", version: "0.0.0" });
try {
    await client.connect(transport);
    if (argv.includes("--list") || argv.length === 0) {
        const tools = await client.listTools();
        for (const t of tools.tools)
            console.log(`- ${t.name}: ${t.description?.split("\n")[0] ?? ""}`);
    }
    else if (argv.includes("--resources")) {
        const res = await client.listResources();
        for (const r of res.resources)
            console.log(`- ${r.uri}: ${r.description ?? r.name}`);
    }
    else if (argv[0] === "--res") {
        const res = await client.readResource({ uri: argv[1] });
        console.log(res.contents.map((c) => c.text).join("\n"));
    }
    else {
        const [name, ...rest] = argv;
        const tools = await client.listTools();
        const tool = tools.tools.find((t) => t.name === name);
        if (!tool)
            throw new Error(`未知工具：${name}`);
        const properties = tool.inputSchema.properties ?? {};
        let args = {};
        if (process.env.MCP_ARGS) {
            args = JSON.parse(process.env.MCP_ARGS);
        }
        else if (rest.length === 1 && rest[0].trim().startsWith("{")) {
            args = JSON.parse(rest[0]);
        }
        else {
            for (const token of rest) {
                const eq = token.indexOf("=");
                if (eq <= 0)
                    throw new Error(`参数应为 key=value：${token}`);
                const k = token.slice(0, eq);
                const raw = token.slice(eq + 1);
                const schema = properties[k];
                if (!schema)
                    throw new Error(`未知参数：${k}`);
                if (schema.type === "string")
                    args[k] = raw;
                else {
                    try {
                        args[k] = JSON.parse(raw);
                    }
                    catch {
                        throw new Error(`参数 ${k} 需要 ${schema.type ?? "JSON"} 类型`);
                    }
                }
            }
        }
        if (!args || typeof args !== "object" || Array.isArray(args))
            throw new Error("参数必须是 JSON 对象");
        const validateNumbers = (value) => {
            if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
                throw new Error("参数含不精确数值；作品 ID 请使用带引号的字符串");
            }
            if (value && typeof value === "object")
                for (const child of Object.values(value))
                    validateNumbers(child);
        };
        validateNumbers(args);
        for (const key of Object.keys(args))
            if (!properties[key])
                throw new Error(`未知参数：${key}`);
        const callTimeout = Number(process.env.MCP_CALL_TIMEOUT_MS || 600000);
        const res = await client.callTool({ name, arguments: args }, undefined, { timeout: callTimeout });
        const text = res.content?.map((c) => c.text).join("\n") ?? "";
        console.log(text);
        if (res.isError)
            process.exitCode = 1;
    }
}
catch (e) {
    console.error("调用失败：", e);
    process.exitCode = 1;
}
finally {
    await client.close().catch(() => { });
}
