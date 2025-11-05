# Fastmail MCP Server

A Model Context Protocol (MCP) server for Fastmail's JMAP API. It exposes email, contacts, calendar, identity and bulk-management tools to LLM clients over stdio or HTTP (StreamableHttp).

• Node.js ≥ 18 • TypeScript • No token persistence • 32 tools

## Highlights
- Email: list/search/read, send with draft→sent flow, move/delete, labels
- Advanced: attachments, threads, analytics, multi-criteria search
- Bulk: mark read/unread, move, delete, add/remove labels
- Contacts & Calendar: list/search/get, create events
- Transports: stdio (default), http (StreamableHttp)

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

Run via npx (GitHub)
```bash
FASTMAIL_API_TOKEN="<your_token>" \
  npx --yes github:MadLlama25/fastmail-mcp fastmail-mcp
```

## Configuration

Required (stdio mode only)
- `FASTMAIL_API_TOKEN`: Fastmail API token for the account

Optional
- `FASTMAIL_BASE_URL` (default: `https://api.fastmail.com`)
- `MCP_TRANSPORT`: `stdio` (default) | `http`

HTTP mode only
- `PORT` (default: `3000`), `HOST` (default: `0.0.0.0`)
- `MCP_PATH` (default: `/mcp`) - MCP endpoint
- `OAUTH_BASE_URL` - Public URL for OAuth callbacks (e.g., `https://your-domain.com`)

**Note**: HTTP mode uses OAuth 2.1 for authentication. Users will be redirected to a web form to paste their Fastmail API token, which is then used as the OAuth access token.

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

## Remote Connector (StreamableHttp) deployment with OAuth

Run the server
```bash
npm run build
MCP_TRANSPORT=http PORT=3000 HOST=0.0.0.0 \
OAUTH_BASE_URL="https://your-domain.com" \
FASTMAIL_BASE_URL="https://api.fastmail.com" \
node dist/index.js
```

Add a custom HTTPS connector in your MCP client
- URL: `https://your-domain.com/mcp`
- The client will automatically discover OAuth endpoints and redirect users to authorize

**OAuth Flow:**
1. Client connects to `/mcp` → receives 401 with OAuth discovery info
2. Client fetches `/.well-known/oauth-authorization-server` for OAuth metadata
3. (Optional) Client registers at `/register` using RFC 7591 (fake implementation, always succeeds)
4. Client redirects user to `/authorize?client_id=...&code_challenge=...&redirect_uri=...`
5. User sees web form to paste their Fastmail API token
6. Server validates token against Fastmail, generates authorization code
7. User is redirected back to client with code
8. Client exchanges code for access token at `/token`
9. Client uses access token (the Fastmail token) for all subsequent requests

Health check
```bash
curl -fsS https://your-domain.com/health
```

OAuth endpoints
```bash
curl https://your-domain.com/.well-known/oauth-authorization-server
```

### Docker Compose (example)
```yaml
services:
  app:
    build: .
    image: fastmail-mcp:latest
    restart: unless-stopped
    environment:
      MCP_TRANSPORT: http
      PORT: 3000
      HOST: 0.0.0.0
      OAUTH_BASE_URL: https://fastmail-mcp.example.com
      FASTMAIL_BASE_URL: ${FASTMAIL_BASE_URL}
    ports:
      - "3000:3000"
```

Put this behind TLS (Caddy/Nginx) and expose `https://`.

### Caddy example (StreamableHttp with OAuth)
```
fastmail-mcp.example.com {
  encode zstd gzip
  reverse_proxy /mcp app:3000
  reverse_proxy /authorize* app:3000
  reverse_proxy /token app:3000
  reverse_proxy /revoke app:3000
  reverse_proxy /register app:3000
  reverse_proxy /.well-known/* app:3000
  reverse_proxy /health app:3000
}
```

### .env for Compose
```
FASTMAIL_BASE_URL=https://api.fastmail.com
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
├─ index.ts              # Main server; stdio/http transports
├─ auth.ts               # Token + headers + session URL
├─ jmap-client.ts        # JMAP wrapper, concurrency + backoff
├─ contacts-calendar.ts  # Contacts/Calendar client
└─ handlers.ts           # Tool registry for http mode
```

Scripts
- `npm run dev` — tsx with hot reload (stdio)
- `npm run build` — tsc to `dist/`
- `npm start` — node `dist/index.js` (stdio)

## API & Credits
Powered by Fastmail’s JMAP API. Many flows were inspired by the official Fastmail JMAP-Samples (top-ten, batch methods, etc.).

## License
MIT
