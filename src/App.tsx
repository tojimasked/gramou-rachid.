import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { PRODUCTS as DEFAULT_PRODUCTS } from './data/products.ts';
import type {
  AnalyticsEventType,
  CartEntry,
  Order,
  Product,
  ProductCategory,
  ProductRatingSummary,
  StorePublicConfig,
} from './types.ts';
import { Header } from './components/Header.tsx';
import { Hero } from './components/Hero.tsx';
import { CatalogSection, type SortOption } from './components/CatalogSection.tsx';
import { CraftAndReviews } from './components/CraftAndReviews.tsx';
import { Footer } from './components/Footer.tsx';
import { ProductModal } from './components/ProductModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { OrderTrackingModal } from './components/OrderTrackingModal.tsx';
import { OwnerPortalPage } from './components/OwnerPortalPage.tsx';
import {
  getTrackedOrderIds,
  showBrowserOrderNotification,
  subscribeTrackedOrderListChanges,
  syncExistingPushSubscription,
  type OrderPushNotificationEvent,
} from './lib/notifications.ts';
import { getDeviceProfile } from './lib/device.ts';

const CART_STORAGE_KEY = 'kr-cart-v3';
const VISITOR_ID_KEY = 'kr-visitor-v1';

function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    return `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function StorefrontApp() {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [config, setConfig] = useState<StorePublicConfig>({
    ownerWhatsapp: '212615994602',
    hasOwnerEmail: true,
    freeShippingThreshold: 300,
    storePhoneDisplay: '+212 615 994 602',
  });

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('كل المنتجات');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  const [cart, setCart] = useState<CartEntry[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [activeProductState, setActiveProductState] = useState<{
    product: Product;
    sizeIndex?: number;
  } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingInitialQuery, setTrackingInitialQuery] = useState<string | undefined>(undefined);
  const [trackedOrderIds, setTrackedOrderIds] = useState<string[]>(getTrackedOrderIds);
  const [latestOrderStatusEvent, setLatestOrderStatusEvent] =
    useState<OrderPushNotificationEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const visitorIdRef = useRef<string>(getOrCreateVisitorId());

  const trackEvent = useCallback(
    (type: Exclude<AnalyticsEventType, 'purchase'>, productId?: number) => {
      void getDeviceProfile()
        .then((profile) =>
          fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              visitorId: visitorIdRef.current,
              productId,
              device: profile.device,
              deviceName: profile.deviceName,
              os: profile.os,
              browser: profile.browser,
              screenSize: profile.screenSize,
              timezone: profile.timezone,
              language: profile.language,
            }),
          }),
        )
        .catch(() => {});
    },
    [],
  );

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = (await res.json()) as StorePublicConfig;
        setConfig(data);
      }
    } catch {
      // Keep defaults if offline
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { products?: Product[] } | null) => {
        if (data?.products?.length) {
          setProducts(data.products);
        }
      })
      .catch(() => {});
  }, [fetchConfig]);

  useEffect(() => {
    trackEvent('visit');
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        trackEvent('visit');
      }
    }, 120_000);
    return () => window.clearInterval(interval);
  }, [trackEvent]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const trackOrderId = params.get('track')?.trim();
    if (trackOrderId) {
      setTrackingInitialQuery(trackOrderId);
      setTrackingOpen(true);
    }
    return subscribeTrackedOrderListChanges((ids) => {
      setTrackedOrderIds(ids);
    });
  }, []);

  useEffect(() => {
    if (trackedOrderIds.length === 0) return;
    void syncExistingPushSubscription(trackedOrderIds);

    const streamUrl = `/api/orders/stream?orderIds=${encodeURIComponent(trackedOrderIds.join(','))}`;
    const eventSource = new EventSource(streamUrl);

    const onOrderStatus = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as OrderPushNotificationEvent;
        if (!parsed?.orderId || !parsed?.title) return;
        setLatestOrderStatusEvent(parsed);
        setToast(`${parsed.title} — ${parsed.body}`);
        void showBrowserOrderNotification(parsed);
      } catch {
        // Ignore malformed SSE payload
      }
    };

    eventSource.addEventListener('order_status', onOrderStatus);
    return () => {
      eventSource.removeEventListener('order_status', onOrderStatus);
      eventSource.close();
    };
  }, [trackedOrderIds]);

  function openProductModal(product: Product, sizeIndex?: number) {
    setActiveProductState({ product, sizeIndex });
    trackEvent('product_view', product.id);
  }

  function addToCart(product: Product, sizeIndex: number, quantity: number) {
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === product.id && item.sizeIndex === sizeIndex,
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + quantity,
        };
        return updated;
      }
      return [...prev, { productId: product.id, sizeIndex, quantity }];
    });
    trackEvent('add_to_cart', product.id);
    setToast(`أُضيف إلى السلة: ${product.name}`);
  }

  function updateQuantity(productId: number, sizeIndex: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.sizeIndex === sizeIndex
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function handleOrderSuccess(order: Order) {
    setCart([]);
    setToast(`تم تسجيل الطلب #${order.id} بنجاح`);
  }

  function handleRatingUpdated(productId: number, summary: ProductRatingSummary) {
    setProducts((prev) =>
      prev.map((item) =>
        item.id === productId
          ? { ...item, rating: summary.rating, reviewCount: summary.reviewCount }
          : item,
      ),
    );
    setActiveProductState((prev) =>
      prev && prev.product.id === productId
        ? {
            ...prev,
            product: {
              ...prev.product,
              rating: summary.rating,
              reviewCount: summary.reviewCount,
            },
          }
        : prev,
    );
  }

  const totalItems = cart.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <div className="min-h-screen bg-[#090806] text-[#f4ecd8]">
      <Header
        cartCount={totalItems}
        storePhoneDisplay={config.storePhoneDisplay}
        onOpenCart={() => setCartOpen(true)}
        onOpenTracking={() => setTrackingOpen(true)}
      />

      <main>
        <Hero
          onSelectCategory={(cat) => setSelectedCategory(cat)}
          onOpenFeatured={() => {
            const featured = products.find((p) => p.id === 3) ?? products[0];
            if (featured) openProductModal(featured);
          }}
        />

        <CatalogSection
          products={products}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          sortBy={sortBy}
          onSelectCategory={setSelectedCategory}
          onSearchChange={setSearchQuery}
          onSortChange={setSortBy}
          onQuickAdd={(product, sizeIndex) => addToCart(product, sizeIndex, 1)}
          onViewProduct={openProductModal}
        />

        <CraftAndReviews />
      </main>

      <Footer
        ownerWhatsapp={config.ownerWhatsapp}
        storePhoneDisplay={config.storePhoneDisplay}
        onSelectCategory={setSelectedCategory}
        onOpenTracking={() => setTrackingOpen(true)}
      />

      <a
        href={`https://wa.me/${config.ownerWhatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصل عبر واتساب"
        className="fixed bottom-4 left-4 z-20 inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2.5 text-sm font-semibold text-[#07210f] shadow-lg transition-transform hover:scale-[1.03]"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        <span>واتساب</span>
      </a>

      <ProductModal
        product={activeProductState?.product ?? null}
        initialSizeIndex={activeProductState?.sizeIndex}
        onClose={() => setActiveProductState(null)}
        onRatingUpdated={handleRatingUpdated}
        onAddToCart={(product, sizeIndex, qty) => {
          addToCart(product, sizeIndex, qty);
          setCartOpen(true);
        }}
      />

      <CartDrawer
        open={cartOpen}
        items={cart}
        products={products}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={updateQuantity}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
          trackEvent('checkout_start');
        }}
      />

      <CheckoutModal
        open={checkoutOpen}
        items={cart}
        products={products}
        visitorId={visitorIdRef.current}
        onClose={() => setCheckoutOpen(false)}
        onOrderSuccess={handleOrderSuccess}
      />

      <OrderTrackingModal
        open={trackingOpen}
        initialQuery={trackingInitialQuery}
        latestStatusEvent={latestOrderStatusEvent}
        onClose={() => setTrackingOpen(false)}
      />

      {toast && (
        <div
          role="status"
          className="gold-fill fixed bottom-5 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold text-[#120e05] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const isOwnerRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/owner' ||
      window.location.pathname.startsWith('/owner/'));

  if (isOwnerRoute) {
    return <OwnerPortalPage />;
  }

  return <StorefrontApp />;
}
