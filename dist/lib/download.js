import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { CliError } from "./config.js";
import { ApiError, request, sleep } from "./api.js";
const MAX_BYTES = 128 * 1024 * 1024;
const TIMEOUT = 30_000;
/** Download CDN bytes separately: the API key must never accompany this request. */
export async function fetchBytes(location) {
    const url = new URL(location);
    if (url.protocol !== "https:" && !(process.env.RAVEN_API_BASE_URL && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
        throw new CliError("Asset delivery returned an insecure download URL.");
    }
    for (let attempt = 0;; attempt++) {
        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
        }
        catch {
            throw new CliError(`Could not download asset from ${url.host}; the request failed or timed out.`);
        }
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
            await response.body?.cancel();
            const retryAfter = Number(response.headers.get("retry-after"));
            await sleep(Math.min(10_000, retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
            continue;
        }
        if (!response.ok)
            throw new CliError(`Asset download returned HTTP ${response.status}.`);
        const reader = response.body?.getReader();
        if (!reader)
            throw new CliError("Asset download was empty.");
        const chunks = [];
        let length = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                length += value.byteLength;
                if (length > MAX_BYTES)
                    throw new CliError("Asset exceeds the 128 MB download limit.");
                chunks.push(value);
            }
        }
        catch (error) {
            await reader.cancel().catch(() => { });
            if (error instanceof CliError)
                throw error;
            throw new CliError("Asset download was interrupted or timed out.");
        }
        if (!length)
            throw new CliError("Asset download was empty.");
        return Buffer.concat(chunks, length);
    }
}
export async function downloadAsset(assetId, outputPath) {
    let delivery;
    try {
        delivery = await request("GET", `/asset-delivery-api/v1/assetId/${assetId}`, { timeout: TIMEOUT, noRedirect: true });
    }
    catch (error) {
        if (error instanceof ApiError && error.status === 403) {
            throw new CliError("Asset delivery denied access. Add Legacy Assets > Manage (legacy-asset:manage) to your key, and check access to this asset.");
        }
        throw error;
    }
    const location = delivery?.location ?? delivery?.locations?.[0]?.location;
    if (typeof location !== "string")
        throw new CliError("Asset delivery did not return a download location.");
    const bytes = await fetchBytes(location);
    const path = resolve(outputPath);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rename(temporary, path);
    }
    catch {
        throw new CliError(`Could not write asset to ${path}.`);
    }
    finally {
        await rm(temporary, { force: true });
    }
    return { assetId, path, bytes: bytes.byteLength };
}
