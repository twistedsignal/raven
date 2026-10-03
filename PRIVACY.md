# Privacy policy

Last updated: October 3, 2026

Raven is a Roblox Open Cloud CLI maintained by Twisted Signal. This policy covers the CLI and its planned Roblox OAuth 2.0 app. The OAuth design described below keeps tokens on your machine and uses no Raven backend to store them. The current release still uses manual API keys. This policy does not mean OAuth is available yet.

## OAuth authorization and information used

In the planned OAuth flow, you sign in and approve access on Roblox's website. Roblox handles your password and account authentication. Raven does not receive your Roblox password.

After you approve access, Raven will exchange an authorization code with Roblox for tokens. It will use access tokens to perform commands within the permission scopes and resources you authorize. Refresh tokens allow it to obtain new access tokens without asking you to sign in each time. Depending on the identity scopes you approve, Roblox may also return an ID token, your Roblox user ID, username, or display name. See [Roblox's OAuth documentation](https://create.roblox.com/docs/cloud/auth/oauth2-reference).

Raven will use this information to identify your authorized account, keep your local session signed in, and execute your commands. OAuth tokens and saved authorization information will remain on your machine. They will not be uploaded to a Twisted Signal token-storage service.

## Command data and network requests

Raven sends Roblox the information needed for the commands you run. This can include resource IDs, asset and place files, product metadata, data store keys and values, associated user IDs, and server messages. Roblox returns the requested data or command results. Asset downloads also contact the download location supplied by Roblox. The current CLI does not attach an API key to those download requests.

Roblox and its delivery services receive normal connection information, such as your IP address. Their processing and retention are governed by [Roblox's privacy and cookie policy](https://en.help.roblox.com/hc/en-us/articles/115004630823-Roblox-Privacy-and-Cookie-Policy).

Running `raven update` or `raven update --check` contacts the npm registry for package information. Installing an update invokes your package manager, which makes its own network requests under its configuration and the registry's policies. Opening Roblox authorization pages also subjects that browser session to Roblox's website policies.

If you override the API destination with `RAVEN_API_BASE_URL`, that destination receives the requests and authentication information sent by Raven. Only configure a destination you trust.

## Local storage and retention

The OAuth design stores session tokens and authorization information locally so you can use Raven across CLI sessions. Exact storage paths and logout behavior will be documented with the OAuth-enabled release. This policy must be updated before introducing backend token storage or other data handling that differs from this design.

The current API-key release saves your key, key name and owner ID when available, enabled commands, and a save timestamp in `credentials.json`. The default directory is `~/.config/raven`, or `%APPDATA%\raven` on Windows. `XDG_CONFIG_HOME` and `RAVEN_CONFIG_DIR` can change that location. Credentials are stored as unencrypted JSON. Raven requests restrictive file permissions where supported; this is not encryption.

Saved credentials remain until you remove them. In the current release, `raven auth logout` removes the saved credential file. Keys provided through `RAVEN_API_KEY` or `--api-key` are not saved by that mechanism. Logout does not remove environment variables, shell history, backups, downloaded files, or logs maintained by your own systems.

Command results and errors appear in your terminal, including JSON output when requested. Your shell, CI system, or redirected output may retain sensitive resource data. Protect these records and avoid sharing tokens or private data in bug reports.

## Revocation and deletion

For OAuth, revoke Raven's authorization through Roblox's settings for connected apps. Roblox supports [revoking OAuth authorization sessions](https://create.roblox.com/docs/cloud/auth/oauth2-reference). Removing a local token alone should not be treated as revoking authorization on Roblox. Remove local session files as well if you want to erase the local copy.

For existing API keys, delete or revoke the key through Roblox's Creator Dashboard in addition to removing the local credentials. Revoking credentials does not delete data already sent to Roblox or undo completed commands. Manage that data through Roblox's tools and applicable APIs.

## Telemetry and information you share

The current CLI has no built-in analytics, advertising trackers, or automatic crash reporting. Twisted Signal does not receive your command history, credentials, or command content through a Raven backend. The planned local OAuth design does not introduce such collection or sell authorization data.

If you choose to submit a GitHub issue, maintainers receive the information you include. GitHub issues may be public, and GitHub's own policies apply. Do not include credentials, tokens, or private user data.

## Changes and contact

Changes to this policy will appear in this repository with a revised date. Questions or privacy concerns can be raised through the [project's GitHub issues](https://github.com/twistedsignal/raven/issues) without posting sensitive information. Requests concerning Roblox-held data should go to Roblox.
