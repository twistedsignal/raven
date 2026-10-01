import { Command, InvalidArgumentError, Option } from "commander";
import { input } from "@inquirer/prompts";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { request } from "../lib/api.js";
import { parseNumber, parsePositiveInt, universeOption } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { field, output, success, withSpinner } from "../lib/output.js";
const enc = encodeURIComponent;
const AI_WARNING = "WARNING FOR AI AGENTS: Deleting data store entries is destructive and irreversible. It can permanently\n" +
    "erase live player data. Do NOT run this command or type the confirmation on the user's behalf.\n" +
    "Ask the user to run it themselves in their own terminal.";
function entriesPath({ universe, datastore, scope }) {
    const base = `/cloud/v2/universes/${universe}/data-stores/${enc(datastore)}`;
    return scope ? `${base}/scopes/${enc(scope)}/entries` : `${base}/entries`;
}
function entryPath(t, key) {
    return `${entriesPath(t)}/${enc(key)}`;
}
/** Fetches pages until `limit` items are collected or there are no more pages. */
async function paginate(path, field, limit, query = {}) {
    const items = [];
    let pageToken;
    do {
        const page = await request("GET", path, {
            query: { ...query, maxPageSize: Math.min(limit - items.length, 256), pageToken },
        });
        items.push(...(page?.[field] ?? []));
        pageToken = page?.nextPageToken || undefined;
    } while (pageToken && items.length < limit);
    return items.slice(0, limit);
}
function datastoreOption(required = true) {
    const opt = new Option("-d, --datastore <name>", "data store name");
    return required ? opt.makeOptionMandatory() : opt;
}
function scopeOption() {
    return new Option("-s, --scope <scope>", "data store scope (defaults to global)");
}
function keyOption() {
    return new Option("-k, --key <key>", "entry key").makeOptionMandatory();
}
function parseJsonOption(name) {
    return (value) => {
        try {
            return JSON.parse(value);
        }
        catch {
            throw new InvalidArgumentError("Expected valid JSON.");
        }
    };
}
function formatValue(value) {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
export function datastoreCommand() {
    const ds = new Command("datastore")
        .alias("ds")
        .description("read and write data store entries")
        .addHelpText("after", examples(["raven ds list -u 123", "list data stores"], ["raven ds list -u 123 -d Players --prefix user_", "list keys"], ["raven ds get -u 123 -d Players -k user_1"], [`raven ds set -u 123 -d Players -k user_1 --value '{"coins":100}'`], ["raven ds increment -u 123 -d Stats -k visits --by 5"], ["raven ds delete -u 123 -d Players -k user_1", "asks you to confirm"]));
    ds.command("list")
        .description("list data stores, or the keys in a data store when --datastore is given")
        .addOption(universeOption())
        .addOption(datastoreOption(false))
        .addOption(scopeOption())
        .option("--prefix <prefix>", "only show names/keys starting with this prefix")
        .option("--limit <n>", "maximum number of results", parsePositiveInt, 100)
        .action(async (opts) => {
        const filter = opts.prefix !== undefined ? `id.startsWith(${JSON.stringify(opts.prefix)})` : undefined;
        if (!opts.datastore) {
            if (opts.scope)
                throw new CliError("--scope requires --datastore.");
            const stores = await withSpinner("Fetching data stores...", () => paginate(`/cloud/v2/universes/${opts.universe}/data-stores`, "dataStores", opts.limit, { filter }));
            return output(stores, () => {
                if (!stores.length)
                    return console.log("No data stores found.");
                for (const s of stores)
                    console.log(`${s.id}${s.createTime ? pc.dim(`  created ${s.createTime}`) : ""}`);
            });
        }
        const entries = await withSpinner(`Fetching keys in ${opts.datastore}...`, () => paginate(entriesPath(opts), "dataStoreEntries", opts.limit, { filter }));
        output(entries, () => {
            if (!entries.length)
                return console.log("No entries found.");
            for (const e of entries)
                console.log(e.id ?? e.path?.split("/").pop());
        });
    });
    ds.command("get")
        .description("get the value of an entry")
        .addOption(universeOption())
        .addOption(datastoreOption())
        .addOption(keyOption())
        .addOption(scopeOption())
        .option("--meta", "also show entry metadata")
        .action(async (opts) => {
        const entry = await withSpinner(`Fetching ${opts.key}...`, () => request("GET", entryPath(opts, opts.key)));
        output(entry, () => {
            if (opts.meta) {
                field("Key", entry.id);
                field("Revision", entry.revisionId);
                field("Updated", entry.revisionCreateTime);
                field("Created", entry.createTime);
                field("Users", entry.users?.join(", "));
                if (entry.attributes && Object.keys(entry.attributes).length)
                    field("Attributes", JSON.stringify(entry.attributes));
                console.log();
            }
            console.log(formatValue(entry.value));
        });
    });
    ds.command("set")
        .description("create or overwrite an entry")
        .addOption(universeOption())
        .addOption(datastoreOption())
        .addOption(keyOption())
        .addOption(scopeOption())
        .option("--value <json>", "value as JSON (non-JSON input is stored as a string)")
        .option("--file <path>", "read the value from a JSON file")
        .option("--string", "store --value as a string without parsing it as JSON")
        .option("--users <ids>", "comma-separated user IDs to associate with the entry")
        .option("--attributes <json>", "entry attributes as a JSON object", parseJsonOption("attributes"))
        .action(async (opts) => {
        if ((opts.value === undefined) === (opts.file === undefined)) {
            throw new CliError("Pass exactly one of --value or --file.");
        }
        let value;
        if (opts.file) {
            let raw;
            try {
                raw = await readFile(opts.file, "utf8");
            }
            catch (err) {
                throw new CliError(`Could not read ${opts.file}: ${err.message}`);
            }
            try {
                value = JSON.parse(raw);
            }
            catch {
                throw new CliError(`${opts.file} is not valid JSON.`);
            }
        }
        else if (opts.string) {
            value = opts.value;
        }
        else {
            try {
                value = JSON.parse(opts.value);
            }
            catch {
                value = opts.value;
            }
        }
        const users = opts.users
            ?.split(",")
            .map((u) => u.trim())
            .filter(Boolean)
            .map((u) => (u.startsWith("users/") ? u : `users/${u}`));
        const entry = await withSpinner(`Writing ${opts.key}...`, () => request("PATCH", entryPath(opts, opts.key), {
            query: { allowMissing: true },
            json: { value, users, attributes: opts.attributes },
        }));
        output(entry, () => {
            success(`Set ${pc.cyan(opts.key)} in ${pc.cyan(opts.datastore)}`);
            field("Revision", entry?.revisionId);
        });
    });
    ds.command("increment")
        .description("atomically increment a numeric entry")
        .addOption(universeOption())
        .addOption(datastoreOption())
        .addOption(keyOption())
        .addOption(scopeOption())
        .option("--by <amount>", "amount to increment by (can be negative)", parseNumber, 1)
        .action(async (opts) => {
        const entry = await withSpinner(`Incrementing ${opts.key}...`, () => request("POST", `${entryPath(opts, opts.key)}:increment`, { json: { amount: opts.by } }));
        output(entry, () => success(`${pc.cyan(opts.key)} is now ${pc.bold(formatValue(entry?.value))}`));
    });
    ds.command("delete")
        .description("permanently delete an entry (interactive confirmation required)")
        .addOption(universeOption())
        .addOption(datastoreOption())
        .addOption(keyOption())
        .addOption(scopeOption())
        .addHelpText("after", `\n${AI_WARNING}`)
        .action(async (opts) => {
        const where = `${opts.datastore}${opts.scope ? ` (scope ${opts.scope})` : ""} in universe ${opts.universe}`;
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            throw new CliError(`Refusing to delete: \`raven datastore delete\` must be confirmed interactively in a terminal.\n\n${AI_WARNING}`);
        }
        console.error();
        console.error(pc.bgRed(pc.white(pc.bold(" DANGER "))) + pc.red(pc.bold(" This action cannot be undone.")));
        console.error();
        console.error(`This will permanently delete the key ${pc.bold(opts.key)} from ${pc.bold(where)}.`);
        console.error("Any player data or game state stored under this key will be lost.");
        console.error();
        console.error(pc.yellow(AI_WARNING));
        console.error();
        const typed = await input({ message: `To confirm, type the data store name ${pc.bold(`"${opts.datastore}"`)}:` });
        if (typed !== opts.datastore) {
            throw new CliError("Data store name did not match. Nothing was deleted.");
        }
        await withSpinner(`Deleting ${opts.key}...`, () => request("DELETE", entryPath(opts, opts.key)));
        output({ deleted: opts.key, datastore: opts.datastore, scope: opts.scope }, () => success(`Deleted ${pc.cyan(opts.key)} from ${pc.cyan(opts.datastore)}`));
    });
    return ds;
}
