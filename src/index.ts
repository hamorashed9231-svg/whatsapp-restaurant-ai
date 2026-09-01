import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// تهيئة متغيرات البيئة من ملف .env
dotenv.config();

// تهيئة خادم Redis وطابور المعالجة بالخلفية
import './services/redis.service';
import './workers/whatsapp.worker';

import healthRoutes from './routes/health.routes';
import webhookRoutes from './routes/webhook.routes';
import apiRoutes from './routes/api.routes';

const app = express();
const port = process.env.PORT || 3000;

// إعداد الـ CORS للسماح بجميع الطلبات
app.use(cors({ origin: '*', credentials: false }));

app.use(express.json());

// تقديم ملفات الواجهة الأمامية لـ لوحة تحكم الكول سنتر (React Dashboard)
const frontendDistPath = path.join(process.cwd(), 'frontend/dist');
app.use(express.static(frontendDistPath));

// مسارات الفحص والتشغيل الرئيسية
app.use('/health', healthRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// معلومات حالة الـ API
app.get('/api-info', (req, res) => {
  res.status(200).json({
    status: 'running',
    name: 'WhatsApp Restaurant AI Backend',
    version: '1.1.0',
    queue: 'BullMQ + Redis Active',
    endpoints: {
      health: '/health',
      webhook: '/webhook',
      api: '/api'
    }
  });
});

// توجيه جميع مسارات المتصفح إلى لوحة التحكم التفاعلية
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).json({
        status: 'running',
        name: 'WhatsApp Restaurant AI Backend',
        version: '1.1.0',
        queue: 'BullMQ + Redis Active'
      });
    }
  });
});

// بدء تشغيل خادم الويب
app.listen(port, () => {
  console.log(`===========================================================`);
  console.log(`🚀 خادم AI Agent للمطاعم على واتساب يعمل بنجاح (مع دعم Redis + BullMQ).`);
  console.log(`📡 المنفذ: ${port}`);
  console.log(`🔗 رابط فحص الحالة (Health Check): http://localhost:${port}/health`);
  console.log(`🔗 رابط الويب هوك (Webhook Endpoint): http://localhost:${port}/webhook`);
  console.log(`===========================================================`);
});
