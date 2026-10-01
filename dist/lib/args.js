import { InvalidArgumentError, Option } from "commander";
export function parseId(value) {
    if (!/^\d+$/.test(value))
        throw new InvalidArgumentError("Expected a numeric ID.");
    return value;
}
export function parsePositiveInt(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0)
        throw new InvalidArgumentError("Expected a positive integer.");
    return n;
}
export function parseNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        throw new InvalidArgumentError("Expected a number.");
    return n;
}
/** Accepts `user:123`, `group:456`, or a bare ID (treated as a user). */
export function parseCreator(value) {
    const match = /^(?:(user|group):)?(\d+)$/i.exec(value.trim());
    if (!match)
        throw new InvalidArgumentError("Expected `user:<id>`, `group:<id>`, or a user ID.");
    const [, kind, id] = match;
    return kind?.toLowerCase() === "group" ? { groupId: id } : { userId: id };
}
export function universeOption() {
    return new Option("-u, --universe <id>", "universe (experience) ID")
        .env("RAVEN_UNIVERSE_ID")
        .argParser(parseId)
        .makeOptionMandatory();
}
export function placeOption() {
    return new Option("-p, --place <id>", "place ID").env("RAVEN_PLACE_ID").argParser(parseId).makeOptionMandatory();
}
