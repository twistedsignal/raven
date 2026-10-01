import { Command } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { request } from "../lib/api.js";
import { placeOption, universeOption } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { field, output, success, withSpinner } from "../lib/output.js";
const CONTENT_TYPES = {
    ".rbxl": "application/octet-stream",
    ".rbxlx": "application/xml",
};
export function publishCommand() {
    return new Command("publish")
        .description("publish a place file to an experience")
        .requiredOption("--path <file>", "place file (.rbxl or .rbxlx)")
        .addOption(universeOption())
        .addOption(placeOption())
        .option("--saved", "save the version without publishing it live")
        .action(async (opts) => {
        const contentType = CONTENT_TYPES[extname(opts.path).toLowerCase()];
        if (!contentType)
            throw new CliError("Place files must be .rbxl or .rbxlx.");
        let file;
        try {
            file = await readFile(opts.path);
        }
        catch (err) {
            throw new CliError(`Could not read ${opts.path}: ${err.message}`);
        }
        const versionType = opts.saved ? "Saved" : "Published";
        const result = await withSpinner(`${opts.saved ? "Saving" : "Publishing"} ${basename(opts.path)}...`, () => request("POST", `/universes/v1/${opts.universe}/places/${opts.place}/versions`, {
            query: { versionType },
            body: new Uint8Array(file),
            headers: { "content-type": contentType },
        }));
        output(result, () => {
            success(`${opts.saved ? "Saved" : "Published"} ${pc.cyan(basename(opts.path))} as version ${pc.bold(String(result.versionNumber))}`);
            field("Universe", opts.universe);
            field("Place", opts.place);
            field("URL", pc.underline(`https://www.roblox.com/games/${opts.place}`));
        });
    });
}
