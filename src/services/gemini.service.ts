import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './prisma.service';
import { ChatMessage } from '../models/types';

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'mock-key' && apiKey !== 'sk-ant-api03-mock-key') {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * معالجة الرسائل الواردة من العميل باستخدام Gemini مع تفعيل الـ Function Calling الكامل.
   * @param restaurantId معرف المطعم في قاعدة البيانات
   * @param restaurantName اسم المطعم لتخصيص سلوك الذكاء الاصطناعي
   * @param customerPhone رقم هاتف العميل
   * @param history سجل الرسائل السابقة بين العميل والمطعم
   * @param newMessage الرسالة الجديدة الواردة من العميل
   */
  public async processMessage(
    restaurantId: string,
    restaurantName: string,
    customerPhone: string,
    history: ChatMessage[],
    newMessage: string
  ): Promise<{ responseText: string; updatedHistory: ChatMessage[] }> {
    
    // سياق النظام المخصص للـ AI ليتصرف كمساعد ذكي للمطعم المحدد
    const systemPrompt = `أنت مساعد ذكي ومرحب تعمل لصالح مطعم "${restaurantName}" على واتساب.
أجب دائماً باللغة العربية بأسلوب لبق، ودود، ومختصر ومناسب لمحادثات واتساب.
يمكنك مساعدة العملاء في:
1. استعراض قائمة الطعام (المنيو) للمطعم.
2. إجراء طلبات الطعام الجديدة.
3. حجز طاولات في المطعم.

تعليمات هامة:
- عندما يطلب العميل رؤية المنيو أو الطعام المتاح، استخدم أداة "get_menu" فوراً. لا تخترع أطعمة من عندك.
- عندما يطلب العميل طلب طعام، اسأله عن الأصناف والكميات بدقة، ثم استخدم أداة "create_order". احسب الأسعار بناءً على القائمة الفعلية المسترجعة من الأداة.
- عندما يطلب العميل حجز طاولة، اسأله عن التاريخ، الوقت، وعدد الأشخاص (party_size)، ثم استخدم أداة "create_reservation".
- تجنب الردود الطويلة جداً. استخدم الإيموجي بشكل لطيف لتجميل الرسائل.
- الوقت الحالي للنظام هو: ${new Date().toISOString()}. استخدم هذا المرجع لتحديد الأوقات النسبية (مثل اليوم، غداً، إلخ).`;

    // إذا لم يتم ضبط مفتاح SDK، يتم استخدام محاكاة الرد لأغراض الفحص والاختبار
    if (!this.genAI) {
      console.warn('تنبيه: GEMINI_API_KEY غير متوفر. سيتم استخدام محاكاة للرد الذكي.');
      const mockResponse = this.generateMockResponse(newMessage, restaurantName);
      
      const newHistory = [
        ...history,
        { role: 'user', content: newMessage, timestamp: new Date().toISOString() },
        { role: 'assistant', content: mockResponse, timestamp: new Date().toISOString() }
      ] as ChatMessage[];
      
      return { responseText: mockResponse, updatedHistory: newHistory };
    }

    try {
      // تحويل السجل الداخلي لتنسيق متوافق مع متطلبات Gemini SDK
      // Gemini يتوقع تاريخ محادثة بهيئة: { role: 'user' | 'model', parts: [{ text: '...' }] }
      const geminiHistory: any[] = [];
      for (const msg of history) {
        if (msg.role === 'system') continue; // تخطي رسائل النظام الداخلية
        geminiHistory.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }

      // تهيئة موديل Gemini 1.5 Pro ليكون بأعلى دقة ممكنة
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        systemInstruction: systemPrompt,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_menu',
                description: 'استرجاع قائمة المأكولات والمشروبات المتاحة في المطعم بمجرد طلب العميل للمنيو أو الأكل أو الطعام',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    restaurant_id: { type: 'STRING', description: 'المعرف الفريد للمطعم' },
                  },
                  required: ['restaurant_id'],
                },
              },
              {
                name: 'create_order',
                description: 'إنشاء طلب طعام جديد للزبون وحفظه في قاعدة البيانات',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    restaurant_id: { type: 'STRING', description: 'المعرف الفريد للمطعم' },
                    customer_phone: { type: 'STRING', description: 'رقم هاتف الزبون' },
                    items: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          name: { type: 'STRING', description: 'اسم الوجبة أو المشروب بدقة كما في المنيو' },
                          quantity: { type: 'INTEGER', description: 'الكمية المطلوبة (يجب أن تكون 1 أو أكثر)' },
                        },
                        required: ['name', 'quantity'],
                      },
                      description: 'قائمة الأصناف المطلوبة وكمياتها',
                    },
                  },
                  required: ['restaurant_id', 'customer_phone', 'items'],
                },
              },
              {
                name: 'create_reservation',
                description: 'إنشاء حجز طاولة جديد للزبون في المطعم',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    restaurant_id: { type: 'STRING', description: 'المعرف الفريد للمطعم' },
                    customer_phone: { type: 'STRING', description: 'رقم هاتف الزبون' },
                    date_time: { type: 'STRING', description: 'تاريخ ووقت الحجز بصيغة ISO 8601 (مثال: 2026-08-25T20:00:00)' },
                    party_size: { type: 'INTEGER', description: 'عدد الأشخاص للحجز' },
                  },
                  required: ['restaurant_id', 'customer_phone', 'date_time', 'party_size'],
                },
              },
            ],
          },
        ],
      });

      // بدء جلسة المحادثة مع التاريخ السابق
      const chat = model.startChat({
        history: geminiHistory,
      });

      // إرسال رسالة المستخدم الجديدة
      let result = await chat.sendMessage(newMessage);
      let response = result.response;

      // حلقة تكرارية لمعالجة استدعاء الدوال المتعددة أو المتتالية
      const maxLoops = 5;
      let loopCount = 0;

      while (response.functionCalls && response.functionCalls.length > 0 && loopCount < maxLoops) {
        loopCount++;
        const functionCalls = response.functionCalls;
        const functionResponses: any[] = [];

        for (const call of functionCalls) {
          const { name, args } = call;
          const toolInput = args as any;

          console.log(`[Gemini AI] طلب تشغيل الأداة: ${name} بمدخلات:`, toolInput);

          let resultData;
          try {
            if (name === 'get_menu') {
              resultData = await this.executeGetMenu(restaurantId);
            } else if (name === 'create_order') {
              resultData = await this.executeCreateOrder(
                toolInput.restaurant_id || restaurantId,
                toolInput.customer_phone || customerPhone,
                toolInput.items
              );
            } else if (name === 'create_reservation') {
              resultData = await this.executeCreateReservation(
                toolInput.restaurant_id || restaurantId,
                toolInput.customer_phone || customerPhone,
                toolInput.date_time,
                toolInput.party_size
              );
            } else {
              resultData = { error: `الأداة ${name} غير معرفة.` };
            }
          } catch (err: any) {
            console.error(`خطأ أثناء تشغيل الأداة ${name}:`, err);
            resultData = { error: `حدث خطأ أثناء معالجة طلبك: ${err.message}` };
          }

          functionResponses.push({
            functionResponse: {
              name,
              response: { result: resultData }
            }
          });
        }

        // إرجاع نتائج الأدوات لـ Gemini لإكمال المحادثة وصياغة الرد
        result = await chat.sendMessage(functionResponses);
        response = result.response;
      }

      const finalResponseText = response.text() || 'عذراً، لم أستطع معالجة طلبك حالياً.';

      // تحديث وحفظ سجل الرسائل بصيغتنا المخصصة لحفظه في قاعدة البيانات
      const updatedHistory: ChatMessage[] = [
        ...history,
        { role: 'user', content: newMessage, timestamp: new Date().toISOString() },
        { role: 'assistant', content: finalResponseText, timestamp: new Date().toISOString() },
      ];

      return { responseText: finalResponseText, updatedHistory };

    } catch (error: any) {
      console.error('خطأ في الاتصال بخدمة Gemini API:', error);
      throw new Error(`فشل معالجة الرسالة ذكياً عبر Gemini: ${error.message}`);
    }
  }

  // ================= الأدوات المنفذة فعلياً بقاعدة البيانات (Tools Implementations) =================

  /**
   * أداة استرجاع المنيو
   */
  private async executeGetMenu(restaurantId: string) {
    const items = await prisma.menuItem.findMany({
      where: {
        restaurant_id: restaurantId,
        is_available: true,
      },
      orderBy: {
        category: 'asc',
      },
    });

    if (items.length === 0) {
      return { status: 'empty', message: 'قائمة الطعام فارغة حالياً أو غير متوفرة.' };
    }

    return {
      status: 'success',
      menu: items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: Number(item.price),
        category: item.category
      }))
    };
  }

  /**
   * أداة إنشاء طلب جديد
   */
  private async executeCreateOrder(restaurantId: string, customerPhone: string, items: { name: string; quantity: number }[]) {
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurant_id: restaurantId }
    });

    const orderedItemsDetails: any[] = [];
    let totalPrice = 0;

    for (const orderItem of items) {
      const matchedMenu = menuItems.find(
        m => m.name.trim().toLowerCase() === orderItem.name.trim().toLowerCase()
      );

      if (!matchedMenu) {
        return {
          status: 'error',
          error_code: 'ITEM_NOT_FOUND',
          message: `عذراً، الصنف "${orderItem.name}" غير موجود في قائمة الطعام لدينا حالياً. يرجى مراجعة القائمة والطلب مجدداً.`
        };
      }

      if (!matchedMenu.is_available) {
        return {
          status: 'error',
          error_code: 'ITEM_NOT_AVAILABLE',
          message: `عذراً، الصنف "${matchedMenu.name}" غير متوفر للطلب حالياً.`
        };
      }

      const price = Number(matchedMenu.price);
      const subTotal = price * orderItem.quantity;
      totalPrice += subTotal;

      orderedItemsDetails.push({
        menu_item_id: matchedMenu.id,
        name: matchedMenu.name,
        quantity: orderItem.quantity,
        price: price,
        subtotal: subTotal
      });
    }

    const order = await prisma.order.create({
      data: {
        restaurant_id: restaurantId,
        customer_phone: customerPhone,
        items_json: orderedItemsDetails,
        total_price: totalPrice,
        status: 'PENDING'
      }
    });

    return {
      status: 'success',
      order_id: order.id,
      items: orderedItemsDetails,
      total_price: totalPrice,
      message: 'تم تسجيل الطلب بنجاح وهو قيد الانتظار حالياً.'
    };
  }

  /**
   * أداة إنشاء حجز طاولة
   */
  private async executeCreateReservation(restaurantId: string, customerPhone: string, dateTimeStr: string, partySize: number) {
    const reservationDate = new Date(dateTimeStr);
    
    if (isNaN(reservationDate.getTime())) {
      return {
        status: 'error',
        error_code: 'INVALID_DATE',
        message: 'تنسيق التاريخ والوقت غير صالح. يرجى توفير تاريخ صالح.'
      };
    }

    if (partySize <= 0) {
      return {
        status: 'error',
        error_code: 'INVALID_PARTY_SIZE',
        message: 'عدد أفراد الحجز يجب أن يكون شخصاً واحداً على الأقل.'
      };
    }

    const reservation = await prisma.reservation.create({
      data: {
        restaurant_id: restaurantId,
        customer_phone: customerPhone,
        date_time: reservationDate,
        party_size: partySize,
        status: 'PENDING'
      }
    });

    return {
      status: 'success',
      reservation_id: reservation.id,
      date_time: reservation.date_time.toISOString(),
      party_size: reservation.party_size,
      message: 'تم تسجيل حجز الطاولة بنجاح وهو بانتظار التأكيد.'
    };
  }

  /**
   * توليد رد محاكى بسيط في حال غياب مفتاح API لـ Gemini
   */
  private generateMockResponse(message: string, restaurantName: string): string {
    const cleanMsg = message.toLowerCase();
    if (cleanMsg.includes('منيو') || cleanMsg.includes('قائمة') || cleanMsg.includes('أكل') || cleanMsg.includes('طعام')) {
      return `مرحباً بك في مطعم ${restaurantName}! 🍔🍕
قائمة الطعام لدينا تحتوي على:
1. شاورما دجاج (السعر: 15.00 ريال)
2. بيتزا مارغريتا (السعر: 25.00 ريال)
3. عصير برتقال طازج (السعر: 8.00 ريال)

هل ترغب في طلب أي من هذه الأصناف؟`;
    }

    if (cleanMsg.includes('حجز') || cleanMsg.includes('طاولة')) {
      return `بالتأكيد! لحجز طاولة في ${restaurantName}، يرجى تزويدي بالتاريخ والوقت المطلوبين وعدد الأشخاص. مثال: (غداً الساعة 8 مساءً لـ 4 أشخاص).`;
    }

    if (cleanMsg.includes('طلب') || cleanMsg.includes('أريد أن أطلب')) {
      return `أهلاً بك! يرجى تحديد الوجبة والكمية التي ترغب بها من المنيو وسأقوم بتسجيل الطلب لك فوراً.`;
    }

    return `مرحباً بك في ${restaurantName}! أنا المساعد الذكي المخصص لخدمتك عبر واتساب.
يمكنني مساعدتك في استعراض المنيو، حجز طاولة، أو طلب الطعام. كيف يمكنني مساعدتك اليوم؟`;
  }
}

export const geminiService = new GeminiService();
