import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { calcVariantPrice } from '../data/products.ts';
import type { Product } from '../types.ts';
import { ProductVisual } from './ProductVisual.tsx';

interface DealOfDayBannerProps {
  products: Product[];
  onQuickAdd: (product: Product, sizeIndex: number) => void;
  onViewProduct: (product: Product, sizeIndex?: number) => void;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeUntilMidnight(): TimeRemaining {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffSeconds = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  return {
    hours: Math.floor(diffSeconds / 3600),
    minutes: Math.floor((diffSeconds % 3600) / 60),
    seconds: diffSeconds % 60,
  };
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function DealOfDayBanner({
  products,
  onQuickAdd,
  onViewProduct,
}: DealOfDayBannerProps) {
  const dealProducts = useMemo(() => {
    const discounted = products.filter(
      (p) => typeof p.originalPrice === 'number' && p.originalPrice > p.basePrice,
    );
    if (discounted.length > 0) {
      // Prioritize the luxury gift box or highest discount first
      return [...discounted].sort((a, b) => {
        const discA = (a.originalPrice - a.basePrice) / a.originalPrice;
        const discB = (b.originalPrice - b.basePrice) / b.originalPrice;
        return discB - discA;
      });
    }
    return products.slice(0, 1);
  }, [products]);

  const [activeDealIdx, setActiveDealIdx] = useState(0);
  const [selectedSizes, setSelectedSizes] = useState<Record<number, number>>(() => ({
    3: 2, // Highlight family 1kg Eucalyptus jar by default when picked
  }));
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(getTimeUntilMidnight);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimeLeft(getTimeUntilMidnight());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const dealProduct = dealProducts[activeDealIdx] ?? dealProducts[0];
  if (!dealProduct) return null;

  const rawSizeIdx = selectedSizes[dealProduct.id];
  const activeSizeIndex =
    rawSizeIdx !== undefined && dealProduct.sizes[rawSizeIdx]
      ? rawSizeIdx
      : dealProduct.defaultSizeIndex;
  const activeSize =
    dealProduct.sizes[activeSizeIndex] || dealProduct.sizes[dealProduct.defaultSizeIndex];
  const activeImage = dealProduct.sizeImages?.[activeSizeIndex] || dealProduct.image;

  const dealPrice = calcVariantPrice(dealProduct.basePrice, activeSize.multiplier);
  const oldPrice =
    dealProduct.originalPrice > dealProduct.basePrice
      ? calcVariantPrice(dealProduct.originalPrice, activeSize.multiplier)
      : Math.round((dealPrice * 1.2) / 5) * 5;
  const savingsAmount = Math.max(0, oldPrice - dealPrice);
  const discountPct = oldPrice > dealPrice ? Math.round((1 - dealPrice / oldPrice) * 100) : 0;

  return (
    <div
      aria-label="صفقة اليوم والعروض المحدودة"
      className="mb-12 overflow-hidden rounded-2xl border border-[#8a6a22]/70 bg-[#13110c]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2f2817] bg-[#18150e] px-5 py-3 sm:px-7">
        <div className="flex items-center gap-2 text-xs font-medium text-[#e9c565] sm:text-sm">
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>صفقة اليوم</span>
          <span aria-hidden="true" className="text-[#a99d83]">·</span>
          <span className="text-[#a99d83]">عرض محدود يتجدد كل 24 ساعة</span>
        </div>

        {dealProducts.length > 1 && (
          <div
            role="tablist"
            aria-label="اختر صفقة اليوم"
            className="flex flex-wrap items-center gap-1"
          >
            {dealProducts.map((item, idx) => {
              const isSelected = idx === activeDealIdx;
              const shortLabel =
                item.id === 25
                  ? 'علبة الهدايا'
                  : item.id === 6
                    ? 'زيت الـ 14 زيتًا'
                    : item.id === 3
                      ? 'عسل الكاليبتوس'
                      : item.name;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveDealIdx(idx)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    isSelected
                      ? 'bg-[#d4a537] font-semibold text-[#120e05]'
                      : 'text-[#a99d83] hover:bg-[#13110c] hover:text-[#f4ecd8]'
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid items-stretch lg:grid-cols-[0.9fr_1.1fr]">
        <button
          type="button"
          onClick={() => onViewProduct(dealProduct, activeSizeIndex)}
          aria-label={`معاينة ${dealProduct.name} (${activeSize.label})`}
          className="group relative aspect-square w-full overflow-hidden border-b border-[#2f2817] bg-[#0e0c08] text-start lg:aspect-auto lg:min-h-[340px] lg:border-b-0 lg:border-l"
        >
          <ProductVisual
            key={`deal-${dealProduct.id}-${activeImage}`}
            product={dealProduct}
            imageOverride={activeImage}
            className="lg:h-full transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090806]/75 via-transparent to-transparent" />
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-2 text-xs font-medium">
            {discountPct > 0 && (
              <span className="rounded-md border border-[#d4a537]/40 bg-[#090806]/90 px-2.5 py-1 tabular-nums text-[#e9c565]">
                خصم {discountPct}%
              </span>
            )}
            <span className="rounded-md border border-[#2f2817] bg-[#090806]/90 px-2.5 py-1 tabular-nums text-[#f4ecd8]">
              {activeSize.label}
            </span>
          </div>
        </button>

        <div className="flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#a99d83]">
              <span>{dealProduct.category}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-[#e9c565]">
                ★ {dealProduct.rating} ({dealProduct.reviewCount} تقييم)
              </span>
              <span aria-hidden="true">·</span>
              <span>متوفر للشحن الفوري</span>
            </div>

            <h3
              onClick={() => onViewProduct(dealProduct, activeSizeIndex)}
              className="font-display mt-2 cursor-pointer text-balance text-2xl font-bold text-[#f4ecd8] transition-colors hover:text-[#e9c565] sm:text-3xl"
            >
              {dealProduct.name}
            </h3>

            <p className="mt-2.5 max-w-[54ch] text-sm leading-relaxed text-[#a99d83]">
              {dealProduct.description}
            </p>

            <div className="mt-5">
              <p className="text-xs text-[#a99d83]">
                {dealProduct.unitLabel} · {dealProduct.variantPrompt || 'اختر الحجم'}:
              </p>
              <div
                role="group"
                aria-label={dealProduct.variantPrompt || `خيارات ${dealProduct.name}`}
                className="mt-2 flex flex-wrap gap-2"
              >
                {dealProduct.sizes.map((sizeOption, idx) => {
                  const isSelected = idx === activeSizeIndex;
                  return (
                    <button
                      key={sizeOption.label}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelectedSizes((prev) => ({
                          ...prev,
                          [dealProduct.id]: idx,
                        }))
                      }
                      className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? 'border-[#d4a537] bg-[#d4a537] font-semibold text-[#120e05]'
                          : 'border-[#2f2817] bg-[#0e0c08] text-[#cbbd9f] hover:border-[#d4a537]/70 hover:text-[#f4ecd8]'
                      }`}
                    >
                      {sizeOption.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-[#2f2817] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-3xl font-bold tabular-nums text-[#e9c565]">
                    {dealPrice} درهم
                  </span>
                  {oldPrice > dealPrice && (
                    <s className="text-base tabular-nums text-[#a99d83]">
                      {oldPrice} درهم
                    </s>
                  )}
                </div>
                {savingsAmount > 0 && (
                  <p className="mt-0.5 text-xs font-medium tabular-nums text-[#e9c565]">
                    وفّر {savingsAmount} درهم · عرض خاص اليوم
                  </p>
                )}
              </div>

              <div
                aria-label={`ينتهي العرض خلال ${timeLeft.hours} ساعة و ${timeLeft.minutes} دقيقة و ${timeLeft.seconds} ثانية`}
                className="flex items-center gap-2"
              >
                <div className="min-w-[58px] rounded-xl border border-[#2f2817] bg-[#0e0c08] px-3 py-2 text-center">
                  <div className="font-display text-xl font-bold leading-none tabular-nums text-[#f4ecd8]">
                    {padTwo(timeLeft.hours)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#a99d83]">ساعة</div>
                </div>
                <div className="min-w-[58px] rounded-xl border border-[#2f2817] bg-[#0e0c08] px-3 py-2 text-center">
                  <div className="font-display text-xl font-bold leading-none tabular-nums text-[#f4ecd8]">
                    {padTwo(timeLeft.minutes)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#a99d83]">دقيقة</div>
                </div>
                <div className="min-w-[58px] rounded-xl border border-[#d4a537]/40 bg-[#0e0c08] px-3 py-2 text-center">
                  <div className="font-display text-xl font-bold leading-none tabular-nums text-[#e9c565]">
                    {padTwo(timeLeft.seconds)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#a99d83]">ثانية</div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => onQuickAdd(dealProduct, activeSizeIndex)}
                className="gold-fill whitespace-nowrap rounded-lg px-6 py-3 text-sm font-semibold text-[#120e05] transition-all duration-150 hover:brightness-105 active:scale-[0.98]"
              >
                أضف العرض إلى السلة
              </button>
              <button
                type="button"
                onClick={() => onViewProduct(dealProduct, activeSizeIndex)}
                className="whitespace-nowrap rounded-lg border border-[#2f2817] px-6 py-3 text-sm font-medium text-[#f4ecd8] transition-colors hover:border-[#d4a537]"
              >
                تفاصيل العرض
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
