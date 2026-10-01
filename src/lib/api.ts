import { CliError, resolveApiKey } from "./config.js";

export const BASE_URL = process.env.RAVEN_API_BASE_URL || "https://apis.roblox.com";

export class ApiError extends CliError {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  query?: Query;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  apiKey?: string;
  /** Skip attaching the x-api-key header (for endpoints that take the key in the body). */
  noAuth?: boolean;
}

const MAX_RETRIES = 3;

export async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { ...opts.headers };
  if (!opts.noAuth) headers["x-api-key"] = opts.apiKey ?? (await resolveApiKey());

  let body = opts.body;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (err) {
      throw new CliError(`Network error contacting ${url.host}: ${(err as Error).message}`);
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await sleep(delay);
      continue;
    }

    const text = await res.text();
    let data: unknown = text;
    if (text && res.headers.get("content-type")?.includes("json")) {
      try {
        data = JSON.parse(text);
      } catch {
        // leave as text
      }
    }

    if (!res.ok) throw new ApiError(res.status, formatError(res.status, data), data);
    return (text ? data : undefined) as T;
  }
}

function formatError(status: number, data: unknown): string {
  let detail = "";
  if (data && typeof data === "object") {
    const d = data as Record<string, any>;
    detail =
      d.message ??
      d.errorMessage ??
      d.errors?.[0]?.message ??
      d.error?.message ??
      (typeof d.error === "string" ? d.error : "") ??
      "";
    const code = typeof d.code === "string" ? d.code : d.errorCode;
    if (code && typeof code === "string" && detail) detail = `${code}: ${detail}`;
  } else if (typeof data === "string") {
    detail = data.trim().slice(0, 300);
  }
  const hint =
    status === 401
      ? " (is your API key valid? run `raven auth`)"
      : status === 403
        ? " (does your API key have the required permission and access to this resource?)"
        : "";
  return `Request failed with ${status}${detail ? `: ${detail}` : ""}${hint}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
