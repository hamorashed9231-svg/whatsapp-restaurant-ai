import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';

/**
 * متحكم فحص حالة المخدم وقاعدة البيانات (Health Check)
 */
export const checkHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    // التحقق من إمكانية الاتصال بقاعدة البيانات عبر استعلام بسيط
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        server: 'up'
      }
    });
  } catch (error: any) {
    console.error('Health Check Error:', error.message);
    
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'down',
        server: 'up'
      },
      error: error.message
    });
  }
};
