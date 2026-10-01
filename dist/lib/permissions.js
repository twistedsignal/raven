import pc from "picocolors";
/** The features you can pick during `raven auth`, and the Open Cloud permissions each one needs. */
export const FEATURES = [
    {
        id: "asset",
        name: "Assets: upload, update, and roll back",
        commands: ["asset"],
        scopes: [["assets", ["Read", "Write"]]],
    },
    {
        id: "gamepass",
        name: "Game passes",
        commands: ["product"],
        productType: "gamepass",
        scopes: [["game-pass", ["Read", "Write"]]],
    },
    {
        id: "devProduct",
        name: "Developer products",
        commands: ["product"],
        productType: "devProduct",
        scopes: [["developer-product", ["Read", "Write"]]],
    },
    {
        id: "publish",
        name: "Publish places",
        commands: ["publish"],
        scopes: [["universe-places", ["Write"]]],
    },
    {
        id: "datastore-read",
        name: "Data stores: list and read",
        commands: ["datastore list", "datastore get"],
        scopes: [
            ["universe-datastores.control", ["List"]],
            ["universe-datastores.objects", ["List", "Read"]],
        ],
    },
    {
        id: "datastore-write",
        name: "Data stores: set and increment",
        commands: ["datastore set", "datastore increment"],
        scopes: [["universe-datastores.objects", ["Create", "Update"]]],
    },
    {
        id: "datastore-delete",
        name: "Data stores: delete",
        commands: ["datastore delete"],
        scopes: [["universe-datastores.objects", ["Delete"]]],
    },
    {
        id: "server-restart",
        name: "Restart servers",
        commands: ["server restart"],
        scopes: [["universe", ["Write"]]],
    },
    {
        id: "server-message",
        name: "Message servers (MessagingService)",
        commands: ["server message"],
        scopes: [["universe-messaging-service", ["Publish"]]],
    },
];
export const FEATURE_IDS = FEATURES.map((f) => f.id);
/** Human-readable command names for a feature, e.g. "datastore list, datastore get". */
export function featureCommands(f) {
    return f.productType ? `product --type ${f.productType}` : f.commands.join(", ");
}
function covers(featurePath, path) {
    return path === featurePath || path.startsWith(`${featurePath} `);
}
/** Features that unlock the given command path. `productType` narrows `product` commands. */
export function featuresFor(path, productType) {
    return FEATURES.filter((f) => f.commands.some((c) => covers(c, path) || covers(path, c)) &&
        (!productType || !f.productType || f.productType === productType));
}
/** Merges the scopes of several features into one list per API system. */
function mergeScopes(features) {
    const ORDER = ["List", "Read", "Create", "Update", "Delete", "Write", "Publish"];
    const merged = new Map();
    for (const f of features) {
        for (const [api, ops] of f.scopes) {
            if (!merged.has(api))
                merged.set(api, new Set());
            for (const op of ops)
                merged.get(api).add(op);
        }
    }
    return [...merged].map(([api, ops]) => [api, [...ops].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))]);
}
/** Prints the permissions to add to the API key for the selected features. */
export function printPermissionTable(features) {
    const rows = mergeScopes(features);
    const width = Math.max(...rows.map(([api]) => api.length)) + 4;
    console.log(`  ${pc.dim("API system".padEnd(width))}${pc.dim("Operations")}`);
    for (const [api, ops] of rows)
        console.log(`  ${pc.bold(api.padEnd(width))}${ops.join(", ")}`);
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
/**
 * Prints the enabled commands, flagging any whose permissions the key appears to be missing.
 * Returns true if every enabled feature looks fully permitted (or scopes are unknown).
 */
export function printEnabledCommands(enabled, granted) {
    const map = granted?.length ? grantedMap(granted) : undefined;
    let ok = true;
    console.log(pc.dim("Enabled commands:"));
    for (const f of FEATURES) {
        const label = featureCommands(f);
        if (!enabled.includes(f.id)) {
            console.log(`  ${pc.dim(`- ${label} (disabled)`)}`);
            continue;
        }
        const missing = map ? missingFor(f, map) : [];
        if (missing.length) {
            ok = false;
            console.log(`  ${pc.yellow("!")} ${label}  ${pc.yellow(`key is missing ${missing.join("; ")}`)}`);
        }
        else {
            console.log(`  ${pc.green("✔")} ${label}`);
        }
    }
    return ok;
}
