import { PrismaClient } from '@prisma/client';

// كلاس إدارة الاتصال بقاعدة البيانات كنمط Singleton
class PrismaService {
  private static instance: PrismaClient;

  private constructor() {}

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      const dbUrl = process.env.DB_URL || process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('خطأ: لم يتم ضبط متغير البيئة DB_URL أو DATABASE_URL للاتصال بقاعدة البيانات.');
      }

      PrismaService.instance = new PrismaClient({
        datasources: {
          db: {
            url: dbUrl,
          },
        },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
    return PrismaService.instance;
  }
}

// تصدير العميل الأساسي غير الممتد (Unscoped Prisma Client) للعمليات المركزية والأدمن الرئيسي
export const prisma = PrismaService.getInstance();

// كلاس الخطأ المخصص لعدم تقديم معرف المطعم
export class TenantIdRequiredError extends Error {
  constructor(message = 'خطأ أمان: يجب تزويد معرف المطعم (restaurantId) لتنفيذ استعلامات قاعدة البيانات بشكل آمن.') {
    super(message);
    this.name = 'TenantIdRequiredError';
  }
}

/**
 * دالة مصنع (Factory Function) لإنشاء عميل Prisma ممتد ومخصص لكل مطعم (Multi-Tenant Isolated Prisma Client)
 * يضمن الفلترة والعزل التلقائي بـ restaurant_id على مستوى الاستعلامات (Row-Level Security)
 */
export const getTenantPrisma = (restaurantId: string) => {
  if (!restaurantId || !restaurantId.trim()) {
    throw new TenantIdRequiredError();
  }

  const cleanRestaurantId = restaurantId.trim();

  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      menuItem: {
        async findMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async count({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            (args.data as any) = args.data.map(item => ({ ...item, restaurant_id: cleanRestaurantId }));
          } else {
            (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          }
          return query(args);
        },
        async update({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async updateMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async delete({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async deleteMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
      },
      conversation: {
        async findMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async count({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            (args.data as any) = args.data.map(item => ({ ...item, restaurant_id: cleanRestaurantId }));
          } else {
            (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          }
          return query(args);
        },
        async update({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async updateMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async delete({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async deleteMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
      },
      order: {
        async findMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async count({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            (args.data as any) = args.data.map(item => ({ ...item, restaurant_id: cleanRestaurantId }));
          } else {
            (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          }
          return query(args);
        },
        async update({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async updateMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async delete({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async deleteMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
      },
      reservation: {
        async findMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async count({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            (args.data as any) = args.data.map(item => ({ ...item, restaurant_id: cleanRestaurantId }));
          } else {
            (args.data as any) = { ...args.data, restaurant_id: cleanRestaurantId };
          }
          return query(args);
        },
        async update({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async updateMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async delete({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
        async deleteMany({ args, query }) {
          (args.where as any) = { ...args.where, restaurant_id: cleanRestaurantId };
          return query(args);
        },
      },
    },
  });
};
