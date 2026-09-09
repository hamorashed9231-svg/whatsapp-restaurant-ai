import { prisma } from './prisma.service';

/**
 * تحديث أو إنشاء سجل العميل فور وصول رسالة جديدة أو فتح محادثة
 */
export async function upsertCustomerOnMessage(
  restaurantId: string,
  customerPhone: string,
  isNewOrReopenedConv: boolean
) {
  try {
    const existing = await prisma.customer.findUnique({
      where: {
        restaurant_id_customer_phone: {
          restaurant_id: restaurantId,
          customer_phone: customerPhone
        }
      }
    });

    const now = new Date();

    if (!existing) {
      return await prisma.customer.create({
        data: {
          restaurant_id: restaurantId,
          customer_phone: customerPhone,
          total_conversations_count: 1,
          first_seen_at: now,
          last_seen_at: now
        }
      });
    }

    if (isNewOrReopenedConv) {
      return await prisma.customer.update({
        where: { id: existing.id },
        data: {
          total_conversations_count: { increment: 1 },
          last_seen_at: now
        }
      });
    } else {
      return await prisma.customer.update({
        where: { id: existing.id },
        data: {
          last_seen_at: now
        }
      });
    }
  } catch (error: any) {
    console.error('[CustomerService] Error upserting customer on message:', error.message || error);
    return null;
  }
}

/**
 * توثيق سجل المحادثة عند التحديث إلى حالة CLOSED
 */
export async function logConversationOnClose(conversationId: string) {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conv) return null;

    // 1. ضمان وجود سجل العميل أولاً
    const customer = await upsertCustomerOnMessage(conv.restaurant_id, conv.customer_phone, false);
    if (!customer) return null;

    // 2. فحص أو إنشاء سجل المحادثة في CustomerConversationLog
    const existingLog = await prisma.customerConversationLog.findFirst({
      where: {
        customer_id: customer.id,
        conversation_id: conv.id
      }
    });

    const closedAt = conv.updated_at || new Date();
    const startedAt = conv.created_at || new Date();

    if (!existingLog) {
      return await prisma.customerConversationLog.create({
        data: {
          customer_id: customer.id,
          conversation_id: conv.id,
          started_at: startedAt,
          closed_at: closedAt,
          is_purged: false
        }
      });
    } else {
      return await prisma.customerConversationLog.update({
        where: { id: existingLog.id },
        data: {
          closed_at: closedAt
        }
      });
    }
  } catch (error: any) {
    console.error('[CustomerService] Error logging conversation on close:', error.message || error);
    return null;
  }
}

/**
 * الـ Fallback Guard: التوثيق وتأكيد الأرشفة قبل حذف المحادثة (الـ Purge أو الحذف اليدوي)
 */
export async function ensureConversationLoggedBeforeDelete(conv: any, isPurged: boolean = true) {
  try {
    const restaurantId = conv.restaurant_id;
    const customerPhone = conv.customer_phone;

    if (!restaurantId || !customerPhone) return null;

    // 1. ضمان وجود العميل
    let customer = await prisma.customer.findUnique({
      where: {
        restaurant_id_customer_phone: {
          restaurant_id: restaurantId,
          customer_phone: customerPhone
        }
      }
    });

    const now = new Date();
    const startedAt = conv.created_at ? new Date(conv.created_at) : now;
    const closedAt = conv.updated_at ? new Date(conv.updated_at) : now;

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          restaurant_id: restaurantId,
          customer_phone: customerPhone,
          total_conversations_count: 1,
          first_seen_at: startedAt,
          last_seen_at: closedAt
        }
      });
    }

    // 2. إنشاء أو تحديث سجل المحادثة بـ is_purged
    const existingLog = await prisma.customerConversationLog.findFirst({
      where: {
        customer_id: customer.id,
        conversation_id: conv.id
      }
    });

    if (!existingLog) {
      return await prisma.customerConversationLog.create({
        data: {
          customer_id: customer.id,
          conversation_id: conv.id,
          started_at: startedAt,
          closed_at: closedAt,
          is_purged: isPurged
        }
      });
    } else {
      return await prisma.customerConversationLog.update({
        where: { id: existingLog.id },
        data: {
          is_purged: isPurged,
          closed_at: closedAt
        }
      });
    }
  } catch (error: any) {
    console.error('[CustomerService] Fallback Guard error during purge/delete logging:', error.message || error);
    return null;
  }
}

/**
 * حساب الإحصائية اليومية للعملاء الجدد مقابل القدامى الراجعين
 */
export async function getDailyCustomerStats(restaurantId: string, targetDateStr?: string) {
  const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();
  
  // تحديد بداية ونهاية اليوم المحدد بالتوقيت المحلي/المعياري
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. العملاء الجدد: سجلات Customer التي أنشئت في هذا اليوم
  const newCustomersCount = await prisma.customer.count({
    where: {
      restaurant_id: restaurantId,
      created_at: {
        gte: startOfDay,
        lte: endOfDay
      }
    }
  });

  // 2. العملاء القدامى الراجعون: عملاء تم إنشاؤهم قبل بداية هذا اليوم، ولكن لديهم نشاط محادثات في هذا اليوم
  const returningCustomers = await prisma.customer.count({
    where: {
      restaurant_id: restaurantId,
      created_at: {
        lt: startOfDay
      },
      OR: [
        {
          last_seen_at: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        {
          conversation_logs: {
            some: {
              started_at: {
                gte: startOfDay,
                lte: endOfDay
              }
            }
          }
        }
      ]
    }
  });

  // 3. إجمالي المحادثات في قاعدة البيانات لهذا اليوم
  const activeConversationsToday = await prisma.conversation.count({
    where: {
      restaurant_id: restaurantId,
      updated_at: {
        gte: startOfDay,
        lte: endOfDay
      }
    }
  });

  return {
    date: startOfDay.toISOString().split('T')[0],
    stats: {
      new_customers_count: newCustomersCount,
      returning_customers_count: returningCustomers,
      total_active_customers_today: newCustomersCount + returningCustomers,
      active_conversations_count: activeConversationsToday
    }
  };
}
