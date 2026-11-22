import { CATEGORIES } from '../data/products.ts';
import type { ProductCategory } from '../types.ts';

interface FooterProps {
  ownerWhatsapp: string;
  storePhoneDisplay: string;
  onSelectCategory: (cat: ProductCategory) => void;
  onOpenTracking: () => void;
}

export function Footer({
  ownerWhatsapp,
  storePhoneDisplay,
  onSelectCategory,
  onOpenTracking,
}: FooterProps) {
  return (
    <footer className="border-t border-[#4a3a14] bg-black pt-12 pb-8">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <h3 className="font-display text-lg font-bold text-[#e9c565]">كرامو راشد</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-[#a99d83]">
              عسل مغربي خالص، أملو تقليدي، وزيوت وعناية طبيعية بالشعر والبشرة 100% من خيرات التراب المغربي.
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-[#e9c565]">المتجر</h3>
            <ul className="mt-2.5 space-y-1.5 text-sm text-[#a99d83]">
              {CATEGORIES.map((category) => (
                <li key={category}>
                  <a
                    href="#shop"
                    onClick={() => onSelectCategory(category)}
                    className="transition-colors hover:text-[#e9c565]"
                  >
                    {category}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-[#e9c565]">الطلبات والمساعدة</h3>
            <ul className="mt-2.5 space-y-1.5 text-sm text-[#a99d83]">
              <li>
                <a href="#craft" className="transition-colors hover:text-[#e9c565]">
                  كيف نحصد العسل
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenTracking}
                  className="transition-colors hover:text-[#e9c565]"
                >
                  تتبّع طلبي
                </button>
              </li>
              <li>
                <a
                  href={`https://wa.me/${ownerWhatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#e9c565]"
                >
                  البيع بالجملة والمطاعم
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-[#e9c565]">زور المتجر</h3>
            <div className="mt-2.5 space-y-1.5 text-sm text-[#a99d83]">
              <p>HCHJ+8XV، الدار البيضاء 20250، المغرب</p>
              <p dir="ltr" className="text-right">
                <a href={`tel:${storePhoneDisplay.replace(/\s+/g, '')}`} className="hover:text-[#e9c565]">
                  {storePhoneDisplay}
                </a>
              </p>
              <p>الاثنين – السبت: 09:00 – 20:00</p>
              <p>الأحد: 10:00 – 18:00</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#2f2817] pt-5 text-xs text-[#a99d83]">
          <span>© 2026 كرامو راشد. جميع الحقوق محفوظة.</span>
          <span>الدفع عند الاستلام · الدار البيضاء، المغرب</span>
        </div>
      </div>
    </footer>
  );
}
