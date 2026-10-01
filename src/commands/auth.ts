import { Command } from "commander";
import { password } from "@inquirer/prompts";
import pc from "picocolors";
import { createInterface } from "node:readline/promises";
import { ApiError, request } from "../lib/api.js";
import { openBrowser } from "../lib/browser.js";
import { clearCredentials, CliError, credentialsPath, loadCredentials, saveCredentials } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { field, output, success, withSpinner } from "../lib/output.js";
import { printCommandAccess, printPermissionTable } from "../lib/permissions.js";

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

async function login(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new CliError("`raven auth` is interactive. In non-interactive environments, set RAVEN_API_KEY instead.");
  }

  console.log();
  console.log(pc.bold("Welcome to Raven!") + " Let's get you logged in with a Roblox Open Cloud API key.");
  console.log();

  await pressEnter(`${pc.cyan("?")} Press ${pc.bold("Enter")} to open ${pc.underline(CREDENTIALS_URL)} `);
  const opened = await openBrowser(CREDENTIALS_URL);
  if (!opened) console.log(pc.dim(`  Couldn't open a browser. Visit the link above manually.`));

  console.log();
  console.log(`Click ${pc.bold("Create API Key")}, give it a name, then click ${pc.bold("Add API System")} and add:`);
  console.log();
  printPermissionTable();
  console.log();
  console.log(pc.dim("  You only need the permissions for the commands you plan to use."));
  console.log(pc.dim("  For each API system, select the experiences you want Raven to manage."));
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

  await saveCredentials({
    apiKey,
    name: info.name,
    ownerId: info.authorizedUserId !== undefined ? String(info.authorizedUserId) : undefined,
    savedAt: new Date().toISOString(),
  });

  success(pc.bold("Success!"));
  console.log(`You are now logged into Raven${info.name ? ` with key ${pc.cyan(info.name)}` : ""}.`);
  if (info.scopes?.length) {
    console.log();
    printCommandAccess(info.scopes);
  }
}

export function authCommand(): Command {
  const auth = new Command("auth")
    .description("log in with a Roblox Open Cloud API key")
    .addHelpText(
      "after",
      `
Running \`raven auth\` walks you through creating an API key and saves it.

${examples(
  ["raven auth", "log in interactively"],
  ["raven auth status", "show the saved key and which commands it can use"],
  ["raven auth logout", "remove the saved key"],
)}

In CI, set RAVEN_API_KEY instead of running \`raven auth\`.`,
    )
    .action(login);

  auth
    .command("status")
    .description("show the currently saved API key")
    .action(async () => {
      const creds = await loadCredentials();
      if (!creds) throw new CliError("You are not logged in. Run `raven auth` to log in.");
      const info = await withSpinner("Checking token...", () => introspect(creds.apiKey));
      output({ ...info, savedAt: creds.savedAt, path: credentialsPath() }, () => {
        success(`Logged in${info.name ? ` as ${pc.cyan(info.name)}` : ""}`);
        field("Owner", info.authorizedUserId);
        field("Enabled", info.enabled);
        field("Expires", info.expirationTime ?? "never");
        field("Saved", creds.savedAt);
        field("Stored at", credentialsPath());
        console.log();
        printCommandAccess(info.scopes);
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
