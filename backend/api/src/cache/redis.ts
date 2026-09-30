import Redis from "ioredis";

let client: Redis | null = null;
let disabled = false;

function getClient() {
  const url = process.env.REDIS_URL;
  if (!url || disabled) return null;
  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      retryStrategy: () => null
    });
    client.on("error", () => { disabled = true; });
  }
  return client;
}

async function getConnectedClient() {
  const redis = getClient();
  if (!redis) return null;
  if (redis.status === "wait") await redis.connect();
  return redis;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const connected = await getConnectedClient();
    if (!connected) return null;
    const value = await connected.get(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    disabled = true;
    return null;
  }
}

export async function redisSetJson(key: string, value: unknown, ttlSeconds: number) {
  const redis = getClient();
  if (!redis) return false;
  try {
    const connected = await getConnectedClient();
    if (!connected) return false;
    await connected.set(key, JSON.stringify(value), "EX", Math.max(5, Math.min(ttlSeconds, 300)));
    return true;
  } catch {
    disabled = true;
    return false;
  }
}

export async function redisIncrement(key: string, windowMs: number) {
  const redis = getClient();
  if (!redis) return { available: false, count: 0, ttlSeconds: 0 };
  try {
    const connected = await getConnectedClient();
    if (!connected) return { available: false, count: 0, ttlSeconds: 0 };
    const count = await connected.incr(key);
    if (count === 1) await connected.pexpire(key, Math.max(1000, windowMs));
    const ttlMs = await connected.pttl(key);
    return {
      available: true,
      count,
      ttlSeconds: Math.max(1, Math.ceil(Math.max(0, ttlMs) / 1000))
    };
  } catch {
    disabled = true;
    return { available: false, count: 0, ttlSeconds: 0 };
  }
}
