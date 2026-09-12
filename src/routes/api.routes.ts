import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middlewares/auth.middleware';
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
  updateUserPermissions,
  updateUserColor,
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

// ================= مسارات عامة (Public Routes) =================

// كرون حذف البيانات المجدول للمحادثات المغلقة
router.get('/cron/purge-closed-conversations', purgeClosedConversations);

router.post('/auth/login', login);
router.post('/demo/chat', handleDemoChat);
router.get('/media/:mediaId', getMediaProxy);
router.get('/conversations/media/:mediaId', getMediaProxy);

// ================= مسارات محمية بـ JWT و Permission Guards =================

// مصادقة قنوات Pusher الخاصة (Private Channels)
router.post('/pusher/auth', authMiddleware, handlePusherAuth);

// بيانات وإعدادات المطعم ومعرّف الكتالوج
router.get('/restaurants/:id', authMiddleware, getRestaurant);
router.put('/restaurants/:id', authMiddleware, requirePermission('settings'), updateRestaurantSettings);
router.put('/restaurants/:id/settings', authMiddleware, requirePermission('settings'), updateRestaurantSettings);

// إدارة الفروع وأسعار الفروع
router.get('/restaurants/:id/branches', authMiddleware, getBranchesEndpoint);
router.post('/restaurants/:id/branches', authMiddleware, requirePermission('branches'), createBranchEndpoint);
router.put('/branches/:branchId', authMiddleware, requirePermission('branches'), updateBranchEndpoint);
router.delete('/branches/:branchId', authMiddleware, requirePermission('branches'), deleteBranchEndpoint);
router.get('/restaurants/:id/branch-prices', authMiddleware, getBranchPricesEndpoint);
router.post('/menu/:itemId/branch-prices', authMiddleware, requirePermission('branches'), setBranchPriceEndpoint);

// سجل العملاء وبرنامج الولاء والإحصائيات اليومية
router.get('/restaurants/:id/customers', authMiddleware, requirePermission('customers'), getCustomersEndpoint);
router.get('/restaurants/:id/customers/:customerId', authMiddleware, requirePermission('customers'), getCustomerTimelineEndpoint);
router.get('/restaurants/:id/customer-stats', authMiddleware, getCustomerStatsEndpoint);

// الحملات الجماعية
router.get('/broadcast/active-customers', authMiddleware, requirePermission('broadcast'), getActiveBroadcastCustomers);
router.post('/broadcast/send', authMiddleware, requirePermission('broadcast'), sendBroadcastCampaign);
router.get('/broadcast/logs', authMiddleware, requirePermission('broadcast'), getBroadcastLogs);

// قائمة الطعام (المنيو) والتصنيفات ومزامنة الكتالوج
router.get('/restaurants/:id/menu', authMiddleware, getMenu);
router.post('/restaurants/:id/menu', authMiddleware, requirePermission('menu'), addMenuItem);
router.put('/menu/:itemId', authMiddleware, requirePermission('menu'), updateMenuItem);
router.delete('/menu/:itemId', authMiddleware, requirePermission('menu'), deleteMenuItem);
router.get('/restaurants/:id/categories', authMiddleware, getCategories);
router.post('/restaurants/:id/categories', authMiddleware, requirePermission('menu'), updateCategories);
router.get('/restaurants/:id/quick-replies', authMiddleware, getQuickReplies);
router.post('/restaurants/:id/quick-replies', authMiddleware, requirePermission('menu'), updateQuickReplies);
router.post('/restaurants/:id/menu/import', authMiddleware, requirePermission('menu'), upload.single('file'), importMenu);
router.post('/restaurants/:id/catalog/sync', authMiddleware, requirePermission('menu'), syncCatalogEndpoint);

// الطلبات
router.get('/restaurants/:id/orders', authMiddleware, requirePermission('orders'), getOrders);
router.put('/orders/:orderId/status', authMiddleware, requirePermission('orders'), updateOrderStatus);

// الحجوزات
router.get('/restaurants/:id/reservations', authMiddleware, requirePermission('reservations'), getReservations);
router.put('/reservations/:reservationId/status', authMiddleware, requirePermission('reservations'), updateReservationStatus);

// المحادثات الحقيقية والرسائل وإرسال الكتالوج
router.get('/restaurants/:id/conversations', authMiddleware, requirePermission('conversations'), getConversations);
router.get('/conversations/:id/messages', authMiddleware, requirePermission('conversations'), getConversationMessages);
router.put('/conversations/:id/category', authMiddleware, requirePermission('conversations'), updateConversationCategory);
router.put('/conversations/:id/status', authMiddleware, requirePermission('conversations'), updateConversationStatus);
router.put('/conversations/:id/archive', authMiddleware, requirePermission('conversations'), archiveConversation);
router.delete('/conversations/:id', authMiddleware, requirePermission('conversations'), deleteConversation);
router.post('/conversations/bulk-archive', authMiddleware, requirePermission('conversations'), bulkArchiveConversations);
router.post('/conversations/bulk-delete', authMiddleware, requirePermission('conversations'), bulkDeleteConversations);
router.post('/conversations/:id/block', authMiddleware, requirePermission('conversations'), blockConversation);
router.post('/conversations/:id/unblock', authMiddleware, requirePermission('conversations'), unblockConversation);
router.post('/conversations/:id/messages', authMiddleware, requirePermission('conversations'), sendManualMessage);
router.put('/conversations/:id/messages/:msgIndex', authMiddleware, requirePermission('conversations'), editConversationMessage);
router.delete('/conversations/:id/messages/:msgIndex', authMiddleware, requirePermission('conversations'), deleteConversationMessage);
router.post('/conversations/:id/messages/:msgIndex/reaction', authMiddleware, requirePermission('conversations'), reactToMessageEndpoint);
router.post('/conversations/:id/send-manual', authMiddleware, requirePermission('conversations'), sendManualMessage);
router.post('/conversations/:id/send-template', authMiddleware, requirePermission('conversations'), sendTemplateMessageEndpoint);
router.post('/conversations/:id/send-catalog', authMiddleware, requirePermission('conversations'), sendCatalogMessageEndpoint);

// إدارة المستخدمين (للمسؤول فقط)
router.post('/users', authMiddleware, requirePermission('users'), createUser);
router.get('/users', authMiddleware, requirePermission('users'), listUsers);
router.delete('/users/:id', authMiddleware, requirePermission('users'), deleteUser);
router.put('/users/:userId/permissions', authMiddleware, requirePermission('users'), updateUserPermissions);
router.put('/users/:userId/color', authMiddleware, requirePermission('users'), updateUserColor);

// شات الضبط الذكي والتعليمات الإدارية المخصصة (للمسؤول فقط)
router.post('/restaurants/:id/ai-config-chat', authMiddleware, requirePermission('ai-assistant'), handleAdminConfigChat);
router.get('/restaurants/:id/ai-instructions', authMiddleware, requirePermission('ai-assistant'), getAiInstructions);
router.put('/restaurants/:id/ai-instructions', authMiddleware, requirePermission('ai-assistant'), updateAiInstructions);

export default router;
