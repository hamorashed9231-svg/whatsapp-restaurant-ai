import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/services/prisma.service';
import jwt from 'jsonwebtoken';

describe('WhatsApp Session Window & Template Fallback API Integration Tests', () => {
  let authToken: string;
  let testRestaurantId: string;
  let activeConvId: string;
  let expiredConvId: string;

  const mockStaffUser = {
    id: 'staff-user-test-uuid',
    username: 'teststaff',
    role: 'staff',
  };

  beforeAll(async () => {
    // 1. إعداد مطعم تجريبي
    const restaurant = await prisma.restaurant.create({
      data: {
        name: 'مطعم الاختبارات الآلية',
        phone_number: '+201000000000',
        whatsapp_number_id: `wa_test_${Date.now()}`,
        subscription_tier: 'PREMIUM',
        subscription_status: 'ACTIVE',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    testRestaurantId = restaurant.id;

    // 2. توليد JWT صالح للاختبار
    authToken = jwt.sign(
      {
        id: mockStaffUser.id,
        username: mockStaffUser.username,
        role: mockStaffUser.role,
        restaurantId: testRestaurantId,
      },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '1h' }
    );

    // 3. محادثة نشطة (النافذة مفتوحة: آخر رسالة للعميل منذ ساعتين)
    const activeConversation = await prisma.conversation.create({
      data: {
        restaurant_id: testRestaurantId,
        customer_phone: '+201011111111',
        status: 'IN_PROGRESS',
        assigned_to: mockStaffUser.username,
        messages_json: [
          {
            role: 'user',
            content: 'مساء الخير عايز أطلب',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    });
    activeConvId = activeConversation.id;

    // 4. محادثة منتهية الصلاحية (النافذة مغلقة: آخر رسالة للعميل منذ 26 ساعة)
    const expiredConversation = await prisma.conversation.create({
      data: {
        restaurant_id: testRestaurantId,
        customer_phone: '+201022222222',
        status: 'IN_PROGRESS',
        assigned_to: mockStaffUser.username,
        messages_json: [
          {
            role: 'user',
            content: 'هل التوصيل شغال؟',
            timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    });
    expiredConvId = expiredConversation.id;
  });

  afterAll(async () => {
    // تنظيف بيانات الاختبار
    try {
      await prisma.conversation.deleteMany({ where: { restaurant_id: testRestaurantId } });
      await prisma.restaurant.delete({ where: { id: testRestaurantId } });
    } catch (e) {}
    await prisma.$disconnect();
  });

  // ==========================================
  // 1. اختبارات مسار الإرسال اليدوي /send-manual
  // ==========================================
  describe('POST /api/conversations/:id/send-manual', () => {
    it('يجب السماح بالإرسال بنجاح (HTTP 200) عندما تكون نافذة الـ 24 ساعة نشطة', async () => {
      const response = await request(app)
        .post(`/api/conversations/${activeConvId}/send-manual`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'أهلاً بك، تم استلام طلبك وبدأنا في تحضيره.' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
    });

    it('يجب قبول مفتاح "content" كبديل لـ "text" عند إرسال رسالة عادية', async () => {
      const response = await request(app)
        .post(`/api/conversations/${activeConvId}/send-manual`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'رسالة تجريبية بمفتاح content' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('يجب رفض الإرسال المباشر (HTTP 400) عند انقضاء نافذة الـ 24 ساعة مع إرجاع الخطأ المعتمد', async () => {
      const response = await request(app)
        .post(`/api/conversations/${expiredConvId}/send-manual`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'محاولة إرسال متأخرة بعد انتهاء النافذة' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        error: 'SESSION_WINDOW_EXPIRED',
        isWindowOpen: false,
      });
      expect(response.body.message).toContain('انتهت مهلة الـ 24 ساعة');
      expect(response.body).toHaveProperty('windowExpiresAt');
    });
  });

  // ==========================================
  // 2. اختبارات مسار إرسال القوالب /send-template
  // ==========================================
  describe('POST /api/conversations/:id/send-template', () => {
    it('يجب إرسال قالب Meta الرسمي بنجاح وتجديد نافذة الجلسة حتى لو كانت مغلقة (HTTP 200)', async () => {
      const response = await request(app)
        .post(`/api/conversations/${expiredConvId}/send-template`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          templateName: 'order_update',
          languageCode: 'ar',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('isWindowOpen', true);
      expect(response.body.content).toContain('order_update');
    });

    it('يجب قبول مفتاح "language" بدلاً من "languageCode" مع القوالب', async () => {
      const response = await request(app)
        .post(`/api/conversations/${expiredConvId}/send-template`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          templateName: 'issue_followup',
          language: 'ar',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('يجب رفض الطلب (HTTP 400) إذا لم يتم توفير اسم القالب (templateName)', async () => {
      const response = await request(app)
        .post(`/api/conversations/${expiredConvId}/send-template`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'ar' });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // 3. اختبارات الأمان والمصادقة (Auth & Security)
  // ==========================================
  describe('حماية المسارات والمصادقة', () => {
    it('يجب رفض الوصول (HTTP 401) في حال عدم إرسال Authorization Token', async () => {
      const response = await request(app)
        .post(`/api/conversations/${activeConvId}/send-manual`)
        .send({ text: 'رسالة بدون توكن' });

      expect(response.status).toBe(401);
    });
  });
});
