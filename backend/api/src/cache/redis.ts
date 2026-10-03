import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<void> | null = null;

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

export function redisConfigured() {
  return Boolean(getRedisUrl());
}

async function getClient() {
  const url = getRedisUrl();
  if (!url) return null;
  if (!client) {
    client = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: retries => Math.min(retries * 250, 3000)
      }
    });
    client.on("error", error => console.error("Redis cache error", error.message));
  }
  if (!client.isOpen) {
    if (!connecting) {
      connecting = client.connect().finally(() => { connecting = null; });
    }
    await connecting;
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getClient();
    if (!redis) return null;
    const value = await redis.get(key);
    return value ? JSON.parse(value) as T : null;
  } catch (error) {
    console.warn("Redis cache read skipped:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 10) {
  try {
    const redis = await getClient();
    if (!redis) return false;
    await redis.setEx(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn("Redis cache write skipped:", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}

export async function cacheDelete(key: string) {
  try {
    const redis = await getClient();
    if (!redis) return false;
    await redis.del(key);
    return true;
  } catch (error) {
    console.warn("Redis cache delete skipped:", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}
