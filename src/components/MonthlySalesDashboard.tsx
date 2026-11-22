import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Coins, PackageCheck, ShoppingBag, TrendingUp } from 'lucide-react';
import { PRODUCTS } from '../data/products.ts';
import type { Order } from '../types.ts';

interface MonthlySalesDashboardProps {
  orders: Order[];
}

type ChartMetric = 'units' | 'revenue';

interface ProductSalesDatum {
  productId: number;
  name: string;
  shortName: string;
  category: string;
  units: number;
  revenue: number;
  orderCount: number;
}

const CHART_SERIES = [
  { hex: '#d4a537', dotClass: 'bg-[#d4a537]' },
  { hex: '#e9c565', dotClass: 'bg-[#e9c565]' },
  { hex: '#b8861d', dotClass: 'bg-[#b8861d]' },
  { hex: '#c97a3d', dotClass: 'bg-[#c97a3d]' },
  { hex: '#8c9e5e', dotClass: 'bg-[#8c9e5e]' },
  { hex: '#a67c52', dotClass: 'bg-[#a67c52]' },
  { hex: '#7e6935', dotClass: 'bg-[#7e6935]' },
  { hex: '#df9d4b', dotClass: 'bg-[#df9d4b]' },
];

interface CategorySalesDatum {
  name: string;
  units: number;
  revenue: number;
  color: string;
  dotClass: string;
}

interface DailySalesDatum {
  dayLabel: string;
  dayNumber: number;
  units: number;
  revenue: number;
}

function truncateLabel(text: string, maxLen = 22): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

interface CustomTooltipPayloadItem<T> {
  payload?: T;
}

function ProductBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<CustomTooltipPayloadItem<ProductSalesDatum>>;
}) {
  const item = active && payload && payload[0]?.payload;
  if (!item) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-[#6b5420] bg-[#100e0a]/95 px-3.5 py-2.5 text-xs shadow-xl"
    >
      <div className="font-semibold text-[#f4ecd8]">{item.name}</div>
      <div className="mt-0.5 text-[11px] text-[#a99d83]">{item.category}</div>
      <div className="mt-2 space-y-1 border-t border-[#2f2817] pt-1.5 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">الكمية المباعة:</span>
          <span className="font-bold text-[#e9c565]">{item.units} وحدة</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">إجمالي المبيعات:</span>
          <span className="font-bold text-[#f4ecd8]">{item.revenue} درهم</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">عدد الطلبات:</span>
          <span className="text-[#f4ecd8]">{item.orderCount}</span>
        </div>
      </div>
    </div>
  );
}

function CategoryPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<CustomTooltipPayloadItem<CategorySalesDatum>>;
}) {
  const item = active && payload && payload[0]?.payload;
  if (!item) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-[#6b5420] bg-[#100e0a]/95 px-3.5 py-2.5 text-xs shadow-xl"
    >
      <div className="font-semibold text-[#e9c565]">{item.name}</div>
      <div className="mt-1.5 space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">الوحدات:</span>
          <span className="font-bold text-[#f4ecd8]">{item.units}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">المبيعات:</span>
          <span className="font-bold text-[#e9c565]">{item.revenue} درهم</span>
        </div>
      </div>
    </div>
  );
}

function DailyAreaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<CustomTooltipPayloadItem<DailySalesDatum>>;
}) {
  const item = active && payload && payload[0]?.payload;
  if (!item) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-[#6b5420] bg-[#100e0a]/95 px-3.5 py-2.5 text-xs shadow-xl"
    >
      <div className="font-semibold text-[#f4ecd8]">اليوم {item.dayLabel}</div>
      <div className="mt-1.5 space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">المبيعات:</span>
          <span className="font-bold text-[#e9c565]">{item.revenue} درهم</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#a99d83]">الوحدات:</span>
          <span className="font-semibold text-[#f4ecd8]">{item.units}</span>
        </div>
      </div>
    </div>
  );
}

export function MonthlySalesDashboard({ orders }: MonthlySalesDashboardProps) {
  const [metric, setMetric] = useState<ChartMetric>('units');

  const analytics = useMemo(() => {
    const now = new Date();
    const targetYear = now.getFullYear();
    const targetMonth = now.getMonth();
    const todayDay = now.getDate();

    const monthLabel = new Intl.DateTimeFormat('ar-MA', {
      month: 'long',
      year: 'numeric',
    }).format(now);

    const productLookup = new Map(PRODUCTS.map((p) => [p.id, p]));

    const monthlyOrders = orders.filter((order) => {
      if (order.status === 'cancelled') return false;
      const d = new Date(order.createdAt);
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === targetYear &&
        d.getMonth() === targetMonth
      );
    });

    const productMap = new Map<number, ProductSalesDatum & { orderIds: Set<string> }>();
    const categoryMap = new Map<string, { units: number; revenue: number }>();
    const dailyMap = new Map<number, { units: number; revenue: number }>();

    for (let day = 1; day <= todayDay; day++) {
      dailyMap.set(day, { units: 0, revenue: 0 });
    }

    let totalUnits = 0;
    let totalRevenue = 0;

    for (const order of monthlyOrders) {
      totalRevenue += order.total;
      const orderDate = new Date(order.createdAt);
      const dayOfMonth = orderDate.getDate();
      const dayBucket = dailyMap.get(dayOfMonth) ?? { units: 0, revenue: 0 };
      dayBucket.revenue += order.total;

      for (const item of order.items) {
        totalUnits += item.quantity;
        dayBucket.units += item.quantity;

        const catalogProduct = productLookup.get(item.productId);
        const category = catalogProduct?.category ?? 'منتجات المتجر';

        const existingProduct = productMap.get(item.productId) ?? {
          productId: item.productId,
          name: item.productName,
          shortName: truncateLabel(item.productName, 20),
          category,
          units: 0,
          revenue: 0,
          orderCount: 0,
          orderIds: new Set<string>(),
        };
        existingProduct.units += item.quantity;
        existingProduct.revenue += item.lineTotal;
        existingProduct.orderIds.add(order.id);
        existingProduct.orderCount = existingProduct.orderIds.size;
        productMap.set(item.productId, existingProduct);

        const existingCategory = categoryMap.get(category) ?? { units: 0, revenue: 0 };
        existingCategory.units += item.quantity;
        existingCategory.revenue += item.lineTotal;
        categoryMap.set(category, existingCategory);
      }

      dailyMap.set(dayOfMonth, dayBucket);
    }

    const allProductsSorted = Array.from(productMap.values())
      .map(({ orderIds: _ignored, ...rest }) => rest)
      .sort((a, b) =>
        metric === 'units'
          ? b.units - a.units || b.revenue - a.revenue
          : b.revenue - a.revenue || b.units - a.units,
      );

    const topProducts = allProductsSorted.slice(0, 8);

    const categoryBreakdown: CategorySalesDatum[] = Array.from(categoryMap.entries())
      .map(([name, stats], idx) => {
        const series = CHART_SERIES[idx % CHART_SERIES.length];
        return {
          name,
          units: stats.units,
          revenue: stats.revenue,
          color: series.hex,
          dotClass: series.dotClass,
        };
      })
      .sort((a, b) => (metric === 'units' ? b.units - a.units : b.revenue - a.revenue));

    const dailySeries: DailySalesDatum[] = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayNumber, stats]) => ({
        dayNumber,
        dayLabel: `${dayNumber}`,
        units: stats.units,
        revenue: stats.revenue,
      }));

    const topProduct = allProductsSorted[0] ?? null;

    return {
      monthLabel,
      orderCount: monthlyOrders.length,
      totalUnits,
      totalRevenue,
      topProduct,
      topProducts,
      allProductsSorted,
      categoryBreakdown,
      dailySeries,
    };
  }, [orders, metric]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2f2817] bg-[#13110c] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-[#d4a537]" aria-hidden="true" />
          <div>
            <h3 className="font-display text-base font-bold text-[#f4ecd8]">
              أكثر المنتجات مبيعاً — {analytics.monthLabel}
            </h3>
            <p className="text-xs text-[#a99d83]">
              تُحتسب البيانات من جميع الطلبات الفعّالة خلال الشهر الحالي (باستثناء الملغاة)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#0c0a07] p-1">
          <button
            type="button"
            onClick={() => setMetric('units')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              metric === 'units'
                ? 'bg-[#d4a537] text-[#120e05]'
                : 'text-[#a99d83] hover:text-[#f4ecd8]'
            }`}
          >
            حسب الكمية
          </button>
          <button
            type="button"
            onClick={() => setMetric('revenue')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              metric === 'revenue'
                ? 'bg-[#d4a537] text-[#120e05]'
                : 'text-[#a99d83] hover:text-[#f4ecd8]'
            }`}
          >
            حسب الإيرادات (درهم)
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-4">
          <div className="flex items-center justify-between text-xs text-[#a99d83]">
            <span>مبيعات الشهر</span>
            <Coins className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-[#e9c565]">
            {analytics.totalRevenue.toLocaleString('ar-MA')} <span className="text-sm font-medium">درهم</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-4">
          <div className="flex items-center justify-between text-xs text-[#a99d83]">
            <span>الوحدات المباعة</span>
            <PackageCheck className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-[#f4ecd8]">
            {analytics.totalUnits} <span className="text-sm font-normal text-[#a99d83]">قطعة</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-4">
          <div className="flex items-center justify-between text-xs text-[#a99d83]">
            <span>طلبات الشهر الفعّالة</span>
            <ShoppingBag className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-[#f4ecd8]">
            {analytics.orderCount}
          </div>
        </div>

        <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-4">
          <div className="flex items-center justify-between text-xs text-[#a99d83]">
            <span>المنتج الأكثر مبيعاً</span>
            <TrendingUp className="h-4 w-4 text-[#d4a537]" aria-hidden="true" />
          </div>
          <div className="mt-2 truncate text-sm font-bold text-[#e9c565]">
            {analytics.topProduct ? analytics.topProduct.name : '—'}
          </div>
          {analytics.topProduct && (
            <div className="mt-0.5 text-xs tabular-nums text-[#a99d83]">
              {analytics.topProduct.units} وحدة · {analytics.topProduct.revenue} درهم
            </div>
          )}
        </div>
      </div>

      {analytics.topProducts.length === 0 ? (
        <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-12 text-center">
          <BarChart3 className="mx-auto h-9 w-9 text-[#6b5420]" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-[#f4ecd8]">
            لا توجد مبيعات مسجلة خلال {analytics.monthLabel} بعد
          </p>
          <p className="mt-1 text-xs text-[#a99d83]">
            بمجرد تأكيد أي طلب جديد من المتجر، ستظهر الرسوم البيانية لأكثر المنتجات مبيعاً وتوزيع الفئات هنا تلقائياً.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-[#e9c565]">
                  ترتيب المنتجات الأكثر مبيعاً ({metric === 'units' ? 'بالوحدات' : 'بالدرهم'})
                </h4>
                <span className="text-xs text-[#a99d83] tabular-nums">
                  أعلى {analytics.topProducts.length} منتجات
                </span>
              </div>

              <div dir="ltr" className="h-[290px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.topProducts}
                    layout="vertical"
                    margin={{ top: 4, right: 18, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#2f2817" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      stroke="#a99d83"
                      tick={{ fill: '#a99d83', fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={136}
                      stroke="#a99d83"
                      tick={{ fill: '#f4ecd8', fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(212, 165, 55, 0.08)' }}
                      content={<ProductBarTooltip />}
                    />
                    <Bar
                      dataKey={metric}
                      radius={[0, 6, 6, 0]}
                      barSize={22}
                    >
                      {analytics.topProducts.map((entry, idx) => (
                        <Cell
                          key={entry.productId}
                          fill={CHART_SERIES[idx % CHART_SERIES.length].hex}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5 lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-[#e9c565]">
                  حصة الفئات هذا الشهر
                </h4>
                <span className="text-xs text-[#a99d83] tabular-nums">
                  {analytics.categoryBreakdown.length} فئات
                </span>
              </div>

              <div dir="ltr" className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.categoryBreakdown}
                      dataKey={metric}
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                      stroke="#13110c"
                      strokeWidth={2}
                    >
                      {analytics.categoryBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CategoryPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 space-y-1.5 text-xs">
                {analytics.categoryBreakdown.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${cat.dotClass}`}
                        aria-hidden="true"
                      />
                      <span className="truncate text-[#f4ecd8]">{cat.name}</span>
                    </div>
                    <span className="shrink-0 tabular-nums text-[#a99d83]">
                      {metric === 'units' ? `${cat.units} وحدة` : `${cat.revenue} درهم`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#2f2817] bg-[#13110c] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-display text-sm font-bold text-[#e9c565]">
                الأداء اليومي للمبيعات خلال {analytics.monthLabel}
              </h4>
              <span className="text-xs text-[#a99d83]">
                {metric === 'units' ? 'الكمية المباعة يومياً' : 'الإيراد اليومي بالدرهم'}
              </span>
            </div>

            <div dir="ltr" className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analytics.dailySeries}
                  margin={{ top: 8, right: 14, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="krGoldArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4a537" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#d4a537" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#2f2817" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    stroke="#a99d83"
                    tick={{ fill: '#a99d83', fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="#a99d83"
                    tick={{ fill: '#a99d83', fontSize: 11 }}
                  />
                  <Tooltip content={<DailyAreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke="#e9c565"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#krGoldArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
