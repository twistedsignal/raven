import { Command } from "commander";
import pc from "picocolors";
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { info, success, withSpinner } from "../lib/output.js";
const REPO = "twistedsignal/raven";
const PACKAGE_JSON_URL = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
const TARBALL_URL = `https://github.com/${REPO}/archive/refs/heads/main.tar.gz`;
async function latestVersion() {
    let res;
    try {
        res = await fetch(PACKAGE_JSON_URL, { headers: { "cache-control": "no-cache" } });
    }
    catch (err) {
        throw new CliError(`Couldn't reach GitHub: ${err.message}`);
    }
    if (!res.ok)
        throw new CliError(`Couldn't check for updates (GitHub returned ${res.status}).`);
    return (await res.json()).version;
}
/** Returns >0 if a is newer than b. */
function compareVersions(a, b) {
    const pa = a.split(/[.-]/).map(Number);
    const pb = b.split(/[.-]/).map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff)
            return diff;
    }
    return 0;
}
/** The directory Raven is installed in (the package root). */
function installRoot() {
    return dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.url)))));
}
/** Picks the install command matching the package manager Raven was installed with. */
function installCommand(root) {
    if (/[\\/]\.?pnpm[\\/]/.test(root))
        return ["pnpm", ["add", "-g", TARBALL_URL]];
    if (/[\\/]\.bun[\\/]/.test(root))
        return ["bun", ["add", "-g", TARBALL_URL]];
    return ["npm", ["install", "-g", TARBALL_URL]];
}
function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 1));
    });
}
export function updateCommand(version) {
    return new Command("update")
        .description("update Raven to the latest version")
        .option("--check", "only check whether an update is available")
        .option("-f, --force", "reinstall even if already up to date")
        .addHelpText("after", examples(["raven update"], ["raven update --check", "just check, don't install"]))
        .action(async (opts) => {
        const root = installRoot();
        if (existsSync(join(root, ".git"))) {
            throw new CliError(`Raven is running from a git checkout (${root}).\nUpdate it with: git pull && pnpm install && pnpm build`);
        }
        const latest = await withSpinner("Checking for updates...", latestVersion);
        const newer = compareVersions(latest, version) > 0;
        if (!newer && !opts.force) {
            success(`Raven is up to date (v${version}).`);
            return;
        }
        if (opts.check) {
            info(`Update available: ${pc.dim(`v${version}`)} → ${pc.green(`v${latest}`)}. Run ${pc.cyan("raven update")} to install it.`);
            return;
        }
        const [cmd, args] = installCommand(root);
        info(newer ? `Updating Raven ${pc.dim(`v${version}`)} → ${pc.green(`v${latest}`)}...` : `Reinstalling Raven v${latest}...`);
        info(pc.dim(`$ ${cmd} ${args.join(" ")}`));
        info("");
        let code;
        try {
            code = await run(cmd, args);
        }
        catch (err) {
            throw new CliError(`Couldn't run ${cmd}: ${err.message}`);
        }
        if (code !== 0) {
            throw new CliError(`Update failed (${cmd} exited with code ${code}). If it's a permissions error, try running it with sudo or fix your npm prefix.`);
        }
        info("");
        success(`Raven updated to v${latest}.`);
    });
}
