import { useState, type FormEvent } from 'react';
import { Bell, BellRing, CheckCircle2, Mail, MessageCircle, X } from 'lucide-react';
import type { CartEntry, Order, Product } from '../types.ts';
import { calcVariantPrice } from '../data/products.ts';
import {
  addTrackedOrderIds,
  enableOrderPushNotifications,
  getNotificationPermission,
  syncExistingPushSubscription,
  type BrowserNotificationPermission,
} from '../lib/notifications.ts';
import { getDeviceProfile } from '../lib/device.ts';
import { ReceiptPreviewCard } from './ReceiptPreviewCard.tsx';

interface CheckoutModalProps {
  open: boolean;
  items: CartEntry[];
  products: Product[];
  visitorId?: string;
  onClose: () => void;
  onOrderSuccess: (order: Order) => void;
}

export function CheckoutModal({
  open,
  items,
  products,
  visitorId,
  onClose,
  onOrderSuccess,
}: CheckoutModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [notifPermission, setNotifPermission] = useState<BrowserNotificationPermission>(
    getNotificationPermission,
  );
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [enablingNotif, setEnablingNotif] = useState(false);

  if (!open) return null;

  const subtotal = items.reduce((sum, entry) => {
    const product = products.find((p) => p.id === entry.productId);
    if (!product) return sum;
    const size = product.sizes[entry.sizeIndex] || product.sizes[product.defaultSizeIndex];
    return sum + calcVariantPrice(product.basePrice, size.multiplier) * entry.quantity;
  }, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const profile = await getDeviceProfile();
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          address,
          notes,
          visitorId,
          device: profile.device,
          deviceName: profile.deviceName,
          os: profile.os,
          browser: profile.browser,
          screenSize: profile.screenSize,
          timezone: profile.timezone,
          language: profile.language,
          items,
          deferNotifications: true,
        }),
      });

      const data = (await response.json()) as { order?: Order; error?: string };
      if (!response.ok || !data.order) {
        setError(data.error || 'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.');
        return;
      }

      setConfirmedOrder(data.order);
      onOrderSuccess(data.order);
      addTrackedOrderIds([data.order.id]);
      const perm = getNotificationPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        void syncExistingPushSubscription([data.order.id]);
      }
      setName('');
      setPhone('');
      setAddress('');
      setNotes('');
    } catch {
      setError('حدث خطأ في الاتصال بالخادم. يرجى التحقق من الإنترنت والمحاولة مجددًا.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnableNotifications() {
    if (!confirmedOrder) return;
    setEnablingNotif(true);
    setNotifFeedback(null);
    const result = await enableOrderPushNotifications([confirmedOrder.id]);
    setNotifPermission(result.permission);
    setNotifFeedback(result.message);
    setEnablingNotif(false);
  }

  function handleClose() {
    setConfirmedOrder(null);
    setError(null);
    setNotifFeedback(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="إتمام الطلب"
    >
      <div
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[#6b5420] bg-[#100e0a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2f2817] px-6 py-4">
          <h2 className="font-display text-xl font-bold text-[#f4ecd8]">
            {confirmedOrder ? `تم تسجيل الطلب #${confirmedOrder.id}` : 'بيانات التوصيل'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-[#a99d83] hover:bg-[#1c1810] hover:text-[#f4ecd8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmedOrder ? (
          <div className="space-y-5 p-6">
            <div className="flex items-start gap-3 rounded-xl border border-[#4a3a14] bg-[#13110c] p-4">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#e9c565]" />
              <div>
                <div className="font-semibold text-[#f4ecd8]">
                  شكرًا لك {confirmedOrder.customer.name}، تم حفظ طلبك في النظام بنجاح.
                </div>
                <p className="mt-1 text-xs text-[#a99d83]">
                  رقم الطلب: <span className="font-semibold text-[#e9c565]">{confirmedOrder.id}</span> · الدفع عند الاستلام ({confirmedOrder.total} درهم)
                </p>
              </div>
            </div>

            <ReceiptPreviewCard
              order={confirmedOrder}
              whatsappHref={confirmedOrder.whatsappUrl}
              whatsappButtonLabel="أرسل تأكيد الطلب الآن عبر واتساب"
              receiptPageUrl={confirmedOrder.receiptPageUrl}
              deferNotification={true}
              onUploaded={(urls) => {
                if (urls.order) {
                  setConfirmedOrder(urls.order);
                }
              }}
            />

            <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {notifPermission === 'granted' ? (
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#e9c565]" />
                  ) : (
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#d4a537]" />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-[#f4ecd8]">
                      تنبيهات المتصفح لحالة الطلب #{confirmedOrder.id}
                    </div>
                    <p className="mt-0.5 text-xs text-[#a99d83]">
                      {notifPermission === 'granted'
                        ? 'مفعّلة — ستصلك رسالة فورية فور تجهيز الطلب أو خروجه للتوصيل.'
                        : 'احصل على إشعار فوري في متصفحك بمجرد تحديث حالة طلبك من قبل المتجر.'}
                    </p>
                  </div>
                </div>

                {notifPermission !== 'granted' && (
                  <button
                    type="button"
                    disabled={enablingNotif}
                    onClick={handleEnableNotifications}
                    className="whitespace-nowrap rounded-lg border border-[#d4a537]/70 px-3.5 py-2 text-xs font-semibold text-[#e9c565] transition-colors hover:bg-[#d4a537]/10 disabled:opacity-50"
                  >
                    {enablingNotif ? 'جارٍ التفعيل…' : 'تفعيل التنبيهات'}
                  </button>
                )}
              </div>
              {notifFeedback && (
                <p className="mt-2 text-xs text-[#e9c565]">{notifFeedback}</p>
              )}
            </div>

            <div className="space-y-2 text-xs text-[#a99d83]">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-[#e9c565]" />
                <span>
                  {confirmedOrder.delivery.email.sent
                    ? `تم إرسال نسخة الطلب وصورة الوصل إلى بريد المتجر (${confirmedOrder.delivery.email.destination}).`
                    : confirmedOrder.delivery.email.message}
                </span>
              </div>
              {confirmedOrder.delivery.whatsappApi.sent && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 shrink-0 text-[#25d366]" />
                  <span>{confirmedOrder.delivery.whatsappApi.message}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-lg border border-[#2f2817] px-5 py-2.5 text-sm font-medium text-[#f4ecd8] hover:border-[#d4a537]"
            >
              العودة إلى المتجر
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4 p-6">
            {error && (
              <div className="rounded-lg border border-red-700/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <label className="grid gap-1.5 text-sm text-[#a99d83]">
              <span>الاسم الكامل</span>
              <input
                type="text"
                required
                minLength={3}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: أمين العلمي"
                className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-[#a99d83]">
              <span>رقم الهاتف (واتساب)</span>
              <input
                type="tel"
                required
                dir="ltr"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0612345678"
                className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-right text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-[#a99d83]">
              <span>العنوان في الدار البيضاء أو المدينة</span>
              <input
                type="text"
                required
                minLength={5}
                autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="الحي، الشارع، رقم العمارة…"
                className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-[#a99d83]">
              <span>ملاحظات إضافية (اختياري)</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="وقت التوصيل المفضل أو طلب تغليف هدية…"
                className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-between rounded-xl border border-[#2f2817] bg-[#0c0a07] px-4 py-3 text-sm">
              <span className="text-[#a99d83]">مجموع الطلب (الدفع عند الاستلام)</span>
              <span className="text-lg font-bold tabular-nums text-[#e9c565]">{subtotal} درهم</span>
            </div>

            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="gold-fill w-full rounded-lg px-5 py-3 text-sm font-semibold text-[#120e05] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'جاري تسجيل الطلب وإرساله…' : 'تأكيد الطلب وإرساله'}
            </button>

            <p className="text-xs text-[#a99d83]">
              يتم حفظ الطلب في الخادم وإشعار المتجر عبر البريد الإلكتروني وتجهيز رسالة واتساب فورية.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
