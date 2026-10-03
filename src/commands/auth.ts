import { Command, Option } from "commander";
import { checkbox, password } from "@inquirer/prompts";
import pc from "picocolors";
import { createInterface } from "node:readline/promises";
import { ApiError, request } from "../lib/api.js";
import { openBrowser } from "../lib/browser.js";
import {
  clearCredentials,
  CliError,
  credentialsPath,
  loadCredentials,
  saveCredentials,
} from "../lib/config.js";
import { examples } from "../lib/help.js";
import { field, output, success, withSpinner } from "../lib/output.js";
import {
  FEATURE_IDS,
  FEATURES,
  type FeatureId,
  featureCommands,
  printEnabledCommands,
  printPermissionTable,
} from "../lib/permissions.js";

const CREDENTIALS_URL = "https://create.roblox.com/dashboard/credentials?activeTab=ApiKeysTab";

interface Introspection {
  name?: string;
  authorizedUserId?: number | string;
  scopes?: { name: string; operations: string[] }[];
  enabled?: boolean;
  expired?: boolean;
  expirationTime?: string;
}

export async function introspect(apiKey: string): Promise<Introspection> {
  return request<Introspection>("POST", "/api-keys/v1/introspect", { json: { apiKey }, noAuth: true });
}

async function pressEnter(message: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

function requireTty(): void {
  if (!process.stdin.isTTY) {
    throw new CliError("This command is interactive. In non-interactive environments, set RAVEN_API_KEY instead.");
  }
}

/** The checklist of commands to enable. `previous` pre-checks an earlier selection. */
async function pickFeatures(previous?: FeatureId[]): Promise<FeatureId[]> {
  return checkbox({
    message: "Which commands do you want to use?",
    choices: FEATURES.map((f) => ({
      value: f.id,
      name: f.name,
      description: `raven ${featureCommands(f).replaceAll(", ", ", raven ")}`,
      checked: previous?.includes(f.id) ?? false,
    })),
    required: true,
    loop: false,
    pageSize: FEATURES.length,
    theme: { style: { renderSelectedChoices: (selected: readonly { name: string }[]) => `${selected.length} selected` } },
  });
}

function printKeyInstructions(features: FeatureId[], heading: string): void {
  console.log();
  console.log(heading);
  console.log();
  printPermissionTable(FEATURES.filter((f) => features.includes(f.id)));
  console.log();
  console.log(pc.dim("  For each API system, select the experiences you want Raven to manage."));
}

async function verify(apiKey: string): Promise<Introspection> {
  const info = await withSpinner("Verifying token...", async () => {
    try {
      return await introspect(apiKey);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 403)) {
        throw new CliError("That token is invalid. Double check you copied the whole key and try again.");
      }
      throw err;
    }
  });
  if (info.enabled === false) throw new CliError("That API key is disabled. Enable it on the Creator Dashboard.");
  if (info.expired) throw new CliError("That API key has expired. Create a new one and try again.");
  return info;
}

function printMissingHint(ok: boolean): void {
  if (ok) return;
  console.log();
  console.log(pc.yellow("Some enabled commands need permissions this key doesn't have."));
  console.log(pc.yellow(`Edit the key at ${pc.underline(CREDENTIALS_URL)} and add them.`));
}

async function login(): Promise<void> {
  requireTty();
  const previous = await loadCredentials();

  console.log();
  console.log(pc.bold("Welcome to Raven!") + " Let's get you logged in with a Roblox Open Cloud API key.");
  console.log(pc.dim("Pick only what you need. Your key will only need permissions for those commands."));
  console.log();

  const features = await pickFeatures(previous?.features);
  console.log();

  await pressEnter(`${pc.cyan("?")} Press ${pc.bold("Enter")} to open ${pc.underline(CREDENTIALS_URL)} `);
  const opened = await openBrowser(CREDENTIALS_URL);
  if (!opened) console.log(pc.dim(`  Couldn't open a browser. Visit the link above manually.`));

  printKeyInstructions(
    features,
    `Click ${pc.bold("Create API Key")}, give it a name, then click ${pc.bold("Add API System")} and add:`,
  );
  console.log(pc.dim("  Under Security, add your IP address (or 0.0.0.0/0 to allow any IP)."));
  console.log(pc.dim(`  Click ${pc.bold("Save & Generate Key")}, then copy the key.`));
  console.log();
  await pressEnter(`${pc.cyan("?")} Press ${pc.bold("Enter")} once you've created and copied the key `);
  console.log();

  const apiKey = (
    await password({
      message: "Enter token:",
      mask: "*",
      validate: (v) => (v.trim().length > 0 ? true : "Token cannot be empty."),
    })
  ).trim();

  console.log();
  const info = await verify(apiKey);

  await saveCredentials({
    apiKey,
    name: info.name,
    ownerId: info.authorizedUserId !== undefined ? String(info.authorizedUserId) : undefined,
    features,
    savedAt: new Date().toISOString(),
  });

  success(pc.bold("Success!"));
  console.log(`You are now logged into Raven${info.name ? ` with key ${pc.cyan(info.name)}` : ""}.`);
  console.log();
  printMissingHint(printEnabledCommands(features, info.scopes));
  console.log();
  console.log(pc.dim(`Change which commands are enabled any time with ${pc.cyan("raven auth commands")}.`));
}

async function changeCommands(): Promise<void> {
  requireTty();
  const creds = await loadCredentials();
  if (!creds) throw new CliError("You are not logged in. Run `raven auth` to log in.");

  const before = creds.features ?? FEATURE_IDS;
  const features = await pickFeatures(before);
  const added = features.filter((f) => !before.includes(f));

  await saveCredentials({ ...creds, features });
  console.log();
  success("Saved.");

  if (added.length) {
    printKeyInstructions(
      added,
      `Make sure your API key has these permissions for the newly enabled commands (${pc.underline(CREDENTIALS_URL)}):`,
    );
  }

  console.log();
  const info = await withSpinner("Checking token...", () => introspect(creds.apiKey)).catch(() => undefined);
  printMissingHint(printEnabledCommands(features, info?.scopes));
}

export function authCommand(): Command {
  const auth = new Command("auth")
    .description("log in with a Roblox Open Cloud API key")
    .addHelpText(
      "after",
      `
Running \`raven auth\` asks which commands you want, tells you exactly which
permissions to give your API key, then verifies and saves it.
${examples(
  ["raven auth", "log in interactively"],
  ["raven auth commands", "change which commands are enabled"],
  ["raven auth status", "show the saved key and enabled commands"],
  ["raven auth logout", "remove the saved key"],
)}

In CI, set RAVEN_API_KEY instead of running \`raven auth\`. All commands are
enabled when using RAVEN_API_KEY or --api-key.`,
    )
    .action(login);

  auth.command("commands").description("choose which commands are enabled").action(changeCommands);

  auth
    .command("enable")
    .description("enable one command feature without opening a prompt")
    .addOption(new Option("--feature <feature>", "feature to enable").choices(FEATURE_IDS).makeOptionMandatory())
    .action(async (opts: { feature: FeatureId }) => {
      if (process.env.RAVEN_API_KEY) {
        output({ enabled: opts.feature }, () => success("Environment keys already enable every command."));
        return;
      }
      const creds = await loadCredentials();
      if (!creds) throw new CliError("No saved key. Run `raven auth` or set RAVEN_API_KEY.");
      const features = creds.features ?? FEATURE_IDS;
      if (!features.includes(opts.feature)) await saveCredentials({ ...creds, features: [...features, opts.feature] });
      output({ enabled: opts.feature }, () => success(`Enabled ${opts.feature}. The key still needs its API permissions.`));
    });

  auth
    .command("status")
    .description("show the saved API key and enabled commands")
    .action(async () => {
      const creds = await loadCredentials();
      if (!creds) throw new CliError("You are not logged in. Run `raven auth` to log in.");
      const info = await withSpinner("Checking token...", () => introspect(creds.apiKey));
      const features = creds.features ?? FEATURE_IDS;
      output({ ...info, enabledCommands: features, savedAt: creds.savedAt, path: credentialsPath() }, () => {
        success(`Logged in${info.name ? ` as ${pc.cyan(info.name)}` : ""}`);
        field("Owner", info.authorizedUserId);
        field("Enabled", info.enabled);
        field("Expires", info.expirationTime ?? "never");
        field("Saved", creds.savedAt);
        field("Stored at", credentialsPath());
        console.log();
        printMissingHint(printEnabledCommands(features, info.scopes));
      });
    });

  auth
    .command("logout")
    .description("remove the saved API key")
    .action(async () => {
      const removed = await clearCredentials();
      success(removed ? "Logged out." : "You weren't logged in.");
    });

  return auth;
}
