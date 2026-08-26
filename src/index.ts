import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// تهيئة متغيرات البيئة من ملف .env
dotenv.config();

import healthRoutes from './routes/health.routes';
import webhookRoutes from './routes/webhook.routes';
import apiRoutes from './routes/api.routes';

const app = express();
const port = process.env.PORT || 3000;

// إعداد الـ CORS للسماح فقط للفرونت إند (localhost:5173) في بيئة التطوير
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use(express.json());

// مسارات الفحص والتشغيل الرئيسية
app.use('/health', healthRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// بدء تشغيل خادم الويب
app.listen(port, () => {
  console.log(`===========================================================`);
  console.log(`🚀 خادم AI Agent للمطاعم على واتساب يعمل بنجاح.`);
  console.log(`📡 المنفذ: ${port}`);
  console.log(`🔗 رابط فحص الحالة (Health Check): http://localhost:${port}/health`);
  console.log(`🔗 رابط الويب هوك (Webhook Endpoint): http://localhost:${port}/webhook`);
  console.log(`===========================================================`);
});
