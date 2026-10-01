import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import pc from "picocolors";
import { request } from "../lib/api.js";
import { universeOption } from "../lib/args.js";
import { CliError } from "../lib/config.js";
import { examples } from "../lib/help.js";
import { output, success, withSpinner } from "../lib/output.js";

export function serverCommand(): Command {
  const server = new Command("server")
    .description("restart servers and message them")
    .addHelpText(
      "after",
      examples(
        ["raven server restart --universe 123"],
        [`raven server message -u 123 --topic Announcements --message "Restarting soon"`],
      ),
    );

  server
    .command("restart")
    .description("restart all servers running an outdated version of the experience")
    .addOption(universeOption())
    .option("-y, --yes", "skip the confirmation prompt")
    .action(async (opts: { universe: string; yes?: boolean }) => {
      if (!opts.yes) {
        if (!process.stdin.isTTY) throw new CliError("Refusing to restart servers without --yes in a non-interactive shell.");
        const ok = await confirm({
          message: `Restart servers for universe ${opts.universe}? Players will be disconnected.`,
          default: false,
        });
        if (!ok) return console.log(pc.dim("Cancelled."));
      }
      await withSpinner("Restarting servers...", () =>
        request("POST", `/cloud/v2/universes/${opts.universe}:restartServers`, { json: {} }),
      );
      output({ restarted: true, universe: opts.universe }, () =>
        success(`Restarting servers for universe ${pc.cyan(opts.universe)}`),
      );
    });

  server
    .command("message")
    .description("publish a message to live servers via MessagingService")
    .addOption(universeOption())
    .requiredOption("-t, --topic <topic>", "MessagingService topic")
    .requiredOption("-m, --message <message>", "message to send")
    .action(async (opts: { universe: string; topic: string; message: string }) => {
      await withSpinner(`Publishing to ${opts.topic}...`, () =>
        request("POST", `/cloud/v2/universes/${opts.universe}:publishMessage`, {
          json: { topic: opts.topic, message: opts.message },
        }),
      );
      output({ published: true, topic: opts.topic }, () => success(`Published message to ${pc.cyan(opts.topic)}`));
    });

  return server;
}
