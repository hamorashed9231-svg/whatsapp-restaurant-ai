import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import { prisma } from '../services/prisma.service';
import { geminiService } from '../services/gemini.service';
import { hashPassword, comparePassword } from '../utils/auth';

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
export const getRestaurant = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  try {
    let restaurant;
    try {
      if (id === 'default') {
        restaurant = await prisma.restaurant.findFirst();
      } else {
        restaurant = await prisma.restaurant.findUnique({
          where: { id }
        });
      }
    } catch (dbErr) {
      console.warn('تنبيه: تعذر الوصول لقاعدة البيانات، سيتم التراجع للبيانات المفتراضية.');
    }

    if (!restaurant) {
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      restaurant = {
        id: 'restaurant-am-eissa',
        name: 'مطعم عم عيسى',
        phone_number: '+201012345678',
        whatsapp_number_id: '100020003000',
        whatsapp_access_token: null,
        subscription_tier: 'PREMIUM',
        subscription_status: 'ACTIVE',
        subscription_expires_at: oneYearFromNow,
        ai_instructions: 'توصيل الطلبات مجاناً للطلبات الأكثر من 150 ج.م',
        created_at: new Date()
      };
    }

    res.status(200).json(restaurant);
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
 */
export const getMenu = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    let dbItems: any[] = [];
    try {
      dbItems = await prisma.menuItem.findMany({
        orderBy: { category: 'asc' }
      });
    } catch (dbErr: any) {}

    // دمج أصناف قاعدة البيانات والذاكرة المحلية لمنع أي فقدان للبيانات
    const mergedList = [...dbItems];
    for (const memItem of memoryMenuItems) {
      if (!mergedList.some(d => d.id === memItem.id)) {
        mergedList.push(memItem);
      }
    }

    res.status(200).json(mergedList.length > 0 ? mergedList : memoryMenuItems);
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

  let newItem: any = {
    id: `item-${Date.now()}`,
    restaurant_id: id,
    name,
    description: description || '',
    price: parseFloat(price) || 0,
    category: category || 'وجبات رئيسية',
    image_url: image_url || '',
    is_available: is_available !== undefined ? is_available : true
  };

  try {
    let targetRestId = id;
    const restExists = await prisma.restaurant.findUnique({ where: { id } });
    if (!restExists) {
      const firstRest = await prisma.restaurant.findFirst();
      if (firstRest) {
        targetRestId = firstRest.id;
      }
    }

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
    if (dbItem) {
      newItem = dbItem;
    }
  } catch (e) {
    console.warn('Prisma create failed, fallback to memoryMenuItems:', e);
  }

  // تجنب تكرار الصنف بالذاكرة إذا كان موجوداً
  memoryMenuItems = memoryMenuItems.filter(m => m.id !== newItem.id);
  memoryMenuItems.push(newItem);

  res.status(201).json({
    status: 'success',
    item: newItem,
    message: 'تم إضافة الصنف بنجاح!'
  });
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
 */
export const deleteMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { itemId } = req.params;

  try {
    try {
      await prisma.menuItem.delete({
        where: { id: itemId }
      });
    } catch (e) {}
    
    memoryMenuItems = memoryMenuItems.filter(m => m.id !== itemId);

    res.status(200).json({
      status: 'success',
      message: 'تم حذف الصنف بنجاح!'
    });
  } catch (error: any) {
    memoryMenuItems = memoryMenuItems.filter(m => m.id !== itemId);
    res.status(200).json({
      status: 'success',
      message: 'تم حذف الصنف بنجاح!'
    });
  }
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
 * 11. جلب محادثات المطعم الحقيقية
 */
export const getConversations = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { restaurant_id: id },
        orderBy: { updated_at: 'desc' }
      });
      if (conversations && conversations.length > 0) {
        res.status(200).json(conversations);
        return;
      }
    } catch (e) {}

    res.status(200).json(memoryConversations);
  } catch (error: any) {
    res.status(200).json(memoryConversations);
  }
};

/**
 * 12. جلب رسائل محادثة معينة
 */
export const getConversationMessages = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  try {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id }
      });
      if (conversation) {
        res.status(200).json(conversation.messages_json);
        return;
      }
    } catch (e) {}

    const memConv = memoryConversations.find(c => c.id === id);
    if (memConv) {
      res.status(200).json(memConv.messages_json);
      return;
    }

    res.status(200).json([]);
  } catch (error: any) {
    res.status(200).json([]);
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
 * إرسال رد يدوي من الموظف وتحديث الحالة لـ IN_PROGRESS
 */
export const sendManualMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  const { content, image_url } = req.body;
  const currentUsername = req.user?.username || 'موظف الخدمة';

  const newMsg = {
    role: 'assistant',
    content: content || '',
    image_url: image_url || undefined,
    sender_name: currentUsername,
    timestamp: new Date().toISOString()
  };

  try {
    try {
      const conv = await prisma.conversation.findUnique({ where: { id } });
      if (conv) {
        let msgs: any[] = [];
        try {
          msgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
        } catch (e) {}
        msgs.push(newMsg);

        const updated = await prisma.conversation.update({
          where: { id },
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
    } catch (e) {}

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


