import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { StreamEvent } from "@loomic/shared";

type PendingRPC = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class ConnectionManager {
  private connections = new Map<string, WebSocket>();
  private pendingRPCs = new Map<string, PendingRPC>();

  register(userId: string, ws: WebSocket): void {
    const existing = this.connections.get(userId);
    if (existing && existing !== ws) {
      existing.close(1000, "replaced");
    }
    this.connections.set(userId, ws);
  }

  remove(userId: string): void {
    this.connections.delete(userId);
  }

  get(userId: string): WebSocket | undefined {
    return this.connections.get(userId);
  }

  push(userId: string, event: StreamEvent): void {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "event", event }));
  }

  /** Send a raw JSON message to the user's latest connection. */
  send(userId: string, message: Record<string, unknown>): boolean {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(message));
    return true;
  }

  async rpc<T = unknown>(
    userId: string,
    method: string,
    params: Record<string, unknown>,
    timeout = 10_000,
  ): Promise<T> {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`User ${userId} not connected`);
    }

    const id = randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRPCs.delete(id);
        reject(new Error(`RPC timeout: ${method} (${timeout}ms)`));
      }, timeout);

      this.pendingRPCs.set(id, { resolve, reject, timer });

      ws.send(
        JSON.stringify({
          type: "rpc.request",
          id,
          method,
          params,
        }),
      );
    });
  }

  handleRpcResponse(
    _userId: string,
    msg: { type: "rpc.response"; id: string; result?: unknown; error?: string },
  ): void {
    const pending = this.pendingRPCs.get(msg.id);
    if (!pending) return;

    this.pendingRPCs.delete(msg.id);
    clearTimeout(pending.timer);

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.result);
    }
  }

  dispose(): void {
    for (const pending of this.pendingRPCs.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("ConnectionManager disposed"));
    }
    this.pendingRPCs.clear();
    this.connections.clear();
  }
}
