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
 */
export const triggerNewMessage = async (
  restaurantId: string,
  conversationId: string,
  messageObj: any,
  updatedConversation?: any
) => {
  if (!pusherInstance || !restaurantId || !conversationId) return;
  try {
    const formattedMsgObj = messageObj ? {
      ...messageObj,
      conversation_id: messageObj.conversation_id || conversationId,
      conversationId: messageObj.conversationId || conversationId,
    } : messageObj;

    const channelName = `private-restaurant-${restaurantId}`;
    await pusherInstance.trigger(channelName, 'new-message', {
      conversationId,
      messageObj: formattedMsgObj,
      conversation: updatedConversation,
    });
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
