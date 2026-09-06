import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

import healthRoutes from './routes/health.routes';
import webhookRoutes from './routes/webhook.routes';
import apiRoutes from './routes/api.routes';

const app = express();

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const getFrontendDistPath = () => {
  const candidates = [
    path.join(process.cwd(), 'frontend/dist'),
    path.join(__dirname, '../frontend/dist'),
    path.join(__dirname, '../../frontend/dist'),
    path.join(__dirname, 'frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    '/var/task/frontend/dist'
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (e) {}
  }
  return path.join(process.cwd(), 'frontend/dist');
};

const frontendDistPath = getFrontendDistPath();
app.use(express.static(frontendDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.use('/health', healthRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

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

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/health')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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

export default app;
export { app };
