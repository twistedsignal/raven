#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import pc from "picocolors";
import { createRequire } from "node:module";
import { assetCommand } from "./commands/asset.js";
import { authCommand } from "./commands/auth.js";
import { datastoreCommand } from "./commands/datastore.js";
import { gamepassCommand } from "./commands/gamepass.js";
import { publishCommand } from "./commands/publish.js";
import { serverCommand } from "./commands/server.js";
import { CliError, setApiKeyOverride } from "./lib/config.js";
import { setJsonMode } from "./lib/output.js";
const { version } = createRequire(import.meta.url)("../package.json");
const program = new Command("raven")
    .description("A CLI for the Roblox Open Cloud API")
    .version(version, "-v, --version")
    .option("--api-key <key>", "use this API key instead of the saved one")
    .option("--json", "output raw JSON")
    .showHelpAfterError()
    .hook("preAction", (cmd) => {
    const opts = cmd.optsWithGlobals();
    setApiKeyOverride(opts.apiKey);
    setJsonMode(Boolean(opts.json));
});
program.addCommand(authCommand());
program.addCommand(assetCommand());
program.addCommand(publishCommand());
program.addCommand(datastoreCommand());
program.addCommand(serverCommand());
program.addCommand(gamepassCommand());
try {
    await program.parseAsync();
}
catch (err) {
    if (err instanceof CommanderError)
        process.exit(err.exitCode);
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
