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
