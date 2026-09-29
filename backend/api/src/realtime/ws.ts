import { WebSocketServer, type WebSocket } from "ws";
import { verifyUserToken } from "../auth/user.js";

type Client = { socket: WebSocket; userId: string };
const clients = new Map<string, Set<WebSocket>>();
const authAttempts = new WeakMap<WebSocket, number>();

function addClient(userId: string, socket: WebSocket) {
  const set = clients.get(userId) ?? new Set<WebSocket>();
  if (set.size >= 3) {
    const oldest = set.values().next().value as WebSocket | undefined;
    oldest?.close(1008, "Connection limit reached");
    set.delete(oldest as WebSocket);
  }
  set.add(socket); clients.set(userId, set);
}
function removeClient(userId: string, socket: WebSocket) {
  const set = clients.get(userId); if (!set) return;
  set.delete(socket); if (!set.size) clients.delete(userId);
}
export function broadcastToUser(userId: string, payload: unknown) {
  const encoded = JSON.stringify(payload);
  if (encoded.length > 64 * 1024) return;
  for (const socket of clients.get(userId) ?? []) if (socket.readyState === socket.OPEN) socket.send(encoded);
}
export function attachRealtime(server: import("node:http").Server) {
  const wss = new WebSocketServer({ server, path: "/realtime", maxPayload: 64 * 1024, perMessageDeflate: false });
  wss.on("connection", socket => {
    let client: Client | null = null, authenticated = false;
    const timeout = setTimeout(() => { if (!authenticated) socket.close(1008, "Authentication timeout"); }, 10000);
    const heartbeat = setInterval(() => { if (socket.readyState === socket.OPEN) socket.ping(); }, 30000);
    socket.on("message", raw => {
      if (raw.length > 64 * 1024) return socket.close(1009, "Message too large");
      try {
        const message = JSON.parse(raw.toString());
        if (message?.type !== "auth" || typeof message.token !== "string") return socket.close(1008, "Authentication required");
        const attempts = (authAttempts.get(socket) ?? 0) + 1; authAttempts.set(socket, attempts);
        if (attempts > 3) return socket.close(1008, "Too many authentication attempts");
        const token = verifyUserToken(message.token);
        if (client) removeClient(client.userId, socket);
        client = { socket, userId: token.sub }; authenticated = true; clearTimeout(timeout);
        addClient(client.userId, socket); socket.send(JSON.stringify({ type: "ready" }));
      } catch { socket.close(1008, "Unauthorized"); }
    });
    socket.on("close", () => { clearTimeout(timeout); clearInterval(heartbeat); if (client) removeClient(client.userId, socket); });
  });
  return wss;
}