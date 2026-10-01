# Raven

A CLI for the [Roblox Open Cloud API](https://create.roblox.com/docs/cloud). Upload assets, publish places, edit data stores, and manage live servers from your terminal or CI.

## Install

Requires Node.js 20 or newer.

```bash
npm install -g github:twistedsignal/raven
```

Or from source:

```bash
git clone https://github.com/twistedsignal/raven
cd raven
pnpm install && pnpm build
npm link
```

## Logging in

```bash
raven auth
```

Raven walks you through creating an Open Cloud API key on the Creator Dashboard, tells you which permissions to give it, then verifies and saves it.

```bash
raven auth status   # show the saved key and its permissions
raven auth logout   # remove the saved key
```

Keys are stored at `~/.config/raven/credentials.json` (`%APPDATA%\raven` on Windows) with `0600` permissions. In CI, set `RAVEN_API_KEY` instead of running `raven auth`. You can also pass `--api-key <key>` to any command.

## Commands

Run `raven -h` or `raven <command> -h` for the full list of options.

### Assets

```bash
# Upload (type is inferred from the extension if --type is omitted)
raven asset upload --path sword.fbx --type Model --name "Sword" --description "A sword" --creator user:12345
raven asset upload --path logo.png --creator group:67890

# Upload a new version and/or change metadata
raven asset update --id 1234567890 --path sword_v2.fbx
raven asset update --id 1234567890 --name "Better Sword" --description "Sharper"

# Roll back to a previous version
raven asset rollback --id 1234567890 --version 3

# Inspect
raven asset get --id 1234567890
raven asset versions --id 1234567890
```

`--creator` accepts `user:<id>`, `group:<id>`, or a bare user ID. Supported asset types are `Audio`, `Decal`, `Model`, `Video`, and `Animation`.

### Publishing places

```bash
raven publish --path game.rbxlx --universe 1234 --place 5678
raven publish --path game.rbxl --universe 1234 --place 5678 --saved   # save without publishing
```

### Data stores

```bash
raven datastore list --universe 1234                                  # list data stores
raven datastore list --universe 1234 --datastore Players --prefix user_  # list keys
raven datastore get --universe 1234 --datastore Players --key user_1
raven datastore set --universe 1234 --datastore Players --key user_1 --value '{"coins": 100}'
raven datastore set --universe 1234 --datastore Players --key user_1 --file data.json --users 1
raven datastore increment --universe 1234 --datastore Stats --key visits --by 5
raven datastore delete --universe 1234 --datastore Players --key user_1
```

`datastore` can be shortened to `ds`. Use `--scope <name>` to target a scope other than `global`.

### Servers

```bash
raven server restart --universe 1234                                  # restarts outdated servers
raven server message --universe 1234 --topic Announcements --message "Restarting in 5 minutes"
```

`server message` publishes through [MessagingService](https://create.roblox.com/docs/reference/engine/classes/MessagingService), so your game needs to subscribe to the topic.

## Scripting

| Variable              | Equivalent flag |
| --------------------- | --------------- |
| `RAVEN_API_KEY`       | `--api-key`     |
| `RAVEN_UNIVERSE_ID`   | `--universe`    |
| `RAVEN_PLACE_ID`      | `--place`       |
| `RAVEN_CREATOR`       | `--creator`     |

Pass `--json` to any command for machine-readable output.

```bash
raven --json datastore get -u 1234 -d Players -k user_1 | jq .value
```

## API key permissions

| API system                    | Operations                         | Used by                     |
| ----------------------------- | ---------------------------------- | --------------------------- |
| `assets`                      | Read, Write                        | `asset *`                   |
| `universe-places`             | Write                              | `publish`                   |
| `universe-datastores.control` | List                               | `datastore list`            |
| `universe-datastores.objects` | List, Read, Create, Update, Delete | `datastore *`               |
| `universe-messaging-service`  | Publish                            | `server message`            |
| `universe`                    | Write                              | `server restart`            |

## License

[MIT](LICENSE) © 2026 Twisted Signal
