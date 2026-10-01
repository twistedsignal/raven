import { InvalidArgumentError, Option } from "commander";

export function parseId(value: string): string {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError("Expected a numeric ID.");
  return value;
}

export function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("Expected a positive integer.");
  return n;
}

export function parseNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new InvalidArgumentError("Expected a number.");
  return n;
}

export type Creator = { userId: string } | { groupId: string };

/** Accepts `user:123`, `group:456`, or a bare ID (treated as a user). */
export function parseCreator(value: string): Creator {
  const match = /^(?:(user|group):)?(\d+)$/i.exec(value.trim());
  if (!match) throw new InvalidArgumentError("Expected `user:<id>`, `group:<id>`, or a user ID.");
  const [, kind, id] = match;
  return kind?.toLowerCase() === "group" ? { groupId: id } : { userId: id };
}

export function universeOption(): Option {
  return new Option("-u, --universe <id>", "universe (experience) ID")
    .env("RAVEN_UNIVERSE_ID")
    .argParser(parseId)
    .makeOptionMandatory();
}

export function placeOption(): Option {
  return new Option("-p, --place <id>", "place ID").env("RAVEN_PLACE_ID").argParser(parseId).makeOptionMandatory();
}
