import pc from "picocolors";
let jsonMode = false;
export function setJsonMode(value) {
    jsonMode = value;
}
export function isJsonMode() {
    return jsonMode;
}
/** Prints raw JSON in --json mode, otherwise runs the human-readable printer. */
export function output(data, human) {
    if (jsonMode) {
        console.log(JSON.stringify(data, null, 2));
    }
    else {
        human();
    }
}
export function success(msg) {
    if (!jsonMode)
        console.log(`${pc.green("✔")} ${msg}`);
}
export function info(msg) {
    if (!jsonMode)
        console.log(msg);
}
export function warn(msg) {
    console.error(`${pc.yellow("!")} ${msg}`);
}
export function field(label, value) {
    if (value === undefined || value === null || value === "")
        return;
    console.log(`  ${pc.dim(label.padEnd(14))} ${value}`);
}
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** Shows a spinner on stderr while `fn` runs. Silent in --json mode or when stderr isn't a TTY. */
export async function withSpinner(text, fn) {
    const spinner = { text };
    const stream = process.stderr;
    if (jsonMode || !stream.isTTY)
        return fn(spinner);
    let frame = 0;
    const render = () => {
        stream.write(`\r\x1b[2K${pc.cyan(FRAMES[frame++ % FRAMES.length])} ${spinner.text}`);
    };
    stream.write("\x1b[?25l");
    render();
    const timer = setInterval(render, 80);
    try {
        return await fn(spinner);
    }
    finally {
        clearInterval(timer);
        stream.write("\r\x1b[2K\x1b[?25h");
    }
}
