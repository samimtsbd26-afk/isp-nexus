import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

let redisInstance: Redis | null = null;
let bullRedisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    redisInstance.on("error", (err) => logger.error({ err }, "Redis error"));
    redisInstance.on("connect", () => logger.info("Redis connected"));
  }
  return redisInstance;
}

// BullMQ requires maxRetriesPerRequest: null
export function getBullRedis(): Redis {
  if (!bullRedisInstance) {
    bullRedisInstance = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    bullRedisInstance.on("error", (err) => logger.error({ err }, "BullMQ Redis error"));
  }
  return bullRedisInstance;
}
