import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'maximum-ferret-271365.upstash.io';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || 'gQAAAAAABCQFAAIgcDI3NmE2NGM1MWE3OTY0NTVlYjdjY2ZlZjcwZGMyN2MwYQ';
const isTls = process.env.REDIS_TLS === 'true' || redisHost.includes('upstash.io');

export const redisConnectionOptions: any = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  ...(isTls ? { tls: {} } : {}),
};

export const redisClient = new Redis(redisConnectionOptions);

redisClient.on('connect', () => {
  console.log(`[Redis] تم الاتصال بنجاح بخادم Redis على ${redisHost}:${redisPort}`);
});

redisClient.on('error', (err) => {
  console.error('[Redis] خطأ في الاتصال بخادم Redis:', err.message);
});
