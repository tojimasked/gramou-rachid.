import { useEffect, useState, type FormEvent } from 'react';
import { Minus, Plus, Star, X } from 'lucide-react';
import { calcVariantPrice } from '../data/products.ts';
import type { Product, ProductRatingSummary, ProductReview } from '../types.ts';
import { ProductVisual } from './ProductVisual.tsx';

interface ProductModalProps {
  product: Product | null;
  initialSizeIndex?: number;
  onClose: () => void;
  onAddToCart: (product: Product, sizeIndex: number, quantity: number) => void;
  onRatingUpdated?: (productId: number, summary: ProductRatingSummary) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'ضعيف',
  2: 'مقبول',
  3: 'جيد',
  4: 'جيد جدًا',
  5: 'ممتاز جدًا',
};

function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function StaticStars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const rounded = Math.round(rating);
  const iconCls = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${iconCls} ${
            star <= rounded
              ? 'fill-[#d4a537] text-[#d4a537]'
              : 'fill-transparent text-[#4a3f28]'
          }`}
        />
      ))}
    </span>
  );
}

export function ProductModal({
  product,
  initialSizeIndex,
  onClose,
  onAddToCart,
  onRatingUpdated,
}: ProductModalProps) {
  const [sizeIndex, setSizeIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [liveSummary, setLiveSummary] = useState<ProductRatingSummary | null>(null);

  const [draftRating, setDraftRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [city, setCity] = useState('');
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      const targetIdx =
        initialSizeIndex !== undefined && product.sizes[initialSizeIndex]
          ? initialSizeIndex
          : product.defaultSizeIndex;
      setSizeIndex(targetIdx);
      setQuantity(1);
      setLiveSummary({ rating: product.rating, reviewCount: product.reviewCount });
      setDraftRating(5);
      setHoverRating(null);
      setReviewError(null);
      setReviewSuccess(null);
    }
  }, [product, initialSizeIndex]);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    setLoadingReviews(true);
    fetch(`/api/products/${product.id}/reviews`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { reviews?: ProductReview[]; summary?: ProductRatingSummary } | null) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.reviews)) {
          setReviews(data.reviews);
        }
        if (data.summary) {
          setLiveSummary(data.summary);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingReviews(false);
      });

    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  if (!product) return null;

  const size = product.sizes[sizeIndex] || product.sizes[product.defaultSizeIndex];
  const activeImage = product.sizeImages?.[sizeIndex] || product.image;
  const unitPrice = calcVariantPrice(product.basePrice, size.multiplier);
  const oldPrice = product.originalPrice
    ? calcVariantPrice(product.originalPrice, size.multiplier)
    : 0;

  const displayedRating = liveSummary?.rating ?? product.rating;
  const displayedReviewCount = liveSummary?.reviewCount ?? product.reviewCount;
  const activeStarValue = hoverRating ?? draftRating;

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!product) return;

    const cleanName = authorName.trim();
    const cleanCity = city.trim();
    const cleanComment = comment.trim();

    if (cleanName.length < 2) {
      setReviewError('يرجى إدخال اسمك (حرفان على الأقل).');
      return;
    }
    if (cleanComment.length < 5) {
      setReviewError('يرجى كتابة تعليق موجز حول تجربتك مع المنتج (5 أحرف على الأقل).');
      return;
    }

    setSubmittingReview(true);
    setReviewError(null);
    setReviewSuccess(null);

    try {
      const res = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: cleanName,
          city: cleanCity,
          rating: draftRating,
          comment: cleanComment,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reviews?: ProductReview[];
        summary?: ProductRatingSummary;
      };

      if (!res.ok) {
        setReviewError(data.error || 'تعذر حفظ تقييمك الآن. يرجى المحاولة مجددًا.');
        return;
      }

      if (Array.isArray(data.reviews)) {
        setReviews(data.reviews);
      }
      if (data.summary) {
        setLiveSummary(data.summary);
        onRatingUpdated?.(product.id, data.summary);
      }

      setAuthorName('');
      setCity('');
      setComment('');
      setDraftRating(5);
      setReviewSuccess('تم نشر تقييمك بنجاح. شكرًا لمشاركتك رأيك معنا!');
    } catch {
      setReviewError('حدث خطأ في الاتصال. يرجى التحقق والمحاولة مرة أخرى.');
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="max-h-[90vh] w-full max-w-[840px] overflow-y-auto rounded-2xl border border-[#6b5420] bg-[#100e0a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col border-b border-[#2f2817] bg-[#0e0c08] md:border-b-0 md:border-l">
            <div className="relative aspect-square w-full overflow-hidden">
              <ProductVisual
                key={`${product.id}-${activeImage}`}
                product={product}
                imageOverride={activeImage}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090806]/65 via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-xs text-[#f4ecd8]">
                <span>{product.unitLabel}</span>
                <span className="font-semibold tabular-nums text-[#e9c565]">{size.label}</span>
              </div>
            </div>

            {product.sizes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-[#2f2817] bg-[#0a0805] p-3">
                {product.sizes.map((s, idx) => {
                  const thumbSrc = product.sizeImages?.[idx] || product.image;
                  const active = idx === sizeIndex;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setSizeIndex(idx)}
                      aria-label={`عرض صورة ${s.label}`}
                      aria-pressed={active}
                      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition-all ${
                        active
                          ? 'border-[#d4a537] ring-2 ring-[#d4a537]/40'
                          : 'border-[#2f2817] opacity-65 hover:border-[#d4a537]/60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={thumbSrc}
                        alt={s.label}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#a99d83]">{product.category}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="rounded-lg p-1.5 text-[#a99d83] transition-colors hover:bg-[#1c1810] hover:text-[#f4ecd8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h2 className="gold-text font-display text-2xl font-bold">{product.name}</h2>

            <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums text-[#e9c565]">
              <StaticStars rating={displayedRating} size="md" />
              <span className="font-semibold">{displayedRating}</span>
              <span className="text-xs text-[#a99d83]">({displayedReviewCount} تقييم)</span>
            </div>

            <p className="text-sm leading-relaxed text-[#a99d83]">{product.description}</p>

            <div className="pt-1">
              <div className="mb-2 text-sm font-semibold text-[#f4ecd8]">
                {product.variantPrompt || 'اختر الحجم'}
              </div>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s, idx) => {
                  const active = idx === sizeIndex;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSizeIndex(idx)}
                      className={`rounded-lg border px-3.5 py-1.5 text-sm transition-colors ${
                        active
                          ? 'border-[#d4a537] bg-[#d4a537] font-semibold text-[#120e05]'
                          : 'border-[#2f2817] bg-[#13110c] text-[#f4ecd8] hover:border-[#d4a537]'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums text-[#e9c565]">
                {unitPrice} درهم
              </span>
              {oldPrice > 0 && (
                <s className="text-sm tabular-nums text-[#a99d83]">{oldPrice} درهم</s>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3">
              <div className="inline-flex items-center rounded-lg border border-[#2f2817] bg-[#13110c] p-1">
                <button
                  type="button"
                  aria-label="أنقص الكمية"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[#f4ecd8] hover:bg-[#1c1810]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[2.25rem] text-center text-sm font-semibold tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="زِد الكمية"
                  onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[#f4ecd8] hover:bg-[#1c1810]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onAddToCart(product, sizeIndex, quantity);
                  onClose();
                }}
                className="gold-fill flex-1 whitespace-nowrap rounded-lg px-5 py-3 text-sm font-semibold text-[#120e05] transition-all hover:brightness-105"
              >
                أضف {unitPrice * quantity} درهم إلى السلة
              </button>
            </div>

            <p className="mt-auto pt-2 text-xs text-[#a99d83]">
              توصيل مجاني فوق 300 درهم · اطلب قبل 15:00 للتوصيل في نفس اليوم
            </p>
          </div>
        </div>

        <div className="border-t border-[#2f2817] bg-[#0b0906] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-bold text-[#f4ecd8]">
                تقييمات العملاء وآراؤهم
              </h3>
              <p className="mt-0.5 text-xs text-[#a99d83]">
                شارك تجربتك مع جودة المنتج لمساعدة العملاء الآخرين
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm tabular-nums text-[#e9c565]">
              <StaticStars rating={displayedRating} size="md" />
              <span className="font-bold">{displayedRating} / 5</span>
              <span className="text-xs text-[#a99d83]">· {displayedReviewCount} تقييم</span>
            </div>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
            <form
              onSubmit={handleSubmitReview}
              className="flex flex-col gap-3 rounded-xl border border-[#2f2817] bg-[#13110c] p-4"
            >
              <div className="text-sm font-semibold text-[#f4ecd8]">أضف تقييمك</div>

              <div>
                <span className="mb-1.5 block text-xs text-[#a99d83]">التقييم بالنجوم</span>
                <div
                  role="group"
                  aria-label="اختر التقييم من 1 إلى 5 نجوم"
                  className="flex items-center gap-2"
                >
                  <div
                    className="inline-flex items-center gap-1"
                    onMouseLeave={() => setHoverRating(null)}
                  >
                    {[1, 2, 3, 4, 5].map((starValue) => {
                      const active = starValue <= activeStarValue;
                      return (
                        <button
                          key={starValue}
                          type="button"
                          onMouseEnter={() => setHoverRating(starValue)}
                          onClick={() => setDraftRating(starValue)}
                          aria-label={`${starValue} من 5 نجوم`}
                          aria-pressed={draftRating === starValue}
                          className="rounded-md p-1 transition-transform hover:scale-110"
                        >
                          <Star
                            className={`h-6 w-6 transition-colors ${
                              active
                                ? 'fill-[#d4a537] text-[#d4a537]'
                                : 'fill-transparent text-[#4a3f28] hover:text-[#d4a537]/60'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-medium text-[#e9c565]">
                    {RATING_LABELS[activeStarValue]} ({activeStarValue}/5)
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="review-author" className="mb-1 block text-xs text-[#a99d83]">
                    الاسم
                  </label>
                  <input
                    id="review-author"
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="مثال: كريم ب."
                    className="w-full rounded-lg border border-[#2f2817] bg-[#0e0c08] px-3 py-2 text-sm text-[#f4ecd8] placeholder:text-[#a99d83]/60 focus:border-[#d4a537] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="review-city" className="mb-1 block text-xs text-[#a99d83]">
                    المدينة (اختياري)
                  </label>
                  <input
                    id="review-city"
                    type="text"
                    maxLength={40}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="مثال: الدار البيضاء"
                    className="w-full rounded-lg border border-[#2f2817] bg-[#0e0c08] px-3 py-2 text-sm text-[#f4ecd8] placeholder:text-[#a99d83]/60 focus:border-[#d4a537] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="review-comment" className="mb-1 block text-xs text-[#a99d83]">
                  رأيك حول جودة المنتج
                </label>
                <textarea
                  id="review-comment"
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="حدثنا عن الطعم والقوام وجودة التغليف وسرعة التوصيل..."
                  className="w-full resize-none rounded-lg border border-[#2f2817] bg-[#0e0c08] px-3 py-2 text-sm text-[#f4ecd8] placeholder:text-[#a99d83]/60 focus:border-[#d4a537] focus:outline-none"
                />
              </div>

              {reviewError && (
                <p role="alert" className="text-xs font-medium text-red-400">
                  {reviewError}
                </p>
              )}
              {reviewSuccess && (
                <p role="status" className="text-xs font-medium text-emerald-400">
                  {reviewSuccess}
                </p>
              )}

              <button
                type="submit"
                disabled={submittingReview}
                className="gold-fill mt-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold text-[#120e05] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingReview ? 'جارٍ إرسال التقييم...' : 'نشر التقييم'}
              </button>
            </form>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-[#a99d83]">
                <span>آراء المشترين ({reviews.length})</span>
                {loadingReviews && <span>جارٍ التحميل...</span>}
              </div>

              {!loadingReviews && reviews.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[#2f2817] bg-[#13110c] px-4 py-8 text-center">
                  <StaticStars rating={5} size="md" />
                  <p className="mt-2 text-sm font-medium text-[#f4ecd8]">
                    لا توجد تعليقات مكتوبة بعد لهذا المنتج
                  </p>
                  <p className="mt-1 text-xs text-[#a99d83]">
                    كن أول من يشارك تقييمه حول جودة {product.name}.
                  </p>
                </div>
              ) : (
                <div className="max-h-[300px] space-y-3 overflow-y-auto pl-1">
                  {reviews.map((rev) => (
                    <article
                      key={rev.id}
                      className="rounded-xl border border-[#2f2817] bg-[#13110c] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-[#f4ecd8]">{rev.authorName}</span>
                          {rev.city && (
                            <>
                              <span aria-hidden="true" className="text-[#a99d83]">·</span>
                              <span className="text-[#a99d83]">{rev.city}</span>
                            </>
                          )}
                        </div>
                        <StaticStars rating={rev.rating} size="sm" />
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[#cbbd9f]">
                        «{rev.comment}»
                      </p>
                      <div className="mt-2 text-[11px] tabular-nums text-[#a99d83]">
                        {formatReviewDate(rev.createdAt)}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

