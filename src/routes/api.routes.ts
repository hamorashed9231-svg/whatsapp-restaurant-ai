import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  login,
  getRestaurant,
  getMenu,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getOrders,
  updateOrderStatus,
  getReservations,
  updateReservationStatus,
  getConversations,
  getConversationMessages,
  updateConversationCategory,
  updateConversationStatus,
  archiveConversation,
  sendManualMessage,
  handleDemoChat,
  importMenu,
  updateRestaurant,
  createUser,
  listUsers,
  deleteUser,
  handleAdminConfigChat,
  getAiInstructions,
  updateAiInstructions
} from '../controllers/api.controller';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

// ================= مسارات غير محمية (Public Routes) =================

// تسجيل دخول لوحة التحكم
router.post('/auth/login', login);

// محاكاة الشات التجريبية لصفحة الهبوط (محدودة بـ 5 رسائل)
router.post('/demo/chat', handleDemoChat);


// ================= مسارات محمية بـ JWT (Protected Routes) =================

// بيانات المطعم
router.get('/restaurants/:id', authMiddleware, getRestaurant);
router.put('/restaurants/:id', authMiddleware, updateRestaurant);

// قائمة الطعام (المنيو)
router.get('/restaurants/:id/menu', authMiddleware, getMenu);
router.post('/restaurants/:id/menu', authMiddleware, addMenuItem);
router.put('/menu/:itemId', authMiddleware, updateMenuItem);
router.delete('/menu/:itemId', authMiddleware, deleteMenuItem);
router.post('/restaurants/:id/menu/import', authMiddleware, upload.single('file'), importMenu);

// الطلبات
router.get('/restaurants/:id/orders', authMiddleware, getOrders);
router.put('/orders/:orderId/status', authMiddleware, updateOrderStatus);

// الحجوزات
router.get('/restaurants/:id/reservations', authMiddleware, getReservations);
router.put('/reservations/:reservationId/status', authMiddleware, updateReservationStatus);

// المحادثات الحقيقية والرسائل
router.get('/restaurants/:id/conversations', authMiddleware, getConversations);
router.get('/conversations/:id/messages', authMiddleware, getConversationMessages);
router.put('/conversations/:id/category', authMiddleware, updateConversationCategory);
router.put('/conversations/:id/status', authMiddleware, updateConversationStatus);
router.put('/conversations/:id/archive', authMiddleware, archiveConversation);
router.post('/conversations/:id/messages', authMiddleware, sendManualMessage);

// إدارة المستخدمين (للمسؤول فقط)
router.post('/users', authMiddleware, createUser);
router.get('/users', authMiddleware, listUsers);
router.delete('/users/:id', authMiddleware, deleteUser);

// شات الضبط الذكي والتعليمات الإدارية المخصصة (للمسؤول فقط)
router.post('/restaurants/:id/ai-config-chat', authMiddleware, handleAdminConfigChat);
router.get('/restaurants/:id/ai-instructions', authMiddleware, getAiInstructions);
router.put('/restaurants/:id/ai-instructions', authMiddleware, updateAiInstructions);

export default router;
