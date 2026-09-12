import { Request, Response } from 'express';
import { whatsappQueue } from '../queues/whatsapp.queue';
import { redisClient } from '../services/redis.service';
import { prisma } from '../services/prisma.service';
import { normalizePhone, resolveCustomerIdentifier } from '../utils/phone';
import { triggerNewMessage } from '../services/pusher.service';

/**
 * التحقق من خادم الويب هوك (Webhook Verification) من فيسبوك
 * يطلب فيسبوك هذا المسار مرة واحدة عند تفعيل الـ Webhook للتحقق من هوية الخادم
 */
export const verifyWebhook = async (req: Request, res: Response): Promise<void> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const validTokens = [
    process.env.WEBHOOK_VERIFY_TOKEN,
    'rivix_verify_token_123',
    'my_secure_verify_token_123'
  ].filter(Boolean);

  if (mode && token) {
    if (mode === 'subscribe' && validTokens.includes(token as string)) {
      console.log('[Webhook] تم التحقق بنجاح من Webhook Verification Token.');
      res.status(200).send(challenge);
      return;
    }
    console.warn('[Webhook] فشل التحقق: الـ Verify Token غير متطابق.');
    res.sendStatus(403);
    return;
  }
  
  res.sendStatus(400);
};



/**
 * استقبال أحداث ورسائل واتساب وإضافتها لمؤقت التجميع (Debouncing) عبر Redis و BullMQ ومعالجتها مباشرة في بيئات Serverless
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const body = req.body;

  // التحقق من أن هذا حدث واتساب صالح
  if (!body.object || body.object !== 'whatsapp_business_account') {
    res.status(200).json({ status: 'ignored_not_whatsapp' });
    return;
  }

  try {
    const entries = body.entry || [];
    let processedAny = false;
    let hasRedisFailure = false;

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        const messages = value?.messages || [];
        if (!messages || messages.length === 0) continue;

        const whatsappNumberId = value.metadata?.phone_number_id;
        if (!whatsappNumberId) {
          console.error('[Webhook] لم يتم العثور على phone_number_id في تفاصيل الرسالة.');
          continue;
        }

        for (const message of messages) {
          // 0. فحص الطابع الزمني وكتم الرسائل القديمة التي مر عليها أكثر من 10 دقائق من سيرفرات Meta
          const msgTimestamp = Number(message.timestamp);
          if (msgTimestamp && !isNaN(msgTimestamp)) {
            const ageInSeconds = Math.floor(Date.now() / 1000) - msgTimestamp;
            if (ageInSeconds > 600) {
              console.log(`[Webhook Deduplication] 🛑 تم كتم وتجاهل رسالة قديمة مكررة من سيرفرات Meta (ID: ${message.id}, عمر الرسالة: ${Math.floor(ageInSeconds / 60)} دقيقة)`);
              continue;
            }
          }

          // 1. كتم التكرار عبر Upstash Redis الحتمي فقط (مع وضع علامة فشل إذا تعثر الاتصال دون قطع بقية اللوب)
          const messageId = message.id;
          if (messageId) {
            const redisDedupKey = `msg_dedup:${messageId}`;
            try {
              const setRes = await redisClient.set(redisDedupKey, '1', 'EX', 604800, 'NX');
              if (setRes === null) {
                console.log(`[Webhook Deduplication Upstash Redis] تم كتم رسالة مكررة حتمياً عبر Redis (ID: ${messageId})`);
                continue;
              }
            } catch (redisErr: any) {
              console.warn(`[Webhook Redis Dedup Failure] ⚠️ فشل الاتصال بـ Upstash Redis للرسالة (${messageId})، الاستمرار بالاعتماد على الفحص المباشر:`, redisErr.message);
            }
          }

          // 2. استخراج بيانات الزبون والمعرف الفريد والاسم من Meta Payload
          const contacts = value?.contacts || [];
          const matchingContact = contacts.find((c: any) => c.wa_id === message.from);
          const profileName = matchingContact?.profile?.name?.trim() || null;
          const waId = matchingContact?.wa_id || null;

          const rawCustomerPhone = message.from;
          const customerPhone = resolveCustomerIdentifier(rawCustomerPhone, waId, message.id);

          // 🛑 فحص حظر الزبون محلياً والمقيد برقم الواتساب المخصص للمطعم الحالي منعاً للتداخل بين المطاعم
          const existingConvBlockCheck = await prisma.conversation.findFirst({
            where: {
              customer_phone: customerPhone,
              restaurant: {
                whatsapp_number_id: whatsappNumberId
              }
            },
            select: { is_blocked: true }
          });
          if (existingConvBlockCheck?.is_blocked) {
            console.log(`[Webhook Block Filter] 🚫 تم كتم وتجاهل رسالة قادمة من عميل محظور للمطعم الحالي (${customerPhone}, PhoneID: ${whatsappNumberId})`);
            continue;
          }

          let messageText = '';
          let mediaId = '';

          if (message.type === 'text') {
            messageText = message.text?.body || '';
          } else if (message.type === 'image') {
            const caption = message.image?.caption || '';
            messageText = caption ? `[📷 صورة مرفقة]: ${caption}` : '[📷 صورة مرفقة]';
            mediaId = message.image?.id || '';
          } else if (message.type === 'document') {
            const caption = message.document?.caption || message.document?.filename || '';
            messageText = caption ? `[📄 مستند مرفق]: ${caption}` : '[📄 مستند مرفق]';
            mediaId = message.document?.id || '';
          } else if (message.type === 'audio' || message.type === 'voice') {
            const audioObj = message.audio || message.voice;
            messageText = '[🎙️ تسجيل صوتي]';
            mediaId = audioObj?.id || '';
          } else if (message.type === 'sticker') {
            messageText = '[ملصق 🎨]';
            mediaId = message.sticker?.id || '';
          } else if (message.type === 'order' || message.order || (message.type === 'interactive' && (message.interactive?.order || message.interactive?.type === 'order' || message.interactive?.nfm_reply))) {
            const orderObj = message.order || message.interactive?.order || message.interactive?.nfm_reply;
            const textNote = orderObj?.text || message.interactive?.nfm_reply?.response_json?.text || '';
            const items = orderObj?.product_items || [];

            let itemsMap: Record<string, { name: string; price?: number; id?: string }> = {};
            try {
              const allItems = await prisma.menuItem.findMany({
                select: { id: true, name: true, price: true }
              });
              for (const fi of allItems) {
                const itemData = { name: fi.name, price: Number(fi.price), id: fi.id };
                itemsMap[fi.id] = itemData;
                itemsMap[fi.id.toLowerCase().trim()] = itemData;
              }
            } catch (e) {
              console.warn('[Webhook Order] Could not fetch menuItem details:', e);
            }

            let formattedItems: string[] = [];
            let grandTotal = 0;

            for (const it of items) {
              const qty = Number(it.quantity || 1);
              const retailerId = String(it.product_retailer_id || '').trim();
              
              let dbItem: { name: string; price?: number; id?: string } | undefined = itemsMap[retailerId] || itemsMap[retailerId.toLowerCase()];
              if (!dbItem && retailerId.startsWith('item_')) {
                const numStr = retailerId.replace('item_', '').replace(/^0+/, '');
                dbItem = Object.values(itemsMap).find((val: any) => val.id && (val.id === numStr || val.id.includes(numStr)));
              }

              let itemName = dbItem?.name;
              if (!itemName) {
                if (retailerId.startsWith('item_')) {
                  const cleanNum = retailerId.replace('item_', '').replace(/^0+/, '');
                  itemName = `صنف (#${cleanNum || retailerId})`;
                } else {
                  itemName = retailerId || 'صنف من الكتالوج';
                }
              }

              const rawPrice = it.item_price ? Number(it.item_price) : (dbItem?.price || 0);
              const currency = it.currency || 'EGP';

              if (rawPrice > 0) {
                const itemTotal = rawPrice * qty;
                grandTotal += itemTotal;
                formattedItems.push(`• ${qty}x ${itemName} (${rawPrice} ${currency})`);
              } else {
                formattedItems.push(`• ${qty}x ${itemName}`);
              }
            }

            let summaryHeader = `🛒 [طلب سلة المنتجات من الكتالوج]:`;
            let itemsListStr = formattedItems.length > 0 ? formattedItems.join('\n') : 'تفاصيل المنتجات غير متوفرة';
            let noteStr = textNote ? `\n\n📝 ملاحظة العميل: ${textNote}` : '';
            let totalStr = grandTotal > 0 ? `\n\n💰 الإجمالي: ${grandTotal} EGP` : '';

            messageText = `${summaryHeader}\n${itemsListStr}${totalStr}${noteStr}`;
          } else if (message.type === 'interactive') {
            const interactive = message.interactive;
            if (interactive.type === 'button_reply') {
              messageText = interactive.button_reply?.title || '';
            } else if (interactive.type === 'list_reply') {
              messageText = interactive.list_reply?.title || '';
            }
          } else if (message.type === 'reaction') {
            const reactionObj = message.reaction;
            const targetMessageId = reactionObj?.message_id;
            const emoji = reactionObj?.emoji || '';
            console.log(`[Webhook Reaction] تم استلام تفاعل (${emoji}) على الرسالة (${targetMessageId}) من العميل [${customerPhone}].`);

            if (targetMessageId) {
              try {
                const conv = await prisma.conversation.findFirst({
                  where: { customer_phone: customerPhone }
                });
                if (conv) {
                  let jsonMsgs: any[] = [];
                  try {
                    jsonMsgs = typeof conv.messages_json === 'string' ? JSON.parse(conv.messages_json) : (conv.messages_json as any[]) || [];
                  } catch (e) {}

                  let updated = false;
                  jsonMsgs = jsonMsgs.map(m => {
                    if (m.wamid === targetMessageId || m.id === targetMessageId) {
                      updated = true;
                      return { ...m, reaction: emoji };
                    }
                    return m;
                  });

                  if (updated) {
                    await prisma.conversation.update({
                      where: { id: conv.id },
                      data: { messages_json: jsonMsgs, updated_at: new Date() }
                    });
                  }
                }
              } catch (err) {
                console.error('[Webhook Reaction Error]:', err);
              }
            }
            processedAny = true;
            continue;
          } else if (message.type === 'button') {
            messageText = message.button?.text || '';
          }

          if (!messageText.trim()) {
            console.log(`[Webhook] تم استلام رسالة غير مدعومة من النوع (${message.type}). تم تخطي المعالجة.`);
            continue;
          }

          console.log(`[Webhook] تم استلام رسالة جديدة من [${customerPhone}] متجهة للمعرف [${whatsappNumberId}] (${message.type}): "${messageText}".`);

          const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);

          if (isServerless) {
            // 🛑 الانتظار الحتمي في Vercel لمنع التجميد والاستئناف المكرر لـ Serverless Function
            await processDirectly(whatsappNumberId, customerPhone, messageText, mediaId, message, profileName);
          } else {
            let queuedInRedis = false;
            try {
              const pendingKey = `pending_messages:${whatsappNumberId}:${customerPhone}`;
              const payload = JSON.stringify({
                whatsappNumberId,
                customerPhone,
                customerName: profileName,
                messageText,
                mediaId,
                messageType: message.type,
                timestamp: new Date().toISOString(),
              });

              await redisClient.rpush(pendingKey, payload);
              await redisClient.expire(pendingKey, 120);

              const jobId = `chat_${whatsappNumberId}_${customerPhone}`;
              await whatsappQueue.add(
                'process-whatsapp-message',
                {
                  whatsappNumberId,
                  customerPhone,
                  customerName: profileName,
                  messageText: messageText.trim(),
                  mediaId,
                  messageType: message.type,
                  timestamp: new Date().toISOString(),
                },
                { jobId, delay: 0 }
              ).catch(() => {});
              queuedInRedis = true;
            } catch (redisErr: any) {
              console.warn('[Webhook] تحذير: تعذر دفع المهام لـ Redis/BullMQ (سيتم الاعتماد على المعالجة المباشرة):', redisErr.message);
            }

            if (!queuedInRedis) {
              await processDirectly(whatsappNumberId, customerPhone, messageText, mediaId, message, profileName);
            }
          }

          processedAny = true;
        }
      }
    }

    res.status(200).json({ status: processedAny ? 'processed' : 'ignored' });
  } catch (error: any) {
    console.error('[Webhook] خطأ أثناء معالجة الـ Webhook:', error.message);
    res.status(200).json({ status: 'error', message: error.message });
  }
};

/**
 * معالجة الرسالة مباشرة لبيئات Serverless (مثل Vercel) مع منع تداخل الشاتات تماماً
 */
async function processDirectly(whatsappNumberId: string, rawCustomerPhone: string, messageText: string, mediaId?: string, rawMessage?: any, profileName?: string | null) {
  try {
    const { prisma } = await import('../services/prisma.service');
    const { geminiService } = await import('../services/gemini.service');
    const { whatsappService } = await import('../services/whatsapp.service');
    const { resolveCustomerIdentifier } = await import('../utils/phone');
    const { memoryConversations } = await import('./api.controller');

    const customerPhone = resolveCustomerIdentifier(rawCustomerPhone, null, rawMessage?.id);

    // 1. تحديد المطعم المرتبط برقم الواتساب، مع الدعم التلقائي للمطعم النشط والتحديث التلقائي للمعرف الحقيقي
    let restaurant: any = null;
    try {
      restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { whatsapp_number_id: whatsappNumberId },
            { whatsapp_number_id: whatsappNumberId.trim() }
          ]
        },
      });
      if (!restaurant) {
        restaurant = await prisma.restaurant.findFirst({
          where: { subscription_status: 'ACTIVE' }
        }) || await prisma.restaurant.findFirst();

        // تحديث whatsapp_number_id تلقائياً بالمعرف الحقيقي القادم من Meta
        if (restaurant && whatsappNumberId && restaurant.whatsapp_number_id !== whatsappNumberId) {
          console.log(`[DirectProcess Auto-Fix] 🔄 تحديث whatsapp_number_id للمطعم من (${restaurant.whatsapp_number_id}) إلى الرقم الحقيقي (${whatsappNumberId})`);
          await prisma.restaurant.update({
            where: { id: restaurant.id },
            data: { whatsapp_number_id: whatsappNumberId }
          }).catch(() => {});
          restaurant.whatsapp_number_id = whatsappNumberId;
        }
      }
    } catch (dbErr: any) {
      console.warn('[DirectProcess DB Quota Warning]:', dbErr.message);
    }

    if (!restaurant) {
      const EISSA_TOKEN = process.env.WHATSAPP_TOKEN || 'EAAfbQuX71okBSb0OnQB8oEzZBEdjEyvHkf4Ljxj7JwtIFlK0lnLgLAXrOQZAKZCWdFZCHYKLFROBTZCyYpQGYIFISZAdZBkLP6Gm5G4SQikGlJQyqvetX2f1CKzmxRbZCPyjar6uvsBSyZACYasSOTTAZALCKwJhyYVbQYGP3ngla4ZCoN3p9IJJKKKhRJRK3xT0wZDZD';
      restaurant = {
        id: 'rest_eissa_default',
        name: 'مطعم عم عيسى',
        phone_number: '+201000000000',
        whatsapp_number_id: whatsappNumberId || '1234567890',
        whatsapp_access_token: EISSA_TOKEN,
      };
    }

    // 2. جلب المحادثة النشطة للعميل
    let conversation: any = null;
    try {
      conversation = await prisma.conversation.findFirst({
        where: {
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
        },
        orderBy: { updated_at: 'desc' },
      });
    } catch (e) {}

    const convId = conversation?.id || `conv_${customerPhone.replace(/\+/g, '')}`;

    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            id: convId,
            restaurant_id: restaurant.id,
            customer_phone: customerPhone,
            customer_name: profileName || null,
            messages_json: [],
            status: 'UNANSWERED',
          },
        }).catch(() => null);
      } catch (e) {}

      if (!conversation) {
        conversation = {
          id: convId,
          restaurant_id: restaurant.id,
          customer_phone: customerPhone,
          customer_name: profileName || null,
          messages_json: [],
          status: 'UNANSWERED',
          created_at: new Date(),
          updated_at: new Date()
        };
      }
    } else if (profileName && !conversation.customer_name) {
      try {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { customer_name: profileName }
        }).catch(() => {});
        conversation.customer_name = profileName;
      } catch (e) {}
    }

    // 3. حفظ رسالة العميل في DB وفي الذاكرة الاحتياطية

    let currentMsgs: any[] = [];
    try {
      currentMsgs = typeof conversation.messages_json === 'string'
        ? JSON.parse(conversation.messages_json)
        : (conversation.messages_json as any[]) || [];
    } catch (e) {}

    const msgType = rawMessage?.type || '';
    const isAudioType = (msgType === 'audio' || msgType === 'voice' || messageText.includes('[🎙️ تسجيل صوتي]'));
    const isStickerType = (msgType === 'sticker' || messageText.includes('[ملصق 🎨]'));
    const isDocumentType = (msgType === 'document' || messageText.includes('[📄 مستند مرفق]'));
    const isImageType = (msgType === 'image' || messageText.includes('[📷 صورة مرفقة]') || (!isAudioType && !isStickerType && !isDocumentType && Boolean(mediaId)));

    const finalImageUrl = isImageType && mediaId ? `/api/media/${mediaId}` : undefined;
    const finalAudioUrl = isAudioType && mediaId ? `/api/media/${mediaId}` : undefined;
    const finalStickerUrl = isStickerType && mediaId ? `/api/media/${mediaId}` : undefined;
    const finalDocumentUrl = isDocumentType && mediaId ? `/api/media/${mediaId}` : undefined;

    const msgWamid = rawMessage?.id || undefined;
    const isAlreadyInMsgs = currentMsgs.some((m: any) => {
      if (msgWamid && (m.wamid === msgWamid || m.id === msgWamid)) return true;
      const sameRole = m.role === 'user';
      const sameContent = (m.content || '').trim() === messageText.trim();
      const mTime = m.timestamp ? new Date(m.timestamp).getTime() : 0;
      const closeInTime = mTime ? Math.abs(Date.now() - mTime) < 30000 : true;
      return sameRole && sameContent && closeInTime;
    });

    if (!isAlreadyInMsgs) {
      currentMsgs.push({
        role: 'user',
        content: messageText,
        media_id: mediaId || undefined,
        wamid: msgWamid,
        id: msgWamid,
        reply_to_id: rawMessage?.context?.id || undefined,
        image_url: finalImageUrl,
        audio_url: finalAudioUrl,
        sticker_url: finalStickerUrl,
        document_url: finalDocumentUrl,
        timestamp: new Date().toISOString()
      });

      try {
        await prisma.message.create({
          data: {
            conversation_id: conversation.id,
            role: 'user',
            content: messageText,
            media_id: mediaId || undefined,
            image_url: finalImageUrl,
            audio_url: finalAudioUrl,
            document_url: finalDocumentUrl
          },
        }).catch(() => {});
      } catch (e) {}
    }
    const isWasClosed = (conversation.status === 'CLOSED');
    const isWasArchived = Boolean(conversation.is_archived);
    const shouldReopen = isWasClosed || isWasArchived;
    const isBrandNewConv = !conversation || conversation.messages_json?.length === 0;
    const isNewOrReopenedConv = isBrandNewConv || shouldReopen;
    const newStatus = shouldReopen ? 'UNANSWERED' : (conversation.status || 'UNANSWERED');

    // ⚡ تحديث/إنشاء سجل العميل دائمًا برقم العميل والمطعم لحظياً
    try {
      const { upsertCustomerOnMessage } = await import('../services/customer.service');
      await upsertCustomerOnMessage(restaurant.id, customerPhone, isNewOrReopenedConv, profileName || conversation.customer_name);
    } catch (custErr: any) {
      console.warn('[DirectProcess Customer Upsert Warning]:', custErr.message || custErr);
    }

    try {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          messages_json: currentMsgs as any,
          is_archived: false,
          status: newStatus,
          closed_by: shouldReopen ? null : conversation.closed_by,
          updated_at: new Date()
        }
      }).catch(() => {});
    } catch (e) {}

    if (shouldReopen) {
      conversation.status = 'UNANSWERED';
      conversation.is_archived = false;
      conversation.closed_by = null;
    }

    const latestUserMsg = currentMsgs[currentMsgs.length - 1];
    if (latestUserMsg && restaurant?.id) {
      triggerNewMessage(restaurant.id, conversation.id, latestUserMsg, {
        ...conversation,
        status: newStatus,
        updated_at: new Date().toISOString()
      }).catch(() => {});
    }

    // تحديث الذاكرة الحية دائمًا كخيار احتياطي أسرع
    const memIdx = memoryConversations.findIndex((c: any) => c.customer_phone === customerPhone || c.id === conversation.id);
    if (memIdx !== -1) {
      memoryConversations[memIdx].messages_json = currentMsgs;
      memoryConversations[memIdx].status = newStatus;
      memoryConversations[memIdx].is_archived = false;
      if (profileName && !memoryConversations[memIdx].customer_name) {
        memoryConversations[memIdx].customer_name = profileName;
      }
      if (shouldReopen) memoryConversations[memIdx].closed_by = null;
      memoryConversations[memIdx].updated_at = new Date().toISOString();
    } else {
      memoryConversations.unshift({
        id: conversation.id,
        restaurant_id: restaurant.id,
        customer_phone: customerPhone,
        customer_name: profileName || conversation.customer_name || null,
        messages_json: currentMsgs,
        status: newStatus,
        category: 'INQUIRY',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // فحص تعطيل الردود الآلية والذكاء الاصطناعي
    const isAiDisabled = process.env.DISABLE_AI === 'true' || process.env.DISABLE_AI === '1';
    const isAutoReplyEnabled = process.env.ENABLE_AUTO_REPLY === 'true';

    if (isAiDisabled || !isAutoReplyEnabled) {
      console.log(`[DirectProcess] ⚠️ ${isAiDisabled ? 'الذكاء الاصطناعي معطل (DISABLE_AI=true)' : 'الرد التلقائي غير مفعل'}. تم حفظ الرسالة وتحديث الحالة إلى UNANSWERED وإرسال إشعار Pusher بدون إرسال أي رد آلي للعميل.`);
      return;
    }

    // 4. جلب السياق واستدعاء Gemini AI
    let dbPriorMessages: any[] = [];
    try {
      dbPriorMessages = await prisma.message.findMany({
        where: { conversation_id: conversation.id },
        orderBy: { created_at: 'asc' },
      });
    } catch (e) {}

    const history = dbPriorMessages.length > 0
      ? dbPriorMessages.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.created_at?.toISOString ? msg.created_at.toISOString() : new Date().toISOString(),
        }))
      : currentMsgs.map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString()
        }));

    let responseText = '';
    let updatedHistory = history;

    try {
      const aiResult = await geminiService.processMessage(
        conversation.id,
        restaurant.id,
        restaurant.name,
        customerPhone,
        history,
        messageText
      );
      responseText = aiResult.responseText;
      updatedHistory = aiResult.updatedHistory;
    } catch (aiErr: any) {
      console.error('[DirectProcess AI Error] ⚠️ فشل الذكاء الاصطناعي، يتم تشغيل الرد التلقائي الاحتياطي المباشر:', aiErr.message || aiErr);
      responseText = `أهلاً بك في مطعم ${restaurant.name}! 🌸\nتم استلام رسالتك بنجاح، وسنقوم بالرد عليك في أقرب وقت.`;
      updatedHistory = [
        ...history,
        { role: 'user', content: messageText, timestamp: new Date().toISOString() },
        { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
      ];
    }

    // 4.5. فحص ثانٍ وتأكيدي لحالة المحادثة قبل إرسال الرسالة عبر الواتساب لتفادي الـ Race Condition مع الموظف
    try {
      const freshConv = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        select: { status: true, assigned_to: true }
      });
      const freshStaffAssigned = Boolean(freshConv?.assigned_to && freshConv.assigned_to.trim().length > 0);
      if (freshConv?.status === 'IN_PROGRESS' || freshStaffAssigned) {
        console.log(`[DirectProcess 🛑] تم إلغاء إرسال رد الذكاء الاصطناعي للزبون [${customerPhone}] لأن الموظف قام بالرد/التحويل أثناء معالجة الذكاء الاصطناعي.`);
        return;
      }
    } catch (e: any) {
      console.error('[DirectProcess Re-check Warning] ⚠️ تعذر الاستعلام عن حالة المحادثة قبل الإرسال، وسيتم الاستمرار بالرد (Fail-Open):', e.message || e);
    }

    // 5 & 6. إرسال رد الـ AI وحفظ السجل بالتوازي لتسريع الإرسال للزبون فوراً
    const sendPromise = whatsappService.sendTextMessage(
      customerPhone,
      responseText,
      restaurant.whatsapp_number_id,
      restaurant.whatsapp_access_token || undefined
    ).then(() => {
      console.log(`[DirectProcess] تم إرسال الرد بنجاح للزبون [${customerPhone}]`);
    }).catch((sendErr: any) => {
      console.error(`[DirectProcess WhatsApp Send Error] ❌ فشل إرسال الرد عبر واتساب للزبون [${customerPhone}]:`, sendErr.message || sendErr);
    });

    const dbSavePromise = (async () => {
      try {
        await prisma.message.create({
          data: {
            conversation_id: conversation.id,
            role: 'assistant',
            content: responseText,
          },
        }).catch(() => {});

        const aiMsgObj = {
          conversation_id: conversation.id,
          conversationId: conversation.id,
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toISOString()
        };
        const finalMessagesJson = [
          ...currentMsgs,
          aiMsgObj
        ];

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            messages_json: finalMessagesJson as any,
            updated_at: new Date(),
          },
        }).catch(() => {});

        if (restaurant?.id) {
          triggerNewMessage(restaurant.id, conversation.id, aiMsgObj, {
            ...conversation,
            updated_at: new Date().toISOString()
          }).catch(() => {});
        }

        const finalMemIdx = memoryConversations.findIndex((c: any) => c.id === conversation.id);
        if (finalMemIdx !== -1) {
          memoryConversations[finalMemIdx].messages_json = finalMessagesJson;
          memoryConversations[finalMemIdx].updated_at = new Date().toISOString();
        }
      } catch (e) {}
    })();

    await Promise.all([sendPromise, dbSavePromise]);
  } catch (err: any) {
    console.error('[DirectProcess Error] خطأ أثناء المعالجة المباشرة للرسالة:', err.message || err);
  }
}
