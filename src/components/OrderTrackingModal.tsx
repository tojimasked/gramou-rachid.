import { useEffect, useState, type FormEvent } from 'react';
import { Bell, BellRing, Image as ImageIcon, Search, X } from 'lucide-react';
import type { OrderItem, OrderStatus } from '../types.ts';
import {
  addTrackedOrderIds,
  enableOrderPushNotifications,
  getNotificationPermission,
  getTrackedOrderIds,
  syncExistingPushSubscription,
  type BrowserNotificationPermission,
  type OrderPushNotificationEvent,
} from '../lib/notifications.ts';
import { ReceiptPreviewCard } from './ReceiptPreviewCard.tsx';

interface TrackedOrder {
  id: string;
  createdAt: string;
  status: OrderStatus;
  customer: {
    name: string;
    phone: string;
    address: string;
    notes?: string;
  };
  items: OrderItem[];
  total: number;
  freeShipping: boolean;
  whatsappUrl: string;
  receiptImageUrl?: string;
  receiptPageUrl?: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'طلب جديد — قيد المراجعة',
  preparing: 'قيد التحضير والتعبئة',
  shipped: 'خرج مع الموزع للتوصيل',
  delivered: 'تم التوصيل بنجاح',
  cancelled: 'ملغى',
};

interface OrderTrackingModalProps {
  open: boolean;
  initialQuery?: string;
  latestStatusEvent?: OrderPushNotificationEvent | null;
  onClose: () => void;
}

export function OrderTrackingModal({
  open,
  initialQuery,
  latestStatusEvent,
  onClose,
}: OrderTrackingModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TrackedOrder[] | null>(null);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<BrowserNotificationPermission>(
    getNotificationPermission,
  );
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [enablingNotif, setEnablingNotif] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNotifPermission(getNotificationPermission());
    setNotifMessage(null);
    if (initialQuery && !query) {
      setQuery(initialQuery);
      void runLookup(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  useEffect(() => {
    if (!latestStatusEvent) return;
    setResults((prev) =>
      prev
        ? prev.map((order) =>
            order.id === latestStatusEvent.orderId
              ? { ...order, status: latestStatusEvent.status }
              : order,
          )
        : prev,
    );
  }, [latestStatusEvent]);

  if (!open) return null;

  async function runLookup(searchValue: string) {
    const trimmed = searchValue.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setExpandedReceiptId(null);
    try {
      const res = await fetch(`/api/orders/track?q=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as { orders?: TrackedOrder[]; error?: string };
      if (!res.ok) {
        setError(data.error || 'تعذر البحث عن الطلب.');
        return;
      }
      const found = data.orders || [];
      setResults(found);
      if (found.length > 0) {
        const ids = found.map((o) => o.id);
        addTrackedOrderIds(ids);
        if (getNotificationPermission() === 'granted') {
          void syncExistingPushSubscription(ids);
        }
      }
    } catch {
      setError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await runLookup(query);
  }

  async function handleEnablePush() {
    const resultIds = results?.map((o) => o.id) ?? [];
    const targetIds = resultIds.length > 0 ? resultIds : getTrackedOrderIds();
    setEnablingNotif(true);
    setNotifMessage(null);
    const res = await enableOrderPushNotifications(targetIds);
    setNotifPermission(res.permission);
    setNotifMessage(res.message);
    setEnablingNotif(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="تتبّع طلبي"
    >
      <div
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[#6b5420] bg-[#100e0a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2f2817] px-6 py-4">
          <h2 className="font-display text-xl font-bold text-[#f4ecd8]">تتبّع طلبي</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-[#a99d83] hover:bg-[#1c1810] hover:text-[#f4ecd8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-[#a99d83]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="أدخل رقم الطلب (KR-1001) أو رقم الهاتف…"
                className="w-full rounded-lg border border-[#2f2817] bg-[#13110c] py-2.5 pr-10 pl-3 text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="gold-fill shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold text-[#120e05] hover:brightness-105 disabled:opacity-50"
            >
              {loading ? 'بحث…' : 'بحث'}
            </button>
          </form>

          <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                {notifPermission === 'granted' ? (
                  <BellRing className="h-4 w-4 shrink-0 text-[#e9c565]" />
                ) : (
                  <Bell className="h-4 w-4 shrink-0 text-[#d4a537]" />
                )}
                <span className="text-[#cbbd9f]">
                  {notifPermission === 'granted'
                    ? 'تنبيهات المتصفح مفعّلة لتحديثات الطلبات'
                    : 'فعّل تنبيهات المتصفح لتصلك تحديثات الطلب فورًا'}
                </span>
              </div>

              {notifPermission !== 'granted' && (
                <button
                  type="button"
                  disabled={enablingNotif}
                  onClick={handleEnablePush}
                  className="whitespace-nowrap rounded-lg border border-[#d4a537]/70 px-3 py-1.5 text-xs font-semibold text-[#e9c565] transition-colors hover:bg-[#d4a537]/10 disabled:opacity-50"
                >
                  {enablingNotif ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات'}
                </button>
              )}
            </div>
            {notifMessage && (
              <p className="mt-2 text-xs text-[#e9c565]">{notifMessage}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}

          {results !== null && results.length === 0 && (
            <p className="rounded-xl border border-[#2f2817] bg-[#13110c] p-6 text-center text-sm text-[#a99d83]">
              لم يتم العثور على طلبات مطابقة لـ «{query}».
            </p>
          )}

          {results && results.length > 0 && (
            <div className="space-y-4">
              {results.map((order) => {
                const isExpanded = expandedReceiptId === order.id;
                return (
                  <div
                    key={order.id}
                    className="space-y-3 rounded-xl border border-[#2f2817] bg-[#13110c] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-lg font-bold text-[#e9c565]">
                        #{order.id}
                      </span>
                      <span className="text-xs font-medium text-[#f4ecd8]">
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <div className="space-y-1 border-t border-[#2f2817] pt-2 text-xs text-[#a99d83]">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between">
                          <span>
                            {item.productName} ({item.sizeLabel}) × {item.quantity}
                          </span>
                          <span className="tabular-nums text-[#e9c565]">{item.lineTotal} درهم</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-[#2f2817] pt-2 text-sm font-bold">
                      <span>المجموع</span>
                      <span className="tabular-nums text-[#e9c565]">{order.total} درهم</span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedReceiptId(isExpanded ? null : order.id)
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#d4a537]/60 px-4 py-2 text-xs font-semibold text-[#e9c565] hover:bg-[#d4a537]/10"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>
                        {isExpanded ? 'إخفاء صورة الوصل' : 'عرض وتحميل صورة وصل التوصيل'}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="pt-2">
                        <ReceiptPreviewCard
                          order={order}
                          whatsappHref={order.whatsappUrl}
                          whatsappButtonLabel="إرسال الطلب عبر واتساب"
                          receiptPageUrl={order.receiptPageUrl}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

