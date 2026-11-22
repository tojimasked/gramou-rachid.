import type { OrderStatus } from '../types.ts';

export const TRACKED_ORDERS_KEY = 'kr-tracked-orders-v1';
const TRACKED_ORDERS_EVENT = 'kr:tracked-orders-updated';

export interface OrderPushNotificationEvent {
  orderId: string;
  status: OrderStatus;
  title: string;
  body: string;
  updatedAt: string;
}

export type BrowserNotificationPermission =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

export function getNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function getTrackedOrderIds(): string[] {
  try {
    const raw = localStorage.getItem(TRACKED_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || '').trim())
      .filter((id) => /^[A-Za-z0-9_-]{3,40}$/.test(id))
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function addTrackedOrderIds(orderIds: string[]): string[] {
  const cleaned = orderIds
    .map((id) => String(id || '').trim())
    .filter((id) => /^[A-Za-z0-9_-]{3,40}$/.test(id));
  const merged = Array.from(new Set([...cleaned, ...getTrackedOrderIds()])).slice(0, 20);
  try {
    localStorage.setItem(TRACKED_ORDERS_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(TRACKED_ORDERS_EVENT, { detail: merged }));
  } catch {
    // Ignore storage errors
  }
  return merged;
}

export function subscribeTrackedOrderListChanges(
  callback: (ids: string[]) => void,
): () => void {
  const onCustom = (evt: Event) => {
    const custom = evt as CustomEvent<string[]>;
    callback(Array.isArray(custom.detail) ? custom.detail : getTrackedOrderIds());
  };
  const onStorage = (evt: StorageEvent) => {
    if (evt.key === TRACKED_ORDERS_KEY) {
      callback(getTrackedOrderIds());
    }
  };
  window.addEventListener(TRACKED_ORDERS_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(TRACKED_ORDERS_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function tryRegisterWebPushSubscription(orderIds: string[]): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) return false;
    const { publicKey } = (await keyRes.json()) as { publicKey?: string };
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const subJson = subscription.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderIds,
        subscription: subJson,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

export async function syncExistingPushSubscription(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  if (getNotificationPermission() !== 'granted') return;
  await tryRegisterWebPushSubscription(orderIds);
}

export async function enableOrderPushNotifications(orderIds: string[]): Promise<{
  ok: boolean;
  permission: BrowserNotificationPermission;
  mode: 'web-push' | 'live-browser' | 'none';
  message: string;
}> {
  const mergedIds = addTrackedOrderIds(orderIds);
  const currentPerm = getNotificationPermission();

  if (currentPerm === 'unsupported') {
    return {
      ok: true,
      permission: 'unsupported',
      mode: 'live-browser',
      message: 'متصفحك سيستقبل تنبيهات حالة الطلب مباشرة داخل الموقع عند تحديثها.',
    };
  }

  let finalPerm: NotificationPermission;
  try {
    finalPerm =
      currentPerm === 'default' ? await Notification.requestPermission() : currentPerm;
  } catch {
    finalPerm = 'denied';
  }

  if (finalPerm !== 'granted') {
    return {
      ok: false,
      permission: finalPerm,
      mode: 'none',
      message:
        'تم حظر إذن الإشعارات في المتصفح. يمكنك تفعيله من إعدادات الموقع بجانب شريط العنوان.',
    };
  }

  const webPushOk = mergedIds.length > 0 ? await tryRegisterWebPushSubscription(mergedIds) : false;

  return {
    ok: true,
    permission: 'granted',
    mode: webPushOk ? 'web-push' : 'live-browser',
    message: webPushOk
      ? 'تم تفعيل تنبيهات المتصفح بنجاح! سيصلك إشعار فوري عند تحديث حالة طلبك حتى في الخلفية.'
      : 'تم تفعيل تنبيهات المتصفح! سيصلك إشعار فوري بمجرد تحديث حالة طلبك.',
  };
}

export async function showBrowserOrderNotification(
  payload: OrderPushNotificationEvent,
): Promise<void> {
  if (getNotificationPermission() !== 'granted') return;

  const options: NotificationOptions = {
    body: payload.body,
    dir: 'rtl',
    lang: 'ar',
    tag: `kr-order-${payload.orderId}`,
  };

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (reg && reg.active) {
        await reg.showNotification(payload.title, {
          ...options,
          data: { orderId: payload.orderId, url: `/?track=${encodeURIComponent(payload.orderId)}` },
        });
        return;
      }
    } catch {
      // Fallback to direct Window Notification API
    }
  }

  try {
    const notification = new Notification(payload.title, options);
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore
      }
      notification.close();
    };
  } catch {
    // Ignore if blocked in restricted context
  }
}
