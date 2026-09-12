import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// تعريف نوع مخصص لتوسيع واجهة الطلب لتشمل بيانات المستخدم المصدّق
export interface AuthenticatedRequest extends Request {
  user?: any;
}

/**
 * برمجية وسيطة للتحقق من صلاحية وصحة JWT Token المرفق بالطلب
 */
export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  
  // استخراج التوكن من صيغة Bearer <token>
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      status: 'error',
      error_code: 'UNAUTHORIZED',
      message: 'لم يتم توفير رمز الدخول (Token). يرجى تسجيل الدخول أولاً.'
    });
    return;
  }

  const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

  try {
    // التحقق من صحة التوكن والتوقيع
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // إرفاق البيانات بطلب Express
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      error_code: 'INVALID_TOKEN',
      message: 'رمز الدخول غير صالح أو منتهي الصلاحية. يرجى تسجيل الدخول مجدداً.'
    });
  }
};

/**
 * برمجية وسيطة للتحقق من امتلاك المستخدم للصلاحية المطلوبة (Require Permission Guard)
 */
export const requirePermission = (permissionKey: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'غير مصرح بالدخول.' });
      return;
    }

    // 1. حساب المسؤول يملك صلاحية مطلقة (Superuser)
    if (req.user.role === 'admin') {
      return next();
    }

    try {
      const username = req.user.username;
      if (!username) {
        res.status(403).json({
          status: 'error',
          error_code: 'FORBIDDEN',
          message: 'عذراً، لا تملك الصلاحية للوصول إلى هذه الميزة.'
        });
        return;
      }

      // جلب أحدث الصلاحيات من قاعدة البيانات مباشرة لتطبيق التغييرات اللحظية
      const { PrismaClient } = require('@prisma/client');
      const prismaClient = new PrismaClient();
      const dbUser = await prismaClient.user.findUnique({
        where: { username },
        select: { role: true, permissions: true }
      });

      if (!dbUser) {
        res.status(403).json({ status: 'error', message: 'المستخدم غير موجود.' });
        return;
      }

      if (dbUser.role === 'admin') {
        return next();
      }

      const userPermissions = (dbUser.permissions as string[]) || [];
      if (userPermissions.includes(permissionKey)) {
        return next();
      }

      res.status(403).json({
        status: 'error',
        error_code: 'FORBIDDEN',
        message: `عذراً، لا تملك الصلاحية للوصول إلى هذه الميزة (${permissionKey}).`
      });
    } catch (err) {
      console.error('[RequirePermission Error]:', err);
      res.status(500).json({ status: 'error', message: 'خطأ أثناء فحص الصلاحيات.' });
    }
  };
};
