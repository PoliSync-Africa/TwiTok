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

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    const value = await redis.get(key);
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
    if (redis.status === "wait") await redis.connect();
    await redis.set(key, JSON.stringify(value), "EX", Math.max(5, Math.min(ttlSeconds, 300)));
    return true;
  } catch {
    disabled = true;
    return false;
  }
}
