import { Minus, Plus, X } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, calcVariantPrice } from '../data/products.ts';
import type { CartEntry, Product } from '../types.ts';
import { ProductVisual } from './ProductVisual.tsx';

interface CartDrawerProps {
  open: boolean;
  items: CartEntry[];
  products: Product[];
  onClose: () => void;
  onUpdateQuantity: (productId: number, sizeIndex: number, delta: number) => void;
  onCheckout: () => void;
}

export function CartDrawer({
  open,
  items,
  products,
  onClose,
  onUpdateQuantity,
  onCheckout,
}: CartDrawerProps) {
  const enriched = items
    .map((entry) => {
      const product = products.find((p) => p.id === entry.productId);
      if (!product) return null;
      const size = product.sizes[entry.sizeIndex] || product.sizes[product.defaultSizeIndex];
      const unitPrice = calcVariantPrice(product.basePrice, size.multiplier);
      return {
        ...entry,
        product,
        size,
        unitPrice,
        lineTotal: unitPrice * entry.quantity,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const subtotal = enriched.reduce((sum, item) => sum + item.lineTotal, 0);
  const progressPct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/65 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="سلة التسوق"
        className="fixed inset-y-0 left-0 z-50 flex w-full max-w-[420px] flex-col border-r border-[#6b5420] bg-[#100e0a]"
      >
        <div className="flex items-center justify-between border-b border-[#2f2817] px-5 py-4">
          <h2 className="font-display text-xl font-bold text-[#f4ecd8]">سلتك</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق السلة"
            className="rounded-lg p-1.5 text-[#a99d83] hover:bg-[#1c1810] hover:text-[#f4ecd8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {enriched.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#a99d83]">
              سلتك فارغة حاليًا. أضف عسلًا من المتجر لتبدأ.
            </div>
          ) : (
            <ul className="divide-y divide-[#2f2817]">
              {enriched.map((item) => (
                <li
                  key={`${item.productId}-${item.sizeIndex}`}
                  className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 py-4"
                >
                  <div className="h-14 w-14 overflow-hidden rounded-lg border border-[#2f2817] bg-[#0e0c08]">
                    <ProductVisual
                      product={item.product}
                      imageOverride={item.product.sizeImages?.[item.sizeIndex]}
                    />
                  </div>
                  <div>
                    <div className="font-semibold text-[#f4ecd8]">{item.product.name}</div>
                    <div className="mt-0.5 text-xs text-[#a99d83]">
                      {item.product.unitLabel} {item.size.label} · {item.unitPrice} درهم
                    </div>
                  </div>
                  <div className="text-left font-semibold tabular-nums text-[#e9c565]">
                    {item.lineTotal} درهم
                  </div>
                  <div className="col-span-3 flex items-center justify-between pr-[4.25rem]">
                    <div className="inline-flex items-center rounded-lg border border-[#2f2817] bg-[#13110c] p-0.5">
                      <button
                        type="button"
                        aria-label="أنقص"
                        onClick={() =>
                          onUpdateQuantity(item.productId, item.sizeIndex, -1)
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#f4ecd8] hover:bg-[#1c1810]"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[2rem] text-center text-xs font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="زِد"
                        onClick={() =>
                          onUpdateQuantity(item.productId, item.sizeIndex, 1)
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#f4ecd8] hover:bg-[#1c1810]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-[#2f2817] bg-[#0c0a07] p-5">
          <div className="text-xs text-[#a99d83]">
            {subtotal >= FREE_SHIPPING_THRESHOLD
              ? 'طلبك مؤهل للتوصيل المجاني داخل الدار البيضاء.'
              : `أضف ${FREE_SHIPPING_THRESHOLD - subtotal} درهم للحصول على توصيل مجاني داخل الدار البيضاء.`}
          </div>
          <div className="mt-2 mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[#2f2817]">
            <div
              className="gold-fill h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mb-3 flex items-center justify-between text-base font-bold">
            <span>المجموع</span>
            <span className="tabular-nums text-[#e9c565]">{subtotal} درهم</span>
          </div>

          <button
            type="button"
            disabled={enriched.length === 0}
            onClick={onCheckout}
            className="gold-fill w-full rounded-lg px-5 py-3 text-sm font-semibold text-[#120e05] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            أكمل الطلب
          </button>
        </div>
      </aside>
    </>
  );
}
