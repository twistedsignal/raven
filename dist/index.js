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
import { updateCommand } from "./commands/update.js";
import { CliError, enabledFeatures, setApiKeyOverride } from "./lib/config.js";
import { examples } from "./lib/help.js";
import { setJsonMode } from "./lib/output.js";
import { featuresFor } from "./lib/permissions.js";
const { version } = createRequire(import.meta.url)("../package.json");
const program = new Command("raven")
    .description("A CLI for the Roblox Open Cloud API.")
    .version(version, "-v, --version")
    .option("--api-key <key>", "use this API key instead of the saved one")
    .option("--json", "output raw JSON")
    .showHelpAfterError()
    .addHelpText("before", `${pc.bold("Raven")} ${pc.dim(`v${version}`)}\n`)
    .addHelpText("after", `
Getting started:
  Run ${pc.cyan("raven auth")} to log in, then ${pc.cyan("raven <command> -h")} for help with a command.
${examples(["raven asset upload --path sword.fbx --creator user:123"], ["raven product add -t gamepass -u 123 --name VIP --price 100"], ["raven publish --path game.rbxlx --universe 123 --place 456"], ["raven ds get -u 123 -d Players -k user_1"], ["raven server restart --universe 123"])}

Environment:
  RAVEN_API_KEY       API key to use instead of the saved one
  RAVEN_UNIVERSE_ID   default for --universe
  RAVEN_PLACE_ID      default for --place
  RAVEN_CREATOR       default for --creator

Docs: ${pc.underline("https://github.com/twistedsignal/raven")}`)
    .hook("preAction", async (cmd, actionCommand) => {
    const opts = cmd.optsWithGlobals();
    setApiKeyOverride(opts.apiKey);
    setJsonMode(Boolean(opts.json));
    await assertEnabled(actionCommand);
});
program.addCommand(authCommand());
program.addCommand(assetCommand());
program.addCommand(productCommand());
program.addCommand(publishCommand());
program.addCommand(datastoreCommand());
program.addCommand(serverCommand());
program.addCommand(updateCommand(version));
/** "datastore get" for `raven datastore get`. */
function commandPath(cmd) {
    const names = [];
    for (let c = cmd; c && c !== program; c = c.parent)
        names.unshift(c.name());
    return names.join(" ");
}
/** Blocks commands that weren't enabled during `raven auth`. */
async function assertEnabled(cmd) {
    const path = commandPath(cmd);
    if (path === "auth" || path.startsWith("auth "))
        return;
    const enabled = await enabledFeatures();
    if (!enabled)
        return;
    const type = cmd.opts().type;
    const features = featuresFor(path, path.startsWith("product") ? type : undefined);
    if (features.length && !features.some((f) => enabled.includes(f.id))) {
        const name = `raven ${path}${path.startsWith("product") && type ? ` --type ${type}` : ""}`;
        throw new CliError(`\`${name}\` is disabled. Run \`raven auth commands\` to enable it.`);
    }
}
/** Marks commands that aren't enabled for the saved key in the help output. */
function annotateDisabled(cmd, enabled) {
    for (const sub of cmd.commands) {
        const path = commandPath(sub);
        if (path === "auth" || path === "help")
            continue;
        const features = featuresFor(path);
        const on = features.filter((f) => enabled.includes(f.id));
        if (features.length && !on.length) {
            sub.description(`${sub.description()} ${pc.dim("(disabled)")}`);
        }
        else if (on.length < features.length && on.every((f) => f.productType)) {
            sub.description(`${sub.description()} ${pc.dim(`(${on.map((f) => f.productType).join(", ")} only)`)}`);
        }
        annotateDisabled(sub, enabled);
    }
}
const usingOverride = process.env.RAVEN_API_KEY || process.argv.some((a) => a === "--api-key" || a.startsWith("--api-key="));
const enabled = usingOverride ? undefined : await enabledFeatures();
if (enabled)
    annotateDisabled(program, enabled);
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
