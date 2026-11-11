# Server hosting

## Hosting on ThomasLab

The existing GitHub Pages workflow now installs, tests and builds this project, then stages the generated `Titanic/` folder. The main ThomasLab project list links to `/Titanic/`. Server source, installed dependencies, `.env`, and build tools are excluded from the published client.

**GitHub Pages cannot run this Node multiplayer/voice server.** Host the server separately on a persistent VM or container host with inbound UDP support. Before publishing the client, set the repository Actions variable **`TITANIC_SERVER_URL`** to its public HTTPS address. The workflow supplies that as `VITE_GAME_SERVER_URL` at build time. Players can also choose the address in Settings. Merely publishing the static files does not create a public game server.

For manual builds, copy `.env.example` to `.env`, fill in the server address and hosting values, then run `npm run build`. Only `VITE_GAME_SERVER_URL` is a Vite build variable; keep TURN credentials on the server. Build-time public server URLs are intentionally included in the client. The runtime supplies the configured TURN access to connected voice participants; use dedicated, limited TURN credentials rather than an infrastructure administration password.

### Recommended simple deployment

1. Point a DNS name such as `titanic.example.com` at a VM that permits UDP. Set `.env` values `PUBLIC_IP`, `ALLOWED_ORIGINS` and any STUN/TURN configuration. Include both your game host origin and `https://thomaslab.me` if serving both.
2. Build and run with Node (`npm ci`, `npm run build`, `npm start`), or use `docker compose up -d --build` from `TitanicGame/`. The Docker build context is the repository root. A lockfile is included. The container runs as a non-root user.
3. Put Caddy or an equivalent HTTPS reverse proxy in front of `127.0.0.1:3001`; see `deploy/Caddyfile.example`. Socket.IO uses HTTP/WebSocket on the same endpoint. The game server serves `/Titanic/` too, so the entire game can run from one origin instead of Pages.
4. Permit TCP **80/443** for the reverse proxy and inbound UDP **40000–40100** for WebRTC. If using Docker, these UDP ports are published by `compose.yml`. Set `PUBLIC_IP` to the reachable public address. Avoid an HTTP-only serverless host: the voice relay needs a persistent process and UDP sockets.
5. Set `STUN_URL` for NAT discovery if needed. Set `TURN_URL`, `TURN_USERNAME`, and `TURN_PASSWORD` when clients on restrictive networks need relay service. Self-hosting coturn is an option; `deploy/turnserver.conf.example` shows the corresponding settings. A TURN host also needs its listening ports and relay UDP range reachable (the example uses 3478, 5349 and 49160–49200). Use proper certificates for `turns:` connections.
6. Check `/health`, connect from a second computer on another network, test actual voice in both directions, and complete the manual checklist before inviting a full crew.

`ALLOWED_ORIGINS` is a comma-separated list of exact origins, without trailing slashes. Both polling and WebSocket handshakes validate browser origins. There are room and message rate limits. Use your host's normal reverse proxy and resource protections for public exposure.

The process holds live rooms in memory. Brief network drops and page refreshes can reconnect with a secret, per-tab crew pass; a server restart loses active matches. Host departure migrates host authority to another connected crew member. This release uses one server process: no Redis/distributed room migration, account system, persistence, moderation service or fleet autoscaling is included.

