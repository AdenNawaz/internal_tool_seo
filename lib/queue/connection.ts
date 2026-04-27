import IORedis from "ioredis";

let _connection: IORedis | null = null;

export function getConnection(): IORedis {
  if (!_connection) {
    const url = process.env.UPSTASH_REDIS_URL;
    if (!url) throw new Error("UPSTASH_REDIS_URL is not set");
    _connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _connection;
}

export const connection = {
  get host() { return getConnection().options.host; },
  // BullMQ accepts an IORedis instance directly
} as unknown as IORedis;

// For BullMQ — export factory function so each Queue/Worker gets its own connection
export function makeConnection(): IORedis {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) throw new Error("UPSTASH_REDIS_URL is not set");
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
