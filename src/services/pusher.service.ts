import Pusher from 'pusher';

let pusherInstance: Pusher | null = null;

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER || 'eu';

if (appId && key && secret) {
  try {
    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
    console.log('[Pusher Service] 🟢 Pusher service initialized successfully.');
  } catch (err: any) {
    console.error('[Pusher Service Initialization Error]:', err.message);
  }
} else {
  console.warn('[Pusher Service] ⚠️ Pusher credentials (PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET) are missing in environment variables. Real-time broadcasting will be disabled.');
}

/**
 * Triggers a real-time 'new-message' event to staff dashboard connected clients on private channel.
 * Safely wrapped in try/catch so failure never blocks main message processing.
 *
 * Lightweight Payload Optimization & 10KB Safety Guard:
 * Automatically strips messages_json & full message arrays from updatedConversation
 * to prevent Pusher HTTP 413 (Payload Too Large) errors.
 */
export const triggerNewMessage = async (
  restaurantId: string,
  conversationId: string,
  messageObj: any,
  updatedConversation?: any
) => {
  if (!pusherInstance || !restaurantId || !conversationId) return;
  try {
    const sanitizeMediaUrl = (url?: string) => {
      if (!url) return undefined;
      if (typeof url === 'string' && url.trim().toLowerCase().startsWith('data:')) {
        return undefined; // Strips inline base64 data URLs to prevent 413 Payload Too Large
      }
      return url;
    };

    const hasDataUrlMedia = Boolean(
      (typeof messageObj?.image_url === 'string' && messageObj.image_url.trim().toLowerCase().startsWith('data:')) ||
      (typeof messageObj?.audio_url === 'string' && messageObj.audio_url.trim().toLowerCase().startsWith('data:')) ||
      (typeof messageObj?.document_url === 'string' && messageObj.document_url.trim().toLowerCase().startsWith('data:'))
    );

    const formattedMsgObj = messageObj ? {
      id: messageObj.id,
      role: messageObj.role,
      text: messageObj.text || messageObj.content || '',
      created_at: messageObj.created_at || new Date().toISOString(),
      timestamp: messageObj.timestamp,
      media_id: messageObj.media_id,
      image_url: sanitizeMediaUrl(messageObj.image_url),
      audio_url: sanitizeMediaUrl(messageObj.audio_url),
      document_url: sanitizeMediaUrl(messageObj.document_url),
      has_media: Boolean(messageObj.media_id || messageObj.image_url || messageObj.audio_url || messageObj.document_url || hasDataUrlMedia),
      conversation_id: messageObj.conversation_id || conversationId,
      conversationId: messageObj.conversationId || conversationId,
    } : messageObj;

    // Build lightweight conversation metadata without messages_json or messages array
    let lightweightConv: any = undefined;
    if (updatedConversation) {
      const { messages_json, messages, ...rest } = updatedConversation;
      lightweightConv = {
        id: rest.id || conversationId,
        customer_phone: rest.customer_phone,
        customer_name: rest.customer_name,
        restaurant_id: rest.restaurant_id || restaurantId,
        status: rest.status,
        updated_at: rest.updated_at || new Date().toISOString(),
        assigned_to: rest.assigned_to,
        closed_by: rest.closed_by,
        is_archived: Boolean(rest.is_archived),
        category: rest.category
      };
    }

    let payload: any = {
      conversationId,
      messageObj: formattedMsgObj,
      conversation: lightweightConv,
    };

    let payloadString = JSON.stringify(payload);
    let payloadSize = Buffer.byteLength(payloadString, 'utf8');

    // Safety Guard: Pusher limit is 10,240 bytes (10KB). If payload > 9,000 bytes, prune further.
    const SAFETY_LIMIT_BYTES = 9000;
    if (payloadSize > SAFETY_LIMIT_BYTES) {
      console.warn(
        `[Pusher Payload Warning ⚠️] Payload size (${payloadSize} bytes) for conv ${conversationId} exceeds safety threshold (${SAFETY_LIMIT_BYTES} bytes). Pruning payload further.`
      );

      // Ultra-lightweight fallback
      payload = {
        conversationId,
        messageObj: {
          id: messageObj?.id,
          role: messageObj?.role,
          text: (messageObj?.text || messageObj?.content || '').slice(0, 500),
          created_at: messageObj?.created_at,
          conversation_id: conversationId,
          conversationId: conversationId
        },
        conversation: lightweightConv ? {
          id: lightweightConv.id,
          status: lightweightConv.status,
          updated_at: lightweightConv.updated_at,
          assigned_to: lightweightConv.assigned_to,
          is_archived: lightweightConv.is_archived
        } : undefined
      };

      payloadString = JSON.stringify(payload);
      payloadSize = Buffer.byteLength(payloadString, 'utf8');
      console.warn(`[Pusher Payload Warning ⚠️] Pruned payload size: ${payloadSize} bytes.`);
    }

    const channelName = `private-restaurant-${restaurantId}`;
    await pusherInstance.trigger(channelName, 'new-message', payload);
  } catch (err: any) {
    console.error(`[Pusher Trigger Error] Failed to broadcast message to channel (private-restaurant-${restaurantId}):`, err.message || err);
  }
};

/**
 * Authorizes a client socket connection to a private channel.
 */
export const authorizePusherChannel = (socketId: string, channelName: string) => {
  if (!pusherInstance) {
    throw new Error('Pusher is not initialized');
  }
  return pusherInstance.authorizeChannel(socketId, channelName);
};

export default pusherInstance;
