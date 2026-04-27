import IORedis from "ioredis";

// Use a placeholder URL at build time — lazyConnect:true means no actual
// TCP connection is made until the first command is sent at runtime.
const FALLBACK_URL = "redis://localhost:6379";

export function makeConnection(): IORedis {
  const url = process.env.UPSTASH_REDIS_URL ?? FALLBACK_URL;
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}
