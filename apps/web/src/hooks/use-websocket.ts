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
};

export function useWebSocket(
  getToken: () => string | null,
): WebSocketHandle {
  const wsRef = useRef<WebSocket | null>(null);
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
    if (!token) {
      // Token not yet available (auth loading) — retry shortly
      reconnectTimer.current = setTimeout(connect, 500);
      return;
    }

    const serverBase = getServerBaseUrl();
    const wsUrl =
      serverBase.replace(/^http/, "ws") +
      `/api/ws?token=${encodeURIComponent(token)}`;

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
      setConnected(false);
      wsRef.current = null;

      // 4001 = server rejected auth (token expired/invalid)
      if (event.code === 4001) {
        console.warn("[ws] Auth rejected (token expired?), stopping reconnect");
        // Stop reconnecting — token is bad, need page refresh or re-login
        return;
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
    (action: string, payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[ws] command queued — waiting for connection, readyState:", ws?.readyState);
        return;
      }
      ws.send(JSON.stringify({ type: "command", action, payload }));
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
      sendCommand(
        "agent.run",
        payload as unknown as Record<string, unknown>,
      );
    },
    [sendCommand],
  );

  const cancelRun = useCallback(
    (runId: string) => {
      sendCommand("agent.cancel", { runId });
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

  return { connected, startRun, cancelRun, onEvent, registerRPC };
}
