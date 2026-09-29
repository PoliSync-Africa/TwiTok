import { WebSocketServer, type WebSocket } from "ws";
import { getDb } from "../db/mongo.js";
import { verifyUserToken } from "../auth/user.js";

type Client = { socket: WebSocket; userId: string };
const clients = new Map<string, Set<WebSocket>>();
const authAttempts = new WeakMap<WebSocket, number>();
const messageWindows = new WeakMap<WebSocket, { startedAt: number; count: number }>();

function allowedOrigins() {
  return (process.env.ALLOWED_WEB_ORIGINS ?? process.env.ADMIN_WEB_ORIGIN ?? "").split(",").map(x => x.trim()).filter(Boolean);
}
function originAllowed(origin?: string) {
  const allowed = allowedOrigins();
  if (!origin) return true; // native mobile clients may omit Origin
  return allowed.length > 0 && allowed.includes(origin);
}

function addClient(userId: string, socket: WebSocket) {
  const set = clients.get(userId) ?? new Set<WebSocket>();
  if (set.size >= 3) {
    const oldest = set.values().next().value as WebSocket | undefined;
    oldest?.close(1008, "Connection limit reached");
    if (oldest) set.delete(oldest);
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
  wss.on("connection", async (socket, request) => {
    if (!originAllowed(request.headers.origin)) { socket.close(1008, "Origin not allowed"); return; }
    let client: Client | null = null, authenticated = false;
    const timeout = setTimeout(() => { if (!authenticated) socket.close(1008, "Authentication timeout"); }, 10000);
    const heartbeat = setInterval(() => { if (socket.readyState === socket.OPEN) socket.ping(); }, 30000);
    socket.on("message", async raw => {
      const now = Date.now();
      const window = messageWindows.get(socket);
      if (!window || now - window.startedAt >= 10000) messageWindows.set(socket, { startedAt: now, count: 1 });
      else if (++window.count > 30) return socket.close(1008, "Message rate limit exceeded");
      let rawText: string;
      if (typeof raw === "string") rawText = raw;
      else if (Buffer.isBuffer(raw)) rawText = raw.toString("utf8");
      else if (raw instanceof ArrayBuffer) rawText = Buffer.from(new Uint8Array(raw)).toString("utf8");
      else if (Array.isArray(raw)) rawText = Buffer.concat(raw).toString("utf8");
      else rawText = Buffer.from(new Uint8Array(raw)).toString("utf8");
      if (Buffer.byteLength(rawText, "utf8") > 64 * 1024) return socket.close(1009, "Message too large");
      try {
        const message = JSON.parse(rawText);
        if (message?.type !== "auth" || typeof message.token !== "string") return socket.close(1008, "Authentication required");
        const attempts = (authAttempts.get(socket) ?? 0) + 1; authAttempts.set(socket, attempts);
        if (attempts > 3) return socket.close(1008, "Too many authentication attempts");
        const token = verifyUserToken(message.token);
        const db = await getDb();
        const user = await db.collection("users").findOne({ _id: new (await import("mongodb")).ObjectId(token.sub), status: "ACTIVE" }, { projection: { _id: 1, sessionVersion: 1 } });
        if (!user) return socket.close(1008, "Account unavailable");
        if (Number(user.sessionVersion ?? 0) !== Number(token.sv ?? 0)) return socket.close(1008, "Session revoked");
        if (client) removeClient(client.userId, socket);
        client = { socket, userId: token.sub }; authenticated = true; clearTimeout(timeout);
        addClient(client.userId, socket); socket.send(JSON.stringify({ type: "ready" }));
      } catch { socket.close(1008, "Unauthorized"); }
    });
    socket.on("close", () => { clearTimeout(timeout); clearInterval(heartbeat); if (client) removeClient(client.userId, socket); });
  });
  return wss;
}