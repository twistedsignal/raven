import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export function configDir() {
    if (process.env.RAVEN_CONFIG_DIR)
        return process.env.RAVEN_CONFIG_DIR;
    if (process.platform === "win32" && process.env.APPDATA) {
        return join(process.env.APPDATA, "raven");
    }
    const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(base, "raven");
}
export function credentialsPath() {
    return join(configDir(), "credentials.json");
}
export async function loadCredentials() {
    try {
        const raw = await readFile(credentialsPath(), "utf8");
        const parsed = JSON.parse(raw);
        return parsed.apiKey ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
export async function saveCredentials(creds) {
    await mkdir(configDir(), { recursive: true, mode: 0o700 });
    const path = credentialsPath();
    await writeFile(path, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
    // writeFile only applies mode on creation, so enforce it on overwrite too.
    await chmod(path, 0o600).catch(() => { });
}
export async function clearCredentials() {
    const existing = await loadCredentials();
    await rm(credentialsPath(), { force: true });
    return existing !== undefined;
}
let overrideKey;
export function setApiKeyOverride(key) {
    overrideKey = key;
}
/** Resolves the API key from --api-key, RAVEN_API_KEY, or the saved credentials. */
export async function resolveApiKey() {
    if (overrideKey)
        return overrideKey;
    if (process.env.RAVEN_API_KEY)
        return process.env.RAVEN_API_KEY;
    const creds = await loadCredentials();
    if (creds)
        return creds.apiKey;
    throw new CliError("You are not logged in. Run `raven auth` to log in, or set RAVEN_API_KEY.");
}
export class CliError extends Error {
}
