# Raven

A CLI for the [Roblox Open Cloud API](https://create.roblox.com/docs/cloud). Upload assets, publish places, edit data stores, and manage live servers from your terminal or CI.

## Install

Requires Node.js 20 or newer.

```bash
npm install -g https://github.com/twistedsignal/raven/archive/refs/heads/main.tar.gz
```

> `npm install -g github:twistedsignal/raven` currently leaves a broken install on npm 11 (npm links the package to a temporary clone and then deletes it), so use the tarball URL above.

Or from source:

```bash
git clone https://github.com/twistedsignal/raven
cd raven
pnpm install && pnpm build
npm link
```

The compiled `dist/` is committed so installing from GitHub doesn't need a build step. If you change anything in `src/`, run `pnpm build` and commit `dist/` with it; CI fails if it's out of date.

## Logging in

```bash
raven auth
```

Raven asks which commands you want to use, tells you exactly which permissions to give your Open Cloud API key for those, then verifies and saves it. Commands you didn't pick are disabled (and marked as such in `raven -h`), so your key only ever needs the permissions you actually use.

```bash
raven auth commands # change which commands are enabled
raven auth status   # show the saved key and enabled commands
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

`datastore delete` is irreversible, so it only runs interactively in a terminal and asks you to type the data store name to confirm. It can't be run from scripts or CI.

`datastore` can be shortened to `ds`. Use `--scope <name>` to target a scope other than `global`.

### Game passes and developer products

Every `product` command takes `--type gamepass` or `--type devProduct`.

```bash
raven product add --type gamepass --universe 1234 --name "VIP" --description "VIP perks" --price 100 --icon vip.png
raven product add --type devProduct --universe 1234 --name "100 Coins" --price 25 --managed-pricing
raven product update --type devProduct --universe 1234 --id 5678 --price 30 --no-managed-pricing
raven product disable --type gamepass --universe 1234 --id 5678      # take off sale
raven product enable --type gamepass --universe 1234 --id 5678       # put back on sale
raven product list --type devProduct --universe 1234
raven product get --type gamepass --universe 1234 --id 5678
```

- `--managed-pricing` / `--no-managed-pricing` turns Roblox's managed (regional) pricing on or off. Leave both out to keep the current setting.
- `add` puts the product on sale when you give it a `--price` (pass `--offsale` to skip that).
- Roblox doesn't allow deleting game passes or developer products, so `disable` takes them off sale instead. Players who already own a game pass keep it.

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

`raven auth` shows only the permissions for the commands you pick. For reference:

| Command                                      | API system                    | Operations        |
| -------------------------------------------- | ----------------------------- | ----------------- |
| `asset`                                      | `assets`                      | Read, Write       |
| `product --type gamepass`                    | `game-pass`                   | Read, Write       |
| `product --type devProduct`                  | `developer-product`           | Read, Write       |
| `publish`                                    | `universe-places`             | Write             |
| `datastore list`, `datastore get`            | `universe-datastores.control` | List              |
|                                              | `universe-datastores.objects` | List, Read        |
| `datastore set`, `datastore increment`       | `universe-datastores.objects` | Create, Update    |
| `datastore delete`                           | `universe-datastores.objects` | Delete            |
| `server restart`                             | `universe`                    | Write             |
| `server message`                             | `universe-messaging-service`  | Publish           |

When you use `RAVEN_API_KEY` or `--api-key`, every command is enabled.

## License

[MIT](LICENSE) © 2026 Twisted Signal
