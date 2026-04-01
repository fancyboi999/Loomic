"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  StreamEvent,
  WsCommandAck,
  WsRpcRequest,
  RunCreateRequest,
} from "@loomic/shared";
import { getServerBaseUrl } from "../lib/env";

type EventCallback = (event: StreamEvent) => void;
type RPCHandler = (
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type WebSocketHandle = {
  connected: boolean;
  startRun: (
    payload: RunCreateRequest,
    onAck?: (ack: WsCommandAck) => void,
  ) => void;
  cancelRun: (runId: string) => void;
  onEvent: (cb: EventCallback) => () => void;
  registerRPC: (method: string, handler: RPCHandler) => () => void;
  resumeCanvas: (canvasId: string, onAck?: (ack: WsCommandAck) => void) => void;
};

export function useWebSocket(
  getToken: () => string | null,
): WebSocketHandle {
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(
    (() => {
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("ws_connection_id");
        if (stored) return stored;
        const id = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem("ws_connection_id", id);
        return id;
      }
      return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    })(),
  );
  const [connected, setConnected] = useState(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const eventListeners = useRef<Set<EventCallback>>(new Set());
  const ackListeners = useRef<
    Map<string, (ack: WsCommandAck) => void>
  >(new Map());
  const rpcHandlers = useRef<Map<string, RPCHandler>>(new Map());

  const connect = useCallback(() => {
    const token = getToken();
    if (disposed.current) return;
    // Skip if already connected — prevents React Strict Mode double-mount
    // from replacing an active connection mid-stream
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }
    // Close any existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect from old socket
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!token) {
      // Token not yet available (auth loading) — retry shortly
      reconnectTimer.current = setTimeout(connect, 500);
      return;
    }

    const serverBase = getServerBaseUrl();
    const wsUrl =
      serverBase.replace(/^http/, "ws") +
      `/api/ws?token=${encodeURIComponent(token)}&connectionId=${encodeURIComponent(connectionIdRef.current)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === "event") {
        for (const cb of eventListeners.current) {
          cb(msg.event as StreamEvent);
        }
      } else if (msg.type === "command.ack") {
        const cb = ackListeners.current.get(msg.action as string);
        if (cb) {
          ackListeners.current.delete(msg.action as string);
          cb(msg as unknown as WsCommandAck);
        }
      } else if (msg.type === "rpc.request") {
        void handleRpcRequest(ws, msg as unknown as WsRpcRequest);
      }
    };

    ws.onclose = (event) => {
      // Only handle close for the CURRENT connection.
      // React Strict Mode creates two connections; when the server replaces
      // the old one, its close event fires after remount resets disposed=false.
      // Without this guard, we'd enter a reconnect loop.
      if (wsRef.current !== ws) return;

      setConnected(false);
      wsRef.current = null;

      if (event.code === 4001) {
        console.warn("[ws] Auth rejected, will retry with fresh token");
      }

      if (!disposed.current) {
        const delay = Math.min(
          30_000,
          1000 * Math.pow(2, reconnectAttempt.current),
        );
        reconnectAttempt.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [getToken]);

  async function handleRpcRequest(ws: WebSocket, req: WsRpcRequest) {
    const handler = rpcHandlers.current.get(req.method);
    if (!handler) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "rpc.response",
            id: req.id,
            error: `No handler for method: ${req.method}`,
          }),
        );
      }
      return;
    }

    try {
      const result = await handler(req.params);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "rpc.response", id: req.id, result }),
        );
      }
    } catch (error) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "rpc.response",
            id: req.id,
            error:
              error instanceof Error ? error.message : "RPC handler failed",
          }),
        );
      }
    }
  }

  useEffect(() => {
    disposed.current = false;
    connect();
    return () => {
      disposed.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendCommand = useCallback(
    (action: string, payload: Record<string, unknown>): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[ws] command dropped — not connected, readyState:", ws?.readyState);
        return false;
      }
      ws.send(JSON.stringify({ type: "command", action, payload }));
      return true;
    },
    [],
  );

  const startRun = useCallback(
    (
      payload: RunCreateRequest,
      onAck?: (ack: WsCommandAck) => void,
    ) => {
      if (onAck) {
        ackListeners.current.set("agent.run", onAck);
      }
      const sent = sendCommand(
        "agent.run",
        payload as unknown as Record<string, unknown>,
      );
      if (!sent) {
        // Remove the dangling ack listener so callers don't hang forever
        ackListeners.current.delete("agent.run");
      }
    },
    [sendCommand],
  );

  const cancelRun = useCallback(
    (runId: string) => {
      sendCommand("agent.cancel", { runId });
    },
    [sendCommand],
  );

  const resumeCanvas = useCallback(
    (canvasId: string, onAck?: (ack: WsCommandAck) => void) => {
      if (onAck) {
        ackListeners.current.set("canvas.resume", onAck);
      }
      const sent = sendCommand("canvas.resume", { canvasId, lastSeq: 0 });
      if (!sent) {
        ackListeners.current.delete("canvas.resume");
      }
    },
    [sendCommand],
  );

  const onEvent = useCallback((cb: EventCallback) => {
    eventListeners.current.add(cb);
    return () => {
      eventListeners.current.delete(cb);
    };
  }, []);

  const registerRPC = useCallback(
    (method: string, handler: RPCHandler) => {
      rpcHandlers.current.set(method, handler);
      return () => {
        rpcHandlers.current.delete(method);
      };
    },
    [],
  );

  return { connected, startRun, cancelRun, onEvent, registerRPC, resumeCanvas };
}
