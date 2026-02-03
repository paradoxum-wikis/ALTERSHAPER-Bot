# Aphonos Bot - ALTER EGO Wiki Utility Bot

Aphonos, formerly ALTERSHAPER, a utility discord bot made specifically for ALTER EGO Wiki and Tower Defense Simulator Wiki. Has utilities to link an account with a wiki account, and give out appropriate roles. Also a bunch of fun commands such as `/aura` and `/battle`.

Extensive documentation will be found here: https://alter-ego.fandom.com/wiki/Help:ALTERSHAPER

## Features

- **Moderation**: `/kick`, `/ban`, `/timeout`, `/warn`
- **Management**: `/clear` with message archiving, `/removesin` for punishment reversal
- **Information**: `/sins` for records, `/archives` for deleted messages, `/help` for well, help lol
- **Auto-welcome** new members
- **Action IDs** for moderation & management commands (e.g. W1, K1, B1, T1, C1)

## Setup

1. `npm install`
2. Create `.env` with `DISCORD_TOKEN=your_token`
3. `npm run build`
4. `npm start`

Use `npm run dev` if you want to skip the compiling.

## Required Permissions

You can give the bot its permissions by one of these options:
| Role Permissions (In-server) | Bot Permissions (Dev Portal) |
| -------------------------------- | --------------------------------------- |
| Kick, Approve and Reject Members | Kick Members |
| Ban Members | Ban Members |
| Time out members | Moderate Members |
| Manage Messages | Manage Messages |
| Send Messages | Send Messages |
| Embed Links | Embed Links |
| Read Message History | Read Message History |
| Add Reactions | Add Reactions |
| View Channels | View Channels |

Maybe more that I forgot about xd—but to be honest, if you're selfhosting then you're better off just turning everything on

## Invite

See the OAUTH2 section in your bot settings on the Discord Developer Portal.
