import { useState } from 'react';
import { HERO_IMAGE } from '../data/products.ts';
import type { ProductCategory } from '../types.ts';

interface HeroProps {
  onSelectCategory: (category: ProductCategory) => void;
  onOpenFeatured?: () => void;
}

export function Hero({ onSelectCategory, onOpenFeatured }: HeroProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <section id="top" className="hero-honeycomb-bg border-b border-[#2f2817]">
      <div className="mx-auto max-w-[1200px] px-5 py-12 lg:py-16">
        <div className="grid items-stretch gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center">
            <p className="mb-3 text-sm font-semibold text-[#e9c565]">
              منحل ومتجر طبيعي · الدار البيضاء
            </p>
            <h1 className="gold-text font-display text-balance text-4xl font-bold leading-[1.2] sm:text-5xl lg:text-6xl">
              عسل خالص وعناية مغربية أصيلة.
            </h1>
            <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-[#a99d83] sm:text-lg">
              عسل جبلي حر، أملو تقليدي بالأركان، وزيوت وسيرومات العناية الطبيعية بالشعر والبشرة — تصلك إلى باب بيتك في الدار البيضاء وكل المدن المغربية.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#shop"
                onClick={() => onSelectCategory('كل المنتجات')}
                className="gold-fill inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-7 py-3 text-sm font-semibold text-[#120e05] transition-all duration-150 hover:brightness-105"
              >
                تسوّق كل المنتجات
              </a>
              <a
                href="#shop"
                onClick={() => onSelectCategory('عناية بالشعر')}
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#d4a537]/70 px-7 py-3 text-sm font-semibold text-[#e9c565] transition-colors duration-150 hover:bg-[#d4a537]/10"
              >
                العناية بالشعر
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenFeatured}
            aria-label="عرض منتج الأسبوع: عسل الكاليبتوس 1 كغ"
            className="group relative flex min-h-[280px] overflow-hidden rounded-2xl border border-[#8a6a22]/70 bg-[#13110c] text-start shadow-[0_0_60px_rgba(212,165,55,0.14)] transition-colors hover:border-[#d4a537]"
          >
            {!imgError ? (
              <img
                src={HERO_IMAGE}
                alt="برطمانات عسل مغربي وقطعة شمع عسل"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] lg:h-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#18150e] text-[#e9c565]">
                عسل كرامو راشد
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090806]/90 via-transparent to-[#090806]/30" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-5 py-4 text-sm">
              <span className="font-medium text-[#f4ecd8]">عرض هذا الأسبوع · عسل الكاليبتوس 1 كغ</span>
              <span className="font-semibold tabular-nums text-[#e9c565]">180 درهم</span>
            </div>
          </button>
        </div>

        <div className="mt-10 grid gap-6 border-t border-[#2f2817] pt-8 sm:grid-cols-3">
          <div>
            <div className="font-display text-2xl font-bold tabular-nums text-[#e9c565]">4.8 / 5</div>
            <p className="mt-1 text-sm text-[#a99d83]">تقييم موثّق من 1,240 طلب في المغرب</p>
          </div>
          <div>
            <div className="font-display text-2xl font-bold tabular-nums text-[#e9c565]">100% طبيعي</div>
            <p className="mt-1 text-sm text-[#a99d83]">مستخلص على البارد، غير مسخّن وغير مصفّى</p>
          </div>
          <div>
            <div className="font-display text-2xl font-bold tabular-nums text-[#e9c565]">قبل 15:00</div>
            <p className="mt-1 text-sm text-[#a99d83]">توصيل في نفس اليوم داخل الدار البيضاء ومجاني فوق 300 درهم</p>
          </div>
        </div>
      </div>
    </section>
  );
}
