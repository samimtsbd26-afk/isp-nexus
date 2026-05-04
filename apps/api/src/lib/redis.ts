import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    redisInstance.on("error", (err) => logger.error({ err }, "Redis error"));
    redisInstance.on("connect", () => logger.info("Redis connected"));
  }
  return redisInstance;
}
