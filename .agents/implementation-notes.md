# Implementation Notes for StreamableHttp

## Date: 2025-11-04

## SDK Update
- Updated from @modelcontextprotocol/sdk ^0.6.1 to ^1.21.0
- StreamableHttp support confirmed in SDK

## Implementation Approach

### Based on SDK Example Analysis

From `/node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleStreamableHttp.js`:

#### Key Components

1. **Import Statement**
```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
```

2. **Transport Configuration**
```typescript
new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),  // or undefined for stateless
  eventStore,                              // optional for resumability
  onsessioninitialized: (sessionId) => {}, // callback
  onsessionclosed: (sessionId) => {},      // callback
  enableJsonResponse: false,               // default false (use SSE)
  allowedHosts: [],                        // DNS rebinding protection
  allowedOrigins: [],                      // DNS rebinding protection
  enableDnsRebindingProtection: false      // default false
})
```

3. **HTTP Server Setup**
- Single endpoint (e.g., `/mcp`)
- Handles POST, GET, DELETE methods
- Session management via Map<sessionId, transport>

4. **POST Handler**
- Receives JSON-RPC messages
- For initialization (no sessionId): create new transport + connect to server
- For subsequent requests: reuse existing transport from map
- Store transport in map on session initialization callback

5. **GET Handler**
- Returns SSE stream for server-initiated messages
- Requires valid sessionId in headers
- Optional Last-Event-ID for resumability

6. **DELETE Handler**
- Terminates session
- Removes transport from map

### Current Fastmail MCP Structure

Our current implementation has:
- **stdio mode**: Uses StdioServerTransport (keep unchanged)
- **ws mode**: Uses WebSocket with custom transport (keep unchanged)
- **sse mode**: Uses SSEServerTransport (REPLACE with StreamableHttp)

### Implementation Strategy

1. **Replace SSE mode with HTTP mode**
   - Environment variable: `MCP_TRANSPORT=http` (or keep `sse` as alias for compatibility?)
   - Use `StreamableHTTPServerTransport` instead of `SSEServerTransport`

2. **Configuration Changes**
   - `SSE_PATH` → `MCP_PATH` or `HTTP_PATH` (default: `/mcp`)
   - Remove `messagesPath` (no longer needed with single endpoint)
   - Keep PORT, HOST, AUTH_HEADER, AUTH_SCHEME

3. **Per-Connection Server Pattern**
   - Current SSE implementation creates server per connection
   - Same pattern works for StreamableHttp
   - Each transport connects to new Server instance

4. **Authentication Flow**
   - Current: token captured on first POST
   - New: Same approach, validate on all subsequent requests

5. **Session Management**
   - Use Map to store transports by sessionId
   - Clean up on session close
   - Handle session validation (404 for invalid sessions)

### Code Structure

```typescript
if (transportMode === 'http' || transportMode === 'sse') {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';
  const mcpPath = process.env.MCP_PATH || process.env.SSE_PATH || '/mcp';
  const authHeader = (process.env.AUTH_HEADER || 'authorization').toLowerCase();
  const authScheme = (process.env.AUTH_SCHEME || 'bearer').toLowerCase();
  const defaultBaseUrl = process.env.FASTMAIL_BASE_URL;
  const sharedSecret = process.env.CONNECTOR_SHARED_SECRET;

  // Session storage
  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    context: { token?: string; jmap?: JmapClient; contacts?: ContactsCalendarClient };
    server: Server
  }>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      res.writeHead(200).end('ok');
      return;
    }

    if (url.pathname === mcpPath) {
      if (req.method === 'POST') {
        // Handle POST request
      } else if (req.method === 'GET') {
        // Handle GET request (SSE)
      } else if (req.method === 'DELETE') {
        // Handle DELETE request
      } else {
        res.writeHead(405).end('Method not allowed');
      }
      return;
    }

    res.writeHead(404).end('not found');
  });

  // Start server
}
```

### Important Implementation Details

1. **Session Initialization**
   - Create transport with `sessionIdGenerator: () => randomUUID()`
   - Use `onsessioninitialized` callback to store in map
   - Connect transport to server BEFORE handling request

2. **Request Handling**
   - Parse body for POST requests
   - Check if initialization request (no sessionId)
   - Reuse existing transport for subsequent requests
   - Validate sessionId for non-init requests

3. **Error Handling**
   - 400: Invalid session or bad request
   - 404: Session not found
   - 405: Method not allowed
   - 500: Internal server error

4. **Cleanup**
   - Remove from sessions map when transport closes
   - Handle SIGINT for graceful shutdown
   - Close all active transports on shutdown

## Next Steps

1. Implement HTTP mode in src/index.ts
2. Remove old SSE implementation
3. Test all three modes (stdio, ws, http)
4. Update documentation
5. Commit and push
