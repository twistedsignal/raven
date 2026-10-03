import { Command, InvalidArgumentError, Option } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { downloadAsset } from "../lib/download.js";
import { request, sleep } from "../lib/api.js";
import { parseCreator, parseId, parsePositiveInt } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { field, output, success, withSpinner } from "../lib/output.js";
const ASSET_TYPES = ["Audio", "Decal", "Model", "Video", "Animation"];
const CONTENT_TYPES = {
    ".mp3": { contentType: "audio/mpeg", assetType: "Audio" },
    ".ogg": { contentType: "audio/ogg", assetType: "Audio" },
    ".wav": { contentType: "audio/wav", assetType: "Audio" },
    ".flac": { contentType: "audio/flac", assetType: "Audio" },
    ".png": { contentType: "image/png", assetType: "Decal" },
    ".jpg": { contentType: "image/jpeg", assetType: "Decal" },
    ".jpeg": { contentType: "image/jpeg", assetType: "Decal" },
    ".bmp": { contentType: "image/bmp", assetType: "Decal" },
    ".tga": { contentType: "image/tga", assetType: "Decal" },
    ".fbx": { contentType: "model/fbx", assetType: "Model" },
    ".gltf": { contentType: "model/gltf+json", assetType: "Model" },
    ".glb": { contentType: "model/gltf-binary", assetType: "Model" },
    ".rbxm": { contentType: "model/x-rbxm", assetType: "Model" },
    ".rbxmx": { contentType: "model/x-rbxm", assetType: "Model" },
    ".mp4": { contentType: "video/mp4", assetType: "Video" },
    ".mov": { contentType: "video/mov", assetType: "Video" },
};
function parseAssetType(value) {
    const match = ASSET_TYPES.find((t) => t.toLowerCase() === value.toLowerCase());
    if (!match)
        throw new InvalidArgumentError(`Expected one of: ${ASSET_TYPES.join(", ")}.`);
    return match;
}
function contentTypeFor(path) {
    const entry = CONTENT_TYPES[extname(path).toLowerCase()];
    if (!entry) {
        throw new CliError(`Unsupported file extension "${extname(path)}". Supported: ${Object.keys(CONTENT_TYPES).join(", ")}`);
    }
    return entry;
}
async function readAssetFile(path) {
    const { contentType } = contentTypeFor(path);
    try {
        return new Blob([await readFile(path)], { type: contentType });
    }
    catch (err) {
        throw new CliError(`Could not read ${path}: ${err.message}`);
    }
}
/** Polls an asset operation until it finishes. */
async function waitForOperation(op, onTick) {
    const id = op.path.split("/").pop();
    let current = op;
    for (let attempt = 0; !current.done; attempt++) {
        if (attempt >= 30)
            throw new CliError(`Timed out waiting for operation ${id}. Check it later on the Creator Dashboard.`);
        onTick?.(attempt);
        await sleep(Math.min(1000 * 1.5 ** attempt, 5000));
        current = await request("GET", `/assets/v1/operations/${id}`);
    }
    if (current.error)
        throw new CliError(`Operation failed: ${current.error.message ?? JSON.stringify(current.error)}`);
    return current.response ?? {};
}
function printAsset(asset) {
    field("Asset ID", asset.assetId);
    field("Type", asset.assetType);
    field("Name", asset.displayName);
    field("Description", asset.description);
    field("Revision", asset.revisionId);
    field("Updated", asset.revisionCreateTime);
    field("Moderation", asset.moderationResult?.moderationState);
    if (asset.assetId)
        field("URL", pc.underline(`https://create.roblox.com/store/asset/${asset.assetId}`));
}
export function assetCommand() {
    const asset = new Command("asset").description("download, upload, update, and roll back assets").addHelpText("after", examples(["raven asset upload --path sword.fbx --creator user:123", "type is inferred from the extension"], ["raven asset upload --path logo.png --type Decal --name Logo --creator group:456"], ["raven asset update --id 987 --path sword_v2.fbx", "upload a new version"], ["raven asset rollback --id 987 --to 3"], ["raven asset versions --id 987"]));
    asset
        .command("download")
        .description("download asset content using Legacy Assets Manage permission")
        .requiredOption("--id <id>", "asset ID", parseId)
        .requiredOption("--output <file>", "destination file")
        .action(async (opts) => {
        const result = await withSpinner("Downloading asset…", () => downloadAsset(opts.id, opts.output));
        output(result, () => success(`Downloaded ${result.assetId} to ${result.path} (${result.bytes} bytes)`));
    });
    asset
        .command("upload")
        .description("upload a new asset")
        .requiredOption("--path <file>", "file to upload")
        .addOption(new Option("--type <type>", "asset type (inferred from the file extension if omitted)")
        .choices(ASSET_TYPES)
        .argParser(parseAssetType))
        .option("--name <name>", "display name (defaults to the file name)")
        .option("--description <text>", "asset description", "")
        .addOption(new Option("--creator <creator>", "owner as `user:<id>` or `group:<id>`")
        .env("RAVEN_CREATOR")
        .argParser(parseCreator)
        .makeOptionMandatory())
        .option("--no-wait", "don't wait for processing to finish")
        .action(async (opts) => {
        const { assetType: inferred } = contentTypeFor(opts.path);
        const assetType = opts.type ?? inferred;
        const displayName = opts.name ?? basename(opts.path, extname(opts.path));
        const form = new FormData();
        form.append("request", JSON.stringify({
            assetType,
            displayName,
            description: opts.description,
            creationContext: { creator: opts.creator },
        }));
        form.append("fileContent", await readAssetFile(opts.path), basename(opts.path));
        const result = await withSpinner(`Uploading ${basename(opts.path)}...`, async (spinner) => {
            const op = await request("POST", "/assets/v1/assets", { body: form });
            if (!opts.wait)
                return op;
            spinner.text = "Processing asset...";
            return waitForOperation(op);
        });
        output(result, () => {
            if ("path" in result && result.path?.startsWith("operations/")) {
                success(`Upload started (${result.path}).`);
            }
            else {
                success(`Uploaded ${pc.cyan(displayName)}`);
                printAsset(result);
            }
        });
    });
    asset
        .command("update")
        .description("upload a new version of an asset and/or update its metadata")
        .requiredOption("--id <assetId>", "asset ID", parseId)
        .option("--path <file>", "new file contents")
        .option("--name <name>", "new display name")
        .option("--description <text>", "new description")
        .option("--no-wait", "don't wait for processing to finish")
        .action(async (opts) => {
        if (!opts.path && opts.name === undefined && opts.description === undefined) {
            throw new CliError("Nothing to update. Pass --path, --name, and/or --description.");
        }
        const body = { assetId: opts.id };
        const mask = [];
        if (opts.name !== undefined) {
            body.displayName = opts.name;
            mask.push("displayName");
        }
        if (opts.description !== undefined) {
            body.description = opts.description;
            mask.push("description");
        }
        const form = new FormData();
        form.append("request", JSON.stringify(body));
        if (opts.path)
            form.append("fileContent", await readAssetFile(opts.path), basename(opts.path));
        const result = await withSpinner(`Updating asset ${opts.id}...`, async (spinner) => {
            const op = await request("PATCH", `/assets/v1/assets/${opts.id}`, {
                body: form,
                query: { updateMask: mask.length ? mask.join(",") : undefined },
            });
            if (!opts.wait)
                return op;
            spinner.text = "Processing asset...";
            return waitForOperation(op);
        });
        output(result, () => {
            success(`Updated asset ${pc.cyan(opts.id)}`);
            if (opts.wait)
                printAsset(result);
        });
    });
    asset
        .command("rollback")
        .description("roll an asset back to a previous version")
        .requiredOption("--id <assetId>", "asset ID", parseId)
        .requiredOption("--to <version>", "version number to roll back to", parsePositiveInt)
        .action(async (opts) => {
        const form = new FormData();
        form.append("assetVersion", `assets/${opts.id}/versions/${opts.to}`);
        const result = await withSpinner(`Rolling back asset ${opts.id}...`, () => request("POST", `/assets/v1/assets/${opts.id}/versions:rollback`, { body: form }));
        output(result, () => {
            success(`Rolled back asset ${pc.cyan(opts.id)} to version ${opts.to}`);
            field("New version", result?.path?.split("/").pop());
        });
    });
    asset
        .command("get")
        .description("show information about an asset")
        .requiredOption("--id <assetId>", "asset ID", parseId)
        .action(async (opts) => {
        const result = await withSpinner(`Fetching asset ${opts.id}...`, () => request("GET", `/assets/v1/assets/${opts.id}`, {
            query: { readMask: "assetType,creationContext,description,displayName,path,revisionId,revisionCreateTime,state,moderationResult" },
        }));
        output(result, () => printAsset(result));
    });
    asset
        .command("versions")
        .description("list versions of an asset")
        .requiredOption("--id <assetId>", "asset ID", parseId)
        .option("--limit <n>", "maximum number of versions to show", parsePositiveInt, 10)
        .action(async (opts) => {
        const result = await withSpinner(`Fetching versions of ${opts.id}...`, () => request("GET", `/assets/v1/assets/${opts.id}/versions`, { query: { maxPageSize: Math.min(opts.limit, 50) } }));
        const versions = (result.assetVersions ?? []).slice(0, opts.limit);
        output(versions, () => {
            if (!versions.length)
                return console.log("No versions found.");
            for (const v of versions) {
                const num = v.path.split("/").pop();
                const state = v.moderationResult?.moderationState;
                console.log(`  ${pc.bold(`v${num}`)}${v.published ? pc.green(" published") : ""}${state ? pc.dim(` ${state}`) : ""}`);
            }
        });
    });
    return asset;
}
