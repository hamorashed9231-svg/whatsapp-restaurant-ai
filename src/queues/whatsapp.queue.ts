import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../services/redis.service';

export interface WhatsAppMessageJob {
  whatsappNumberId: string;
  customerPhone: string;
  messageText: string;
  messageType?: string;
  timestamp: string;
}

export const WHATSAPP_QUEUE_NAME = 'whatsapp-incoming-messages';

export const whatsappQueue = new Queue<WhatsAppMessageJob, any, string>(WHATSAPP_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

console.log(`[BullMQ Queue] تم إنشاء طابور الرسائل "${WHATSAPP_QUEUE_NAME}" بنجاح.`);
