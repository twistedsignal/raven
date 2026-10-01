import { Command, InvalidArgumentError, Option } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { request, sleep } from "../lib/api.js";
import { type Creator, parseCreator, parseId, parsePositiveInt } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { field, output, success, withSpinner } from "../lib/output.js";

const ASSET_TYPES = ["Audio", "Decal", "Model", "Video", "Animation"] as const;
type AssetType = (typeof ASSET_TYPES)[number];

const CONTENT_TYPES: Record<string, { contentType: string; assetType: AssetType }> = {
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

interface Operation {
  path: string;
  done?: boolean;
  error?: { code?: number | string; message?: string };
  response?: Asset;
}

interface Asset {
  assetId?: string;
  assetType?: string;
  displayName?: string;
  description?: string;
  path?: string;
  revisionId?: string;
  revisionCreateTime?: string;
  moderationResult?: { moderationState?: string };
  state?: string;
  creationContext?: { creator?: Creator };
}

interface AssetVersion {
  path: string;
  creationContext?: { creator?: Creator };
  moderationResult?: { moderationState?: string };
  published?: boolean;
}

function parseAssetType(value: string): AssetType {
  const match = ASSET_TYPES.find((t) => t.toLowerCase() === value.toLowerCase());
  if (!match) throw new InvalidArgumentError(`Expected one of: ${ASSET_TYPES.join(", ")}.`);
  return match;
}

function contentTypeFor(path: string) {
  const entry = CONTENT_TYPES[extname(path).toLowerCase()];
  if (!entry) {
    throw new CliError(
      `Unsupported file extension "${extname(path)}". Supported: ${Object.keys(CONTENT_TYPES).join(", ")}`,
    );
  }
  return entry;
}

async function readAssetFile(path: string): Promise<Blob> {
  const { contentType } = contentTypeFor(path);
  try {
    return new Blob([await readFile(path)], { type: contentType });
  } catch (err) {
    throw new CliError(`Could not read ${path}: ${(err as Error).message}`);
  }
}

/** Polls an asset operation until it finishes. */
async function waitForOperation(op: Operation, onTick?: (attempt: number) => void): Promise<Asset> {
  const id = op.path.split("/").pop();
  let current = op;
  for (let attempt = 0; !current.done; attempt++) {
    if (attempt >= 30) throw new CliError(`Timed out waiting for operation ${id}. Check it later on the Creator Dashboard.`);
    onTick?.(attempt);
    await sleep(Math.min(1000 * 1.5 ** attempt, 5000));
    current = await request<Operation>("GET", `/assets/v1/operations/${id}`);
  }
  if (current.error) throw new CliError(`Operation failed: ${current.error.message ?? JSON.stringify(current.error)}`);
  return current.response ?? {};
}

function printAsset(asset: Asset): void {
  field("Asset ID", asset.assetId);
  field("Type", asset.assetType);
  field("Name", asset.displayName);
  field("Description", asset.description);
  field("Revision", asset.revisionId);
  field("Updated", asset.revisionCreateTime);
  field("Moderation", asset.moderationResult?.moderationState);
  if (asset.assetId) field("URL", pc.underline(`https://create.roblox.com/store/asset/${asset.assetId}`));
}

export function assetCommand(): Command {
  const asset = new Command("asset").description("upload, update, and roll back assets").addHelpText(
    "after",
    examples(
      ["raven asset upload --path sword.fbx --creator user:123", "type is inferred from the extension"],
      ["raven asset upload --path logo.png --type Decal --name Logo --creator group:456"],
      ["raven asset update --id 987 --path sword_v2.fbx", "upload a new version"],
      ["raven asset rollback --id 987 --version 3"],
      ["raven asset versions --id 987"],
    ),
  );

  asset
    .command("upload")
    .description("upload a new asset")
    .requiredOption("--path <file>", "file to upload")
    .addOption(
      new Option("--type <type>", "asset type (inferred from the file extension if omitted)")
        .choices(ASSET_TYPES)
        .argParser(parseAssetType),
    )
    .option("--name <name>", "display name (defaults to the file name)")
    .option("--description <text>", "asset description", "")
    .addOption(
      new Option("--creator <creator>", "owner as `user:<id>` or `group:<id>`")
        .env("RAVEN_CREATOR")
        .argParser(parseCreator)
        .makeOptionMandatory(),
    )
    .option("--no-wait", "don't wait for processing to finish")
    .action(async (opts: { path: string; type?: AssetType; name?: string; description: string; creator: Creator; wait: boolean }) => {
      const { assetType: inferred } = contentTypeFor(opts.path);
      const assetType = opts.type ?? inferred;
      const displayName = opts.name ?? basename(opts.path, extname(opts.path));

      const form = new FormData();
      form.append(
        "request",
        JSON.stringify({
          assetType,
          displayName,
          description: opts.description,
          creationContext: { creator: opts.creator },
        }),
      );
      form.append("fileContent", await readAssetFile(opts.path), basename(opts.path));

      const result = await withSpinner(`Uploading ${basename(opts.path)}...`, async (spinner) => {
        const op = await request<Operation>("POST", "/assets/v1/assets", { body: form });
        if (!opts.wait) return op;
        spinner.text = "Processing asset...";
        return waitForOperation(op);
      });

      output(result, () => {
        if ("path" in result && (result as Operation).path?.startsWith("operations/")) {
          success(`Upload started (${(result as Operation).path}).`);
        } else {
          success(`Uploaded ${pc.cyan(displayName)}`);
          printAsset(result as Asset);
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
    .action(async (opts: { id: string; path?: string; name?: string; description?: string; wait: boolean }) => {
      if (!opts.path && opts.name === undefined && opts.description === undefined) {
        throw new CliError("Nothing to update. Pass --path, --name, and/or --description.");
      }

      const body: Record<string, string> = { assetId: opts.id };
      const mask: string[] = [];
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
      if (opts.path) form.append("fileContent", await readAssetFile(opts.path), basename(opts.path));

      const result = await withSpinner(`Updating asset ${opts.id}...`, async (spinner) => {
        const op = await request<Operation>("PATCH", `/assets/v1/assets/${opts.id}`, {
          body: form,
          query: { updateMask: mask.length ? mask.join(",") : undefined },
        });
        if (!opts.wait) return op;
        spinner.text = "Processing asset...";
        return waitForOperation(op);
      });

      output(result, () => {
        success(`Updated asset ${pc.cyan(opts.id)}`);
        if (opts.wait) printAsset(result as Asset);
      });
    });

  asset
    .command("rollback")
    .description("roll an asset back to a previous version")
    .requiredOption("--id <assetId>", "asset ID", parseId)
    .requiredOption("--version <number>", "version number to roll back to", parsePositiveInt)
    .action(async (opts: { id: string; version: number }) => {
      const result = await withSpinner(`Rolling back asset ${opts.id}...`, () =>
        request<AssetVersion>("POST", `/assets/v1/assets/${opts.id}:rollback`, {
          json: { assetVersion: `assets/${opts.id}/versions/${opts.version}` },
        }),
      );
      output(result, () => {
        success(`Rolled back asset ${pc.cyan(opts.id)} to version ${opts.version}`);
        field("New version", result?.path?.split("/").pop());
      });
    });

  asset
    .command("get")
    .description("show information about an asset")
    .requiredOption("--id <assetId>", "asset ID", parseId)
    .action(async (opts: { id: string }) => {
      const result = await withSpinner(`Fetching asset ${opts.id}...`, () =>
        request<Asset>("GET", `/assets/v1/assets/${opts.id}`, {
          query: { readMask: "assetType,creationContext,description,displayName,path,revisionId,revisionCreateTime,state,moderationResult" },
        }),
      );
      output(result, () => printAsset(result));
    });

  asset
    .command("versions")
    .description("list versions of an asset")
    .requiredOption("--id <assetId>", "asset ID", parseId)
    .option("--limit <n>", "maximum number of versions to show", parsePositiveInt, 10)
    .action(async (opts: { id: string; limit: number }) => {
      const result = await withSpinner(`Fetching versions of ${opts.id}...`, () =>
        request<{ assetVersions?: AssetVersion[]; nextPageToken?: string }>(
          "GET",
          `/assets/v1/assets/${opts.id}/versions`,
          { query: { maxPageSize: Math.min(opts.limit, 50) } },
        ),
      );
      const versions = (result.assetVersions ?? []).slice(0, opts.limit);
      output(versions, () => {
        if (!versions.length) return console.log("No versions found.");
        for (const v of versions) {
          const num = v.path.split("/").pop();
          const state = v.moderationResult?.moderationState;
          console.log(`  ${pc.bold(`v${num}`)}${v.published ? pc.green(" published") : ""}${state ? pc.dim(` ${state}`) : ""}`);
        }
      });
    });

  return asset;
}
