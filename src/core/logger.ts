const DEBUG = process.env.FANQIE_DEBUG === "1";
function safeStringify(v: unknown): string {
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
function write(level: string, args: unknown[]): void {
    const ts = new Date().toISOString();
    const msg = args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ");
    try {
        process.stderr.write(`[${ts}] [${level}] ${msg}\n`);
    }
    catch {
    }
}
export const logger = {
    debug: (...args: unknown[]) => {
        if (DEBUG)
            write("DEBUG", args);
    },
    info: (...args: unknown[]) => write("INFO", args),
    warn: (...args: unknown[]) => write("WARN", args),
    error: (...args: unknown[]) => write("ERROR", args),
};
