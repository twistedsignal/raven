import pc from "picocolors";
/** Formats an "Examples:" block for addHelpText. Comments are printed above their command. */
export function examples(...lines) {
    const body = lines.map(([c, comment]) => `${comment ? `  ${pc.dim(`# ${comment}`)}\n` : ""}  $ ${c}`);
    return `\nExamples:\n${body.join("\n")}`;
}
