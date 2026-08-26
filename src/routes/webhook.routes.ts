import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/webhook.controller';

const router = Router();

// فيسبوك يرسل طلب GET للتحقق من المسار عند إعداد الويب هوك لأول مرة
router.get('/', verifyWebhook);

// فيسبوك يرسل طلب POST عند استلام أي رسالة جديدة أو حدوث تغيير
router.post('/', handleWebhook);

export default router;
