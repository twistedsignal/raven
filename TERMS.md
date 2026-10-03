# Terms of use

Last updated: October 3, 2026

These terms describe use of Raven, the Roblox Open Cloud CLI maintained by Twisted Signal, and its planned Roblox OAuth 2.0 app. The current release uses manually supplied API keys. OAuth authorization will apply when an OAuth-enabled release becomes available.

## License

Raven is open-source software under the [MIT license](LICENSE). That license governs your rights to use, copy, modify, and distribute the software. These terms do not restrict or replace those rights. If these terms conflict with the MIT license, the license controls for the software.

## Roblox authorization

The planned OAuth app lets you authorize Raven through Roblox and grant access to selected resources and permission scopes. Review Roblox's consent screen before approving access. Raven does not need your Roblox password, and you should never provide it to Raven or its maintainers.

You must meet [Roblox's eligibility requirements for OAuth apps](https://create.roblox.com/docs/cloud/auth/oauth2-overview), including being at least 13 years old. You must also have permission to manage any account, group, experience, asset, or data you access through Raven.

You are responsible for protecting your credentials and tokens, reviewing the permissions you grant, and commands run by you or your automation. You can revoke an OAuth authorization through Roblox. Revoking access does not undo commands already completed.

## Your commands and content

Raven can publish places, upload and download assets, change product settings, edit or delete data store entries, restart servers, and send messages. Check resource IDs and command arguments before running a command. Keep backups of important data. Some changes, including data store deletion, cannot be undone.

You retain your rights to content you process through Raven. These terms do not transfer ownership of your assets or data to Twisted Signal. You are responsible for having the rights and permissions needed to upload, download, or change that content and for handling personal data lawfully.

Your use of Roblox remains subject to [Roblox's terms of use](https://www.roblox.com/termsofuse) and applicable API rules. Use Raven only for resources you are authorized to access. Do not use it to bypass access controls or violate others' rights.

## Privacy

The [privacy policy](PRIVACY.md) explains how Raven handles authorization information and command data, including the planned OAuth transition.

## Availability and responsibility

Raven is an independent project and is not affiliated with or endorsed by Roblox Corporation. Roblox and package registries operate their own services. Changes to their APIs, permissions, or availability can affect Raven's commands.

Raven is provided "as is" and "as available" without a guarantee of uninterrupted operation, accuracy, support, or compatibility with future Roblox changes. The warranty disclaimer and limitation of liability in the [MIT license](LICENSE) apply to the extent permitted by law. These terms do not exclude rights or liabilities that applicable law does not allow to be excluded.

## Changes and contact

Updates to these terms will appear in this repository with a revised date. They do not revoke rights already granted under the MIT license. Questions about Raven or these terms can be raised through the [project's GitHub issues](https://github.com/twistedsignal/raven/issues). Do not post credentials, tokens, or private user data.
