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
  deleteConversation,
  bulkArchiveConversations,
  bulkDeleteConversations,
  blockConversation,
  unblockConversation,
  sendManualMessage,
  sendTemplateMessageEndpoint,
  handleDemoChat,
  importMenu,
  updateRestaurant,
  createUser,
  listUsers,
  deleteUser,
  handleAdminConfigChat,
  getAiInstructions,
  updateAiInstructions,
  updateRestaurantSettings,
  syncCatalogEndpoint,
  sendCatalogMessageEndpoint,
  editConversationMessage,
  deleteConversationMessage,
  reactToMessageEndpoint,
  getCategories,
  updateCategories,
  getQuickReplies,
  updateQuickReplies,
  getMediaProxy,
  handlePusherAuth,
  getBranchesEndpoint,
  createBranchEndpoint,
  updateBranchEndpoint,
  deleteBranchEndpoint,
  getBranchPricesEndpoint,
  setBranchPriceEndpoint,
  getCustomersEndpoint,
  getCustomerTimelineEndpoint,
  getCustomerStatsEndpoint,
  getActiveBroadcastCustomers,
  sendBroadcastCampaign,
  getBroadcastLogs
} from '../controllers/api.controller';
import { upload } from '../middlewares/upload.middleware';
import { purgeClosedConversations } from '../controllers/purge.controller';

const router = Router();

// ================= مسارات غير محمية (Public Routes) =================

// كرون حذف البيانات المجدول للمحادثات المغلقة
router.get('/cron/purge-closed-conversations', purgeClosedConversations);

// تسجيل دخول لوحة التحكم
router.post('/auth/login', login);

// محاكاة الشات التجريبية لصفحة الهبوط (محدودة بـ 5 رسائل)
router.post('/demo/chat', handleDemoChat);

// بروكسي الوسائط المباشرة (الصور والتسجيلات الصوتية)
router.get('/media/:mediaId', getMediaProxy);
router.get('/conversations/media/:mediaId', getMediaProxy);


// ================= مسارات محمية بـ JWT (Protected Routes) =================

// مصادقة قنوات Pusher الخاصة (Private Channels)
router.post('/pusher/auth', authMiddleware, handlePusherAuth);

// بيانات وإعدادات المطعم ومعرّف الكتالوج
router.get('/restaurants/:id', authMiddleware, getRestaurant);
router.put('/restaurants/:id', authMiddleware, updateRestaurantSettings);
router.put('/restaurants/:id/settings', authMiddleware, updateRestaurantSettings);

// إدارة الفروع وأسعار الفروع
router.get('/restaurants/:id/branches', authMiddleware, getBranchesEndpoint);
router.post('/restaurants/:id/branches', authMiddleware, createBranchEndpoint);
router.put('/branches/:branchId', authMiddleware, updateBranchEndpoint);
router.delete('/branches/:branchId', authMiddleware, deleteBranchEndpoint);
router.get('/restaurants/:id/branch-prices', authMiddleware, getBranchPricesEndpoint);
router.post('/menu/:itemId/branch-prices', authMiddleware, setBranchPriceEndpoint);

// سجل العملاء وبرنامج الولاء والإحصائيات اليومية
router.get('/restaurants/:id/customers', authMiddleware, getCustomersEndpoint);
router.get('/restaurants/:id/customers/:customerId', authMiddleware, getCustomerTimelineEndpoint);
router.get('/restaurants/:id/customer-stats', authMiddleware, getCustomerStatsEndpoint);

// الحملات الجماعية (خاص بـ houda والمستخدمين المعتمدين)
router.get('/broadcast/active-customers', authMiddleware, getActiveBroadcastCustomers);
router.post('/broadcast/send', authMiddleware, sendBroadcastCampaign);
router.get('/broadcast/logs', authMiddleware, getBroadcastLogs);

// قائمة الطعام (المنيو) والتصنيفات ومزامنة الكتالوج
router.get('/restaurants/:id/menu', authMiddleware, getMenu);
router.post('/restaurants/:id/menu', authMiddleware, addMenuItem);
router.put('/menu/:itemId', authMiddleware, updateMenuItem);
router.delete('/menu/:itemId', authMiddleware, deleteMenuItem);
router.get('/restaurants/:id/categories', authMiddleware, getCategories);
router.post('/restaurants/:id/categories', authMiddleware, updateCategories);
router.get('/restaurants/:id/quick-replies', authMiddleware, getQuickReplies);
router.post('/restaurants/:id/quick-replies', authMiddleware, updateQuickReplies);
router.post('/restaurants/:id/menu/import', authMiddleware, upload.single('file'), importMenu);
router.post('/restaurants/:id/catalog/sync', authMiddleware, syncCatalogEndpoint);

// الطلبات
router.get('/restaurants/:id/orders', authMiddleware, getOrders);
router.put('/orders/:orderId/status', authMiddleware, updateOrderStatus);

// الحجوزات
router.get('/restaurants/:id/reservations', authMiddleware, getReservations);
router.put('/reservations/:reservationId/status', authMiddleware, updateReservationStatus);

// المحادثات الحقيقية والرسائل وإرسال الكتالوج
router.get('/restaurants/:id/conversations', authMiddleware, getConversations);
router.get('/conversations/:id/messages', authMiddleware, getConversationMessages);
router.put('/conversations/:id/category', authMiddleware, updateConversationCategory);
router.put('/conversations/:id/status', authMiddleware, updateConversationStatus);
router.put('/conversations/:id/archive', authMiddleware, archiveConversation);
router.delete('/conversations/:id', authMiddleware, deleteConversation);
router.post('/conversations/bulk-archive', authMiddleware, bulkArchiveConversations);
router.post('/conversations/bulk-delete', authMiddleware, bulkDeleteConversations);
router.post('/conversations/:id/block', authMiddleware, blockConversation);
router.post('/conversations/:id/unblock', authMiddleware, unblockConversation);
router.post('/conversations/:id/messages', authMiddleware, sendManualMessage);
router.put('/conversations/:id/messages/:msgIndex', authMiddleware, editConversationMessage);
router.delete('/conversations/:id/messages/:msgIndex', authMiddleware, deleteConversationMessage);
router.post('/conversations/:id/messages/:msgIndex/reaction', authMiddleware, reactToMessageEndpoint);
router.post('/conversations/:id/send-manual', authMiddleware, sendManualMessage);
router.post('/conversations/:id/send-template', authMiddleware, sendTemplateMessageEndpoint);
router.post('/conversations/:id/send-catalog', authMiddleware, sendCatalogMessageEndpoint);

// إدارة المستخدمين (للمسؤول فقط)
router.post('/users', authMiddleware, createUser);
router.get('/users', authMiddleware, listUsers);
router.delete('/users/:id', authMiddleware, deleteUser);

// شات الضبط الذكي والتعليمات الإدارية المخصصة (للمسؤول فقط)
router.post('/restaurants/:id/ai-config-chat', authMiddleware, handleAdminConfigChat);
router.get('/restaurants/:id/ai-instructions', authMiddleware, getAiInstructions);
router.put('/restaurants/:id/ai-instructions', authMiddleware, updateAiInstructions);

export default router;
