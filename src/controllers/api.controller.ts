import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import { prisma } from '../services/prisma.service';
import { anthropicService } from '../services/anthropic.service';

/**
 * 1. تسجيل الدخول لمسؤول لوحة تحكم المطعم
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_password_123';
  const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // توقيع الـ JWT بصلاحية 24 ساعة
    const token = jwt.sign(
      { username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      status: 'success',
      token,
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
};

/**
 * 2. جلب بيانات المطعم
 * يدعم المعرف الخاص 'default' لجلب أول مطعم في قاعدة البيانات لتسهيل تجربة العميل
 */
export const getRestaurant = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  try {
    let restaurant;

    if (id === 'default') {
      restaurant = await prisma.restaurant.findFirst();
    } else {
      restaurant = await prisma.restaurant.findUnique({
        where: { id }
      });
    }

    if (!restaurant) {
      res.status(404).json({
        status: 'error',
        error_code: 'RESTAURANT_NOT_FOUND',
        message: 'المطعم غير موجود.'
      });
      return;
    }

    res.status(200).json(restaurant);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 3. جلب قائمة الطعام (المنيو) للمطعم
 */
export const getMenu = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const menu = await prisma.menuItem.findMany({
      where: { restaurant_id: id },
      orderBy: { category: 'asc' }
    });
    res.status(200).json(menu);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 4. إضافة صنف جديد للمنيو
 */
export const addMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  const { name, description, price, category, is_available } = req.body;

  try {
    const newItem = await prisma.menuItem.create({
      data: {
        restaurant_id: id,
        name,
        description,
        price,
        category,
        is_available: is_available !== undefined ? is_available : true
      }
    });
    res.status(201).json({
      status: 'success',
      item: newItem,
      message: 'تم إضافة الصنف بنجاح!'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 5. تعديل صنف في المنيو
 */
export const updateMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { itemId } = req.params;
  const { name, description, price, category, is_available } = req.body;

  try {
    const updatedItem = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        name,
        description,
        price,
        category,
        is_available
      }
    });
    res.status(200).json({
      status: 'success',
      item: updatedItem,
      message: 'تم تحديث الصنف بنجاح!'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 6. حذف صنف من المنيو
 */
export const deleteMenuItem = async (req: Request, res: Response): Promise<void> => {
  const { itemId } = req.params;

  try {
    await prisma.menuItem.delete({
      where: { id: itemId }
    });
    res.status(200).json({
      status: 'success',
      message: 'تم حذف الصنف بنجاح!'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
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

/**
 * 11. جلب محادثات المطعم الحقيقية
 */
export const getConversations = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // restaurant_id
  try {
    const conversations = await prisma.conversation.findMany({
      where: { restaurant_id: id },
      orderBy: { updated_at: 'desc' }
    });
    res.status(200).json(conversations);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * 12. جلب رسائل محادثة معينة
 */
export const getConversationMessages = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // conversation_id
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id }
    });

    if (!conversation) {
      res.status(404).json({
        status: 'error',
        error_code: 'CONVERSATION_NOT_FOUND',
        message: 'المحادثة غير موجودة.'
      });
      return;
    }

    res.status(200).json(conversation.messages_json);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
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

    const { responseText } = await anthropicService.processMessage(
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


