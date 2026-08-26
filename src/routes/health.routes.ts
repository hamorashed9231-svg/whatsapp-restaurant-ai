import { Router } from 'express';
import { checkHealth } from '../controllers/health.controller';

const router = Router();

// مسار فحص الحالة
router.get('/', checkHealth);

export default router;
