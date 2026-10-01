import { Command, InvalidArgumentError, Option } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { request } from "../lib/api.js";
import { parseNumber, parsePositiveInt, universeOption } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { field, output, success, withSpinner } from "../lib/output.js";

interface Entry {
  path?: string;
  id?: string;
  value?: unknown;
  etag?: string;
  revisionId?: string;
  revisionCreateTime?: string;
  createTime?: string;
  state?: string;
  users?: string[];
  attributes?: Record<string, unknown>;
}

interface Target {
  universe: string;
  datastore: string;
  scope?: string;
}

const enc = encodeURIComponent;

function entriesPath({ universe, datastore, scope }: Target): string {
  const base = `/cloud/v2/universes/${universe}/data-stores/${enc(datastore)}`;
  return scope ? `${base}/scopes/${enc(scope)}/entries` : `${base}/entries`;
}

function entryPath(t: Target, key: string): string {
  return `${entriesPath(t)}/${enc(key)}`;
}

/** Fetches pages until `limit` items are collected or there are no more pages. */
async function paginate<T>(
  path: string,
  field: string,
  limit: number,
  query: Record<string, string | undefined> = {},
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await request<Record<string, unknown> & { nextPageToken?: string }>("GET", path, {
      query: { ...query, maxPageSize: Math.min(limit - items.length, 256), pageToken },
    });
    items.push(...((page?.[field] as T[] | undefined) ?? []));
    pageToken = page?.nextPageToken || undefined;
  } while (pageToken && items.length < limit);
  return items.slice(0, limit);
}

function datastoreOption(required = true): Option {
  const opt = new Option("-d, --datastore <name>", "data store name");
  return required ? opt.makeOptionMandatory() : opt;
}

function scopeOption(): Option {
  return new Option("-s, --scope <scope>", "data store scope (defaults to global)");
}

function keyOption(): Option {
  return new Option("-k, --key <key>", "entry key").makeOptionMandatory();
}

function parseJsonOption(name: string) {
  return (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      throw new InvalidArgumentError("Expected valid JSON.");
    }
  };
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function datastoreCommand(): Command {
  const ds = new Command("datastore").alias("ds").description("read and write data store entries");

  ds.command("list")
    .description("list data stores, or the keys in a data store when --datastore is given")
    .addOption(universeOption())
    .addOption(datastoreOption(false))
    .addOption(scopeOption())
    .option("--prefix <prefix>", "only show names/keys starting with this prefix")
    .option("--limit <n>", "maximum number of results", parsePositiveInt, 100)
    .action(async (opts: { universe: string; datastore?: string; scope?: string; prefix?: string; limit: number }) => {
      const filter = opts.prefix !== undefined ? `id.startsWith(${JSON.stringify(opts.prefix)})` : undefined;

      if (!opts.datastore) {
        if (opts.scope) throw new CliError("--scope requires --datastore.");
        const stores = await withSpinner("Fetching data stores...", () =>
          paginate<{ id: string; createTime?: string; state?: string }>(
            `/cloud/v2/universes/${opts.universe}/data-stores`,
            "dataStores",
            opts.limit,
            { filter },
          ),
        );
        return output(stores, () => {
          if (!stores.length) return console.log("No data stores found.");
          for (const s of stores) console.log(`${s.id}${s.createTime ? pc.dim(`  created ${s.createTime}`) : ""}`);
        });
      }

      const entries = await withSpinner(`Fetching keys in ${opts.datastore}...`, () =>
        paginate<Entry>(entriesPath(opts as Target), "dataStoreEntries", opts.limit, { filter }),
      );
      output(entries, () => {
        if (!entries.length) return console.log("No entries found.");
        for (const e of entries) console.log(e.id ?? e.path?.split("/").pop());
      });
    });

  ds.command("get")
    .description("get the value of an entry")
    .addOption(universeOption())
    .addOption(datastoreOption())
    .addOption(keyOption())
    .addOption(scopeOption())
    .option("--meta", "also show entry metadata")
    .action(async (opts: Target & { key: string; meta?: boolean }) => {
      const entry = await withSpinner(`Fetching ${opts.key}...`, () => request<Entry>("GET", entryPath(opts, opts.key)));
      output(entry, () => {
        if (opts.meta) {
          field("Key", entry.id);
          field("Revision", entry.revisionId);
          field("Updated", entry.revisionCreateTime);
          field("Created", entry.createTime);
          field("Users", entry.users?.join(", "));
          if (entry.attributes && Object.keys(entry.attributes).length) field("Attributes", JSON.stringify(entry.attributes));
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
    .action(
      async (
        opts: Target & { key: string; value?: string; file?: string; string?: boolean; users?: string; attributes?: object },
      ) => {
        if ((opts.value === undefined) === (opts.file === undefined)) {
          throw new CliError("Pass exactly one of --value or --file.");
        }

        let value: unknown;
        if (opts.file) {
          let raw: string;
          try {
            raw = await readFile(opts.file, "utf8");
          } catch (err) {
            throw new CliError(`Could not read ${opts.file}: ${(err as Error).message}`);
          }
          try {
            value = JSON.parse(raw);
          } catch {
            throw new CliError(`${opts.file} is not valid JSON.`);
          }
        } else if (opts.string) {
          value = opts.value;
        } else {
          try {
            value = JSON.parse(opts.value!);
          } catch {
            value = opts.value;
          }
        }

        const users = opts.users
          ?.split(",")
          .map((u) => u.trim())
          .filter(Boolean)
          .map((u) => (u.startsWith("users/") ? u : `users/${u}`));

        const entry = await withSpinner(`Writing ${opts.key}...`, () =>
          request<Entry>("PATCH", entryPath(opts, opts.key), {
            query: { allowMissing: true },
            json: { value, users, attributes: opts.attributes },
          }),
        );
        output(entry, () => {
          success(`Set ${pc.cyan(opts.key)} in ${pc.cyan(opts.datastore)}`);
          field("Revision", entry?.revisionId);
        });
      },
    );

  ds.command("increment")
    .description("atomically increment a numeric entry")
    .addOption(universeOption())
    .addOption(datastoreOption())
    .addOption(keyOption())
    .addOption(scopeOption())
    .option("--by <amount>", "amount to increment by (can be negative)", parseNumber, 1)
    .action(async (opts: Target & { key: string; by: number }) => {
      const entry = await withSpinner(`Incrementing ${opts.key}...`, () =>
        request<Entry>("POST", `${entryPath(opts, opts.key)}:increment`, { json: { amount: opts.by } }),
      );
      output(entry, () => success(`${pc.cyan(opts.key)} is now ${pc.bold(formatValue(entry?.value))}`));
    });

  ds.command("delete")
    .description("delete an entry")
    .addOption(universeOption())
    .addOption(datastoreOption())
    .addOption(keyOption())
    .addOption(scopeOption())
    .action(async (opts: Target & { key: string }) => {
      await withSpinner(`Deleting ${opts.key}...`, () => request("DELETE", entryPath(opts, opts.key)));
      output({ deleted: opts.key }, () => success(`Deleted ${pc.cyan(opts.key)} from ${pc.cyan(opts.datastore)}`));
    });

  return ds;
}
