import { getRedis } from "./redis";
import { callAhrefs } from "./ahrefs";

export async function cachedAhrefs(
  tool: string,
  args: Record<string, unknown>,
  ttl = 60 * 60 * 24 * 7
) {
  const key = `ahrefs:${tool}:${JSON.stringify(args)}`;
  const redis = getRedis();

  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall through to live call
    }
  }

  const result = await callAhrefs(tool, args);

  if (redis) {
    try {
      await redis.set(key, result, { ex: ttl });
    } catch {
      // Redis unavailable — result still returned
    }
  }

  return result;
}
