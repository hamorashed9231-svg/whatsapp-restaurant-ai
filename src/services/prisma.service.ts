import { PrismaClient } from '@prisma/client';

// كلاس إدارة الاتصال بقاعدة البيانات كنمط Singleton
class PrismaService {
  private static instance: PrismaClient;

  private constructor() {}

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
    return PrismaService.instance;
  }
}

// تصدير نسخة وحيدة للوصول المباشر
export const prisma = PrismaService.getInstance();
