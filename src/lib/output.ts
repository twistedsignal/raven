import pc from "picocolors";
import ora, { type Ora } from "ora";

let jsonMode = false;

export function setJsonMode(value: boolean): void {
  jsonMode = value;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** Prints raw JSON in --json mode, otherwise runs the human-readable printer. */
export function output(data: unknown, human: () => void): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    human();
  }
}

export function success(msg: string): void {
  if (!jsonMode) console.log(`${pc.green("✔")} ${msg}`);
}

export function info(msg: string): void {
  if (!jsonMode) console.log(msg);
}

export function warn(msg: string): void {
  console.error(`${pc.yellow("!")} ${msg}`);
}

export function field(label: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  console.log(`  ${pc.dim(label.padEnd(14))} ${value}`);
}

export async function withSpinner<T>(text: string, fn: (spinner: Ora) => Promise<T>): Promise<T> {
  const spinner = ora({ text, stream: process.stderr, isSilent: jsonMode || !process.stderr.isTTY });
  spinner.start();
  try {
    const result = await fn(spinner);
    spinner.stop();
    return result;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}
