import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Check,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import type {
  AdminStoreSettings,
  InventoryItem,
  LowStockAlert,
  Order,
  OrderStatus,
} from '../types.ts';
import { ReceiptPreviewCard } from './ReceiptPreviewCard.tsx';
import { MonthlySalesDashboard } from './MonthlySalesDashboard.tsx';

interface AdminDashboardModalProps {
  open: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: 'new', label: 'طلب جديد' },
  { value: 'preparing', label: 'قيد التحضير' },
  { value: 'shipped', label: 'في التوصيل' },
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'cancelled', label: 'ملغى' },
];

export function AdminDashboardModal({
  open,
  onClose,
  onConfigUpdated,
}: AdminDashboardModalProps) {
  const [tab, setTab] = useState<'orders' | 'analytics' | 'inventory' | 'settings'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low'>('all');
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [updatingProductId, setUpdatingProductId] = useState<number | null>(null);
  const [sendingAlert, setSendingAlert] = useState(false);

  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [hasSmtpPass, setHasSmtpPass] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappCloudToken, setWhatsappCloudToken] = useState('');
  const [hasWhatsappToken, setHasWhatsappToken] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, invRes] = await Promise.all([
        fetch('/api/admin/orders'),
        fetch('/api/admin/inventory'),
      ]);

      if (ordersRes.ok) {
        const data = (await ordersRes.json()) as {
          orders: Order[];
          settings: AdminStoreSettings;
        };
        setOrders(data.orders || []);
        if (data.settings) {
          setOwnerEmail(data.settings.ownerEmail || '');
          setOwnerWhatsapp(data.settings.ownerWhatsapp || '');
          setSmtpHost(data.settings.smtpHost || 'smtp.gmail.com');
          setSmtpPort(String(data.settings.smtpPort || 587));
          setSmtpUser(data.settings.smtpUser || '');
          setSmtpFrom(data.settings.smtpFrom || '');
          setHasSmtpPass(data.settings.hasSmtpPass);
          setWhatsappPhoneNumberId(data.settings.whatsappPhoneNumberId || '');
          setHasWhatsappToken(data.settings.hasWhatsappToken);
        }
      }

      if (invRes.ok) {
        const invData = (await invRes.json()) as {
          items: InventoryItem[];
          alerts: LowStockAlert[];
        };
        setInventory(invData.items || []);
        setAlerts(invData.alerts || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setFeedback(null);
      loadAdminData();
    }
  }, [open, loadAdminData]);

  if (!open) return null;

  const lowStockItems = inventory.filter((item) => item.stock <= item.lowStockThreshold);
  const unackedAlerts = alerts.filter((a) => !a.acknowledged);
  const filteredInventory = inventory.filter((item) => {
    const matchesLow = inventoryFilter === 'all' || item.stock <= item.lowStockThreshold;
    const q = inventoryQuery.trim();
    const matchesQuery = !q || `${item.productName} ${item.category}`.includes(q);
    return matchesLow && matchesQuery;
  });

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o)),
      );
    }
  }

  async function handleInventoryUpdate(
    productId: number,
    patch: { stock?: number; lowStockThreshold?: number },
  ) {
    setUpdatingProductId(productId);
    try {
      const res = await fetch(`/api/admin/inventory/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as {
        items?: InventoryItem[];
        alerts?: LowStockAlert[];
        triggeredAlerts?: LowStockAlert[];
        error?: string;
      };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error || 'تعذر تحديث كمية المنتج.' });
        return;
      }
      if (data.items) setInventory(data.items);
      if (data.alerts) setAlerts(data.alerts);
      if (data.triggeredAlerts && data.triggeredAlerts.length > 0) {
        const triggered = data.triggeredAlerts[0];
        setFeedback({
          ok: true,
          text: `⚠️ تنبيه مخزون منخفض لمنتج «${triggered.productName}» (المتبقي: ${triggered.stock})${
            triggered.emailSent ? ' — تم إرسال بريد تنبيهي تلقائيًا.' : '.'
          }`,
        });
      }
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function handleSendLowStockAlert(productId?: number) {
    setSendingAlert(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/inventory/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeof productId === 'number' ? { productId } : {}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        alerts?: LowStockAlert[];
      };
      if (data.alerts) setAlerts(data.alerts);
      setFeedback({
        ok: Boolean(data.ok),
        text: data.message || 'تم إرسال تنبيه المخزون.',
      });
    } catch {
      setFeedback({ ok: false, text: 'تعذر إرسال تنبيه المخزون.' });
    } finally {
      setSendingAlert(false);
    }
  }

  async function handleAcknowledgeAlert(alertId: string) {
    const res = await fetch(
      `/api/admin/inventory/alerts/${encodeURIComponent(alertId)}/ack`,
      { method: 'PATCH' },
    );
    if (res.ok) {
      const data = (await res.json()) as { alerts: LowStockAlert[] };
      setAlerts(data.alerts);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerEmail,
          ownerWhatsapp,
          smtpHost,
          smtpPort: Number(smtpPort) || 587,
          smtpUser,
          smtpPass: smtpPass || undefined,
          smtpFrom,
          whatsappPhoneNumberId,
          whatsappCloudToken: whatsappCloudToken || undefined,
        }),
      });
      const data = (await res.json()) as { settings?: AdminStoreSettings };
      if (res.ok && data.settings) {
        setHasSmtpPass(data.settings.hasSmtpPass);
        setHasWhatsappToken(data.settings.hasWhatsappToken);
        setSmtpPass('');
        setWhatsappCloudToken('');
        onConfigUpdated();
        setFeedback({
          ok: true,
          text: 'تم حفظ إعدادات البريد الإلكتروني ورقم الواتساب بنجاح.',
        });
      } else {
        setFeedback({ ok: false, text: 'تعذر حفظ الإعدادات.' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTestingEmail(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; message: string };
      setFeedback({ ok: data.ok, text: data.message });
    } catch {
      setFeedback({ ok: false, text: 'حدث خطأ أثناء اختبار البريد الإلكتروني.' });
    } finally {
      setTestingEmail(false);
    }
  }

  const latestAlertWhatsappUrl =
    unackedAlerts[0]?.whatsappUrl ||
    alerts[0]?.whatsappUrl ||
    `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(
      `⚠️ تنبيه مخزون منخفض — متجر كرامو راشد:\n${lowStockItems
        .map((it) => `• ${it.productName}: المتبقي ${it.stock} (الحد الأدنى ${it.lowStockThreshold})`)
        .join('\n')}`,
    )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="لوحة التاجر وإدارة الطلبات والمخزون"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl border border-[#6b5420] bg-[#100e0a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2f2817] px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="font-display text-xl font-bold text-[#f4ecd8]">
              لوحة التاجر والطلبات
            </h2>
            <div className="flex flex-wrap gap-1 rounded-lg bg-[#18150e] p-1">
              <button
                type="button"
                onClick={() => setTab('orders')}
                className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tab === 'orders'
                    ? 'bg-[#d4a537] text-[#120e05]'
                    : 'text-[#a99d83] hover:text-[#f4ecd8]'
                }`}
              >
                الطلبات ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('analytics')}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tab === 'analytics'
                    ? 'bg-[#d4a537] text-[#120e05]'
                    : 'text-[#a99d83] hover:text-[#f4ecd8]'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>لوحة البيانات</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('inventory')}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tab === 'inventory'
                    ? 'bg-[#d4a537] text-[#120e05]'
                    : 'text-[#a99d83] hover:text-[#f4ecd8]'
                }`}
              >
                <span>المخزون والتنبيهات</span>
                {lowStockItems.length > 0 && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                      tab === 'inventory'
                        ? 'bg-[#120e05] text-amber-300'
                        : 'bg-amber-950/80 text-amber-300'
                    }`}
                  >
                    {lowStockItems.length} منخفض
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab('settings')}
                className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tab === 'settings'
                    ? 'bg-[#d4a537] text-[#120e05]'
                    : 'text-[#a99d83] hover:text-[#f4ecd8]'
                }`}
              >
                إعدادات البريد والواتساب
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAdminData}
              aria-label="تحديث"
              className="rounded-lg border border-[#2f2817] p-2 text-[#a99d83] hover:border-[#d4a537] hover:text-[#f4ecd8]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="rounded-lg p-1.5 text-[#a99d83] hover:bg-[#1c1810] hover:text-[#f4ecd8]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {lowStockItems.length > 0 && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-700/70 bg-amber-950/35 px-4 py-3 text-sm text-amber-100"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
                <div>
                  <span className="font-semibold">
                    تنبيه مخزون منخفض: {lowStockItems.length} منتج وصل للحد الأدنى
                  </span>
                  <span className="mr-2 text-xs text-amber-200/80">
                    ({lowStockItems.slice(0, 3).map((i) => i.productName).join('، ')}
                    {lowStockItems.length > 3 ? '…' : ''})
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {tab !== 'inventory' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('inventory');
                      setInventoryFilter('low');
                    }}
                    className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10"
                  >
                    عرض المخزون المنخفض
                  </button>
                )}
                <a
                  href={latestAlertWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-[#07210f] hover:brightness-105"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>إرسال تنبيه واتساب</span>
                </a>
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                feedback.ok
                  ? 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200'
                  : 'border-red-700/60 bg-red-950/35 text-red-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {tab === 'orders' ? (
            orders.length === 0 ? (
              <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-12 text-center text-sm text-[#a99d83]">
                لا توجد طلبات مسجلة بعد. عند إرسال أي عميل لطلب جديد، سيظهر هنا فورًا مع خصم الكمية تلقائيًا من المخزون.
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="space-y-3 rounded-xl border border-[#2f2817] bg-[#13110c] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-lg font-bold text-[#e9c565]">
                          #{order.id}
                        </span>
                        <span className="text-xs text-[#a99d83]">
                          {new Date(order.createdAt).toLocaleString('ar-MA')}
                        </span>
                      </div>
                      <select
                        value={order.status}
                        onChange={(e) =>
                          handleStatusChange(order.id, e.target.value as OrderStatus)
                        }
                        aria-label={`تغيير حالة الطلب ${order.id}`}
                        className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-1.5 text-xs text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <span className="text-xs text-[#a99d83]">العميل: </span>
                        <span className="font-medium text-[#f4ecd8]">{order.customer.name}</span>
                      </div>
                      <div>
                        <span className="text-xs text-[#a99d83]">الهاتف: </span>
                        <span dir="ltr" className="font-medium text-[#f4ecd8]">
                          {order.customer.phone}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-[#a99d83]">العنوان: </span>
                        <span className="text-[#f4ecd8]">{order.customer.address}</span>
                      </div>
                    </div>

                    <div className="space-y-1 border-t border-[#2f2817] pt-3 text-xs text-[#a99d83]">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {item.productName} ({item.sizeLabel}) × {item.quantity}
                          </span>
                          <span className="tabular-nums text-[#e9c565]">{item.lineTotal} درهم</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-1.5 text-sm font-bold text-[#f4ecd8]">
                        <span>المجموع</span>
                        <span className="tabular-nums text-[#e9c565]">{order.total} درهم</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2f2817] pt-3 text-xs">
                      <div className="flex flex-wrap items-center gap-4 text-[#a99d83]">
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-[#e9c565]" />
                          {order.delivery.email.sent ? (
                            <span className="text-emerald-300">
                              أُرسل للبريد ({order.delivery.email.destination})
                            </span>
                          ) : (
                            <span>البريد: {order.delivery.email.message}</span>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiptOrder(order)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4a537]/70 px-3 py-1.5 font-semibold text-[#e9c565] hover:bg-[#d4a537]/10"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          <span>صورة وصل التوصيل</span>
                        </button>

                        <a
                          href={
                            order.customerWhatsappUrl ||
                            `https://wa.me/${order.customer.phone.replace(/^0/, '212').replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                              `مرحبًا ${order.customer.name}، تأكيد طلبك #${order.id} من متجر كرامو راشد (${order.total} درهم)${order.receiptPageUrl ? `\nصورة الوصل: ${order.receiptPageUrl}` : ''}`,
                            )}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] px-3 py-1.5 font-semibold text-[#07210f] hover:brightness-105"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>تحقق واتساب للعميل</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'analytics' ? (
            <MonthlySalesDashboard orders={orders} />
          ) : tab === 'inventory' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2f2817] bg-[#13110c] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInventoryFilter('all')}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      inventoryFilter === 'all'
                        ? 'bg-[#d4a537] text-[#120e05]'
                        : 'bg-[#18150e] text-[#a99d83] hover:text-[#f4ecd8]'
                    }`}
                  >
                    كل المنتجات ({inventory.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryFilter('low')}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      inventoryFilter === 'low'
                        ? 'bg-amber-400 text-[#120e05]'
                        : 'bg-[#18150e] text-amber-300 hover:bg-[#1f1a10]'
                    }`}
                  >
                    مخزون منخفض ({lowStockItems.length})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={inventoryQuery}
                    onChange={(e) => setInventoryQuery(e.target.value)}
                    placeholder="ابحث عن منتج…"
                    aria-label="ابحث في المخزون"
                    className="w-48 rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-1.5 text-xs text-[#f4ecd8] placeholder:text-[#a99d83]/70 focus:border-[#d4a537] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={sendingAlert || lowStockItems.length === 0}
                    onClick={() => handleSendLowStockAlert()}
                    className="gold-fill inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-[#120e05] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    <span>{sendingAlert ? 'جاري الإرسال…' : 'إرسال تنبيه الآن'}</span>
                  </button>
                </div>
              </div>

              {unackedAlerts.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="font-display text-base font-bold text-[#e9c565]">
                    سجل تنبيهات انخفاض المخزون ({unackedAlerts.length})
                  </h3>
                  <div className="space-y-2">
                    {unackedAlerts.slice(0, 6).map((alert) => (
                      <div
                        key={alert.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-700/50 bg-[#17120a] px-4 py-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-semibold text-[#f4ecd8]">
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                            <span>{alert.productName}</span>
                            <span className="tabular-nums text-amber-300">
                              (المتبقي: {alert.stock} / حد التنبيه: {alert.threshold})
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[#a99d83]">
                            <span>{new Date(alert.createdAt).toLocaleString('ar-MA')}</span>
                            <span>·</span>
                            <span>
                              {alert.emailSent
                                ? 'أُرسل التنبيه بالبريد'
                                : alert.emailMessage || 'تنبيه مسجّل'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={alert.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-[#25d366] px-2.5 py-1.5 font-semibold text-[#07210f] hover:brightness-105"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>واتساب</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#2f2817] px-2.5 py-1.5 text-[#f4ecd8] hover:border-[#d4a537]"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>تمت المراجعة</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[#a99d83]">
                  <span>
                    انقر على (− / +) أو عدّل الكمية لإدارة المخزون — يتم إرسال تنبيه تلقائي فور وصول أي منتج إلى حد التنبيه أو أدنى.
                  </span>
                </div>

                {filteredInventory.length === 0 ? (
                  <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-8 text-center text-sm text-[#a99d83]">
                    لا توجد منتجات مطابقة في هذا العرض.
                  </div>
                ) : (
                  <div className="divide-y divide-[#2f2817] overflow-hidden rounded-xl border border-[#2f2817] bg-[#13110c]">
                    {filteredInventory.map((item) => {
                      const isOut = item.stock === 0;
                      const isLow = item.stock > 0 && item.stock <= item.lowStockThreshold;
                      const busy = updatingProductId === item.productId;

                      return (
                        <div
                          key={item.productId}
                          className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5"
                        >
                          <div className="min-w-[200px] flex-1">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 shrink-0 text-[#d4a537]" aria-hidden="true" />
                              <span className="font-semibold text-[#f4ecd8]">{item.productName}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#a99d83]">
                              <span>{item.category}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`font-semibold ${
                                  isOut
                                    ? 'text-red-400'
                                    : isLow
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                }`}
                              >
                                {isOut
                                  ? 'نفد من المخزون'
                                  : isLow
                                    ? 'مخزون منخفض'
                                    : 'متوفر'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2 text-xs text-[#a99d83]">
                              <span>الكمية:</span>
                              <div className="inline-flex items-center rounded-lg border border-[#2f2817] bg-[#0c0a07] p-0.5">
                                <button
                                  type="button"
                                  disabled={busy || item.stock <= 0}
                                  aria-label={`إنقاص مخزون ${item.productName}`}
                                  onClick={() =>
                                    handleInventoryUpdate(item.productId, {
                                      stock: Math.max(0, item.stock - 1),
                                    })
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#f4ecd8] hover:bg-[#1c1810] disabled:opacity-35"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={9999}
                                  dir="ltr"
                                  aria-label={`كمية ${item.productName}`}
                                  value={item.stock}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                    setInventory((prev) =>
                                      prev.map((p) =>
                                        p.productId === item.productId ? { ...p, stock: val } : p,
                                      ),
                                    );
                                  }}
                                  onBlur={(e) => {
                                    const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                    handleInventoryUpdate(item.productId, { stock: val });
                                  }}
                                  className="w-12 bg-transparent text-center text-xs font-bold tabular-nums text-[#e9c565] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-label={`زيادة مخزون ${item.productName}`}
                                  onClick={() =>
                                    handleInventoryUpdate(item.productId, {
                                      stock: item.stock + 1,
                                    })
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#f4ecd8] hover:bg-[#1c1810] disabled:opacity-35"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <label className="flex items-center gap-1.5 text-xs text-[#a99d83]">
                              <span>حد التنبيه:</span>
                              <input
                                type="number"
                                min={0}
                                max={999}
                                dir="ltr"
                                value={item.lowStockThreshold}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                  setInventory((prev) =>
                                    prev.map((p) =>
                                      p.productId === item.productId
                                        ? { ...p, lowStockThreshold: val }
                                        : p,
                                    ),
                                  );
                                }}
                                onBlur={(e) => {
                                  const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                  handleInventoryUpdate(item.productId, {
                                    lowStockThreshold: val,
                                  });
                                }}
                                className="w-14 rounded-lg border border-[#2f2817] bg-[#0c0a07] px-2 py-1 text-center text-xs font-semibold tabular-nums text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                              />
                            </label>

                            {(isLow || isOut) && (
                              <button
                                type="button"
                                disabled={sendingAlert}
                                onClick={() => handleSendLowStockAlert(item.productId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/60 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
                              >
                                <BellRing className="h-3.5 w-3.5" />
                                <span>إرسال تنبيه</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-[#a99d83]">
                  <span>البريد الإلكتروني لاستلام الطلبات والتنبيهات</span>
                  <input
                    type="email"
                    dir="ltr"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="your-email@gmail.com"
                    className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-left text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                  />
                </label>

                <label className="grid gap-1.5 text-sm text-[#a99d83]">
                  <span>رقم واتساب المتجر (بصيغة دولية بدون +)</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={ownerWhatsapp}
                    onChange={(e) => setOwnerWhatsapp(e.target.value)}
                    placeholder="212612345678"
                    className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-left text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                  />
                </label>
              </div>

              <div className="space-y-4 rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                <div>
                  <h3 className="font-display text-base font-bold text-[#e9c565]">
                    إعدادات إرسال البريد التلقائي (SMTP / Gmail)
                  </h3>
                  <p className="mt-1 text-xs text-[#a99d83]">
                    لإرسال الطلبات وتنبيهات المخزون تلقائيًا إلى بريدك عبر Gmail، استخدم بريدك في خانة المستخدم وكلمة مرور التطبيقات (App Password) من إعدادات أمان Google.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs text-[#a99d83]">
                    <span>خادم SMTP</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-2 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-[#a99d83]">
                    <span>المنفذ (Port)</span>
                    <input
                      type="number"
                      dir="ltr"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-2 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-[#a99d83]">
                    <span>حساب SMTP (البريد المرسل)</span>
                    <input
                      type="email"
                      dir="ltr"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="your-email@gmail.com"
                      className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-2 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-[#a99d83]">
                    <span>
                      كلمة مرور SMTP / App Password{' '}
                      {hasSmtpPass && <span className="text-emerald-400">(محفوظة)</span>}
                    </span>
                    <input
                      type="password"
                      dir="ltr"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder={hasSmtpPass ? '••••••••••••' : 'أدخل كلمة مرور التطبيق'}
                      className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-2 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                <div>
                  <h3 className="font-display text-base font-bold text-[#e9c565]">
                    إرسال واتساب تلقائي في الخلفية (Meta WhatsApp Cloud API — اختياري)
                  </h3>
                  <p className="mt-1 text-xs text-[#a99d83]">
                    بدون هذا الربط، يتم فتح واتساب مباشرة للعميل برسالة الطلب الجاهزة إلى رقمك. عند إضافة بيانات Meta Cloud API، يرسل الخادم رسالة فورية إلى واتسابك في الخلفية أيضًا.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs text-[#a99d83]">
                    <span>Phone Number ID</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={whatsappPhoneNumberId}
                      onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                      placeholder="مثال: 1092837465..."
                      className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-2 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-[#a99d83]">
                    <span>
                      Access Token{' '}
                      {hasWhatsappToken && <span className="text-emerald-400">(محفوظ)</span>}
                    </span>
                    <input
                      type="password"
                      dir="ltr"
                      value={whatsappCloudToken}
                      onChange={(e) => setWhatsappCloudToken(e.target.value)}
                      placeholder={hasWhatsappToken ? '••••••••••••' : 'EAAG...'}
                      className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-2 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="gold-fill inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-[#120e05] hover:brightness-105 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{saving ? 'جاري الحفظ…' : 'حفظ الإعدادات'}</span>
                </button>

                <button
                  type="button"
                  disabled={testingEmail}
                  onClick={handleTestEmail}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#d4a537]/70 px-5 py-2.5 text-sm font-medium text-[#e9c565] hover:bg-[#d4a537]/10 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>{testingEmail ? 'جاري الإرسال…' : 'إرسال بريد تجريبي'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {receiptOrder && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setReceiptOrder(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`صورة وصل التوصيل #${receiptOrder.id}`}
        >
          <div
            className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-2xl border border-[#6b5420] bg-[#100e0a]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2f2817] px-6 py-4">
              <h3 className="font-display text-lg font-bold text-[#e9c565]">
                وصل التوصيل #{receiptOrder.id}
              </h3>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                aria-label="إغلاق"
                className="rounded-lg p-1.5 text-[#a99d83] hover:bg-[#1c1810] hover:text-[#f4ecd8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <ReceiptPreviewCard
                order={receiptOrder}
                whatsappHref={
                  receiptOrder.customerWhatsappUrl ||
                  `https://wa.me/${receiptOrder.customer.phone.replace(/^0/, '212').replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                    `مرحبًا ${receiptOrder.customer.name}، تأكيد طلبك #${receiptOrder.id} من متجر كرامو راشد (${receiptOrder.total} درهم)${receiptOrder.receiptPageUrl ? `\nصورة الوصل: ${receiptOrder.receiptPageUrl}` : ''}`,
                  )}`
                }
                whatsappButtonLabel="إرسال التحقق للعميل عبر واتساب"
                receiptPageUrl={receiptOrder.receiptPageUrl}
                onUploaded={(urls) => {
                  if (urls.order) {
                    const updated = urls.order;
                    setReceiptOrder(updated);
                    setOrders((prev) =>
                      prev.map((o) => (o.id === updated.id ? updated : o)),
                    );
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
