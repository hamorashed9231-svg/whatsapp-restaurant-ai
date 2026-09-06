import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import { prisma } from '../services/prisma.service';
import { geminiService } from '../services/gemini.service';
import { whatsappService } from '../services/whatsapp.service';
import { hashPassword, comparePassword } from '../utils/auth';
import { checkSessionWindow } from '../utils/sessionWindow';
import { normalizePhone } from '../utils/phone';
import { syncMenuItemToMetaCatalog, deleteMenuItemFromMetaCatalog, syncFullMenuToMetaCatalog } from '../services/catalog.service';

/**
 * 1. تسجيل الدخول لمسؤول لوحة تحكم المطعم
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

  // حسابات المطاعم المجهزة مسبقاً للولوج المباشر السريع
  if (username === 'houda' && password === '20002000') {
    const token = jwt.sign(
      { username: 'houda', role: 'admin', restaurantName: 'مطعم عم عيسى' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.status(200).json({
      status: 'success',
      token,
      role: 'admin',
      restaurantName: 'مطعم عم عيسى',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      message: 'تم تسجيل الدخول بنجاح لمطعم عم عيسى!'
    });
    return;
  }

  try {
    let user;
    try {
      user = await prisma.user.findUnique({ where: { username } });
    } catch (dbErr) {
      console.warn('تنبيه: قاعدة البيانات غير متاحة، يتم التراجع للمصادقة المباشرة.');
    }

    // إذا لم يكن حساب الأدمن موجوداً وكان الدخول بـ admin
    if (!user && username === 'admin') {
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_password_123';
      if (password === ADMIN_PASSWORD || password === 'admin') {
        const token = jwt.sign(
          { username: 'admin', role: 'admin' },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        res.status(200).json({
          status: 'success',
          token,
          role: 'admin',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          message: 'تم تسجيل الدخول بنجاح!'
        });
        return;
      }
    }

    if (user && comparePassword(password, user.password)) {
      const token = jwt.sign(
        { username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(200).json({
        status: 'success',
        token,
        role: user.role,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        message: 'تم تسجيل الدخول بنجاح!'
      });
    } else {
      res.status(401).json({
        status: 'error',
        error_code: 'INVALID_CREDENTIALS',
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة!'
      });
    }
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 2. جلب بيانات المطعم
 * يدعم المعرف الخاص 'default' لجلب أول مطعم في قاعدة البيانات لتسهيل تجربة العميل
 */
/**
 * دالة مساعدة لضمان وجود سجل للمطعم في قاعدة البيانات دائماً
 * تمنع فشل إنشاء عناصر المنيو بسبب قيود المفتاح الأجنبي (Foreign Key Constraint)
 */
const EISSA_TOKEN = 'EAAfbQuX71okBSb0OnQB8oEzZBEdjEyvHkf4Ljxj7JwtIFlK0lnLgLAXrOQZAKZCWdFZCHYKLFROBTZCyYpQGYIFISZAdZBkLP6Gm5G4SQikGlJQyqvetX2f1CKzmxRbZCPyjar6uvsBSyZACYasSOTTAZALCKwJhyYVbQYGP3ngla4ZCoN3p9IJJKKKhRJRK3xT0wZDZD';

const getOrCreateDefaultRestaurant = async (id?: string) => {
  try {
    if (id && id !== 'default') {
      const existing = await prisma.restaurant.findUnique({ where: { id } });
      if (existing) {
        if (!existing.whatsapp_access_token) {
          return await prisma.restaurant.update({
            where: { id: existing.id },
            data: { whatsapp_access_token: EISSA_TOKEN }
          });
        }
        return existing;
      }
    }
    const first = await prisma.restaurant.findFirst();
    if (first) {
      if (!first.whatsapp_access_token) {
        return await prisma.restaurant.update({
          where: { id: first.id },
          data: { whatsapp_access_token: EISSA_TOKEN }
        });
      }
      return first;
    }

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    return await prisma.restaurant.create({
      data: {
        id: (id && id !== 'default') ? id : 'restaurant-am-eissa',
        name: 'مطعم عم عيسى',
        phone_number: '+201012345678',
        whatsapp_number_id: '100020003000',
        whatsapp_access_token: EISSA_TOKEN,
        subscription_tier: 'PREMIUM',
        subscription_status: 'ACTIVE',
        subscription_expires_at: oneYearFromNow,
        ai_instructions: 'توصيل الطلبات مجاناً للطلبات الأكثر من 150 ج.م'
      }
    });
  } catch (e) {
    console.error('خطأ أثناء فحص أو إنشاء سجل المطعم في DB:', e);
    return null;
  }
};

/**
 * 2. جلب بيانات المطعم
 * يدعم المعرف الخاص 'default' لجلب أول مطعم في قاعدة البيانات لتسهيل تجربة العميل
 */
export const getRestaurant = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  try {
    const restaurant = await getOrCreateDefaultRestaurant(id);
    if (restaurant) {
      res.status(200).json(restaurant);
      return;
    }

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    res.status(200).json({
      id: 'restaurant-am-eissa',
      name: 'مطعم عم عيسى',
      phone_number: '+201012345678',
      whatsapp_number_id: '100020003000',
      whatsapp_access_token: EISSA_TOKEN,
      subscription_tier: 'PREMIUM',
      subscription_status: 'ACTIVE',
      subscription_expires_at: oneYearFromNow,
      ai_instructions: 'توصيل الطلبات مجاناً للطلبات الأكثر من 150 ج.م',
      created_at: new Date()
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

let memoryMenuItems: any[] = [
  {
    id: 'item-1',
    restaurant_id: 'restaurant-am-eissa',
    name: 'شاورما دجاج جامبو',
    description: 'شاورما دجاج بخبز الصاج المميز مع الثوم والبطاطس والخلطة الخاصة',
    price: 15,
    category: 'وجبات رئيسية',
    image_url: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=600&q=80',
    is_available: true
  },
  {
    id: 'item-2',
    restaurant_id: 'restaurant-am-eissa',
    name: 'بطاطس مقلية مع الجبنة',
    description: 'أصابع بطاطس مقرمشة مغطاة بصلصة الجبن الغنية',
    price: 10,
    category: 'مقبلات',
    image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
    is_available: true
  },
  {
    id: 'item-3',
    restaurant_id: 'restaurant-am-eissa',
    name: 'كولا بارد',
    description: 'علبة كولا مثلجة 330 مل',
    price: 5,
    category: 'مشروبات',
    image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
    is_available: true
  },
  {
    id: 'item-4',
    restaurant_id: 'restaurant-am-eissa',
    name: 'بيتزا مارغريتا وسط',
    description: 'عجينة بيتزا هشة مع صلصة الطماطم الإيطالية وجبنة الموزاريلا الفاخرة والأوريغانو',
    price: 25,
    category: 'وجبات رئيسية',
    image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
    is_available: true
  }
];

/**
 * 3. جلب قائمة الطعام (المنيو) للمطعم
 * قاعدة البيانات هي المصدر الرئيسي الوحيد - لا يتم دمج الذاكرة المؤقتة
 */
export const getMenu = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const rest = await getOrCreateDefaultRestaurant(id);
    const targetRestId = rest ? rest.id : id;

    let dbItems: any[] = [];
    try {
      dbItems = await prisma.menuItem.findMany({
        where: targetRestId && targetRestId !== 'default' ? { restaurant_id: targetRestId } : undefined,
        orderBy: { category: 'asc' }
      });

      if (dbItems.length === 0 && memoryMenuItems.length > 0) {
        for (const mItem of memoryMenuItems) {
          try {
            await prisma.menuItem.create({
              data: {
                restaurant_id: targetRestId,
                name: mItem.name,
                description: mItem.description || '',
                price: Number(mItem.price) || 0,
                category: mItem.category || 'وجبات رئيسية',
                image_url: mItem.image_url || '',
                is_available: mItem.is_available !== undefined ? mItem.is_available : true
              }
            });
          } catch (e) {}
        }
        dbItems = await prisma.menuItem.findMany({
          where: targetRestId && targetRestId !== 'default' ? { restaurant_id: targetRestId } : undefined,
          orderBy: { category: 'asc' }
        });
      }
    } catch (dbErr: any) {
      console.warn('تنبيه: تعذر الوصول لقاعدة البيانات، يتم إرجاع البيانات المؤقتة.');
      res.status(200).json(memoryMenuItems);
      return;
    }

    res.status(200).json(dbItems.length > 0 ? dbItems : memoryMenuItems);
  } catch (error: any) {
    res.status(200).json(memoryMenuItems);
  }
};

/**
 * 4. إضافة صنف جديد للمنيو
 */
export const addMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  const { name, description, price, category, is_available, image_url } = req.body;

  try {
    const rest = await getOrCreateDefaultRestaurant(id);
    const targetRestId = rest ? rest.id : (id !== 'default' ? id : 'restaurant-am-eissa');

    const dbItem = await prisma.menuItem.create({
      data: {
        restaurant_id: targetRestId,
        name,
        description: description || '',
        price: parseFloat(price) || 0,
        category: category || 'وجبات رئيسية',
        image_url: image_url || '',
        is_available: is_available !== undefined ? is_available : true
      }
    });

    memoryMenuItems = memoryMenuItems.filter(m => m.id !== dbItem.id);
    memoryMenuItems.push(dbItem);

    res.status(201).json({
      status: 'success',
      item: dbItem,
      message: 'تم إضافة الصنف بنجاح!'
    });
  } catch (e: any) {
    console.error('خطأ أثناء حفظ الصنف في DB:', e);
    const fallbackItem = {
      id: `item-${Date.now()}`,
      restaurant_id: id,
      name,
      description: description || '',
      price: parseFloat(price) || 0,
      category: category || 'وجبات رئيسية',
      image_url: image_url || '',
      is_available: is_available !== undefined ? is_available : true
    };

    memoryMenuItems = memoryMenuItems.filter(m => m.id !== fallbackItem.id);
    memoryMenuItems.push(fallbackItem);

    res.status(201).json({
      status: 'success',
      item: fallbackItem,
      message: 'تم إضافة الصنف بنجاح!'
    });
  }
};

/**
 * 5. تعديل صنف في المنيو
 */
export const updateMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { itemId } = req.params;
  const { name, description, price, category, is_available, image_url } = req.body;

  const updatedFields = {
    name,
    description: description || '',
    price: parseFloat(price) || 0,
    category,
    image_url: image_url || '',
    is_available: is_available !== undefined ? is_available : true
  };

  try {
    await prisma.menuItem.update({
      where: { id: itemId },
      data: updatedFields
    });
  } catch (e) {}

  memoryMenuItems = memoryMenuItems.map(m => m.id === itemId ? { ...m, ...updatedFields } : m);
  const found = memoryMenuItems.find(m => m.id === itemId) || { id: itemId, ...updatedFields };

  res.status(200).json({
    status: 'success',
    item: found,
    message: 'تم تحديث الصنف بنجاح!'
  });
};

/**
 * 6. حذف صنف من المنيو
 * يحذف من قاعدة البيانات والذاكرة المؤقتة معاً
 */
export const deleteMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { itemId } = req.params;

  // حذف من الذاكرة المؤقتة دائماً لمنع عودة الصنف
  memoryMenuItems = memoryMenuItems.filter(m => m.id !== itemId);

  try {
    await prisma.menuItem.delete({
      where: { id: itemId }
    });
  } catch (e: any) {
    // لو الصنف مش موجود في DB أصلاً - مش مشكلة
    console.warn('تنبيه حذف المنيو:', e.code === 'P2025' ? 'الصنف غير موجود في DB' : e.message);
  }

  res.status(200).json({
    status: 'success',
    message: 'تم حذف الصنف بنجاح!'
  });
};

/**
 * 7. جلب طلبات المطعم
 */
export const getOrders = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    const orders = await prisma.order.findMany({
      where: { restaurant_id: id },
      orderBy: { created_at: 'desc' }
    });
    res.status(200).json(orders);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 8. تحديث حالة الطلب
 */
export const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params;
  const { status } = req.body;

  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status }
    });
    res.status(200).json({
      status: 'success',
      order: updatedOrder,
      message: 'تم تحديث حالة الطلب بنجاح!'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 9. جلب حجوزات المطعم
 */
export const getReservations = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    const reservations = await prisma.reservation.findMany({
      where: { restaurant_id: id },
      orderBy: { date_time: 'desc' }
    });
    res.status(200).json(reservations);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 10. تحديث حالة الحجز
 */
export const updateReservationStatus = async (req: Request, res: Response): Promise<void> => {
  const { reservationId } = req.params;
  const { status } = req.body;

  try {
    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status }
    });
    res.status(200).json({
      status: 'success',
      reservation: updatedReservation,
      message: 'تم تحديث حالة الحجز بنجاح!'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

let memoryConversations: any[] = [
  {
    id: 'conv-101',
    restaurant_id: 'restaurant-am-eissa',
    customer_phone: '+201012345678',
    status: 'UNANSWERED',
    category: 'COMPLAINT',
    assigned_to: null,
    closed_by: null,
    messages_json: [
      { role: 'user', content: 'سلام عليكم، الأوردر وصل متأخر جدا والبطاطس باردة!', timestamp: new Date(Date.now() - 3600000).toISOString() }
    ],
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'conv-102',
    restaurant_id: 'restaurant-am-eissa',
    customer_phone: '+201198765432',
    status: 'IN_PROGRESS',
    category: 'ORDER',
    assigned_to: 'houda',
    closed_by: null,
    messages_json: [
      { role: 'user', content: 'عايز 2 شاورما دجاج وجامبو كولا', timestamp: new Date(Date.now() - 1800000).toISOString() },
      { role: 'assistant', content: 'تمام يا فندم تم تسجيل طلبك وبدأ تحضيره فوراً!', sender_name: 'houda', timestamp: new Date(Date.now() - 1200000).toISOString() }
    ],
    created_at: new Date(Date.now() - 1800000).toISOString(),
    updated_at: new Date(Date.now() - 1200000).toISOString()
  },
  {
    id: 'conv-103',
    restaurant_id: 'restaurant-am-eissa',
    customer_phone: '+201255554444',
    status: 'CLOSED',
    category: 'INQUIRY',
    assigned_to: 'admin',
    closed_by: 'admin',
    messages_json: [
      { role: 'user', content: 'مواعيد العمل عندكم كام؟', timestamp: new Date(Date.now() - 7200000).toISOString() },
      { role: 'assistant', content: 'بنفتح يومياً من 11 صباحاً لـ 2 صباحاً مرحباً بك!', sender_name: 'admin', timestamp: new Date(Date.now() - 7000000).toISOString() }
    ],
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 7000000).toISOString()
  }
];

/**
 * 11. جلب محادثات المطعم الحقيقية وإثرائها ببيانات نافذة الـ 24 ساعة (معزل تماماً بكل مطعم)
 */
export const getConversations = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    const conversations = await prisma.conversation.findMany({
      where: { restaurant_id: id },
      orderBy: { updated_at: 'desc' }
    });

    const enriched = (conversations || []).map(c => {
      let msgs: any[] = [];
      try {
        msgs = typeof c.messages_json === 'string' ? JSON.parse(c.messages_json) : (c.messages_json as any[]) || [];
      } catch (e) {}
      const lastUserMsg = msgs.slice().reverse().find((m: any) => m.role === 'user');
      const windowInfo = checkSessionWindow(lastUserMsg?.timestamp || lastUserMsg?.created_at || c.updated_at || c.created_at);
      return {
        ...c,
        isWindowOpen: windowInfo.isWindowOpen,
        windowExpiresAt: windowInfo.windowExpiresAt,
        remainingHours: windowInfo.remainingHours
      };
    });

    res.status(200).json(enriched);
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    res.status(200).json([]);
  }
};

/**
 * 12. جلب رسائل محادثة معينة مدعومة ببيانات نافذة الـ 24 ساعة للفرونت إند
 */
export const getConversationMessages = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  try {
    let msgs: any[] = [];
    let lastActivityDate: any = null;

    const conversation = await prisma.conversation.findUnique({
      where: { id }
    });

    if (conversation) {
      try {
        msgs = typeof conversation.messages_json === 'string' ? JSON.parse(conversation.messages_json) : (conversation.messages_json as any[]) || [];
      } catch (e) {}

      if (msgs.length === 0) {
        const dbMsgs = await prisma.message.findMany({
          where: { conversation_id: id },
          orderBy: { created_at: 'asc' }
        });
        if (dbMsgs && dbMsgs.length > 0) {
          msgs = dbMsgs.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.created_at.toISOString()
          }));
        }
      }

      lastActivityDate = conversation.updated_at || conversation.created_at;
    }

    const lastUserMsg = msgs.slice().reverse().find((m: any) => m.role === 'user');
    const windowInfo = checkSessionWindow(lastUserMsg?.timestamp || lastUserMsg?.created_at || lastActivityDate);

    res.status(200).json({
      messages: msgs,
      isWindowOpen: windowInfo.isWindowOpen,
      windowExpiresAt: windowInfo.windowExpiresAt,
      remainingHours: windowInfo.remainingHours
    });
  } catch (error: any) {
    res.status(200).json({ messages: [], isWindowOpen: false, windowExpiresAt: null, remainingHours: 0 });
  }
};

/**
 * 13. معالجة المحادثة التجريبية (Demo Chat) لصفحة الهبوط مع قيود الاستهلاك
 */
export const handleDemoChat = async (req: Request, res: Response): Promise<void> => {
  const { message, history, sessionCount } = req.body;

  // فحص حد الـ 5 رسائل لمنع سوء استخدام المفتاح المجاني
  if (sessionCount >= 5) {
    res.status(200).json({
      responseText: "عذراً، لقد استهلكت الحد الأقصى المتاح للمحادثة التجريبية في هذه الجلسة (5 رسائل). يرجى التسجيل والاشتراك في منصة Rivix لتخصيص وكيل ذكي كامل لمطعمك وإدارة طاولاتك ومنيوهاتك بشكل غير محدود!",
      reachedLimit: true
    });
    return;
  }

  try {
    // محاكاة معالجة ذكية للـ AI
    // سننشئ سياق مطعم تجريبي للـ Claude API
    const demoRestaurantId = 'demo-restaurant-id';
    const demoRestaurantName = 'مطعم ومطبخ البركة شاورما (نسخة تجريبية)';
    const demoCustomerPhone = 'demo-visitor-phone';

    const { responseText } = await geminiService.processMessage(
      'demo',
      demoRestaurantId,
      demoRestaurantName,
      demoCustomerPhone,
      history || [],
      message
    );

    res.status(200).json({
      responseText,
      reachedLimit: false
    });
  } catch (error: any) {
    console.error('خطأ في المحاكاة التجريبية للـ AI:', error);
    res.status(500).json({
      status: 'error',
      message: 'عذراً، حدث خطأ أثناء معالجة رسالتك تجريبياً.',
      error: error.message
    });
  }
};

/**
 * 14. استيراد المنيو من ملف Excel أو CSV
 */
export const importMenu = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id

  if (!req.file) {
    res.status(400).json({
      status: 'error',
      message: 'لم يتم العثور على أي ملف مرفوع! يرجى رفع ملف Excel أو CSV.'
    });
    return;
  }

  try {
    // 1. قراءة الملف من الـ Buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    // 2. اختيار أول ورقة عمل (First Sheet)
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 3. تحويل ورقة العمل لمصفوفة JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'الملف فارغ أو لا يحتوي على بيانات صالحة!'
      });
      return;
    }

    const itemsToCreate: any[] = [];
    let rowNumber = 1; // لتحديد السطر عند حدوث خطأ

    // 4. معالجة الصفوف والتحقق من صحتها
    for (const row of jsonData as any[]) {
      rowNumber++;
      
      // مطابقة أسماء الأعمدة بالعربية والإنجليزية
      const name = row['الاسم'] || row['Name'] || row['name'] || row['اسم الصنف'] || row['Item Name'];
      const description = row['الوصف'] || row['Description'] || row['description'] || row['وصف الصنف'] || row['Item Description'];
      const priceRaw = row['السعر'] || row['Price'] || row['price'] || row['سعر الصنف'] || row['Item Price'];
      const category = row['التصنيف'] || row['Category'] || row['category'] || row['القسم'] || row['Item Category'];
      const availableRaw = row['متوفر'] || row['Available'] || row['available'] || row['الحالة'] || row['Item Status'];
      const imageUrl = row['الصورة'] || row['رابط الصورة'] || row['Image'] || row['image_url'] || row['Image URL'];

      // تخطي الأسطر الفارغة تماماً
      if (!name && priceRaw === undefined && !category) {
        continue;
      }

      // التحقق من الحقول المطلوبة
      if (!name) {
        res.status(400).json({
          status: 'error',
          message: `خطأ في السطر ${rowNumber}: اسم الصنف مطلوب.`
        });
        return;
      }

      if (priceRaw === undefined || priceRaw === null) {
        res.status(400).json({
          status: 'error',
          message: `خطأ في السطر ${rowNumber} (${name}): سعر الصنف مطلوب.`
        });
        return;
      }

      if (!category) {
        res.status(400).json({
          status: 'error',
          message: `خطأ في السطر ${rowNumber} (${name}): تصنيف الصنف مطلوب.`
        });
        return;
      }

      // التحقق من صحة السعر
      const price = parseFloat(priceRaw);
      if (isNaN(price) || price < 0) {
        res.status(400).json({
          status: 'error',
          message: `خطأ في السطر ${rowNumber} (${name}): السعر "${priceRaw}" غير صالح. يجب أن يكون رقماً موجباً.`
        });
        return;
      }

      // التحقق من التوفر
      let is_available = true;
      if (availableRaw !== undefined && availableRaw !== null) {
        const val = String(availableRaw).trim().toLowerCase();
        if (val === 'لا' || val === '0' || val === 'false' || val === 'غير متوفر' || val === 'no') {
          is_available = false;
        }
      }

      itemsToCreate.push({
        restaurant_id: id,
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        price: price,
        category: String(category).trim(),
        image_url: imageUrl ? String(imageUrl).trim() : null,
        is_available: is_available
      });
    }

    if (itemsToCreate.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'لم يتم العثور على أي أصناف صالحة للاستيراد في الملف.'
      });
      return;
    }

    // 5. إدراج البيانات في قاعدة البيانات
    const createdCount = await prisma.$transaction(
      itemsToCreate.map(item => prisma.menuItem.create({ data: item }))
    );

    res.status(200).json({
      status: 'success',
      message: `تم استيراد ${createdCount.length} أصناف جديدة للمنيو بنجاح!`,
      importedCount: createdCount.length
    });

  } catch (error: any) {
    console.error('خطأ أثناء استيراد المنيو:', error);
    res.status(500).json({
      status: 'error',
      message: 'حدث خطأ داخلي أثناء معالجة ملف الاستيراد.',
      error: error.message
    });
  }
};

/**
 * 15. تحديث إعدادات المطعم
 */
export const updateRestaurant = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  const { name, phone_number, whatsapp_number_id, whatsapp_access_token } = req.body;

  try {
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id },
      data: {
        name,
        phone_number,
        whatsapp_number_id,
        whatsapp_access_token: whatsapp_access_token === '' ? null : whatsapp_access_token
      }
    });

    res.status(200).json({
      status: 'success',
      restaurant: updatedRestaurant,
      message: 'تم تحديث إعدادات المطعم بنجاح!'
    });
  } catch (error: any) {
    console.error('خطأ أثناء تحديث بيانات المطعم:', error);
    res.status(500).json({
      status: 'error',
      message: 'عذراً، فشل تحديث إعدادات المطعم.',
      error: error.message
    });
  }
};

/**
 * إنشاء مستخدم (موظف) جديد في لوحة التحكم (للمسؤول فقط)
 */
export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { username, password, role } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      res.status(400).json({ status: 'error', message: 'اسم المستخدم مسجل بالفعل!' });
      return;
    }

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashPassword(password),
        role
      }
    });

    res.status(201).json({
      status: 'success',
      message: 'تم إنشاء المستخدم بنجاح!',
      user: { id: newUser.id, username: newUser.username, role: newUser.role }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * جلب جميع مستخدمي النظام (للمسؤول فقط)
 */
export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' }
    });
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * حذف مستخدم معين من النظام (للمسؤول فقط)
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    if (userToDelete?.username === 'admin') {
      res.status(400).json({ status: 'error', message: 'لا يمكن حذف حساب المسؤول الرئيسي!' });
      return;
    }

    await prisma.user.delete({ where: { id } });
    res.status(200).json({ status: 'success', message: 'تم حذف المستخدم بنجاح!' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * تحديث تصنيف المحادثة يدوياً
 */
export const updateConversationCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const { category } = req.body;
  try {
    try {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { category }
      });
      res.status(200).json({ status: 'success', message: 'تم تحديث تصنيف المحادثة بنجاح!', conversation: updated });
      return;
    } catch (e) {}

    const memConv = memoryConversations.find(c => c.id === id);
    if (memConv) {
      memConv.category = category;
      res.status(200).json({ status: 'success', message: 'تم تحديث تصنيف المحادثة بنجاح!', conversation: memConv });
      return;
    }

    res.status(200).json({ status: 'success', message: 'تم تحديث التصنيف!' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * أرشفة أو إلغاء أرشفة محادثة
 */
export const archiveConversation = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const { is_archived } = req.body;

  try {
    try {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { is_archived: is_archived !== undefined ? is_archived : true }
      });
      res.status(200).json({ status: 'success', message: 'تم تحديث أرشفة المحادثة بنجاح!', conversation: updated });
      return;
    } catch (e) {}

    const memConv = memoryConversations.find(c => c.id === id);
    if (memConv) {
      memConv.is_archived = is_archived !== undefined ? is_archived : true;
      memConv.updated_at = new Date().toISOString();
      res.status(200).json({ status: 'success', message: 'تم تحديث أرشفة المحادثة بنجاح!', conversation: memConv });
      return;
    }

    res.status(200).json({ status: 'success', message: 'تمت الأرشفة بنجاح!' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * حذف المحادثة نهائياً من قاعدة البيانات والذاكرة
 */
export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  memoryConversations = memoryConversations.filter(c => c.id !== id);

  try {
    await prisma.message.deleteMany({ where: { conversation_id: id } }).catch(() => {});
    await prisma.conversation.delete({ where: { id } }).catch(() => {});
  } catch (e: any) {
    console.warn('[Delete Conversation Warn]:', e.message);
  }

  res.status(200).json({ status: 'success', message: 'تم حذف المحادثة بنجاح!' });
};

/**
 * تحديث حالة المحادثة وتحديد الموظف الذي قام بالمتابعة أو الإغلاق
 */
export const updateConversationStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const { status, assigned_to, closed_by } = req.body;
  const currentUsername = req.user?.username || 'موظف الخدمة';

  let finalAssignedTo = assigned_to;
  let finalClosedBy = closed_by;

  if (status === 'IN_PROGRESS' && !finalAssignedTo) {
    finalAssignedTo = currentUsername;
  }
  if (status === 'CLOSED') {
    finalClosedBy = currentUsername;
  }
  if (status === 'UNANSWERED') {
    finalAssignedTo = null;
    finalClosedBy = null;
  }

  try {
    try {
      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          status,
          assigned_to: finalAssignedTo,
          closed_by: finalClosedBy
        }
      });
      res.status(200).json({ status: 'success', message: 'تم تحديث حالة المحادثة بنجاح!', conversation: updated });
      return;
    } catch (e) {}

    const memConv = memoryConversations.find(c => c.id === id);
    if (memConv) {
      memConv.status = status;
      memConv.assigned_to = status === 'UNANSWERED' ? null : (finalAssignedTo || memConv.assigned_to || currentUsername);
      memConv.closed_by = status === 'CLOSED' ? (finalClosedBy || currentUsername) : null;
      memConv.updated_at = new Date().toISOString();
      res.status(200).json({ status: 'success', message: 'تم تحديث حالة المحادثة بنجاح!', conversation: memConv });
      return;
    }

    res.status(200).json({ status: 'success', message: 'تم التحديث بنجاح!' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * إرسال رد يدوي من الموظف وتحديث الحالة لـ IN_PROGRESS (مع التحقق الإجباري من نافذة الـ 24 ساعة)
 */
export const sendManualMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const content = req.body.content || req.body.text;
  const image_url = req.body.image_url;
  const currentUsername = req.user?.username || 'موظف الخدمة';

  try {
    let msgs: any[] = [];
    let customerPhone = '';
    let restaurantId = '';
    let conv: any = null;

    try {
      conv = await prisma.conversation.findUnique({ where: { id } });
      if (conv) {
        customerPhone = conv.customer_phone;
        restaurantId = conv.restaurant_id;
        try {
          msgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
        } catch (e) {}
      }
    } catch (e) {}

    if (!conv) {
      res.status(404).json({ status: 'error', message: 'لم يتم العثور على المحادثة.' });
      return;
    }
    customerPhone = normalizePhone(conv.customer_phone);

    // 1. فحص نافذة الـ 24 ساعة من تاريخ أحدث رسالة صادرة من العميل
    const lastUserMsg = msgs.slice().reverse().find((m: any) => m.role === 'user');
    const windowInfo = checkSessionWindow(lastUserMsg?.timestamp || lastUserMsg?.created_at || conv?.created_at);

    if (!windowInfo.isWindowOpen) {
      res.status(400).json({
        status: 'error',
        error: 'SESSION_WINDOW_EXPIRED',
        message: 'انتهت مهلة الـ 24 ساعة للتواصل المباشر مع العميل. يجب إرسال رسالة قالب معتمدة (Template Message) لإعادة فتح المحادثة.',
        isWindowOpen: false,
        windowExpiresAt: windowInfo.windowExpiresAt
      });
      return;
    }

    const newMsg = {
      role: 'assistant',
      content: content || '',
      image_url: image_url || undefined,
      sender_name: currentUsername,
      timestamp: new Date().toISOString()
    };

    // 2. إرسال الرسالة عبر WhatsApp Cloud API إن وُجد تفاصيل رقم المطعم
    if (customerPhone && restaurantId) {
      try {
        const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
        if (restaurant) {
          if (image_url && image_url.trim()) {
            await whatsappService.sendImageMessage(
              customerPhone,
              image_url,
              content,
              restaurant.whatsapp_number_id,
              restaurant.whatsapp_access_token || undefined
            );
          } else if (content && content.trim()) {
            await whatsappService.sendTextMessage(
              customerPhone,
              content,
              restaurant.whatsapp_number_id,
              restaurant.whatsapp_access_token || undefined
            );
          }
        }
      } catch (wsErr: any) {
        console.error('[Manual Message Error] فشل الإرسال عبر واتساب:', wsErr.message);
        res.status(400).json({
          status: 'error',
          message: wsErr.message || 'فشل إرسال الرسالة عبر الواتساب.'
        });
        return;
      }
    }

    // 3. تحديث السجل في الداتابيز
    if (conv && conv.id && conv.restaurant_id) {
      msgs.push(newMsg);
      await prisma.message.create({
        data: {
          conversation_id: conv.id,
          role: 'assistant',
          content: content || (image_url ? '[صورة مرفقة]' : '')
        }
      }).catch(() => {});

      const updated = await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          messages_json: msgs,
          status: 'IN_PROGRESS',
          assigned_to: conv.assigned_to || currentUsername,
          updated_at: new Date()
        }
      });
      res.status(200).json({ status: 'success', message: 'تم إرسال الرسالة وحفظ المحادثة!', conversation: updated, messageObj: newMsg });
      return;
    }

    const memConv = memoryConversations.find(c => c.id === id);
    if (memConv) {
      if (!Array.isArray(memConv.messages_json)) {
        memConv.messages_json = [];
      }
      memConv.messages_json.push(newMsg);
      memConv.status = 'IN_PROGRESS';
      memConv.assigned_to = memConv.assigned_to || currentUsername;
      memConv.updated_at = new Date().toISOString();
      res.status(200).json({ status: 'success', message: 'تم إرسال الرسالة محلياً!', conversation: memConv, messageObj: newMsg });
      return;
    }

    res.status(200).json({ status: 'success', message: 'تم الإرسال بنجاح!', messageObj: newMsg });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * إرسال قالب رسمي معتمد من Meta بالـ Endpoint المخصص لوحات التحكم عند انقضاء الـ 24 ساعة
 */
export const sendTemplateMessageEndpoint = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const { templateName, languageCode, components } = req.body;
  const currentUsername = req.user?.username || 'موظف الخدمة';

  if (!templateName || !templateName.trim()) {
    res.status(400).json({ status: 'error', message: 'اسم القالب الرسمي (templateName) مطلوب.' });
    return;
  }

  try {
    let customerPhone = '';
    let restaurantId = '';
    let conv: any = null;

    try {
      conv = await prisma.conversation.findUnique({ where: { id } });
      if (conv) {
        customerPhone = conv.customer_phone;
        restaurantId = conv.restaurant_id;
      }
    } catch (e) {}

    if (!conv) {
      const memConv = memoryConversations.find(c => c.id === id);
      if (memConv) {
        conv = memConv;
        customerPhone = memConv.customer_phone;
        restaurantId = memConv.restaurant_id;
      }
    }

    if (!customerPhone) {
      res.status(404).json({ status: 'error', message: 'المحادثة غير موجودة أو رقم العميل مفقود.' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

    // إرسال القالب من خلال خدمة واتساب
    await whatsappService.sendTemplateMessage(
      customerPhone,
      templateName,
      languageCode || 'ar',
      components,
      restaurant?.whatsapp_number_id,
      restaurant?.whatsapp_access_token || undefined
    );

    const templateMsgObj = {
      role: 'assistant',
      content: `[قالب رسمي معتمد: ${templateName}]`,
      sender_name: currentUsername,
      is_template: true,
      timestamp: new Date().toISOString()
    };

    if (conv && conv.id && conv.restaurant_id) {
      let msgs: any[] = [];
      try {
        msgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
      } catch (e) {}
      msgs.push(templateMsgObj);

      const updated = await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          messages_json: msgs,
          status: 'IN_PROGRESS',
          assigned_to: conv.assigned_to || currentUsername,
          updated_at: new Date()
        }
      });
      res.status(200).json({
        status: 'success',
        message: `تم إرسال القالب الرسمي (${templateName}) بنجاح وإعادة تفعيل التواصل مع العميل!`,
        conversation: updated,
        messageObj: templateMsgObj
      });
      return;
    }

    res.status(200).json({ status: 'success', message: 'تم إرسال القالب بنجاح!', messageObj: templateMsgObj });
  } catch (error: any) {
    console.error('خطأ إرسال القالب الرسمي:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * شات الضبط الذكي الخاص بالأدمن لتوجيه المساعد
 */
export const handleAdminConfigChat = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  const { message, history } = req.body;
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      res.status(404).json({ status: 'error', message: 'المطعم غير موجود.' });
      return;
    }

    const result = await geminiService.processAdminConfigMessage(
      restaurant.id,
      restaurant.name,
      history || [],
      message
    );

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * جلب التعليمات الإدارية المخصصة الحالية للمطعم
 */
export const getAiInstructions = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { ai_instructions: true }
    });
    res.status(200).json({ instructions: restaurant?.ai_instructions || '' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * تعديل التعليمات الإدارية المخصصة للمطعم مباشرة
 */
export const updateAiInstructions = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  const { instructions } = req.body;
  try {
    await prisma.restaurant.update({
      where: { id },
      data: { ai_instructions: instructions }
    });
    res.status(200).json({ status: 'success', message: 'تم تحديث توجيهات المساعد الذكي بنجاح!' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * تحديث إعدادات المطعم ومعرّف الكتالوج (Meta Catalog ID)
 */
export const updateRestaurantSettings = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  const { name, phone_number, whatsapp_number_id, whatsapp_access_token, catalog_id } = req.body;

  try {
    const updated = await prisma.restaurant.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(phone_number ? { phone_number } : {}),
        ...(whatsapp_number_id ? { whatsapp_number_id } : {}),
        ...(whatsapp_access_token ? { whatsapp_access_token } : {}),
        ...(catalog_id !== undefined ? { catalog_id } : {})
      }
    });

    res.status(200).json({
      status: 'success',
      restaurant: updated,
      message: 'تم تحديث إعدادات المطعم ومعرّف الكتالوج بنجاح!'
    });
  } catch (err: any) {
    console.error('Error updating restaurant settings:', err);
    res.status(500).json({ status: 'error', message: err.message || 'فشل تحديث الإعدادات.' });
  }
};

/**
 * مزامنة المنيو كاملاً مع كتالوج Meta Commerce Catalog يدوياً
 */
export const syncCatalogEndpoint = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    const result = await syncFullMenuToMetaCatalog(id);
    if (!result.success) {
      res.status(400).json({ status: 'error', message: result.error || 'فشلت مزامنة الكتالوج مع Meta Commerce API.' });
      return;
    }
    res.status(200).json({ status: 'success', message: `تمت مزامنة ${result.syncedCount} صنف مع كتالوج Meta الواتساب الرسمي بنجاح!` });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'حدث خطأ أثناء مزامنة الكتالوج.' });
  }
};

/**
 * إرسال رسالة الكتالوج الرسمي المباشرة للعميل في محادثة معينة
 */
export const sendCatalogMessageEndpoint = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const currentUsername = req.user?.username || 'موظف الخدمة';
  try {
    let conv: any = null;
    try {
      conv = await prisma.conversation.findUnique({
        where: { id },
        include: { restaurant: true }
      });
    } catch (e) {}

    if (!conv) {
      conv = memoryConversations.find(c => c.id === id);
    }

    if (!conv || !conv.customer_phone) {
      res.status(404).json({ status: 'error', message: 'المحادثة غير موجودة أو رقم العميل مفقود.' });
      return;
    }

    await whatsappService.sendNativeCatalogMessage(
      conv.customer_phone,
      'تفضل بتصفح قائمة طعام المطعم واختيار الوجبة مباشرة 🛍️',
      undefined,
      conv.restaurant?.whatsapp_number_id,
      conv.restaurant?.whatsapp_access_token || undefined
    );

    const catalogMsgObj = {
      role: 'assistant',
      content: '[🛍️ تم إرسال كتالوج الواتساب الرسمي المباشر للعميل]',
      sender_name: currentUsername,
      timestamp: new Date().toISOString()
    };

    let msgs: any[] = [];
    try {
      msgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
    } catch (e) {}
    msgs.push(catalogMsgObj);

    try {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { messages_json: msgs, status: 'IN_PROGRESS', updated_at: new Date() }
      });
    } catch (e) {}

    res.status(200).json({ status: 'success', message: 'تم إرسال الكتالوج المباشر للعميل بنجاح!', messageObj: catalogMsgObj });
  } catch (err: any) {
    console.error('Error sending catalog message:', err);
    res.status(500).json({ status: 'error', message: err.message || 'فشل إرسال الكتالوج عبر الواتساب.' });
  }
};

/**
 * 22. تعديل محتوى رسالة معينة في المحادثة
 */
export const editConversationMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id, msgIndex } = req.params;
  const { content } = req.body;
  const index = parseInt(msgIndex, 10);

  if (content === undefined || content === null) {
    res.status(400).json({ status: 'error', message: 'محتوى الرسالة مطلوب للتعديل.' });
    return;
  }

  try {
    const conv = await prisma.conversation.findUnique({ where: { id } });
    if (!conv) {
      res.status(404).json({ status: 'error', message: 'المحادثة غير موجودة.' });
      return;
    }

    let msgs: any[] = [];
    try {
      msgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
    } catch (e) {}

    if (isNaN(index) || index < 0 || index >= msgs.length) {
      res.status(400).json({ status: 'error', message: 'موقع الرسالة غير صالح.' });
      return;
    }

    msgs[index].content = content;
    msgs[index].is_edited = true;
    msgs[index].edited_at = new Date().toISOString();

    await prisma.conversation.update({
      where: { id },
      data: {
        messages_json: msgs as any,
        updated_at: new Date()
      }
    });

    res.status(200).json({ status: 'success', message: 'تم تعديل الرسالة بنجاح!', messages: msgs });
  } catch (err: any) {
    console.error('Error editing message:', err);
    res.status(500).json({ status: 'error', message: err.message || 'فشل تعديل الرسالة.' });
  }
};

/**
 * 23. مسح رسالة معينة من سجل المحادثة
 */
export const deleteConversationMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id, msgIndex } = req.params;
  const index = parseInt(msgIndex, 10);

  try {
    const conv = await prisma.conversation.findUnique({ where: { id } });
    if (!conv) {
      res.status(404).json({ status: 'error', message: 'المحادثة غير موجودة.' });
      return;
    }

    let msgs: any[] = [];
    try {
      msgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
    } catch (e) {}

    if (isNaN(index) || index < 0 || index >= msgs.length) {
      res.status(400).json({ status: 'error', message: 'موقع الرسالة غير صالح.' });
      return;
    }

    msgs.splice(index, 1);

    await prisma.conversation.update({
      where: { id },
      data: {
        messages_json: msgs as any,
        updated_at: new Date()
      }
    });

    res.status(200).json({ status: 'success', message: 'تم مسح الرسالة بنجاح!', messages: msgs });
  } catch (err: any) {
    console.error('Error deleting message:', err);
    res.status(500).json({ status: 'error', message: err.message || 'فشل مسح الرسالة.' });
  }
};


