# Artisan

A desktop virtual tabletop for small, private D&D 5e groups — maps, tokens,
fog of war, dynamic lighting, dice, an initiative tracker, and a vendored 5e
SRD bestiary/character sheet, all running offline-first with a lightweight
sync broker for the table.

## Install

### Desktop + broker

The desktop application is built with Wails; the Go broker runs separately.
Build the desktop with the Wails workflow documented in `DEPLOY.md`, then run
the broker from `broker-go/`.

For a Docker deployment of the broker, use the compose file in that directory:

```
cd broker-go
docker compose up -d --build
```

For local development, use Node.js 20+ and Yarn for the frontend, and Go 1.25+
for the broker. The frontend uses Vite and can run fully offline: `yarn start`
starts the development server, `yarn build` creates the production bundle, and
`yarn preview` serves that bundle locally.

Run the broker from its own directory:

```
cd broker-go
go run .
```

## Game Master Accounts

Every map, token, fog shape and image lives in the browser's own IndexedDB
storage, so a game set up on one computer can't be opened on another. An
optional account lets a Game Master carry that data between machines.

Open **Settings → Game Master Account**, create an account, then:

- **Save to Server** uploads your whole library (maps, tokens, images, fog and
  token positions) to the server.
- **Load from Server** on another computer or browser downloads it and reloads
  the page.

This is a manual snapshot, not live sync. Save when you finish preparing a game
and load before you play elsewhere. If you save from two machines the last save
wins, so treat one machine as the source of truth per session.

Player sessions work the same way: players still join with the room link and
password and receive images relayed through the broker over the same
WebSocket connection used for map/token sync (see "Networking" below).

### Sharing your view

The owner of a map gets an eye button in the map controls. Turn it on and every
player's camera follows yours, at the same position and zoom, however big their
window is. Turn it off and everyone is free to look around again.

Fog is unaffected. It is drawn per viewer from the map state, so players see the
same framing but still only the parts of the map you have revealed to them.

### Networking

Map/token images and asset requests between players travel over a single
WebSocket connection to the broker: every message — game state *and* image
bytes — is a `peer_message` frame relayed through it (see
`broker-go/internal/game/hub.go`'s `handlePeerMessage` and
`src/network/Session.ts`'s `sendTo`/`_handlePeerMessage`). No STUN/TURN/ICE
server, nothing that can fail behind a strict firewall or VPN. The trade-off
is that image transfers use the broker's own bandwidth instead of going
directly between players' machines — fine for a small private game, not
meant for a large public server.

### Server configuration

By default the frontend talks to the backend on **whatever host you opened the
page from**, on port `9420`. So reaching the app at `http://192.168.1.10:3000`
makes it use `http://192.168.1.10:9420` for the backend, and it keeps working
when your machine's IP changes. Set `VITE_BROKER_PORT` to move that port,
or `VITE_BROKER_URL` to a full URL if the backend runs on another machine.

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_BROKER_PORT` | `9420` | Backend port, on the same host as the page |
| `VITE_BROKER_URL` | *(derived)* | Full backend URL, overrides the above |
| `DATA_DIR` | `./data` | Where broker account credentials and backups are stored |
| `MAX_ACCOUNTS` | `4` | Cap on registered accounts, `0` disables registration (this repo's broker deploy sets `20`, see `broker-go/docker-compose.yml`) |
| `MAX_BACKUP_BYTES` | `2147483648` | Largest backup accepted, in bytes |

Passwords are stored hashed with bcrypt and sessions use a random token that
expires after 30 days. **Serve the backend over HTTPS.** Without TLS the Game
Master's password is sent in the clear; put the backend behind a reverse
proxy such as Caddy or nginx for a local setup.

Back up the `DATA_DIR` directory, it is the only copy of the account data. When
running with Docker Compose it is kept in the `gm-data` volume.

To run the broker self checks:

```
cd broker-go && go test ./...
```

## Troubleshooting

**Custom Images Aren't Showing on Other Computers**

Images travel through the broker over the same WebSocket connection as
everything else, so there is no STUN/TURN/ICE configuration to troubleshoot.
If images still aren't arriving, check that both players can reach the
broker itself (the same connection carrying map/token sync); if that works,
image transfer will too.
