export function ok(data, note) {
    const payload = note ? { note, ...data } : data;
    return {
        content: [
            {
                type: "text",
                text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
            },
        ],
    };
}
export function fromService(r) {
    if (!r.ok) {
        const hint = r.warnings?.length ? r.warnings.join("；") : undefined;
        return fail(r.message ?? "操作失败", hint);
    }
    return ok(r);
}
export function fail(message, hint) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(hint ? { error: message, hint } : { error: message }, null, 2),
            },
        ],
        isError: true,
    };
}
