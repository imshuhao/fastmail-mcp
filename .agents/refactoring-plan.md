# Refactoring Plan: SSE to StreamableHttp

## Date: 2025-11-04

## Objective
Refactor the Fastmail MCP server to remove deprecated SSE transport and implement the new StreamableHttp transport as specified in MCP 2025-03-26.

## Current State Analysis

### Files Affected
1. **src/index.ts** (lines 16, 1560-1658)
   - Imports SSEServerTransport
   - Full SSE implementation with dedicated endpoints
   - Uses separate GET (SSE events) and POST (messages) endpoints

2. **README.md** (lines 60-65, 80-136)
   - Documents SSE mode configuration
   - SSE deployment examples
   - Docker/Caddy configuration for SSE

3. **package.json**
   - Currently using @modelcontextprotocol/sdk ^0.6.0
   - May need to check if this version supports StreamableHttp

### Current SSE Implementation Details
- **Entry point**: `MCP_TRANSPORT=sse` environment variable
- **Configuration**:
  - PORT (default: 3000)
  - HOST (default: 0.0.0.0)
  - SSE_PATH (default: /mcp)
  - Messages path: ${SSE_PATH}/messages
  - AUTH_HEADER and AUTH_SCHEME for authentication
- **Session management**: Map-based session storage
- **Authentication**: Bearer token captured on first POST request
- **Health endpoint**: /health

## StreamableHttp Transport Specifications

### Key Features
1. **Single endpoint** for both POST and GET (simplification from SSE's dual-endpoint)
2. **Bidirectional communication** on the same connection
3. **Session management** via Mcp-Session-Id header
4. **Resumability** support with Last-Event-ID
5. **Adaptive behavior**: standard HTTP for quick ops, streaming for long-running tasks

### Implementation Requirements
1. Single HTTP endpoint (e.g., /mcp) supporting:
   - POST: Client-to-server JSON-RPC messages
   - GET: Optional SSE stream for server-initiated messages (new SSE is different from old SSE transport)
   - DELETE: Session termination
2. Headers:
   - Accept: application/json, text/event-stream
   - Mcp-Session-Id: session identifier (server-assigned)
   - Last-Event-ID: for resumability
   - Origin: must validate to prevent DNS rebinding
3. Response codes:
   - 202: Notifications/responses
   - 404: Session not found/terminated
4. Security:
   - Bind to localhost for local servers
   - Validate Origin header
   - Implement proper authentication

### Why Replace SSE?
1. **Complexity reduction**: Two endpoints → one endpoint
2. **Better scalability**: Less resource consumption
3. **Improved reliability**: Built-in recovery mechanisms
4. **Protocol compatibility**: Better HTTP/2 and HTTP/3 support
5. **Bidirectional**: Server can initiate communication
6. **Unified error handling**: Single channel for all errors

## Refactoring Steps

### Phase 1: Code Analysis (COMPLETED)
- [x] Identify all SSE references in codebase
- [x] Understand current implementation
- [x] Research StreamableHttp specifications
- [x] Create refactoring plan

### Phase 2: Implementation
1. **Update dependencies**
   - Check SDK version supports StreamableHttp
   - Update if necessary (SDK 1.10.0+ has StreamableHttp)

2. **Modify src/index.ts**
   - Remove SSEServerTransport import
   - Add StreamableHttpServerTransport import
   - Replace SSE transport implementation (lines 1560-1658)
   - Implement new StreamableHttp server:
     - Single /mcp endpoint
     - Session management with Mcp-Session-Id
     - Origin header validation
     - DELETE support for session termination
     - Proper authentication flow
   - Update environment variable handling:
     - Rename SSE_PATH to MCP_ENDPOINT or similar
     - Remove MESSAGES_PATH (no longer needed)
   - Keep health endpoint

3. **Update configuration**
   - Change MCP_TRANSPORT values: stdio | ws | http (instead of sse)
   - Update environment variable names
   - Ensure backward compatibility where possible

4. **Error handling and validation**
   - Add Origin header validation
   - Implement proper session not found handling
   - Add resumability support (optional but recommended)

### Phase 3: Documentation Updates
1. **README.md**
   - Replace all SSE references with StreamableHttp
   - Update configuration examples
   - Update deployment examples (Docker, Caddy)
   - Update environment variables documentation
   - Add migration guide for existing users
   - Clarify the distinction between old SSE transport and new SSE within StreamableHttp

2. **package.json**
   - Update version number
   - Update description if needed

3. **Add MIGRATION.md** (optional)
   - Guide for users migrating from SSE to StreamableHttp
   - Breaking changes
   - Configuration changes

### Phase 4: Testing
1. Build the project
2. Test stdio mode (should remain unchanged)
3. Test WebSocket mode (should remain unchanged)
4. Test new StreamableHttp mode:
   - POST requests
   - GET requests (SSE streaming)
   - Session management
   - Authentication
   - Health endpoint
5. Test with actual Fastmail API

### Phase 5: Commit and Push
1. Commit changes with descriptive message
2. Push to branch: claude/refactor-sse-to-streamable-http-011CUoVcUueBuD4KXeNEC5nk

## Notes

### Terminology Clarification
- **Old SSE Transport**: The deprecated MCP transport mode that used SSE as the primary transport mechanism (being removed)
- **New SSE in StreamableHttp**: SSE is still used within StreamableHttp for streaming long-running responses, but it's part of the HTTP transport, not a separate transport mode

### Compatibility Considerations
- stdio mode: No changes needed
- ws mode: No changes needed
- sse mode: Being replaced entirely with http/streamablehttp mode

### Potential Issues
1. SDK version may need update
2. Existing deployments will need configuration changes
3. Session management implementation needs careful testing
4. Origin validation security must be properly implemented

## References
- MCP Specification 2025-03-26: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- Blog post on SSE deprecation: https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/
- SDK version 1.10.0+ required for StreamableHttp support
