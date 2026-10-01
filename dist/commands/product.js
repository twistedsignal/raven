import { Command, InvalidArgumentError, Option } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { request } from "../lib/api.js";
import { parseId, parsePositiveInt, universeOption } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { field, output, success, withSpinner } from "../lib/output.js";
/** The game pass and developer product APIs are near-identical; these are the parts that differ. */
const TYPES = {
    gamepass: {
        label: "game pass",
        base: (u) => `/game-passes/v1/universes/${u}/game-passes`,
        idField: "gamePassId",
        iconField: "iconAssetId",
        listField: "gamePasses",
        createIconField: "imageFile",
        updateIconField: "file",
        url: (id) => `https://www.roblox.com/game-pass/${id}`,
    },
    devProduct: {
        label: "developer product",
        base: (u) => `/developer-products/v2/universes/${u}/developer-products`,
        idField: "productId",
        iconField: "iconImageAssetId",
        listField: "developerProducts",
        createIconField: "imageFile",
        updateIconField: "imageFile",
    },
};
const TYPE_ALIASES = {
    gamepass: "gamepass",
    "game-pass": "gamepass",
    pass: "gamepass",
    devproduct: "devProduct",
    "dev-product": "devProduct",
    developerproduct: "devProduct",
    "developer-product": "devProduct",
    product: "devProduct",
};
function parseType(value) {
    const type = TYPE_ALIASES[value.toLowerCase()];
    if (!type)
        throw new InvalidArgumentError("Expected `gamepass` or `devProduct`.");
    return type;
}
function typeOption() {
    return new Option("-t, --type <type>", "product type")
        .choices(["gamepass", "devProduct"])
        .argParser(parseType)
        .makeOptionMandatory();
}
const IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".bmp": "image/bmp",
    ".tga": "image/tga",
};
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
/** Maps a raw API response onto the shared Product shape. */
function normalize(type, raw) {
    const t = TYPES[type];
    return { ...raw, id: raw[t.idField], iconAssetId: raw[t.iconField] };
}
async function getProduct(type, universe, id) {
    return normalize(type, await request("GET", `${TYPES[type].base(universe)}/${id}/creator`));
}
function price(p) {
    const robux = p.priceInformation?.defaultPriceInRobux;
    return robux == null ? "not set" : `R$${robux}`;
}
function managedPricing(p) {
    return p.priceInformation?.enabledFeatures?.includes("RegionalPricing") ?? false;
}
function printProduct(type, p) {
    field("ID", p.id);
    field("Type", TYPES[type].label);
    field("Name", p.name);
    field("Description", p.description);
    field("Price", price(p));
    field("Status", p.isForSale ? pc.green("on sale") : pc.yellow("off sale"));
    field("Managed price", managedPricing(p) ? "on" : "off");
    field("Icon asset", p.iconAssetId || undefined);
    field("Updated", p.updatedTimestamp);
    if (TYPES[type].url)
        field("URL", pc.underline(TYPES[type].url(p.id)));
}
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
    if (opts.managedPricing !== undefined)
        form.append("isRegionalPricingEnabled", String(opts.managedPricing));
    if (opts.icon)
        form.append(iconField, await readIcon(opts.icon), basename(opts.icon));
    return form;
}
async function updateAndFetch(type, universe, id, form) {
    await request("PATCH", `${TYPES[type].base(universe)}/${id}`, { body: form });
    return getProduct(type, universe, id);
}
function managedPricingOptions(cmd) {
    return cmd
        .option("--managed-pricing", "turn on managed (regional) pricing")
        .option("--no-managed-pricing", "turn off managed (regional) pricing");
}
export function productCommand() {
    const product = new Command("product")
        .description("create and manage game passes and developer products")
        .addHelpText("after", `
Every subcommand needs --type gamepass or --type devProduct.
${examples(["raven product add -t gamepass -u 123 --name VIP --price 100 --icon vip.png"], ["raven product add -t devProduct -u 123 --name Coins --price 25 --managed-pricing"], ["raven product update -t devProduct -u 123 --id 456 --no-managed-pricing"], ["raven product disable -t gamepass -u 123 --id 456", "take off sale"], ["raven product list -t devProduct -u 123"])}`);
    managedPricingOptions(product
        .command("add")
        .description("create a new game pass or developer product")
        .addOption(typeOption())
        .addOption(universeOption())
        .requiredOption("--name <name>", "product name")
        .option("--description <text>", "product description")
        .option("--price <robux>", "price in Robux (puts it on sale unless --offsale is given)", parsePositiveInt)
        .option("--icon <file>", "icon image (.png, .jpg, .bmp, .tga)")
        .option("--offsale", "create it without putting it on sale")).action(async (opts) => {
        const t = TYPES[opts.type];
        const form = await buildForm({ ...opts, onsale: opts.price !== undefined && !opts.offsale }, t.createIconField);
        const created = await withSpinner(`Creating ${t.label} ${opts.name}...`, async () => normalize(opts.type, await request("POST", t.base(opts.universe), { body: form })));
        output(created, () => {
            success(`Created ${t.label} ${pc.cyan(created.name)}`);
            printProduct(opts.type, created);
        });
    });
    managedPricingOptions(product
        .command("update")
        .description("update a game pass or developer product")
        .addOption(typeOption())
        .addOption(universeOption())
        .requiredOption("--id <id>", "game pass or developer product ID", parseId)
        .option("--name <name>", "new name")
        .option("--description <text>", "new description")
        .option("--price <robux>", "new price in Robux", parsePositiveInt)
        .option("--icon <file>", "new icon image (.png, .jpg, .bmp, .tga)")
        .option("--onsale", "put it on sale")
        .option("--offsale", "take it off sale")).action(async (opts) => {
        const t = TYPES[opts.type];
        const form = await buildForm(opts, t.updateIconField);
        if ([...form.keys()].length === 0) {
            throw new CliError("Nothing to update. Pass at least one of --name, --description, --price, --icon, --onsale, --offsale, or --[no-]managed-pricing.");
        }
        const updated = await withSpinner(`Updating ${t.label} ${opts.id}...`, () => updateAndFetch(opts.type, opts.universe, opts.id, form));
        output(updated, () => {
            success(`Updated ${t.label} ${pc.cyan(updated.name)}`);
            printProduct(opts.type, updated);
        });
    });
    product
        .command("disable")
        .alias("offsale")
        .description("take a game pass or developer product off sale (they can't be deleted)")
        .addOption(typeOption())
        .addOption(universeOption())
        .requiredOption("--id <id>", "game pass or developer product ID", parseId)
        .action(async (opts) => {
        const t = TYPES[opts.type];
        const updated = await withSpinner(`Disabling ${t.label} ${opts.id}...`, async () => updateAndFetch(opts.type, opts.universe, opts.id, await buildForm({ offsale: true }, t.updateIconField)));
        output(updated, () => success(`${pc.cyan(updated.name)} is now off sale.`));
    });
    product
        .command("enable")
        .alias("onsale")
        .description("put a game pass or developer product back on sale")
        .addOption(typeOption())
        .addOption(universeOption())
        .requiredOption("--id <id>", "game pass or developer product ID", parseId)
        .option("--price <robux>", "price in Robux (required if it has no price yet)", parsePositiveInt)
        .action(async (opts) => {
        const t = TYPES[opts.type];
        const updated = await withSpinner(`Enabling ${t.label} ${opts.id}...`, async () => updateAndFetch(opts.type, opts.universe, opts.id, await buildForm({ onsale: true, price: opts.price }, t.updateIconField)));
        output(updated, () => success(`${pc.cyan(updated.name)} is now on sale for ${price(updated)}.`));
    });
    product
        .command("get")
        .description("show a game pass or developer product")
        .addOption(typeOption())
        .addOption(universeOption())
        .requiredOption("--id <id>", "game pass or developer product ID", parseId)
        .action(async (opts) => {
        const p = await withSpinner(`Fetching ${TYPES[opts.type].label} ${opts.id}...`, () => getProduct(opts.type, opts.universe, opts.id));
        output(p, () => printProduct(opts.type, p));
    });
    product
        .command("list")
        .description("list game passes or developer products in an experience")
        .addOption(typeOption())
        .addOption(universeOption())
        .option("--limit <n>", "maximum number of results", parsePositiveInt, 100)
        .action(async (opts) => {
        const t = TYPES[opts.type];
        const items = await withSpinner(`Fetching ${t.label}s...`, async () => {
            const items = [];
            let pageToken;
            do {
                const page = await request("GET", `${t.base(opts.universe)}/creator`, {
                    query: { pageSize: Math.min(opts.limit - items.length, 100), pageToken },
                });
                items.push(...(page[t.listField] ?? []).map((raw) => normalize(opts.type, raw)));
                pageToken = page.nextPageToken || undefined;
            } while (pageToken && items.length < opts.limit);
            return items.slice(0, opts.limit);
        });
        output(items, () => {
            if (!items.length)
                return console.log(`No ${t.label}s found.`);
            for (const p of items) {
                const status = p.isForSale ? pc.green(price(p)) : pc.yellow("off sale");
                const managed = managedPricing(p) ? pc.dim(" managed") : "";
                console.log(`${pc.dim(String(p.id).padEnd(14))} ${p.name}  ${status}${managed}`);
            }
        });
    });
    return product;
}
