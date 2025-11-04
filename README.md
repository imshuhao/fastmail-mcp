# Fastmail MCP Server

A Model Context Protocol (MCP) server for Fastmail’s JMAP API. It exposes email, contacts, calendar, identity and bulk-management tools to LLM clients over stdio, WebSocket or SSE.

• Node.js ≥ 18 • TypeScript • No token persistence • 32 tools

## Highlights
- Email: list/search/read, send with draft→sent flow, move/delete, labels
- Advanced: attachments, threads, analytics, multi-criteria search
- Bulk: mark read/unread, move, delete, add/remove labels
- Contacts & Calendar: list/search/get, create events
- Transports: stdio (default), ws, sse

## Quickstart

Prerequisites
- Node.js 18+
- A Fastmail API token (Settings → Privacy & Security → Connected apps & API tokens)

Install and run (stdio)
```bash
npm ci            # also builds via prepare
FASTMAIL_API_TOKEN="<your_token>" npm start
```

Dev mode with auto-reload
```bash
export FASTMAIL_API_TOKEN="<your_token>"
npm run dev
```

Local smoke test
```bash
# Put FASTMAIL_API_TOKEN in .env (optionally FASTMAIL_BASE_URL)
node scripts/test-mcp.mjs
# Expected: “Fastmail MCP server running on stdio” and “Tools available: 32”
```

Run via npx (GitHub)
```bash
FASTMAIL_API_TOKEN="<your_token>" \
  npx --yes github:MadLlama25/fastmail-mcp fastmail-mcp
```

## Configuration

Required
- `FASTMAIL_API_TOKEN`: Fastmail API token for the account

Optional
- `FASTMAIL_BASE_URL` (default: `https://api.fastmail.com`)
- `MCP_TRANSPORT`: `stdio` (default) | `ws` | `sse`

WS mode only
- `PORT` (default: `3000`), `HOST` (default: `0.0.0.0`)
- `WS_PATH` (default: `/mcp`)
- `AUTH_HEADER` (default: `Authorization`), `AUTH_SCHEME` (default: `Bearer`)
- `CONNECTOR_SHARED_SECRET` (optional). If set, a client must send header `x-connector-secret: <value>`.

SSE mode only
- `PORT` (default: `3000`), `HOST` (default: `0.0.0.0`)
- `SSE_PATH` (default: `/mcp`); messages stream is `${SSE_PATH}/messages`
- `AUTH_HEADER` (default: `Authorization`), `AUTH_SCHEME` (default: `Bearer`)

Note: SSE authenticates via the Bearer token supplied by the client. No additional shared-secret gate is enforced in the SSE path.

## Using as a Claude Desktop Extension (DXT)

1) Build and pack
```bash
npm run build
npx dxt pack
```
This produces a `.dxt` package in the project root from `manifest.json`.

2) Install the `.dxt` in Claude Desktop and provide:
- Fastmail API Token (stored by Claude)
- Fastmail Base URL (optional)

## Remote Connector (SSE) deployment

Run the server
```bash
npm run build
MCP_TRANSPORT=sse PORT=3000 HOST=0.0.0.0 \
AUTH_HEADER=Authorization AUTH_SCHEME=Bearer \
FASTMAIL_BASE_URL="https://api.fastmail.com" \
node dist/index.js
```

Add a custom HTTPS connector in your client
- URL: `https://<your-domain>/mcp`
- Secret: your Fastmail API token (sent as `Authorization: Bearer <token>`)

Health check
```bash
curl -fsS https://<your-domain>/health
```

### Docker Compose (example)
```yaml
services:
  app:
    build: .
    image: fastmail-mcp:beta
    restart: unless-stopped
    environment:
      MCP_TRANSPORT: sse
      PORT: 3000
      HOST: 0.0.0.0
      AUTH_HEADER: Authorization
      AUTH_SCHEME: Bearer
      CONNECTOR_SHARED_SECRET: ${CONNECTOR_SHARED_SECRET}
      FASTMAIL_BASE_URL: ${FASTMAIL_BASE_URL}
    ports:
      - "3000:3000"
```

Put this behind TLS (Caddy/Nginx) and expose `https://`.

### Caddy example (SSE)
```
fastmail-mcp.example.com {
  encode zstd gzip
  reverse_proxy /mcp app:3000
  reverse_proxy /mcp/messages app:3000
  reverse_proxy /health app:3000
}
```

### .env for Compose
```
FASTMAIL_BASE_URL=https://api.fastmail.com
# Optional for WS only; SSE ignores it
# CONNECTOR_SHARED_SECRET=your_shared_secret
```

## Available Tools (32)

Email
- list_mailboxes — List all mailboxes
- list_emails — List emails (optional mailbox, limit)
- get_email — Get one email by ID
- send_email — Draft + submit, moves to Sent
- search_emails — Text search, recent-first
- get_recent_emails — Recent from a mailbox
- mark_email_read — Read/unread toggle
- delete_email — Move to Trash
- move_email — Move to a mailbox
- add_labels — Add mailbox labels (single)
- remove_labels — Remove mailbox labels (single)

Advanced email
- get_email_attachments — List attachments
- download_attachment — Download URL for attachment
- advanced_search — Multi-criteria search
- get_thread — Fetch full conversation thread
- get_mailbox_stats — Stats per/all mailboxes
- get_account_summary — Aggregate account stats

Bulk
- bulk_mark_read — Many emails read/unread
- bulk_move — Many emails move
- bulk_delete — Many emails to Trash
- bulk_add_labels — Many emails add labels
- bulk_remove_labels — Many emails remove labels

Contacts
- list_contacts — List contacts
- get_contact — Get by ID
- search_contacts — Search by name/email

Calendar
- list_calendars — List calendars
- list_calendar_events — List events
- get_calendar_event — Get by ID
- create_calendar_event — Create an event

Identity & Testing
- list_identities — Available sending identities
- check_function_availability — Capability check + guidance
- test_bulk_operations — Safe dry-run for bulk ops

## Security & Privacy
- No token persistence. In ws/sse, tokens live only per-connection.
- No raw secrets are logged. Errors are sanitized to avoid leaking IDs or blobs.
- Respect Fastmail rate limits. Client includes 2 in-flight concurrency and exponential backoff for 429/5xx.

## Troubleshooting
Common issues
- Auth failures: verify `FASTMAIL_API_TOKEN` and base URL
- Contacts/Calendar forbidden: may require plan features/scopes enabled
- Build issues: ensure Node 18+, run `npm ci` then `npm run build`

Self-check tools
- `check_function_availability` — shows which feature families are available for your account/token
- `test_bulk_operations` — dry-run bulk changes; set `dryRun:false` to execute

## Development
Project layout
```
src/
├─ index.ts              # Main server; stdio/ws/sse transports
├─ auth.ts               # Token + headers + session URL
├─ jmap-client.ts        # JMAP wrapper, concurrency + backoff
├─ contacts-calendar.ts  # Contacts/Calendar client
└─ handlers.ts           # Tool registry used by ws/sse
```

Scripts
- `npm run dev` — tsx with hot reload (stdio)
- `npm run build` — tsc to `dist/`
- `npm start` — node `dist/index.js` (stdio)
- `node scripts/test-mcp.mjs` — local stdio smoke test that loads `.env`

## API & Credits
Powered by Fastmail’s JMAP API. Many flows were inspired by the official Fastmail JMAP-Samples (top-ten, batch methods, etc.).

## License
MIT
