import { ShoppingBag } from 'lucide-react';

interface HeaderProps {
  cartCount: number;
  storePhoneDisplay: string;
  onOpenCart: () => void;
  onOpenTracking: () => void;
}

export function Header({
  cartCount,
  storePhoneDisplay,
  onOpenCart,
  onOpenTracking,
}: HeaderProps) {
  return (
    <>
      <div className="border-b border-[#4a3a14]/70 bg-black text-xs text-[#e9c565]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-2">
          <span className="truncate">
            توصيل مجاني في الدار البيضاء من 300 درهم · شحن في نفس اليوم
          </span>
          <a
            href={`tel:${storePhoneDisplay.replace(/\s+/g, '')}`}
            dir="ltr"
            className="shrink-0 whitespace-nowrap hover:underline"
          >
            {storePhoneDisplay}
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-20 border-b border-[#4a3a14] bg-[#090806]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-8 px-5 py-3.5">
          <a
            href="#top"
            className="gold-text font-display shrink-0 whitespace-nowrap text-2xl font-bold tracking-tight"
          >
            كرامو راشد
          </a>

          <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-7 text-sm font-medium text-[#a99d83] md:flex">
            <a href="#shop" className="shrink-0 whitespace-nowrap transition-colors hover:text-[#f4ecd8]">
              المتجر
            </a>
            <a href="#craft" className="shrink-0 whitespace-nowrap transition-colors hover:text-[#f4ecd8]">
              طريقة الحصاد
            </a>
            <a href="#reviews" className="shrink-0 whitespace-nowrap transition-colors hover:text-[#f4ecd8]">
              آراء العملاء
            </a>
            <button
              type="button"
              onClick={onOpenTracking}
              className="shrink-0 whitespace-nowrap transition-colors hover:text-[#f4ecd8]"
            >
              تتبّع طلبي
            </button>
          </nav>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label="فتح السلة"
            className="gold-fill inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-[#120e05] transition-transform duration-150 hover:brightness-105 active:scale-[0.98]"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span>السلة</span>
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md bg-[#120e05] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[#e9c565]">
              {cartCount}
            </span>
          </button>
        </div>
      </header>
    </>
  );
}
