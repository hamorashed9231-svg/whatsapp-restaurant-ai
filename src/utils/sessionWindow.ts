/**
 * وحدة فحص وإدارة نافذة التفاعل المسموحة من Meta (WhatsApp 24-Hour Session Window)
 */

export interface SessionWindowInfo {
  isWindowOpen: boolean;
  windowExpiresAt: string | null;
  remainingHours: number;
}

export const checkSessionWindow = (lastCustomerMessageDate?: Date | string | null): SessionWindowInfo => {
  if (!lastCustomerMessageDate) {
    const now = Date.now();
    return {
      isWindowOpen: true,
      windowExpiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      remainingHours: 24,
    };
  }
  const lastTime = new Date(lastCustomerMessageDate).getTime();
  if (isNaN(lastTime)) {
    const now = Date.now();
    return {
      isWindowOpen: true,
      windowExpiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      remainingHours: 24,
    };
  }
  const expiresAtMs = lastTime + 24 * 60 * 60 * 1000;
  const now = Date.now();
  const diffMs = expiresAtMs - now;
  const isWindowOpen = diffMs > 0;
  const remainingHours = isWindowOpen ? Number((diffMs / (1000 * 60 * 60)).toFixed(2)) : 0;

  return {
    isWindowOpen,
    windowExpiresAt: new Date(expiresAtMs).toISOString(),
    remainingHours,
  };
};

export const isSessionWindowOpen = (lastCustomerMessageDate?: Date | string | null): boolean => {
  return checkSessionWindow(lastCustomerMessageDate).isWindowOpen;
};
