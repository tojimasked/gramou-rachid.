export type ProductCategory =
  | 'كل المنتجات'
  | 'عناية بالشعر'
  | 'عناية بالبشرة'
  | 'عسل طبيعي'
  | 'عسل فاخر'
  | 'شمع العسل'
  | 'منتجات النحل'
  | 'علب الهدايا'
  | 'مؤونة المطبخ';

export type ProductShape = 'jar' | 'bottle' | 'comb' | 'bag' | 'box';

export interface ProductSize {
  label: string;
  multiplier: number;
}

export interface Product {
  id: number;
  name: string;
  category: Exclude<ProductCategory, 'كل المنتجات'>;
  basePrice: number;
  originalPrice: number;
  rating: number;
  reviewCount: number;
  badge?: string;
  color: string;
  sizes: ProductSize[];
  defaultSizeIndex: number;
  unitLabel: string;
  variantPrompt?: string;
  description: string;
  shape: ProductShape;
  image: string;
  sizeImages?: Record<number, string>;
}

export interface ProductReview {
  id: string;
  productId: number;
  authorName: string;
  city?: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ProductRatingSummary {
  rating: number;
  reviewCount: number;
}

export interface CartEntry {
  productId: number;
  sizeIndex: number;
  quantity: number;
}

export type OrderStatus = 'new' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: number;
  productName: string;
  sizeLabel: string;
  unitLabel: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface DeliveryChannelResult {
  sent: boolean;
  destination: string;
  message: string;
  timestamp: string;
}

export interface Order {
  id: string;
  createdAt: string;
  status: OrderStatus;
  customer: {
    name: string;
    phone: string;
    address: string;
    notes?: string;
  };
  items: OrderItem[];
  subtotal: number;
  freeShipping: boolean;
  total: number;
  whatsappUrl: string;
  customerWhatsappUrl?: string;
  whatsappMessage: string;
  receiptImageUrl?: string;
  receiptPageUrl?: string;
  delivery: {
    email: DeliveryChannelResult;
    whatsappApi: DeliveryChannelResult;
  };
}

export interface StorePublicConfig {
  ownerWhatsapp: string;
  hasOwnerEmail: boolean;
  freeShippingThreshold: number;
  storePhoneDisplay: string;
}

export interface AdminStoreSettings {
  ownerEmail: string;
  ownerWhatsapp: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  hasSmtpPass: boolean;
  whatsappPhoneNumberId: string;
  hasWhatsappToken: boolean;
}

export interface InventoryItem {
  productId: number;
  productName: string;
  category: string;
  unitLabel: string;
  stock: number;
  lowStockThreshold: number;
  lastAlertedAt?: string;
}

export interface LowStockAlert {
  id: string;
  createdAt: string;
  productId: number;
  productName: string;
  stock: number;
  threshold: number;
  emailSent: boolean;
  emailMessage?: string;
  whatsappSent: boolean;
  whatsappUrl: string;
  acknowledged: boolean;
}

export type AnalyticsEventType =
  | 'visit'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_start'
  | 'purchase';

export interface OwnerAuthStatus {
  configured: boolean;
  authenticated: boolean;
  envLocked: boolean;
}

export interface OwnerDailyAnalyticsPoint {
  dateKey: string;
  label: string;
  visits: number;
  uniqueVisitors: number;
  orders: number;
  revenue: number;
}

export interface OwnerProductEngagement {
  productId: number;
  productName: string;
  category: string;
  views: number;
  addToCarts: number;
  unitsSold: number;
  revenue: number;
}

export interface OwnerRecentActivityItem {
  id: string;
  type: AnalyticsEventType;
  timestamp: string;
  device: 'mobile' | 'desktop';
  deviceName?: string;
  locationLabel?: string;
  productName?: string;
  orderId?: string;
  orderTotal?: number;
}

export type DeviceLocationSource = 'proxy' | 'ip' | 'order' | 'timezone';

export interface OwnerDeviceRecord {
  visitorId: string;
  deviceType: 'mobile' | 'desktop';
  deviceName: string;
  os: string;
  browser: string;
  screenSize?: string;
  locationLabel: string;
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  language?: string;
  locationSource: DeviceLocationSource;
  firstSeenAt: string;
  lastSeenAt: string;
  visitCount: number;
  isOnlineNow: boolean;
  lastEventType?: AnalyticsEventType;
  ordersCount: number;
  totalSpent: number;
  customerName?: string;
}

export interface OwnerLocationSummary {
  locationLabel: string;
  city?: string;
  country?: string;
  devicesCount: number;
  activeNowCount: number;
  ordersCount: number;
}

export interface OwnerAnalyticsSummary {
  generatedAt: string;
  activeVisitorsNow: number;
  todayVisits: number;
  todayUniqueVisitors: number;
  todayOrders: number;
  todayRevenue: number;
  monthVisits: number;
  monthUniqueVisitors: number;
  monthOrders: number;
  monthRevenue: number;
  totalVisits: number;
  totalUniqueVisitors: number;
  totalBuyers: number;
  totalOrders: number;
  totalUnitsSold: number;
  totalRevenue: number;
  conversionRatePct: number;
  averageOrderValue: number;
  funnel: {
    visits: number;
    productViews: number;
    addToCarts: number;
    checkoutsStarted: number;
    purchases: number;
  };
  deviceBreakdown: {
    mobile: number;
    desktop: number;
  };
  dailySeries: OwnerDailyAnalyticsPoint[];
  productEngagement: OwnerProductEngagement[];
  recentEvents: OwnerRecentActivityItem[];
  devices: OwnerDeviceRecord[];
  locationBreakdown: OwnerLocationSummary[];
}

