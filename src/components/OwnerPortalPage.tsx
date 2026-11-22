import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  Check,
  Eye,
  Globe,
  Image as ImageIcon,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Monitor,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AdminStoreSettings,
  AnalyticsEventType,
  DeviceLocationSource,
  InventoryItem,
  LowStockAlert,
  Order,
  OrderStatus,
  OwnerAnalyticsSummary,
  OwnerAuthStatus,
  OwnerDailyAnalyticsPoint,
} from '../types.ts';
import { MonthlySalesDashboard } from './MonthlySalesDashboard.tsx';
import { ReceiptPreviewCard } from './ReceiptPreviewCard.tsx';

type PortalSection = 'traffic' | 'devices' | 'bestsellers' | 'orders' | 'inventory' | 'settings';

const LOCATION_SOURCE_LABELS: Record<DeviceLocationSource, string> = {
  order: 'من عنوان الطلب',
  proxy: 'من مزوّد الشبكة',
  ip: 'من الشبكة (IP)',
  timezone: 'من توقيت الجهاز',
};

const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: 'new', label: 'طلب جديد' },
  { value: 'preparing', label: 'قيد التحضير' },
  { value: 'shipped', label: 'في التوصيل' },
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'cancelled', label: 'ملغى' },
];

const EVENT_LABELS: Record<AnalyticsEventType, string> = {
  visit: 'زيارة المتجر',
  product_view: 'معاينة منتج',
  add_to_cart: 'إضافة للسلة',
  checkout_start: 'بدء إتمام الطلب',
  purchase: 'عملية شراء مكتملة',
};

function DailyTrafficTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: OwnerDailyAnalyticsPoint }>;
}) {
  const point = active && payload && payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-[#6b5420] bg-[#100e0a]/95 px-3.5 py-2.5 text-xs shadow-xl"
    >
      <div className="font-semibold text-[#e9c565]">{point.label}</div>
      <div className="mt-1.5 space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">الزيارات:</span>
          <span className="font-bold text-[#f4ecd8]">{point.visits}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">الزوار الفريدون:</span>
          <span className="text-[#f4ecd8]">{point.uniqueVisitors}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">الطلبات:</span>
          <span className="font-bold text-[#e9c565]">{point.orders}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">المبيعات:</span>
          <span className="font-bold text-[#e9c565]">{point.revenue} درهم</span>
        </div>
      </div>
    </div>
  );
}

export function OwnerPortalPage() {
  // Keep owner bearer token strictly in JS memory — never localStorage/sessionStorage
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<OwnerAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [section, setSection] = useState<PortalSection>('traffic');
  const [loadingData, setLoadingData] = useState(false);
  const [analytics, setAnalytics] = useState<OwnerAnalyticsSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low'>('all');
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'online' | 'mobile' | 'desktop' | 'buyers'>('all');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [updatingProductId, setUpdatingProductId] = useState<number | null>(null);
  const [sendingAlert, setSendingAlert] = useState(false);
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  useEffect(() => {
    document.title = 'بوابة المالك الخاصة | كرامو راشد';
  }, []);

  const authHeaders = useCallback(
    (activeToken: string | null): HeadersInit =>
      activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
    [],
  );

  const checkAuthStatus = useCallback(
    async (activeToken: string | null) => {
      setAuthLoading(true);
      try {
        const res = await fetch('/api/owner/auth/status', {
          headers: authHeaders(activeToken),
        });
        if (res.ok) {
          const data = (await res.json()) as OwnerAuthStatus;
          setAuthStatus(data);
        }
      } finally {
        setAuthLoading(false);
      }
    },
    [authHeaders],
  );

  const loadPortalData = useCallback(
    async (activeToken: string) => {
      setLoadingData(true);
      try {
        const headers = authHeaders(activeToken);
        const [analyticsRes, ordersRes, invRes] = await Promise.all([
          fetch('/api/owner/analytics', { headers }),
          fetch('/api/admin/orders', { headers }),
          fetch('/api/admin/inventory', { headers }),
        ]);

        if (
          analyticsRes.status === 401 ||
          ordersRes.status === 401 ||
          invRes.status === 401
        ) {
          setToken(null);
          setAuthStatus((prev) =>
            prev ? { ...prev, authenticated: false } : { configured: true, authenticated: false, envLocked: false },
          );
          return;
        }

        if (analyticsRes.ok) {
          const aData = (await analyticsRes.json()) as { analytics: OwnerAnalyticsSummary };
          setAnalytics(aData.analytics);
        }

        if (ordersRes.ok) {
          const oData = (await ordersRes.json()) as {
            orders: Order[];
            settings: AdminStoreSettings;
          };
          setOrders(oData.orders || []);
          if (oData.settings) {
            setOwnerEmail(oData.settings.ownerEmail || '');
            setOwnerWhatsapp(oData.settings.ownerWhatsapp || '');
            setSmtpHost(oData.settings.smtpHost || 'smtp.gmail.com');
            setSmtpPort(String(oData.settings.smtpPort || 587));
            setSmtpUser(oData.settings.smtpUser || '');
            setSmtpFrom(oData.settings.smtpFrom || '');
            setHasSmtpPass(oData.settings.hasSmtpPass);
            setWhatsappPhoneNumberId(oData.settings.whatsappPhoneNumberId || '');
            setHasWhatsappToken(oData.settings.hasWhatsappToken);
          }
        }

        if (invRes.ok) {
          const iData = (await invRes.json()) as {
            items: InventoryItem[];
            alerts: LowStockAlert[];
          };
          setInventory(iData.items || []);
          setAlerts(iData.alerts || []);
        }
      } finally {
        setLoadingData(false);
      }
    },
    [authHeaders],
  );

  useEffect(() => {
    checkAuthStatus(token);
  }, [checkAuthStatus, token]);

  useEffect(() => {
    if (token && authStatus?.authenticated) {
      loadPortalData(token);
    }
  }, [token, authStatus?.authenticated, loadPortalData]);

  useEffect(() => {
    if (!token || !authStatus?.authenticated) return;
    if (section !== 'traffic' && section !== 'devices') return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadPortalData(token);
      }
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [token, authStatus?.authenticated, section, loadPortalData]);

  async function handleSetupSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (passcodeInput.trim().length < 6) {
      setAuthError('يرجى إدخال رمز مرور من 6 أحرف على الأقل.');
      return;
    }
    if (passcodeInput !== confirmPasscode) {
      setAuthError('رمزا المرور غير متطابقين.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/owner/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'تعذر حفظ رمز المرور.');
        return;
      }
      setPasscodeInput('');
      setConfirmPasscode('');
      setToken(data.token);
      setAuthStatus({ configured: true, authenticated: true, envLocked: false });
    } catch {
      setAuthError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!passcodeInput.trim()) {
      setAuthError('أدخل رمز الدخول.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/owner/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'رمز الدخول غير صحيح.');
        return;
      }
      setPasscodeInput('');
      setToken(data.token);
      setAuthStatus((prev) =>
        prev ? { ...prev, authenticated: true } : { configured: true, authenticated: true, envLocked: false },
      );
    } catch {
      setAuthError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!token) return;
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      loadPortalData(token);
    }
  }

  async function handleInventoryUpdate(
    productId: number,
    patch: { stock?: number; lowStockThreshold?: number },
  ) {
    if (!token) return;
    setUpdatingProductId(productId);
    try {
      const res = await fetch(`/api/admin/inventory/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
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
          text: `تنبيه مخزون منخفض لمنتج «${triggered.productName}» (المتبقي: ${triggered.stock})`,
        });
      }
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function handleSendLowStockAlert(productId?: number) {
    if (!token) return;
    setSendingAlert(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/inventory/send-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
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
    if (!token) return;
    const res = await fetch(
      `/api/admin/inventory/alerts/${encodeURIComponent(alertId)}/ack`,
      { method: 'PATCH', headers: authHeaders(token) },
    );
    if (res.ok) {
      const data = (await res.json()) as { alerts: LowStockAlert[] };
      setAlerts(data.alerts);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingSettings(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
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
        setFeedback({
          ok: true,
          text: 'تم حفظ إعدادات البريد الإلكتروني ورقم الواتساب بنجاح.',
        });
      } else {
        setFeedback({ ok: false, text: 'تعذر حفظ الإعدادات.' });
      }
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleTestEmail() {
    if (!token) return;
    setTestingEmail(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: authHeaders(token),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setFeedback({ ok: data.ok, text: data.message });
    } catch {
      setFeedback({ ok: false, text: 'حدث خطأ أثناء اختبار البريد الإلكتروني.' });
    } finally {
      setTestingEmail(false);
    }
  }

  if (authLoading && !authStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090806] text-[#f4ecd8]">
        <div className="text-sm text-[#a99d83]">جاري التحقق من الجلسة…</div>
      </div>
    );
  }

  if (!token || !authStatus?.authenticated) {
    const needsSetup = authStatus ? !authStatus.configured : false;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090806] px-4 py-10 text-[#f4ecd8]">
        <div className="w-full max-w-[420px] rounded-2xl border border-[#4a3a14] bg-[#13110c] p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4a3a14] bg-[#18150e] text-[#e9c565]">
              {needsSetup ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-[#f4ecd8]">
                {needsSetup ? 'إعداد بوابة المالك الخاصة' : 'دخول المالك — كرامو راشد'}
              </h1>
              <p className="text-xs text-[#a99d83]">
                {needsSetup
                  ? 'أنشئ رمز مرور سري لحماية لوحة الزوار والمبيعات والطلبات'
                  : 'هذه الصفحة مخصصة لمالك المتجر فقط ومخفية عن العملاء'}
              </p>
            </div>
          </div>

          {authError && (
            <div className="mt-4 rounded-xl border border-red-700/60 bg-red-950/35 px-4 py-2.5 text-xs text-red-200">
              {authError}
            </div>
          )}

          {needsSetup ? (
            <form onSubmit={handleSetupSubmit} className="mt-6 space-y-4">
              <label className="grid gap-1.5 text-xs text-[#a99d83]">
                <span>رمز المرور الجديد (6 أحرف أو أرقام على الأقل)</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="••••••"
                  className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-4 py-2.5 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                />
              </label>

              <label className="grid gap-1.5 text-xs text-[#a99d83]">
                <span>تأكيد رمز المرور</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="••••••"
                  className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-4 py-2.5 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={authSubmitting}
                className="gold-fill w-full rounded-lg px-5 py-2.5 text-sm font-semibold text-[#120e05] hover:brightness-105 disabled:opacity-50"
              >
                {authSubmitting ? 'جاري الحفظ…' : 'حفظ الرمز والدخول للبوابة'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
              <label className="grid gap-1.5 text-xs text-[#a99d83]">
                <span>رمز دخول المالك</span>
                <input
                  type="password"
                  required
                  dir="ltr"
                  autoFocus
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="أدخل رمز الدخول…"
                  className="rounded-lg border border-[#2f2817] bg-[#0c0a07] px-4 py-2.5 text-left text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={authSubmitting}
                className="gold-fill w-full rounded-lg px-5 py-2.5 text-sm font-semibold text-[#120e05] hover:brightness-105 disabled:opacity-50"
              >
                {authSubmitting ? 'جاري التحقق…' : 'دخول إلى بوابة المالك'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const lowStockItems = inventory.filter((item) => item.stock <= item.lowStockThreshold);
  const unackedAlerts = alerts.filter((a) => !a.acknowledged);
  const filteredInventory = inventory.filter((item) => {
    const matchesLow = inventoryFilter === 'all' || item.stock <= item.lowStockThreshold;
    const q = inventoryQuery.trim();
    const matchesQuery = !q || `${item.productName} ${item.category}`.includes(q);
    return matchesLow && matchesQuery;
  });

  const latestAlertWhatsappUrl =
    unackedAlerts[0]?.whatsappUrl ||
    alerts[0]?.whatsappUrl ||
    `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(
      `⚠️ تنبيه مخزون منخفض — متجر كرامو راشد:\n${lowStockItems
        .map((it) => `• ${it.productName}: المتبقي ${it.stock} (الحد الأدنى ${it.lowStockThreshold})`)
        .join('\n')}`,
    )}`;

  const funnelSteps = analytics
    ? [
        { label: 'زوار المتجر', value: analytics.funnel.visits },
        { label: 'معاينة المنتجات', value: analytics.funnel.productViews },
        { label: 'إضافة للسلة', value: analytics.funnel.addToCarts },
        { label: 'بدء إتمام الطلب', value: analytics.funnel.checkoutsStarted },
        { label: 'شراء مكتمل', value: analytics.funnel.purchases },
      ]
    : [];
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  const navItems: Array<{
    id: PortalSection;
    label: string;
    icon: typeof Users;
    badge?: string;
  }> = [
    { id: 'traffic', label: 'الزوار والمشتريات', icon: Activity },
    {
      id: 'devices',
      label: 'الأجهزة والمواقع',
      icon: MapPin,
      badge:
        analytics && analytics.activeVisitorsNow > 0
          ? `${analytics.activeVisitorsNow} متصل`
          : analytics && analytics.devices.length > 0
            ? String(analytics.devices.length)
            : undefined,
    },
    { id: 'bestsellers', label: 'أكثر المنتجات مبيعاً', icon: BarChart3 },
    {
      id: 'orders',
      label: 'الطلبات والفواتير',
      icon: ShoppingBag,
      badge: orders.length > 0 ? String(orders.length) : undefined,
    },
    {
      id: 'inventory',
      label: 'المخزون والتنبيهات',
      icon: Package,
      badge: lowStockItems.length > 0 ? `${lowStockItems.length} منخفض` : undefined,
    },
    { id: 'settings', label: 'إعدادات الإشعارات', icon: Settings },
  ];

  const sectionTitle: Record<PortalSection, string> = {
    traffic: 'مراقبة الزوار ومعدلات الشراء',
    devices: 'أماكن تواجد الأجهزة وأسماؤها',
    bestsellers: 'أكثر المنتجات مبيعاً خلال الشهر الحالي',
    orders: 'إدارة طلبات العملاء ووصل التوصيل',
    inventory: 'المخزون وتنبيهات النفاد',
    settings: 'إعدادات البريد الإلكتروني والواتساب',
  };

  const deviceList = analytics?.devices || [];
  const locationList = analytics?.locationBreakdown || [];
  const filteredDevices = deviceList.filter((d) => {
    if (deviceFilter === 'online' && !d.isOnlineNow) return false;
    if (deviceFilter === 'mobile' && d.deviceType !== 'mobile') return false;
    if (deviceFilter === 'desktop' && d.deviceType !== 'desktop') return false;
    if (deviceFilter === 'buyers' && d.ordersCount <= 0) return false;
    if (selectedLocation && d.locationLabel !== selectedLocation) return false;
    const q = deviceQuery.trim().toLowerCase();
    if (!q) return true;
    return `${d.deviceName} ${d.os} ${d.browser} ${d.locationLabel} ${d.customerName || ''} ${d.visitorId}`
      .toLowerCase()
      .includes(q);
  });
  const locationMaxCount = Math.max(1, ...locationList.map((loc) => loc.devicesCount));
  const buyerDevicesCount = deviceList.filter((d) => d.ordersCount > 0).length;

  return (
    <div className="flex min-h-screen flex-col bg-[#090806] text-[#f4ecd8] lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-[#2f2817] bg-[#100e0a] lg:w-[260px] lg:border-b-0 lg:border-l">
        <div className="flex items-center justify-between border-b border-[#2f2817] px-5 py-4">
          <div>
            <div className="gold-text font-display text-lg font-bold">كرامو راشد</div>
            <div className="text-xs text-[#a99d83]">بوابة المالك الخاصة</div>
          </div>
          <Lock className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
        </div>

        <nav
          aria-label="أقسام لوحة المالك"
          className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setFeedback(null);
                }}
                className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#d4a537] text-[#120e05]'
                    : 'text-[#a99d83] hover:bg-[#18150e] hover:text-[#f4ecd8]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`tabular-nums text-[11px] font-bold ${
                      active ? 'text-[#120e05]' : 'text-[#e9c565]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden border-t border-[#2f2817] p-3 lg:block">
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setAuthStatus((prev) =>
                prev ? { ...prev, authenticated: false } : null,
              );
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-[#a99d83] transition-colors hover:bg-[#18150e] hover:text-[#f4ecd8]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2f2817] bg-[#0c0a07] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#a99d83]">
              <span>بوابة المالك</span>
              <span aria-hidden="true">/</span>
              <span className="text-[#e9c565]">{sectionTitle[section]}</span>
            </div>
            <h1 className="font-display mt-0.5 text-xl font-bold text-[#f4ecd8]">
              {sectionTitle[section]}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadPortalData(token)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#2f2817] bg-[#13110c] px-3.5 py-2 text-xs font-semibold text-[#f4ecd8] hover:border-[#d4a537]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>تحديث البيانات</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setToken(null);
                setAuthStatus((prev) =>
                  prev ? { ...prev, authenticated: false } : null,
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2f2817] bg-[#13110c] px-3 py-2 text-xs font-semibold text-[#a99d83] hover:text-[#f4ecd8] lg:hidden"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>خروج</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 p-6">
          {lowStockItems.length > 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-700/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
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
                {section !== 'inventory' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSection('inventory');
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
              className={`rounded-xl border px-4 py-3 text-sm ${
                feedback.ok
                  ? 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200'
                  : 'border-red-700/60 bg-red-950/35 text-red-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {section === 'traffic' && (
            <div className="space-y-6">
              {!analytics ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((k) => (
                    <div
                      key={k}
                      className="h-28 animate-pulse rounded-xl border border-[#2f2817] bg-[#13110c]"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>الزوار النشطون حالياً (5 د)</span>
                        <Eye className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#e9c565]">
                        {analytics.activeVisitorsNow}
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-[#a99d83]">
                        اليوم: {analytics.todayUniqueVisitors} زائر فريد · {analytics.todayVisits} زيارة
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>إجمالي زوار الموقع</span>
                        <Users className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#f4ecd8]">
                        {analytics.totalUniqueVisitors}
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-[#a99d83]">
                        إجمالي الزيارات: {analytics.totalVisits} · هذا الشهر: {analytics.monthUniqueVisitors}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>العملاء المشترون والطلبات</span>
                        <ShoppingBag className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#f4ecd8]">
                        {analytics.totalBuyers}{' '}
                        <span className="text-sm font-normal text-[#a99d83]">عميل</span>
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-[#a99d83]">
                        {analytics.totalOrders} طلب · {analytics.totalUnitsSold} قطعة مباعة
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>معدل الشراء والمبيعات</span>
                        <TrendingUp className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#e9c565]">
                        {analytics.conversionRatePct}%
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-[#a99d83]">
                        الإجمالي: {analytics.totalRevenue.toLocaleString('ar-MA')} درهم · اليوم: {analytics.todayOrders} طلب
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-12">
                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-7">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-base font-bold text-[#e9c565]">
                            الزيارات مقابل المشتريات (آخر 14 يوماً)
                          </h2>
                          <p className="text-xs text-[#a99d83]">
                            مقارنة يومية بين عدد زيارات المتجر وعدد الطلبات المؤكدة
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[#a99d83]">
                          <span>الأعمدة: الزيارات</span>
                          <span className="text-[#e9c565]">الخط: الطلبات</span>
                        </div>
                      </div>

                      <div dir="ltr" className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={analytics.dailySeries}
                            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                          >
                            <CartesianGrid stroke="#2f2817" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="label"
                              stroke="#a99d83"
                              tick={{ fill: '#a99d83', fontSize: 11 }}
                            />
                            <YAxis
                              yAxisId="left"
                              allowDecimals={false}
                              stroke="#a99d83"
                              tick={{ fill: '#a99d83', fontSize: 11 }}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              allowDecimals={false}
                              stroke="#e9c565"
                              tick={{ fill: '#e9c565', fontSize: 11 }}
                            />
                            <Tooltip content={<DailyTrafficTooltip />} />
                            <Bar
                              yAxisId="left"
                              dataKey="visits"
                              fill="#5c471b"
                              radius={[4, 4, 0, 0]}
                              barSize={20}
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="orders"
                              stroke="#e9c565"
                              strokeWidth={2.5}
                              dot={{ r: 3.5, fill: '#e9c565' }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-5">
                      <div>
                        <h2 className="font-display text-base font-bold text-[#e9c565]">
                          رحلة العميل من الزيارة إلى الشراء
                        </h2>
                        <p className="text-xs text-[#a99d83]">
                          تتبّع تفاعل الزوار عبر خطوات الشراء داخل المتجر
                        </p>

                        <div className="mt-5 space-y-3.5">
                          {funnelSteps.map((step) => {
                            const widthPct = Math.round((step.value / funnelMax) * 100);
                            return (
                              <div key={step.label} className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-[#f4ecd8]">{step.label}</span>
                                  <span className="font-bold tabular-nums text-[#e9c565]">
                                    {step.value}
                                  </span>
                                </div>
                                <svg
                                  viewBox="0 0 100 6"
                                  preserveAspectRatio="none"
                                  className="h-2 w-full overflow-hidden rounded-full bg-[#1e1a12]"
                                  aria-hidden="true"
                                >
                                  <rect
                                    x="0"
                                    y="0"
                                    width={Math.max(step.value > 0 ? 4 : 0, widthPct)}
                                    height="6"
                                    fill="#d4a537"
                                  />
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-[#2f2817] pt-4 text-xs">
                        <div className="flex items-center gap-2 text-[#a99d83]">
                          <Smartphone className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                          <span>الهاتف:</span>
                          <span className="font-bold tabular-nums text-[#f4ecd8]">
                            {analytics.deviceBreakdown.mobile}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[#a99d83]">
                          <Monitor className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                          <span>الحاسوب:</span>
                          <span className="font-bold tabular-nums text-[#f4ecd8]">
                            {analytics.deviceBreakdown.desktop}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-12">
                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-7">
                      <h2 className="font-display text-base font-bold text-[#e9c565]">
                        تفاعل العملاء ومشتريات كل منتج
                      </h2>
                      <p className="mb-4 text-xs text-[#a99d83]">
                        مقارنة عدد مرات المعاينة والإضافة للسلة مع المبيعات الفعلية
                      </p>

                      {analytics.productEngagement.length === 0 ? (
                        <div className="py-10 text-center text-xs text-[#a99d83]">
                          سيظهر هنا جدول تفاعل المنتجات فور زيارة العملاء للمتجر أو الشراء.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-xs">
                            <thead>
                              <tr className="border-b border-[#2f2817] text-[#a99d83]">
                                <th className="py-2.5 font-medium">المنتج</th>
                                <th className="py-2.5 text-center font-medium">معاينة</th>
                                <th className="py-2.5 text-center font-medium">للسلة</th>
                                <th className="py-2.5 text-center font-medium">المباع</th>
                                <th className="py-2.5 text-left font-medium">المبيعات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2f2817]">
                              {analytics.productEngagement.slice(0, 10).map((row) => (
                                <tr key={row.productId} className="hover:bg-[#18150e]">
                                  <td className="py-2.5">
                                    <div className="font-semibold text-[#f4ecd8]">
                                      {row.productName}
                                    </div>
                                    <div className="text-[11px] text-[#a99d83]">
                                      {row.category}
                                    </div>
                                  </td>
                                  <td className="py-2.5 text-center tabular-nums text-[#f4ecd8]">
                                    {row.views}
                                  </td>
                                  <td className="py-2.5 text-center tabular-nums text-[#f4ecd8]">
                                    {row.addToCarts}
                                  </td>
                                  <td className="py-2.5 text-center font-bold tabular-nums text-[#e9c565]">
                                    {row.unitsSold}
                                  </td>
                                  <td className="py-2.5 text-left font-bold tabular-nums text-[#e9c565]">
                                    {row.revenue} درهم
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-5">
                      <h2 className="font-display text-base font-bold text-[#e9c565]">
                        أحدث حركة الزوار والشراء
                      </h2>
                      <p className="mb-4 text-xs text-[#a99d83]">
                        آخر 20 تفاعل مسجل في المتجر
                      </p>

                      {analytics.recentEvents.length === 0 ? (
                        <div className="py-10 text-center text-xs text-[#a99d83]">
                          لا توجد أحداث مسجلة حتى الآن.
                        </div>
                      ) : (
                        <div className="max-h-[360px] divide-y divide-[#2f2817] overflow-y-auto">
                          {analytics.recentEvents.map((evt) => (
                            <div
                              key={evt.id}
                              className="flex items-start justify-between gap-3 py-2.5 text-xs"
                            >
                              <div className="min-w-0">
                                <div
                                  className={`font-semibold ${
                                    evt.type === 'purchase'
                                      ? 'text-[#e9c565]'
                                      : 'text-[#f4ecd8]'
                                  }`}
                                >
                                  {EVENT_LABELS[evt.type]}
                                  {evt.orderId ? ` #${evt.orderId}` : ''}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-[#a99d83]">
                                  {evt.productName ? `${evt.productName} · ` : ''}
                                  {evt.orderTotal ? `${evt.orderTotal} درهم · ` : ''}
                                  {evt.deviceName || (evt.device === 'mobile' ? 'هاتف' : 'حاسوب')}
                                  {evt.locationLabel ? ` · ${evt.locationLabel}` : ''}
                                </div>
                              </div>
                              <span className="shrink-0 tabular-nums text-[11px] text-[#a99d83]">
                                {new Date(evt.timestamp).toLocaleTimeString('ar-MA', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-base font-bold text-[#e9c565]">
                          الأجهزة المتصلة وأماكن تواجدها الآن
                        </h2>
                        <p className="text-xs text-[#a99d83]">
                          نظرة سريعة على أسماء الأجهزة ومواقع العملاء المتصفحين للمتجر
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSection('devices')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4a537]/60 px-3.5 py-1.5 text-xs font-semibold text-[#e9c565] hover:bg-[#d4a537]/10"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>عرض كل الأجهزة والمواقع ({deviceList.length})</span>
                      </button>
                    </div>

                    {deviceList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#a99d83]">
                        ستظهر هنا أسماء الأجهزة ومواقعها بمجرد دخول الزوار للمتجر.
                      </div>
                    ) : (
                      <div className="mt-4 divide-y divide-[#2f2817]">
                        {deviceList.slice(0, 5).map((d) => (
                          <div
                            key={d.visitorId}
                            className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              {d.deviceType === 'mobile' ? (
                                <Smartphone className="h-4 w-4 shrink-0 text-[#d4a537]" aria-hidden="true" />
                              ) : (
                                <Monitor className="h-4 w-4 shrink-0 text-[#d4a537]" aria-hidden="true" />
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-[#f4ecd8]">{d.deviceName}</span>
                                  <span aria-hidden="true" className="text-[#a99d83]">·</span>
                                  <span className="font-mono text-[11px] text-[#a99d83]">
                                    #{d.visitorId}
                                  </span>
                                  {d.isOnlineNow && (
                                    <span className="font-semibold text-emerald-400">· متصل الآن</span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[11px] text-[#a99d83]">
                                  {d.os} · {d.browser}
                                  {d.customerName ? ` · العميل: ${d.customerName}` : ''}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-[11px]">
                              <span className="inline-flex items-center gap-1 font-medium text-[#e9c565]">
                                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>{d.locationLabel}</span>
                              </span>
                              <span className="tabular-nums text-[#a99d83]">
                                {d.visitCount} زيارة
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {section === 'devices' && (
            <div className="space-y-6">
              {!analytics ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((k) => (
                    <div
                      key={k}
                      className="h-28 animate-pulse rounded-xl border border-[#2f2817] bg-[#13110c]"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>الأجهزة المتصلة الآن</span>
                        <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-emerald-400">
                        {analytics.activeVisitorsNow}
                      </div>
                      <div className="mt-1 text-xs text-[#a99d83]">
                        نشطة خلال آخر 5 دقائق
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>إجمالي الأجهزة المسجلة</span>
                        <Monitor className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#f4ecd8]">
                        {deviceList.length}
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-[#a99d83]">
                        هاتف: {analytics.deviceBreakdown.mobile} · حاسوب: {analytics.deviceBreakdown.desktop}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>أماكن تواجد الأجهزة</span>
                        <Globe className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#e9c565]">
                        {locationList.length}
                      </div>
                      <div className="mt-1 truncate text-xs text-[#a99d83]">
                        {locationList[0] ? `الأعلى: ${locationList[0].locationLabel}` : 'لا توجد مواقع بعد'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                      <div className="flex items-center justify-between text-xs text-[#a99d83]">
                        <span>أجهزة أتمّت الشراء</span>
                        <ShoppingBag className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 text-3xl font-bold tabular-nums text-[#f4ecd8]">
                        {buyerDevicesCount}
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-[#a99d83]">
                        من أصل {deviceList.length} جهاز مسجل
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-12">
                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-base font-bold text-[#e9c565]">
                            التوزيع الجغرافي للأجهزة
                          </h2>
                          <p className="text-xs text-[#a99d83]">
                            اضغط على أي منطقة لتصفية الأجهزة التابعة لها
                          </p>
                        </div>
                        {selectedLocation && (
                          <button
                            type="button"
                            onClick={() => setSelectedLocation(null)}
                            className="text-xs font-semibold text-[#e9c565] hover:underline"
                          >
                            إلغاء التصفية
                          </button>
                        )}
                      </div>

                      {locationList.length === 0 ? (
                        <div className="py-10 text-center text-xs text-[#a99d83]">
                          لم يتم تسجيل مواقع بعد.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {locationList.map((loc) => {
                            const widthPct = Math.round((loc.devicesCount / locationMaxCount) * 100);
                            const isSelected = selectedLocation === loc.locationLabel;
                            return (
                              <button
                                key={loc.locationLabel}
                                type="button"
                                onClick={() =>
                                  setSelectedLocation((prev) =>
                                    prev === loc.locationLabel ? null : loc.locationLabel,
                                  )
                                }
                                className={`block w-full rounded-lg border p-3 text-right transition-colors ${
                                  isSelected
                                    ? 'border-[#d4a537] bg-[#1b160c]'
                                    : 'border-[#2f2817] bg-[#0c0a07] hover:border-[#6b5420]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[#f4ecd8]">
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#d4a537]" aria-hidden="true" />
                                    <span className="truncate">{loc.locationLabel}</span>
                                  </span>
                                  <span className="shrink-0 font-bold tabular-nums text-[#e9c565]">
                                    {loc.devicesCount} جهاز
                                  </span>
                                </div>
                                <svg
                                  viewBox="0 0 100 4"
                                  preserveAspectRatio="none"
                                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1e1a12]"
                                  aria-hidden="true"
                                >
                                  <rect
                                    x="0"
                                    y="0"
                                    width={Math.max(6, widthPct)}
                                    height="4"
                                    fill="#d4a537"
                                  />
                                </svg>
                                <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-[#a99d83]">
                                  <span>
                                    {loc.activeNowCount > 0
                                      ? `${loc.activeNowCount} متصل الآن`
                                      : 'لا يوجد متصل الآن'}
                                  </span>
                                  <span>{loc.ordersCount} طلب</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-8">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              { id: 'all', label: `الكل (${deviceList.length})` },
                              {
                                id: 'online',
                                label: `متصل الآن (${deviceList.filter((d) => d.isOnlineNow).length})`,
                              },
                              {
                                id: 'mobile',
                                label: `هاتف (${deviceList.filter((d) => d.deviceType === 'mobile').length})`,
                              },
                              {
                                id: 'desktop',
                                label: `حاسوب (${deviceList.filter((d) => d.deviceType === 'desktop').length})`,
                              },
                              { id: 'buyers', label: `مشترون (${buyerDevicesCount})` },
                            ] as const
                          ).map((tabItem) => (
                            <button
                              key={tabItem.id}
                              type="button"
                              onClick={() => setDeviceFilter(tabItem.id)}
                              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                deviceFilter === tabItem.id
                                  ? 'bg-[#d4a537] text-[#120e05]'
                                  : 'bg-[#18150e] text-[#a99d83] hover:text-[#f4ecd8]'
                              }`}
                            >
                              {tabItem.label}
                            </button>
                          ))}
                        </div>

                        <input
                          type="search"
                          value={deviceQuery}
                          onChange={(e) => setDeviceQuery(e.target.value)}
                          placeholder="ابحث باسم الجهاز، المدينة، النظام…"
                          aria-label="ابحث في الأجهزة"
                          className="w-full rounded-lg border border-[#2f2817] bg-[#0c0a07] px-3 py-1.5 text-xs text-[#f4ecd8] placeholder:text-[#a99d83]/70 focus:border-[#d4a537] focus:outline-none sm:w-56"
                        />
                      </div>

                      {filteredDevices.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[#a99d83]">
                          لا توجد أجهزة مطابقة لعوامل التصفية الحالية.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-xs">
                            <thead>
                              <tr className="border-b border-[#2f2817] text-[#a99d83]">
                                <th className="py-2.5 pl-3 font-medium">اسم الجهاز والحالة</th>
                                <th className="px-3 py-2.5 font-medium">النظام والمتصفح</th>
                                <th className="px-3 py-2.5 font-medium">مكان التواجد</th>
                                <th className="py-2.5 pr-3 text-left font-medium">النشاط والشراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2f2817]">
                              {filteredDevices.map((d) => (
                                <tr key={d.visitorId} className="align-top hover:bg-[#18150e]">
                                  <td className="py-3 pl-3">
                                    <div className="flex items-start gap-2.5">
                                      {d.deviceType === 'mobile' ? (
                                        <Smartphone
                                          className="mt-0.5 h-4 w-4 shrink-0 text-[#d4a537]"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Monitor
                                          className="mt-0.5 h-4 w-4 shrink-0 text-[#d4a537]"
                                          aria-hidden="true"
                                        />
                                      )}
                                      <div>
                                        <div className="font-semibold text-[#f4ecd8]">
                                          {d.deviceName}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#a99d83]">
                                          <span className="font-mono">#{d.visitorId}</span>
                                          <span aria-hidden="true">·</span>
                                          {d.isOnlineNow ? (
                                            <span className="font-semibold text-emerald-400">
                                              متصل الآن
                                            </span>
                                          ) : (
                                            <span className="tabular-nums">
                                              آخر ظهور:{' '}
                                              {new Date(d.lastSeenAt).toLocaleString('ar-MA', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}
                                            </span>
                                          )}
                                          {d.customerName && (
                                            <>
                                              <span aria-hidden="true">·</span>
                                              <span className="text-[#e9c565]">{d.customerName}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="px-3 py-3 text-[#f4ecd8]">
                                    <div>{d.os}</div>
                                    <div className="mt-0.5 text-[11px] tabular-nums text-[#a99d83]">
                                      {d.browser}
                                      {d.screenSize ? ` · ${d.screenSize}` : ''}
                                      {d.language ? ` · ${d.language}` : ''}
                                    </div>
                                  </td>

                                  <td className="px-3 py-3">
                                    <div className="inline-flex items-center gap-1 font-semibold text-[#e9c565]">
                                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                      <span>{d.locationLabel}</span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-[#a99d83]">
                                      {LOCATION_SOURCE_LABELS[d.locationSource]}
                                      {d.timezone ? ` · ${d.timezone}` : ''}
                                    </div>
                                  </td>

                                  <td className="py-3 pr-3 text-left tabular-nums">
                                    <div className="font-semibold text-[#f4ecd8]">
                                      {d.visitCount} زيارة
                                      {d.ordersCount > 0 && (
                                        <span className="text-[#e9c565]">
                                          {' '}
                                          · {d.ordersCount} طلب ({d.totalSpent} درهم)
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-[#a99d83]">
                                      {d.lastEventType
                                        ? `آخر إجراء: ${EVENT_LABELS[d.lastEventType]}`
                                        : 'زيارة للمتجر'}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {section === 'bestsellers' && <MonthlySalesDashboard orders={orders} />}

          {section === 'orders' &&
            (orders.length === 0 ? (
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
                        <span className="text-xs tabular-nums text-[#a99d83]">
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
            ))}

          {section === 'inventory' && (
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
                  <h2 className="font-display text-base font-bold text-[#e9c565]">
                    سجل تنبيهات انخفاض المخزون ({unackedAlerts.length})
                  </h2>
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
                              {isOut ? 'نفد من المخزون' : isLow ? 'مخزون منخفض' : 'متوفر'}
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
          )}

          {section === 'settings' && (
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
                    placeholder="212615994602"
                    className="rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-left text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
                  />
                </label>
              </div>

              <div className="space-y-4 rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
                <div>
                  <h2 className="font-display text-base font-bold text-[#e9c565]">
                    إعدادات إرسال البريد التلقائي (SMTP / Gmail)
                  </h2>
                  <p className="mt-1 text-xs text-[#a99d83]">
                    لإرسال الطلبات وتنبيهات المخزون تلقائيًا إلى بريدك عبر Gmail، استخدم بريدك في خانة المستخدم وكلمة مرور التطبيقات (App Password).
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
                  <h2 className="font-display text-base font-bold text-[#e9c565]">
                    إرسال واتساب تلقائي في الخلفية (Meta WhatsApp Cloud API — اختياري)
                  </h2>
                  <p className="mt-1 text-xs text-[#a99d83]">
                    عند إضافة بيانات Meta Cloud API، يرسل الخادم رسالة فورية إلى واتسابك في الخلفية تلقائيًا.
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
                  disabled={savingSettings}
                  className="gold-fill inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-[#120e05] hover:brightness-105 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{savingSettings ? 'جاري الحفظ…' : 'حفظ الإعدادات'}</span>
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
        </main>
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
