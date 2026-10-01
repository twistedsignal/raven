import { CliError, resolveApiKey } from "./config.js";
export const BASE_URL = process.env.RAVEN_API_BASE_URL || "https://apis.roblox.com";
export class ApiError extends CliError {
    status;
    body;
    constructor(status, message, body) {
        super(message);
        this.status = status;
        this.body = body;
    }
}
const MAX_RETRIES = 3;
export async function request(method, path, opts = {}) {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
        if (v !== undefined)
            url.searchParams.set(k, String(v));
    }
    const headers = { ...opts.headers };
    if (!opts.noAuth)
        headers["x-api-key"] = opts.apiKey ?? (await resolveApiKey());
    let body = opts.body;
    if (opts.json !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.json);
    }
    for (let attempt = 0;; attempt++) {
        let res;
        try {
            res = await fetch(url, { method, headers, body });
        }
        catch (err) {
            throw new CliError(`Network error contacting ${url.host}: ${err.message}`);
        }
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
            const retryAfter = Number(res.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
            await sleep(delay);
            continue;
        }
        const text = await res.text();
        let data = text;
        if (text && res.headers.get("content-type")?.includes("json")) {
            try {
                data = JSON.parse(text);
            }
            catch {
                // leave as text
            }
        }
        if (!res.ok)
            throw new ApiError(res.status, formatError(res.status, data), data);
        return (text ? data : undefined);
    }
}
function formatError(status, data) {
    let detail = "";
    if (data && typeof data === "object") {
        const d = data;
        detail =
            d.message ??
                d.errorMessage ??
                d.errors?.[0]?.message ??
                d.error?.message ??
                (typeof d.error === "string" ? d.error : "") ??
                "";
        const code = typeof d.code === "string" ? d.code : d.errorCode;
        if (code && typeof code === "string" && detail)
            detail = `${code}: ${detail}`;
    }
    else if (typeof data === "string") {
        detail = data.trim().slice(0, 300);
    }
    const hint = status === 401
        ? " (is your API key valid? run `raven auth`)"
        : status === 403
            ? " (does your API key have the required permission and access to this resource?)"
            : "";
    return `Request failed with ${status}${detail ? `: ${detail}` : ""}${hint}`;
}
export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
