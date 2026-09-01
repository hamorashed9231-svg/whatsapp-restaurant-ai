import { Request, Response } from 'express';
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

  try {
    let user = await prisma.user.findUnique({ where: { username } });

    // إذا لم يكن حساب الأدمن الرئيسي موجوداً في النظام وقام المستخدم بمحاولة تسجيل الدخول به، ننشئه فوراً
    if (!user && username === 'admin') {
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_password_123';
      user = await prisma.user.create({
        data: {
          username: 'admin',
          password: hashPassword(ADMIN_PASSWORD),
          role: 'admin'
        }
      });
    }

    if (user && comparePassword(password, user.password)) {
      // توقيع الـ JWT بصلاحية 24 ساعة
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
    let whereClause: any = {};
    if (id && id !== 'default') {
      whereClause = { restaurant_id: id };
    }

    try {
      const menu = await prisma.menuItem.findMany({
        where: whereClause,
        orderBy: { category: 'asc' }
      });
      res.status(200).json(menu);
    } catch (dbErr: any) {
      if (dbErr.message && dbErr.message.includes('image_url')) {
        const fallbackMenu = await prisma.menuItem.findMany({
          where: whereClause,
          select: {
            id: true,
            restaurant_id: true,
            name: true,
            description: true,
            price: true,
            category: true,
            is_available: true
          },
          orderBy: { category: 'asc' }
        });
        res.status(200).json(fallbackMenu.map(item => ({ ...item, image_url: null })));
        return;
      }
      throw dbErr;
    }
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
    const updated = await prisma.conversation.update({
      where: { id },
      data: { category }
    });
    res.status(200).json({ status: 'success', message: 'تم تحديث تصنيف المحادثة بنجاح!', conversation: updated });
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


