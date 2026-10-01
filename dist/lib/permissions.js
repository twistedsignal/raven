import pc from "picocolors";
/** Which Open Cloud permissions each Raven command needs. */
export const FEATURES = [
    { command: "asset", scopes: [["assets", ["Read", "Write"]]] },
    { command: "product --type gamepass", scopes: [["game-pass", ["Read", "Write"]]] },
    { command: "product --type devProduct", scopes: [["developer-product", ["Read", "Write"]]] },
    { command: "publish", scopes: [["universe-places", ["Write"]]] },
    {
        command: "datastore",
        scopes: [
            ["universe-datastores.control", ["List"]],
            ["universe-datastores.objects", ["List", "Read", "Create", "Update", "Delete"]],
        ],
    },
    { command: "server restart", scopes: [["universe", ["Write"]]] },
    { command: "server message", scopes: [["universe-messaging-service", ["Publish"]]] },
];
/** Prints the permissions table shown during `raven auth`. */
export function printPermissionTable() {
    console.log(`  ${pc.dim("Command".padEnd(28))}${pc.dim("API system".padEnd(30))}${pc.dim("Operations")}`);
    for (const f of FEATURES) {
        f.scopes.forEach(([api, ops], i) => {
            const cmd = i === 0 ? pc.cyan(f.command.padEnd(28)) : " ".repeat(28);
            console.log(`  ${cmd}${pc.bold(api.padEnd(30))}${ops.join(", ")}`);
        });
    }
}
/**
 * Builds a map of API system -> granted operations. Tolerates both
 * `{ name: "assets", operations: ["read"] }` and `"assets:read"` style values.
 */
function grantedMap(granted) {
    const map = new Map();
    const add = (api, op) => {
        const key = api.toLowerCase();
        if (!map.has(key))
            map.set(key, new Set());
        if (op)
            map.get(key).add(op.toLowerCase());
    };
    for (const scope of granted) {
        const [api, op] = scope.name.split(":");
        add(api, op);
        for (const operation of scope.operations ?? [])
            add(api, operation.split(":").pop());
    }
    return map;
}
/** Returns the permissions a feature needs that the key doesn't have. */
function missingFor(feature, granted) {
    const missing = [];
    for (const [api, ops] of feature.scopes) {
        const have = granted.get(api);
        const lacking = have ? ops.filter((o) => !have.has(o.toLowerCase())) : ops;
        if (lacking.length)
            missing.push(`${api}: ${lacking.join(", ")}`);
    }
    return missing;
}
/** Prints which commands the key can use, based on the scopes returned by introspection. */
export function printCommandAccess(granted) {
    if (!granted?.length)
        return;
    const map = grantedMap(granted);
    console.log(pc.dim("Commands this key can use:"));
    for (const f of FEATURES) {
        const missing = missingFor(f, map);
        if (!missing.length) {
            console.log(`  ${pc.green("✔")} ${f.command}`);
        }
        else {
            console.log(`  ${pc.red("✖")} ${f.command.padEnd(26)} ${pc.dim(`missing ${missing.join("; ")}`)}`);
        }
    }
}
