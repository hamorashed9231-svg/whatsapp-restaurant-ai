import dotenv from 'dotenv';
dotenv.config();

// تهيئة خادم Redis وطابور المعالجة بالخلفية
import './services/redis.service';
import './workers/whatsapp.worker';

import app from './app';

const port = process.env.PORT || 3000;

// بدء تشغيل خادم الويب
app.listen(port, () => {
  console.log(`===========================================================`);
  console.log(`🚀 خادم AI Agent للمطاعم على واتساب يعمل بنجاح (مع دعم Redis + BullMQ).`);
  console.log(`📡 المنفذ: ${port}`);
  console.log(`🔗 رابط فحص الحالة (Health Check): http://localhost:${port}/health`);
  console.log(`🔗 رابط الويب هوك (Webhook Endpoint): http://localhost:${port}/webhook`);
  console.log(`===========================================================`);
});

export default app;
