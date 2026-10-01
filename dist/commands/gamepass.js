import { Command } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { request } from "../lib/api.js";
import { parseId, parsePositiveInt, universeOption } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { field, output, success, withSpinner } from "../lib/output.js";
const IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".bmp": "image/bmp",
    ".tga": "image/tga",
};
const base = (universe) => `/game-passes/v1/universes/${universe}/game-passes`;
async function readIcon(path) {
    const type = IMAGE_TYPES[extname(path).toLowerCase()];
    if (!type)
        throw new CliError(`Icons must be one of: ${Object.keys(IMAGE_TYPES).join(", ")}`);
    try {
        return new Blob([await readFile(path)], { type });
    }
    catch (err) {
        throw new CliError(`Could not read ${path}: ${err.message}`);
    }
}
function getPass(universe, id) {
    return request("GET", `${base(universe)}/${id}/creator`);
}
function update(universe, id, form) {
    return request("PATCH", `${base(universe)}/${id}`, { body: form });
}
function price(pass) {
    const robux = pass.priceInformation?.defaultPriceInRobux;
    return robux == null ? "not set" : `R$${robux}`;
}
function printPass(pass) {
    field("ID", pass.gamePassId);
    field("Name", pass.name);
    field("Description", pass.description);
    field("Price", price(pass));
    field("Status", pass.isForSale ? pc.green("on sale") : pc.yellow("off sale"));
    field("Regional", pass.priceInformation?.enabledFeatures.includes("RegionalPricing") ? "enabled" : undefined);
    field("Icon asset", pass.iconAssetId || undefined);
    field("Updated", pass.updatedTimestamp);
    field("URL", pc.underline(`https://www.roblox.com/game-pass/${pass.gamePassId}`));
}
/** Builds the multipart body shared by create and update. `iconField` differs between the two endpoints. */
async function buildForm(opts, iconField) {
    if (opts.onsale && opts.offsale)
        throw new CliError("Pass only one of --onsale or --offsale.");
    const form = new FormData();
    if (opts.name !== undefined)
        form.append("name", opts.name);
    if (opts.description !== undefined)
        form.append("description", opts.description);
    if (opts.price !== undefined)
        form.append("price", String(opts.price));
    if (opts.onsale)
        form.append("isForSale", "true");
    if (opts.offsale)
        form.append("isForSale", "false");
    if (opts.regionalPricing !== undefined)
        form.append("isRegionalPricingEnabled", String(opts.regionalPricing));
    if (opts.icon)
        form.append(iconField, await readIcon(opts.icon), basename(opts.icon));
    return form;
}
export function gamepassCommand() {
    const gp = new Command("gamepass").alias("gp").description("create and manage game passes");
    gp.command("add")
        .description("create a new game pass")
        .addOption(universeOption())
        .requiredOption("--name <name>", "game pass name")
        .option("--description <text>", "game pass description")
        .option("--price <robux>", "price in Robux (puts the pass on sale unless --offsale is given)", parsePositiveInt)
        .option("--icon <file>", "icon image (.png, .jpg, .bmp, .tga)")
        .option("--offsale", "create the pass without putting it on sale")
        .option("--regional-pricing", "enable regional pricing")
        .action(async (opts) => {
        const form = await buildForm({ ...opts, onsale: opts.price !== undefined && !opts.offsale }, "imageFile");
        const pass = await withSpinner(`Creating ${opts.name}...`, () => request("POST", base(opts.universe), { body: form }));
        output(pass, () => {
            success(`Created game pass ${pc.cyan(pass.name)}`);
            printPass(pass);
        });
    });
    gp.command("update")
        .description("update a game pass")
        .addOption(universeOption())
        .requiredOption("--id <gamePassId>", "game pass ID", parseId)
        .option("--name <name>", "new name")
        .option("--description <text>", "new description")
        .option("--price <robux>", "new price in Robux", parsePositiveInt)
        .option("--icon <file>", "new icon image (.png, .jpg, .bmp, .tga)")
        .option("--onsale", "put the pass on sale")
        .option("--offsale", "take the pass off sale")
        .option("--regional-pricing", "enable regional pricing")
        .option("--no-regional-pricing", "disable regional pricing")
        .action(async (opts) => {
        const form = await buildForm(opts, "file");
        if ([...form.keys()].length === 0) {
            throw new CliError("Nothing to update. Pass at least one of --name, --description, --price, --icon, --onsale, --offsale, or --regional-pricing.");
        }
        const pass = await withSpinner(`Updating game pass ${opts.id}...`, async () => {
            await update(opts.universe, opts.id, form);
            return getPass(opts.universe, opts.id);
        });
        output(pass, () => {
            success(`Updated game pass ${pc.cyan(pass.name)}`);
            printPass(pass);
        });
    });
    gp.command("disable")
        .alias("offsale")
        .description("take a game pass off sale (game passes can't be deleted)")
        .addOption(universeOption())
        .requiredOption("--id <gamePassId>", "game pass ID", parseId)
        .action(async (opts) => {
        const pass = await withSpinner(`Disabling game pass ${opts.id}...`, async () => {
            await update(opts.universe, opts.id, await buildForm({ offsale: true }, "file"));
            return getPass(opts.universe, opts.id);
        });
        output(pass, () => success(`${pc.cyan(pass.name)} is now off sale. Players who already own it keep it.`));
    });
    gp.command("enable")
        .alias("onsale")
        .description("put a game pass back on sale")
        .addOption(universeOption())
        .requiredOption("--id <gamePassId>", "game pass ID", parseId)
        .option("--price <robux>", "price in Robux (required if the pass has no price yet)", parsePositiveInt)
        .action(async (opts) => {
        const pass = await withSpinner(`Enabling game pass ${opts.id}...`, async () => {
            await update(opts.universe, opts.id, await buildForm({ onsale: true, price: opts.price }, "file"));
            return getPass(opts.universe, opts.id);
        });
        output(pass, () => success(`${pc.cyan(pass.name)} is now on sale for ${price(pass)}.`));
    });
    gp.command("get")
        .description("show a game pass")
        .addOption(universeOption())
        .requiredOption("--id <gamePassId>", "game pass ID", parseId)
        .action(async (opts) => {
        const pass = await withSpinner(`Fetching game pass ${opts.id}...`, () => getPass(opts.universe, opts.id));
        output(pass, () => printPass(pass));
    });
    gp.command("list")
        .description("list game passes in an experience")
        .addOption(universeOption())
        .option("--limit <n>", "maximum number of results", parsePositiveInt, 100)
        .action(async (opts) => {
        const passes = await withSpinner("Fetching game passes...", async () => {
            const items = [];
            let pageToken;
            do {
                const page = await request("GET", `${base(opts.universe)}/creator`, { query: { pageSize: Math.min(opts.limit - items.length, 100), pageToken } });
                items.push(...(page.gamePasses ?? []));
                pageToken = page.nextPageToken || undefined;
            } while (pageToken && items.length < opts.limit);
            return items.slice(0, opts.limit);
        });
        output(passes, () => {
            if (!passes.length)
                return console.log("No game passes found.");
            for (const p of passes) {
                const status = p.isForSale ? pc.green(price(p)) : pc.yellow("off sale");
                console.log(`${pc.dim(String(p.gamePassId).padEnd(14))} ${p.name}  ${status}`);
            }
        });
    });
    return gp;
}
