# Multi-Tab WebSocket Architecture

## Problem

ConnectionManager stores one WebSocket per userId. Opening a second canvas tab replaces the first connection, causing the first tab to lose all WS events. Users cannot work on multiple canvases simultaneously.

## Design: Hybrid Routing (C)

- **Agent events** routed by `canvasId` — all tabs viewing the same canvas see the same events
- **ACK / RPC responses** routed by `connectionId` — delivered precisely to the tab that sent the request
- Each tab generates a unique `connectionId` (UUID) and passes it during WS handshake

## Architecture

### Data Structures

**ConnectionManager** changes from `Map<userId, WebSocket>` to:

```typescript
type ConnectionEntry = {
  ws: WebSocket;
  userId: string;
  connectionId: string;
  canvasId: string | null; // set when tab binds to a canvas
};

// Primary lookup: connectionId → entry
private connections = new Map<string, ConnectionEntry>();
// Index: userId → Set<connectionId>
private userIndex = new Map<string, Set<string>>();
// Index: canvasId → Set<connectionId>
private canvasIndex = new Map<string, Set<string>>();
```

### Connection Lifecycle

1. **Client opens WS**: `/api/ws?token=xxx&connectionId=uuid`
2. **Server registers**: stores entry with `canvasId = null`
3. **Client sends first command** (e.g. `agent.run` with `canvasId`): server updates entry's `canvasId` and adds to canvasIndex
4. **Client disconnects**: remove from all indexes
5. **New connection with same userId**: does NOT replace existing connections

### Routing Methods

| Method | Routes to | Use case |
|--------|-----------|----------|
| `pushToCanvas(canvasId, event)` | All connections viewing that canvas | Agent stream events, canvas.sync |
| `sendTo(connectionId, message)` | Single specific connection | ACK, RPC response |
| `pushToUser(userId, event)` | All connections for that user | Account-level notifications (future) |

### Client Changes

**use-websocket.ts**:
- Generate `connectionId` (UUID) once per hook instance, pass in WS URL query param
- No other client changes needed — event filtering by `runId` already works

**canvas/page.tsx**: No changes needed.

**chat-sidebar.tsx**: No changes needed — already filters events by `runId`.

### Server Changes

**connection-manager.ts**:
- Replace single-connection Map with multi-connection data structure
- Add `register(connectionId, userId, ws)` with no replacement behavior
- Add `bindCanvas(connectionId, canvasId)` to associate connection with canvas
- Add `pushToCanvas(canvasId, event)` for canvas-scoped event delivery
- Add `sendTo(connectionId, message)` for precise delivery
- Keep `push(userId, event)` as broadcast to all user connections
- Update `rpc()` to target specific connectionId
- Update `remove()` to clean up all indexes

**handler.ts**:
- Extract `connectionId` from WS URL query params during auth
- Pass `connectionId` to register
- On `agent.run` command: call `bindCanvas(connectionId, canvasId)`
- ACK delivery: use `sendTo(connectionId, ack)` instead of `send(userId, ack)`
- Event streaming: use `pushToCanvas(canvasId, event)` instead of `push(userId, event)`
- RPC: target specific connectionId

### Wire Protocol Changes

**WS URL**: `/api/ws?token=xxx&connectionId=xxx`

No changes to event schema or command schema. The `connectionId` is transport-level only.

## Edge Cases

- **Same canvas in two tabs**: both receive agent events (correct — same canvas)
- **Tab closed mid-stream**: connection removed, events silently dropped for that connection; other tabs unaffected
- **All tabs closed**: no connections for user, events dropped (agent run still completes server-side)
- **Reconnect**: client uses same `connectionId`, server replaces only THAT connection entry

## Scope

- ConnectionManager refactor (server)
- Handler routing changes (server)
- Client connectionId generation (web)
- Update existing tests
- No database changes
- No event schema changes
