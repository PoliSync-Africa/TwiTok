import { WebSocketServer, type WebSocket } from "ws";
import { verifyUserToken } from "../auth/user.js";

type Client = { socket: WebSocket; userId: string };

const clients = new Map<string, Set<WebSocket>>();

function addClient(userId: string, socket: WebSocket) {
  const set = clients.get(userId) ?? new Set<WebSocket>();
  set.add(socket);
  clients.set(userId, set);
}

function removeClient(userId: string, socket: WebSocket) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(socket);
  if (!set.size) clients.delete(userId);
}

export function broadcastToUser(userId: string, payload: unknown) {
  const encoded = JSON.stringify(payload);
  for (const socket of clients.get(userId) ?? []) {
    if (socket.readyState === socket.OPEN) socket.send(encoded);
  }
}

export function attachRealtime(server: import("node:http").Server) {
  const wss = new WebSocketServer({ server, path: "/realtime" });

  wss.on("connection", socket => {
    let client: Client | null = null;

    socket.on("message", raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message?.type !== "auth" || typeof message.token !== "string") {
          socket.send(JSON.stringify({ type: "error", error: "Authentication required" }));
          return;
        }
        const token = verifyUserToken(message.token);
        if (client) removeClient(client.userId, socket);
        client = { socket, userId: token.sub };
        addClient(client.userId, socket);
        socket.send(JSON.stringify({ type: "ready" }));
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "Invalid realtime authentication" }));
        socket.close(1008, "Unauthorized");
      }
    });

    socket.on("close", () => {
      if (client) removeClient(client.userId, socket);
    });
  });

  return wss;
}
