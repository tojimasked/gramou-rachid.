import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { CATEGORIES, calcVariantPrice } from '../data/products.ts';
import type { Product, ProductCategory } from '../types.ts';
import { ProductVisual } from './ProductVisual.tsx';
import { DealOfDayBanner } from './DealOfDayBanner.tsx';

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

interface CatalogSectionProps {
  products: Product[];
  selectedCategory: ProductCategory;
  searchQuery: string;
  sortBy: SortOption;
  onSelectCategory: (cat: ProductCategory) => void;
  onSearchChange: (q: string) => void;
  onSortChange: (sort: SortOption) => void;
  onQuickAdd: (product: Product, sizeIndex: number) => void;
  onViewProduct: (product: Product, sizeIndex?: number) => void;
}

function normalizeArabicText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function productMatchesQuery(product: Product, normalizedTerms: string[]): boolean {
  if (normalizedTerms.length === 0) return true;
  const searchable = normalizeArabicText(
    [
      product.name,
      product.category,
      product.description,
      product.unitLabel,
      product.badge || '',
      ...product.sizes.map((s) => s.label),
    ].join(' '),
  );
  return normalizedTerms.every((term) => searchable.includes(term));
}

export function CatalogSection({
  products,
  selectedCategory,
  searchQuery,
  sortBy,
  onSelectCategory,
  onSearchChange,
  onSortChange,
  onQuickAdd,
  onViewProduct,
}: CatalogSectionProps) {
  const [selectedSizes, setSelectedSizes] = useState<Record<number, number>>({});

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = normalizeArabicText(trimmedQuery);
  const queryTerms = normalizedQuery ? normalizedQuery.split(' ') : [];

  const matchingAcrossAllCategories = products.filter((p) =>
    productMatchesQuery(p, queryTerms),
  );

  const filtered = matchingAcrossAllCategories
    .filter(
      (p) => selectedCategory === 'كل المنتجات' || p.category === selectedCategory,
    )
    .sort((a, b) => {
      if (sortBy === 'price-asc') return a.basePrice - b.basePrice;
      if (sortBy === 'price-desc') return b.basePrice - a.basePrice;
      if (sortBy === 'rating') return b.rating - a.rating;
      return a.id - b.id;
    });

  return (
    <section id="shop" className="py-16">
      <div className="mx-auto max-w-[1200px] px-5">
        <DealOfDayBanner
          products={products}
          onQuickAdd={onQuickAdd}
          onViewProduct={onViewProduct}
        />

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="gold-text font-display text-3xl font-bold sm:text-4xl">
              العسل الطبيعي والعناية المغربية
            </h2>
            <p className="mt-1.5 text-sm text-[#a99d83] tabular-nums">
              {trimmedQuery
                ? `${filtered.length} نتيجة مطابقة لـ «${trimmedQuery}»`
                : `${filtered.length} منتج · الأسعار بالدرهم المغربي، والتوصيل في كل المغرب`}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#a99d83]">
            <span className="whitespace-nowrap">ترتيب:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="rounded-lg border border-[#2f2817] bg-[#13110c] px-3 py-2 text-sm text-[#f4ecd8] focus:border-[#d4a537] focus:outline-none"
            >
              <option value="featured">المميزة</option>
              <option value="price-asc">السعر: من الأقل</option>
              <option value="price-desc">السعر: من الأعلى</option>
              <option value="rating">الأعلى تقييمًا</option>
            </select>
          </label>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-[#d4a537]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && searchQuery) {
                  onSearchChange('');
                }
              }}
              placeholder="ابحث فوريًا عن عسل السدر، الأعشاب، الدغموس، شمع العسل، غذاء الملكات، أملو، زيت الشعر…"
              aria-label="بحث فوري في منتجات كرامو راشد"
              className="w-full rounded-xl border border-[#2f2817] bg-[#13110c] py-3.5 pr-12 pl-12 text-sm text-[#f4ecd8] placeholder:text-[#a99d83]/75 focus:border-[#d4a537] focus:outline-none sm:text-base"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="مسح البحث"
                className="absolute top-1/2 left-3 -translate-y-1/2 rounded-lg p-1.5 text-[#a99d83] transition-colors hover:bg-[#1c1810] hover:text-[#f4ecd8]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="تصفية المنتجات حسب الفئة"
          className="mb-8 flex gap-1.5 overflow-x-auto border-b border-[#2f2817] pb-3"
        >
          {CATEGORIES.map((category) => {
            const active = category === selectedCategory;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectCategory(category)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-[#d4a537] text-[#120e05] font-semibold'
                    : 'bg-[#13110c] text-[#a99d83] hover:bg-[#1c1810] hover:text-[#f4ecd8]'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-[#2f2817] bg-[#13110c] px-6 py-16 text-center">
            <p className="text-[#a99d83]">
              لا توجد منتجات مطابقة لبحثك
              {selectedCategory !== 'كل المنتجات' ? ` ضمن فئة «${selectedCategory}»` : ''}.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {selectedCategory !== 'كل المنتجات' && matchingAcrossAllCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectCategory('كل المنتجات')}
                  className="gold-fill rounded-lg px-5 py-2 text-sm font-semibold text-[#120e05] hover:brightness-105"
                >
                  عرض {matchingAcrossAllCategories.length} نتيجة في كل الفئات
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('كل المنتجات');
                  onSearchChange('');
                }}
                className="rounded-lg border border-[#d4a537]/70 px-5 py-2 text-sm font-medium text-[#e9c565] hover:bg-[#d4a537]/10"
              >
                إعادة ضبط البحث
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((product) => {
              const rawIdx = selectedSizes[product.id];
              const activeSizeIndex =
                rawIdx !== undefined && product.sizes[rawIdx]
                  ? rawIdx
                  : product.defaultSizeIndex;
              const activeSize =
                product.sizes[activeSizeIndex] || product.sizes[product.defaultSizeIndex];
              const activeImage = product.sizeImages?.[activeSizeIndex] || product.image;
              const displayPrice = calcVariantPrice(product.basePrice, activeSize.multiplier);
              const oldPrice = product.originalPrice
                ? calcVariantPrice(product.originalPrice, activeSize.multiplier)
                : 0;
              const discountPct =
                oldPrice > displayPrice
                  ? Math.round((1 - displayPrice / oldPrice) * 100)
                  : 0;

              return (
                <article
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#2f2817] bg-[#13110c] transition-transform duration-150 hover:-translate-y-0.5 hover:border-[#d4a537]/70"
                >
                  <button
                    type="button"
                    onClick={() => onViewProduct(product, activeSizeIndex)}
                    aria-label={`عرض تفاصيل ${product.name} (${activeSize.label})`}
                    className="relative aspect-square w-full overflow-hidden border-b border-[#2f2817] bg-[#0e0c08] text-start"
                  >
                    <ProductVisual
                      key={`${product.id}-${activeImage}`}
                      product={product}
                      imageOverride={activeImage}
                      className="transition-all duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090806]/65 via-transparent to-transparent ring-1 ring-inset ring-[#d4a537]/10" />
                    {product.badge && (
                      <span className="absolute right-3 bottom-3 rounded-md border border-[#d4a537]/30 bg-[#090806]/85 px-2.5 py-1 text-xs font-medium text-[#e9c565] backdrop-blur-sm">
                        {product.badge}
                      </span>
                    )}
                    <span className="absolute left-3 bottom-3 rounded-md border border-[#2f2817] bg-[#090806]/85 px-2.5 py-1 text-xs font-medium tabular-nums text-[#f4ecd8] backdrop-blur-sm">
                      {activeSize.label}
                    </span>
                  </button>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center gap-2 text-xs text-[#a99d83]">
                      <span>{product.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums text-[#e9c565]">
                        ★ {product.rating} ({product.reviewCount})
                      </span>
                    </div>

                    <h3
                      onClick={() => onViewProduct(product, activeSizeIndex)}
                      className="font-display mt-1.5 cursor-pointer text-lg font-semibold text-[#f4ecd8] transition-colors group-hover:text-[#e9c565]"
                    >
                      {product.name}
                    </h3>

                    <p className="mt-1 text-xs text-[#a99d83]">
                      {product.unitLabel} · {product.variantPrompt || 'اختر الحجم'}:
                    </p>

                    <div
                      role="group"
                      aria-label={product.variantPrompt || `خيارات ${product.name}`}
                      className="mt-2.5 flex flex-wrap gap-1.5"
                    >
                      {product.sizes.map((sizeOption, idx) => {
                        const isSelected = idx === activeSizeIndex;
                        return (
                          <button
                            key={sizeOption.label}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              setSelectedSizes((prev) => ({
                                ...prev,
                                [product.id]: idx,
                              }))
                            }
                            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
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

                    <div className="mt-4 flex items-baseline gap-2.5">
                      <span className="text-xl font-semibold tabular-nums text-[#e9c565]">
                        {displayPrice} درهم
                      </span>
                      {oldPrice > displayPrice && (
                        <>
                          <s className="text-sm tabular-nums text-[#a99d83]">
                            {oldPrice} درهم
                          </s>
                          {discountPct > 0 && (
                            <span className="text-xs font-medium text-[#e9c565]">
                              وفّر {discountPct}%
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="mt-auto grid grid-cols-[1fr_auto] gap-2.5 pt-4">
                      <button
                        type="button"
                        onClick={() => onQuickAdd(product, activeSizeIndex)}
                        className="gold-fill whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold text-[#120e05] transition-all duration-150 hover:brightness-105 active:scale-[0.98]"
                      >
                        أضف إلى السلة
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewProduct(product, activeSizeIndex)}
                        className="whitespace-nowrap rounded-lg border border-[#2f2817] px-4 py-2.5 text-sm font-medium text-[#f4ecd8] transition-colors hover:border-[#d4a537]"
                      >
                        التفاصيل
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

