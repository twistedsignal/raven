#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import pc from "picocolors";
import { createRequire } from "node:module";
import { assetCommand } from "./commands/asset.js";
import { authCommand } from "./commands/auth.js";
import { datastoreCommand } from "./commands/datastore.js";
import { productCommand } from "./commands/product.js";
import { publishCommand } from "./commands/publish.js";
import { serverCommand } from "./commands/server.js";
import { CliError, setApiKeyOverride } from "./lib/config.js";
import { examples } from "./lib/help.js";
import { setJsonMode } from "./lib/output.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command("raven")
  .description("A CLI for the Roblox Open Cloud API.")
  .version(version, "-v, --version")
  .option("--api-key <key>", "use this API key instead of the saved one")
  .option("--json", "output raw JSON")
  .showHelpAfterError()
  .addHelpText("before", `${pc.bold("Raven")} ${pc.dim(`v${version}`)}\n`)
  .addHelpText(
    "after",
    `
Getting started:
  Run ${pc.cyan("raven auth")} to log in, then ${pc.cyan("raven <command> -h")} for help with a command.
${examples(
  ["raven asset upload --path sword.fbx --creator user:123"],
  ["raven product add -t gamepass -u 123 --name VIP --price 100"],
  ["raven publish --path game.rbxlx --universe 123 --place 456"],
  ["raven ds get -u 123 -d Players -k user_1"],
  ["raven server restart --universe 123"],
)}

Environment:
  RAVEN_API_KEY       API key to use instead of the saved one
  RAVEN_UNIVERSE_ID   default for --universe
  RAVEN_PLACE_ID      default for --place
  RAVEN_CREATOR       default for --creator

Docs: ${pc.underline("https://github.com/twistedsignal/raven")}`,
  )
  .hook("preAction", (cmd) => {
    const opts = cmd.optsWithGlobals();
    setApiKeyOverride(opts.apiKey);
    setJsonMode(Boolean(opts.json));
  });

program.addCommand(authCommand());
program.addCommand(assetCommand());
program.addCommand(productCommand());
program.addCommand(publishCommand());
program.addCommand(datastoreCommand());
program.addCommand(serverCommand());

try {
  await program.parseAsync();
} catch (err) {
  if (err instanceof CommanderError) process.exit(err.exitCode);
  if (err instanceof Error && err.name === "ExitPromptError") {
    console.error(pc.dim("\nCancelled."));
    process.exit(130);
  }
  if (err instanceof CliError) {
    console.error(`${pc.red("✖")} ${err.message}`);
    process.exit(1);
  }
  throw err;
}
