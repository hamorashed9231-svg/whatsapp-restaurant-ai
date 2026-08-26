import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';

/**
 * متحكم فحص حالة المخدم وقاعدة البيانات (Health Check)
 */
export const checkHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("DATABASE_URL check:", {
      exists: !!process.env.DATABASE_URL,
      length: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
      keys: Object.keys(process.env).filter(k => k.includes("DATA") || k.includes("URL") || k.includes("WHATSAPP") || k.includes("API"))
    });

    // التحقق من إمكانية الاتصال بقاعدة البيانات عبر استعلام بسيط
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        server: 'up'
      },
      debug: {
        dbUrlExists: !!process.env.DATABASE_URL,
        dbUrlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
        keys: Object.keys(process.env).filter(k => k.includes("DATABASE") || k.includes("URL"))
      }
    });
  } catch (error: any) {
    console.error('خطأ في فحص الصحة (Health Check Error):', error.message);
    
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'down',
        server: 'up'
      },
      error: error.message,
      debug: {
        dbUrlExists: !!process.env.DATABASE_URL,
        dbUrlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
        keys: Object.keys(process.env).filter(k => k.includes("DATABASE") || k.includes("URL"))
      }
    });
  }
};
