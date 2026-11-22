import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import * as webpush from 'web-push';
import {
  PRODUCTS,
  CATEGORIES,
  FREE_SHIPPING_THRESHOLD,
  calcVariantPrice,
} from './src/data/products.ts';
import type {
  AdminStoreSettings,
  AnalyticsEventType,
  DeliveryChannelResult,
  DeviceLocationSource,
  InventoryItem,
  LowStockAlert,
  Order,
  OrderItem,
  OrderStatus,
  OwnerAnalyticsSummary,
  OwnerDailyAnalyticsPoint,
  OwnerDeviceRecord,
  OwnerLocationSummary,
  OwnerProductEngagement,
  OwnerRecentActivityItem,
  ProductRatingSummary,
  ProductReview,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'store-settings.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const OWNER_AUTH_FILE = path.join(DATA_DIR, 'owner-auth.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const VAPID_KEYS_FILE = path.join(DATA_DIR, 'vapid-keys.json');
const PUSH_SUBS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

const DEFAULT_STOCK = 20;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const OWNER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

interface PersistedInventoryEntry {
  stock: number;
  lowStockThreshold: number;
  lastAlertedAt?: string;
}

interface PersistedInventoryData {
  entries: Record<string, PersistedInventoryEntry>;
  alerts: LowStockAlert[];
}

interface PersistedSettings {
  ownerEmail: string;
  ownerWhatsapp: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  whatsappCloudToken: string;
  whatsappPhoneNumberId: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
}

function safeOrderId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '');
}

function getReceiptFilePath(orderId: string): string {
  return path.join(RECEIPTS_DIR, `${safeOrderId(orderId)}.png`);
}

function getPublicBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host']?.toString().split(',')[0] || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '212615994602';
  if (digits.startsWith('0') && digits.length === 10) {
    return '212' + digits.slice(1);
  }
  return digits;
}

function formatPhoneDisplay(whatsappDigits: string): string {
  if (whatsappDigits.startsWith('212') && whatsappDigits.length === 12) {
    const local = whatsappDigits.slice(3);
    return `+212 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+${whatsappDigits}`;
}

function loadSettings(): PersistedSettings {
  ensureDataDir();
  const defaults: PersistedSettings = {
    ownerEmail: process.env.OWNER_EMAIL?.trim() || 'gojosaturo109028@gmail.com',
    ownerWhatsapp: normalizeWhatsappNumber(process.env.OWNER_WHATSAPP || '212615994602'),
    smtpHost: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: process.env.SMTP_USER?.trim() || '',
    smtpPass: process.env.SMTP_PASS?.trim() || '',
    smtpFrom: process.env.SMTP_FROM?.trim() || 'كرامو راشد <orders@kramorachid.ma>',
    whatsappCloudToken: process.env.WHATSAPP_CLOUD_TOKEN?.trim() || '',
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '',
  };

  if (!fs.existsSync(SETTINGS_FILE)) {
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as Partial<PersistedSettings>;
    return {
      ownerEmail: raw.ownerEmail ?? defaults.ownerEmail,
      ownerWhatsapp: normalizeWhatsappNumber(raw.ownerWhatsapp || defaults.ownerWhatsapp),
      smtpHost: raw.smtpHost || defaults.smtpHost,
      smtpPort: Number(raw.smtpPort) || defaults.smtpPort,
      smtpUser: raw.smtpUser ?? defaults.smtpUser,
      smtpPass: raw.smtpPass ?? defaults.smtpPass,
      smtpFrom: raw.smtpFrom || defaults.smtpFrom,
      whatsappCloudToken: raw.whatsappCloudToken ?? defaults.whatsappCloudToken,
      whatsappPhoneNumberId: raw.whatsappPhoneNumberId ?? defaults.whatsappPhoneNumberId,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: PersistedSettings): void {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function loadOrders(): Order[] {
  ensureDataDir();
  if (!fs.existsSync(ORDERS_FILE)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveOrders(orders: Order[]): void {
  ensureDataDir();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function loadReviews(): ProductReview[] {
  ensureDataDir();
  if (!fs.existsSync(REVIEWS_FILE)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
    return Array.isArray(data) ? (data as ProductReview[]) : [];
  } catch {
    return [];
  }
}

function saveReviews(reviews: ProductReview[]): void {
  ensureDataDir();
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews.slice(0, 5000), null, 2), 'utf8');
}

function computeProductRatingSummary(
  productId: number,
  allReviews: ProductReview[],
): ProductRatingSummary {
  const baseProduct = PRODUCTS.find((p) => p.id === productId);
  const baseRating = baseProduct?.rating ?? 4.8;
  const baseCount = baseProduct?.reviewCount ?? 0;
  const productReviews = allReviews.filter((r) => r.productId === productId);
  if (productReviews.length === 0) {
    return { rating: baseRating, reviewCount: baseCount };
  }
  const userSum = productReviews.reduce((acc, r) => acc + r.rating, 0);
  const totalCount = baseCount + productReviews.length;
  const weightedSum = baseRating * baseCount + userSum;
  const avg = Math.min(5, Math.max(1, Math.round((weightedSum / totalCount) * 10) / 10));
  return { rating: avg, reviewCount: totalCount };
}

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
}

interface StoredPushSubscriptionRecord {
  endpointHash: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  orderIds: string[];
  updatedAt: string;
}

let cachedVapidKeys: StoredVapidKeys | null = null;

function getOrCreateVapidKeys(): StoredVapidKeys {
  if (cachedVapidKeys) return cachedVapidKeys;

  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    cachedVapidKeys = { publicKey: envPublic, privateKey: envPrivate };
  } else {
    ensureDataDir();
    if (fs.existsSync(VAPID_KEYS_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, 'utf8')) as Partial<StoredVapidKeys>;
        if (typeof parsed.publicKey === 'string' && typeof parsed.privateKey === 'string') {
          cachedVapidKeys = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        }
      } catch {
        // Regenerate below
      }
    }
    if (!cachedVapidKeys) {
      const generated = webpush.generateVAPIDKeys();
      cachedVapidKeys = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
      };
      fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(cachedVapidKeys, null, 2), 'utf8');
    }
  }

  const settings = loadSettings();
  const subjectEmail = settings.ownerEmail && settings.ownerEmail.includes('@')
    ? settings.ownerEmail
    : 'orders@kramorachid.ma';
  webpush.setVapidDetails(
    `mailto:${subjectEmail}`,
    cachedVapidKeys.publicKey,
    cachedVapidKeys.privateKey,
  );
  return cachedVapidKeys;
}

function loadPushSubscriptions(): StoredPushSubscriptionRecord[] {
  ensureDataDir();
  if (!fs.existsSync(PUSH_SUBS_FILE)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as StoredPushSubscriptionRecord[]) : [];
  } catch {
    return [];
  }
}

function savePushSubscriptions(records: StoredPushSubscriptionRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(records.slice(0, 1000), null, 2), 'utf8');
}

const ORDER_STATUS_NOTIFICATION_COPY: Record<OrderStatus, { title: string; body: string }> = {
  new: {
    title: 'تم تسجيل طلبك',
    body: 'طلبك قيد المراجعة وسنبدأ بتجهيزه قريبًا.',
  },
  preparing: {
    title: 'طلبك قيد التحضير والتعبئة',
    body: 'بدأ فريق كرامو راشد بتجهيز وتغليف طلبك بعناية.',
  },
  shipped: {
    title: 'طلبك في الطريق إليك',
    body: 'خرج الطلب مع الموزّع وهو في طريقه إلى عنوانك الآن.',
  },
  delivered: {
    title: 'تم توصيل طلبك بنجاح',
    body: 'نتمنى لك تجربة رائعة مع منتجات كرامو راشد الطبيعية!',
  },
  cancelled: {
    title: 'تم إلغاء الطلب',
    body: 'تم تحديث حالة طلبك إلى ملغى. يمكنك التواصل معنا عبر واتساب لأي استفسار.',
  },
};

const orderStreamClients = new Map<string, Set<express.Response>>();

function registerOrderStreamClient(orderId: string, res: express.Response): void {
  let set = orderStreamClients.get(orderId);
  if (!set) {
    set = new Set();
    orderStreamClients.set(orderId, set);
  }
  set.add(res);
}

function unregisterOrderStreamClient(orderId: string, res: express.Response): void {
  const set = orderStreamClients.get(orderId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    orderStreamClients.delete(orderId);
  }
}

async function notifyOrderStatusChange(order: Order): Promise<number> {
  const copy = ORDER_STATUS_NOTIFICATION_COPY[order.status];
  const payload = {
    orderId: order.id,
    status: order.status,
    title: `طلب #${order.id}: ${copy.title}`,
    body: copy.body,
    updatedAt: new Date().toISOString(),
    url: `/?track=${encodeURIComponent(order.id)}`,
  };

  let notifiedCount = 0;

  // 1. Push immediately over active SSE connections watching this order ID
  const sseClients = orderStreamClients.get(order.id);
  if (sseClients && sseClients.size > 0) {
    const serialized = `event: order_status\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const clientRes of sseClients) {
      try {
        clientRes.write(serialized);
        notifiedCount += 1;
      } catch {
        unregisterOrderStreamClient(order.id, clientRes);
      }
    }
  }

  // 2. Send real Web Push notification to all subscribed devices for this order ID
  const subs = loadPushSubscriptions();
  const targets = subs.filter((record) => record.orderIds.includes(order.id));
  if (targets.length > 0) {
    getOrCreateVapidKeys();
    const expiredHashes = new Set<string>();

    await Promise.all(
      targets.map(async (record) => {
        try {
          await webpush.sendNotification(record.subscription, JSON.stringify(payload), {
            TTL: 24 * 60 * 60,
          });
          notifiedCount += 1;
        } catch (err) {
          const statusCode =
            typeof err === 'object' && err !== null && 'statusCode' in err
              ? Number((err as { statusCode?: number }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            expiredHashes.add(record.endpointHash);
          }
        }
      }),
    );

    if (expiredHashes.size > 0) {
      savePushSubscriptions(subs.filter((r) => !expiredHashes.has(r.endpointHash)));
    }
  }

  return notifiedCount;
}

function loadInventoryData(): PersistedInventoryData {
  ensureDataDir();
  if (!fs.existsSync(INVENTORY_FILE)) {
    return { entries: {}, alerts: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8')) as Partial<PersistedInventoryData>;
    return {
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    };
  } catch {
    return { entries: {}, alerts: [] };
  }
}

function saveInventoryData(data: PersistedInventoryData): void {
  ensureDataDir();
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

interface StoredOwnerAuth {
  salt: string;
  hash: string;
  createdAt: string;
}

function getEnvOwnerPasscode(): string {
  return process.env.OWNER_ACCESS_CODE?.trim() || '';
}

function loadStoredOwnerAuth(): StoredOwnerAuth | null {
  ensureDataDir();
  if (!fs.existsSync(OWNER_AUTH_FILE)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(OWNER_AUTH_FILE, 'utf8')) as Partial<StoredOwnerAuth>;
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function isOwnerAuthConfigured(): boolean {
  return Boolean(getEnvOwnerPasscode() || loadStoredOwnerAuth());
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function verifyOwnerPasscode(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  const envPass = getEnvOwnerPasscode();
  if (envPass) {
    return crypto.timingSafeEqual(sha256Buffer(trimmed), sha256Buffer(envPass));
  }

  const stored = loadStoredOwnerAuth();
  if (!stored) return false;
  try {
    const expectedBuf = Buffer.from(stored.hash, 'hex');
    const actualBuf = crypto.scryptSync(trimmed, stored.salt, 64);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

function issueOwnerSessionToken(): { token: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + OWNER_TOKEN_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ role: 'owner', iat: now, exp: expiresAt }),
    'utf8',
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt };
}

function verifyOwnerSessionToken(authHeader?: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return false;

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return false;

  try {
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');
    const actualBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length) return false;
    if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) return false;

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as { role?: string; exp?: number };
    return (
      payload.role === 'owner' &&
      typeof payload.exp === 'number' &&
      payload.exp > Date.now()
    );
  } catch {
    return false;
  }
}

const loginAttemptBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientBucketKey(req: express.Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function isLoginRateLimited(bucketKey: string): boolean {
  const now = Date.now();
  const bucket = loginAttemptBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    return false;
  }
  return bucket.count >= 10;
}

function recordFailedLoginAttempt(bucketKey: string): void {
  const now = Date.now();
  const bucket = loginAttemptBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    loginAttemptBuckets.set(bucketKey, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    bucket.count += 1;
  }
}

function clearFailedLoginAttempts(bucketKey: string): void {
  loginAttemptBuckets.delete(bucketKey);
}

function requireOwnerAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!verifyOwnerSessionToken(req.headers.authorization)) {
    res.status(401).json({ error: 'يتطلب الوصول تسجيل دخول المالك.' });
    return;
  }
  next();
}

interface StoredVisitorInfo {
  firstSeenAt: string;
  lastSeenAt: string;
  device: 'mobile' | 'desktop';
  deviceName?: string;
  os?: string;
  browser?: string;
  screenSize?: string;
  locationLabel?: string;
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  language?: string;
  locationSource?: DeviceLocationSource;
  lastEventType?: AnalyticsEventType;
  ordersCount?: number;
  totalSpent?: number;
  customerName?: string;
  visitCount: number;
  lastVisitEventAt: string;
}

interface StoredAnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  timestamp: string;
  visitorHash: string;
  device: 'mobile' | 'desktop';
  deviceName?: string;
  locationLabel?: string;
  productId?: number;
  productName?: string;
  orderId?: string;
  orderTotal?: number;
}

interface PersistedAnalyticsData {
  visitors: Record<string, StoredVisitorInfo>;
  events: StoredAnalyticsEvent[];
}

function loadAnalyticsData(): PersistedAnalyticsData {
  ensureDataDir();
  if (!fs.existsSync(ANALYTICS_FILE)) {
    return { visitors: {}, events: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')) as Partial<PersistedAnalyticsData>;
    return {
      visitors:
        parsed.visitors && typeof parsed.visitors === 'object' ? parsed.visitors : {},
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return { visitors: {}, events: [] };
  }
}

function saveAnalyticsData(data: PersistedAnalyticsData): void {
  ensureDataDir();
  if (data.events.length > 5000) {
    data.events = data.events.slice(-5000);
  }
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sanitizeTextField(raw: unknown, maxLen = 80): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function inferDeviceFromRequest(req: express.Request, hint?: string): 'mobile' | 'desktop' {
  if (hint === 'mobile' || hint === 'desktop') return hint;
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  return /mobile|android|iphone|ipad|ipod/.test(ua) ? 'mobile' : 'desktop';
}

function parseDeviceMetadataFromRequest(
  req: express.Request,
  clientHints?: {
    deviceName?: unknown;
    os?: unknown;
    browser?: unknown;
    screenSize?: unknown;
  },
): {
  deviceName: string;
  os: string;
  browser: string;
  screenSize?: string;
} {
  const ua = String(req.headers['user-agent'] || '');
  const chModel = sanitizeTextField(
    String(req.headers['sec-ch-ua-model'] || '').replace(/^"|"$/g, ''),
    48,
  );
  const chPlatform = sanitizeTextField(
    String(req.headers['sec-ch-ua-platform'] || '').replace(/^"|"$/g, ''),
    32,
  );

  let fallbackBrowser = 'متصفح ويب';
  if (/EdgA?\/|EdgiOS\//i.test(ua)) fallbackBrowser = 'Edge';
  else if (/SamsungBrowser\//i.test(ua)) fallbackBrowser = 'Samsung Internet';
  else if (/OPR\/|Opera/i.test(ua)) fallbackBrowser = 'Opera';
  else if (/Firefox\/|FxiOS\//i.test(ua)) fallbackBrowser = 'Firefox';
  else if (/CriOS\/|Chrome\//i.test(ua)) fallbackBrowser = 'Chrome';
  else if (/Safari\//i.test(ua)) fallbackBrowser = 'Safari';

  let fallbackHardware = 'جهاز حاسوب';
  let fallbackOs = chPlatform || 'نظام غير محدد';

  if (/iPhone/i.test(ua)) {
    fallbackHardware = 'Apple iPhone';
    fallbackOs = 'iOS';
  } else if (/iPad/i.test(ua)) {
    fallbackHardware = 'Apple iPad';
    fallbackOs = 'iPadOS';
  } else if (/Android/i.test(ua)) {
    const modelMatch = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
    const uaModel = sanitizeTextField(modelMatch?.[1], 40);
    const chosenModel = chModel || (uaModel && uaModel !== 'K' ? uaModel : '');
    fallbackHardware = chosenModel ? `Android (${chosenModel})` : 'هاتف Android';
    fallbackOs = 'Android';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    fallbackHardware = 'Apple Mac';
    fallbackOs = 'macOS';
  } else if (/Windows NT/i.test(ua)) {
    fallbackHardware = 'Windows PC';
    fallbackOs = 'Windows';
  } else if (/Linux/i.test(ua)) {
    fallbackHardware = 'Linux PC';
    fallbackOs = 'Linux';
  }

  const clientDeviceName = sanitizeTextField(clientHints?.deviceName, 80);
  const clientOs = sanitizeTextField(clientHints?.os, 40);
  const clientBrowser = sanitizeTextField(clientHints?.browser, 40);
  const clientScreen = sanitizeTextField(clientHints?.screenSize, 24);

  return {
    deviceName: clientDeviceName || `${fallbackHardware} · ${fallbackBrowser}`,
    os: clientOs || fallbackOs,
    browser: clientBrowser || fallbackBrowser,
    screenSize: clientScreen || undefined,
  };
}

const COUNTRY_NAME_AR: Record<string, string> = {
  MA: 'المغرب',
  FR: 'فرنسا',
  ES: 'إسبانيا',
  DE: 'ألمانيا',
  IT: 'إيطاليا',
  BE: 'بلجيكا',
  NL: 'هولندا',
  GB: 'المملكة المتحدة',
  UK: 'المملكة المتحدة',
  US: 'الولايات المتحدة',
  CA: 'كندا',
  SA: 'السعودية',
  AE: 'الإمارات',
  QA: 'قطر',
  KW: 'الكويت',
  DZ: 'الجزائر',
  TN: 'تونس',
  EG: 'مصر',
  TR: 'تركيا',
};

const TIMEZONE_LOCATION_AR: Record<string, { city?: string; country: string; label: string }> = {
  'Africa/Casablanca': { city: 'الدار البيضاء', country: 'المغرب', label: 'المغرب (نطاق الدار البيضاء)' },
  'Africa/El_Aaiun': { city: 'العيون', country: 'المغرب', label: 'العيون، المغرب' },
  'Europe/Paris': { city: 'باريس', country: 'فرنسا', label: 'باريس، فرنسا' },
  'Europe/Madrid': { city: 'مدريد', country: 'إسبانيا', label: 'مدريد، إسبانيا' },
  'Europe/Brussels': { city: 'بروكسل', country: 'بلجيكا', label: 'بروكسل، بلجيكا' },
  'Europe/Amsterdam': { city: 'أمستردام', country: 'هولندا', label: 'أمستردام، هولندا' },
  'Europe/Berlin': { city: 'برلين', country: 'ألمانيا', label: 'برلين، ألمانيا' },
  'Europe/London': { city: 'لندن', country: 'المملكة المتحدة', label: 'لندن، بريطانيا' },
  'Europe/Rome': { city: 'روما', country: 'إيطاليا', label: 'روما، إيطاليا' },
  'Asia/Riyadh': { city: 'الرياض', country: 'السعودية', label: 'الرياض، السعودية' },
  'Asia/Dubai': { city: 'دبي', country: 'الإمارات', label: 'دبي، الإمارات' },
  'Africa/Algiers': { city: 'الجزائر', country: 'الجزائر', label: 'الجزائر' },
  'Africa/Tunis': { city: 'تونس', country: 'تونس', label: 'تونس' },
  'Africa/Cairo': { city: 'القاهرة', country: 'مصر', label: 'القاهرة، مصر' },
  'America/New_York': { city: 'نيويورك', country: 'الولايات المتحدة', label: 'نيويورك، أمريكا' },
  'America/Los_Angeles': { city: 'لوس أنجلوس', country: 'الولايات المتحدة', label: 'لوس أنجلوس، أمريكا' },
  'America/Toronto': { city: 'تورونتو', country: 'كندا', label: 'تورونتو، كندا' },
};

const MOROCCAN_CITIES = [
  'الدار البيضاء',
  'كازابلانكا',
  'الرباط',
  'سلا',
  'مراكش',
  'طنجة',
  'فاس',
  'مكناس',
  'أكادير',
  'وجدة',
  'القنيطرة',
  'تطوان',
  'المحمدية',
  'الجديدة',
  'آسفي',
  'بني ملال',
  'الناظور',
  'تازة',
  'خريبكة',
  'سطات',
  'برشيد',
  'تارودانت',
  'ورزازات',
  'العيون',
  'الداخلة',
  'الصويرة',
  'الحسيمة',
  'تمارة',
];

function extractCityFromOrderAddress(address?: string): string | undefined {
  const clean = sanitizeTextField(address, 120);
  if (!clean) return undefined;
  for (const city of MOROCCAN_CITIES) {
    if (clean.includes(city)) {
      return city === 'كازابلانكا' ? 'الدار البيضاء' : city;
    }
  }
  const firstSegment = clean.split(/[،,\-\n]/)[0]?.trim();
  if (firstSegment && firstSegment.length >= 3 && firstSegment.length <= 32) {
    return firstSegment;
  }
  return undefined;
}

function formatCountryLabel(rawCountry: string): string {
  const upper = rawCountry.trim().toUpperCase();
  if (COUNTRY_NAME_AR[upper]) return COUNTRY_NAME_AR[upper];
  return sanitizeTextField(rawCountry, 48);
}

function safeDecodeGeoHeader(val: unknown): string {
  const s = sanitizeTextField(val, 64);
  if (!s) return '';
  try {
    return sanitizeTextField(decodeURIComponent(s), 64);
  } catch {
    return s;
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('ff')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

function extractClientPublicIp(req: express.Request): string | null {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const candidates = [
    ...forwarded.split(',').map((s) => s.trim()),
    String(req.headers['x-real-ip'] || '').trim(),
    String(req.ip || req.socket.remoteAddress || '').trim(),
  ].filter(Boolean);

  for (const raw of candidates) {
    const normalized = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    if (net.isIP(normalized) && !isPrivateOrReservedIp(normalized)) {
      return normalized;
    }
  }
  return null;
}

interface ResolvedGeoLocation {
  locationLabel: string;
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  language?: string;
  locationSource: DeviceLocationSource;
  publicIpToEnrich?: string;
}

function resolveLocationFromRequest(
  req: express.Request,
  clientTimezone?: unknown,
  clientLanguage?: unknown,
  orderAddress?: string,
): ResolvedGeoLocation {
  const timezone = sanitizeTextField(clientTimezone, 64);
  const language = sanitizeTextField(clientLanguage, 24);
  const orderCity = extractCityFromOrderAddress(orderAddress);

  if (orderCity) {
    return {
      locationLabel: `${orderCity}، المغرب`,
      city: orderCity,
      country: 'المغرب',
      timezone: timezone || undefined,
      language: language || undefined,
      locationSource: 'order',
    };
  }

  // 1. Reverse proxy / CDN geo headers (Cloud Run / App Engine / Cloudflare / Vercel)
  const rawCity =
    safeDecodeGeoHeader(req.headers['x-appengine-city']) ||
    safeDecodeGeoHeader(req.headers['cf-ipcity']) ||
    safeDecodeGeoHeader(req.headers['x-vercel-ip-city']) ||
    safeDecodeGeoHeader(req.headers['x-geo-city']);
  const rawRegion =
    safeDecodeGeoHeader(req.headers['x-appengine-region']) ||
    safeDecodeGeoHeader(req.headers['cf-region']) ||
    safeDecodeGeoHeader(req.headers['x-vercel-ip-country-region']) ||
    safeDecodeGeoHeader(req.headers['x-geo-region']);
  const rawCountry =
    safeDecodeGeoHeader(req.headers['x-appengine-country']) ||
    safeDecodeGeoHeader(req.headers['cf-ipcountry']) ||
    safeDecodeGeoHeader(req.headers['x-vercel-ip-country']) ||
    safeDecodeGeoHeader(req.headers['x-geo-country']);

  if (rawCity || (rawCountry && rawCountry !== 'XX')) {
    const countryAr = rawCountry ? formatCountryLabel(rawCountry) : '';
    const cityClean = rawCity && rawCity !== '?' ? rawCity : '';
    const labelParts = [cityClean, countryAr].filter(Boolean);
    return {
      locationLabel: labelParts.join('، ') || countryAr || 'موقع غير محدد',
      city: cityClean || undefined,
      region: rawRegion && rawRegion !== '?' ? rawRegion : undefined,
      country: countryAr || undefined,
      timezone: timezone || undefined,
      language: language || undefined,
      locationSource: 'proxy',
    };
  }

  // 2. Check cached IP geo lookup if public IP exists
  const publicIp = extractClientPublicIp(req);
  if (publicIp) {
    const cached = ipGeoCache.get(publicIp);
    if (cached && cached.expiresAt > Date.now() && cached.locationLabel) {
      return {
        locationLabel: cached.locationLabel,
        city: cached.city,
        region: cached.region,
        country: cached.country,
        timezone: timezone || undefined,
        language: language || undefined,
        locationSource: 'ip',
      };
    }
  }

  // 3. Timezone / browser locale fallback
  if (timezone) {
    const mapped = TIMEZONE_LOCATION_AR[timezone];
    if (mapped) {
      return {
        locationLabel: mapped.label,
        city: mapped.city,
        country: mapped.country,
        timezone,
        language: language || undefined,
        locationSource: 'timezone',
        publicIpToEnrich: publicIp || undefined,
      };
    }
    const tzCity = timezone.split('/').slice(1).join(' / ').replace(/_/g, ' ');
    return {
      locationLabel: tzCity || timezone,
      city: tzCity || undefined,
      timezone,
      language: language || undefined,
      locationSource: 'timezone',
      publicIpToEnrich: publicIp || undefined,
    };
  }

  return {
    locationLabel: 'موقع غير محدد',
    language: language || undefined,
    locationSource: 'timezone',
    publicIpToEnrich: publicIp || undefined,
  };
}

interface CachedIpGeoEntry {
  expiresAt: number;
  locationLabel?: string;
  city?: string;
  region?: string;
  country?: string;
}

const ipGeoCache = new Map<string, CachedIpGeoEntry>();
const pendingIpGeoLookups = new Set<string>();

function enqueuePublicIpGeoEnrichment(ip: string, visitorHash: string): void {
  if (!net.isIP(ip) || isPrivateOrReservedIp(ip)) return;
  const cached = ipGeoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return;
  const lookupKey = `${ip}:${visitorHash}`;
  if (pendingIpGeoLookups.has(lookupKey)) return;
  pendingIpGeoLookups.add(lookupKey);

  void (async () => {
    try {
      const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) {
        ipGeoCache.set(ip, { expiresAt: Date.now() + 30 * 60 * 1000 });
        return;
      }
      const geo = (await response.json()) as {
        success?: boolean;
        city?: string;
        region?: string;
        country?: string;
        country_code?: string;
      };
      if (!geo.success) {
        ipGeoCache.set(ip, { expiresAt: Date.now() + 60 * 60 * 1000 });
        return;
      }

      const city = sanitizeTextField(geo.city, 48) || undefined;
      const region = sanitizeTextField(geo.region, 48) || undefined;
      const country = geo.country_code
        ? formatCountryLabel(geo.country_code)
        : sanitizeTextField(geo.country, 48) || undefined;
      const label = [city, country].filter(Boolean).join('، ') || country || region || '';
      if (!label) return;

      ipGeoCache.set(ip, {
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        locationLabel: label,
        city,
        region,
        country,
      });

      const data = loadAnalyticsData();
      const visitor = data.visitors[visitorHash];
      if (visitor && visitor.locationSource !== 'order' && visitor.locationSource !== 'proxy') {
        visitor.city = city;
        visitor.region = region;
        visitor.country = country;
        visitor.locationLabel = label;
        visitor.locationSource = 'ip';
        saveAnalyticsData(data);
      }
    } catch {
      ipGeoCache.set(ip, { expiresAt: Date.now() + 15 * 60 * 1000 });
    } finally {
      pendingIpGeoLookups.delete(lookupKey);
    }
  })();
}

function deriveVisitorHash(req: express.Request, rawVisitorId?: string): string {
  const cleanId = String(rawVisitorId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (cleanId.length >= 8) {
    return crypto.createHash('sha256').update(`vid:${cleanId}`).digest('hex').slice(0, 20);
  }
  const ip = req.ip || req.socket.remoteAddress || 'anon';
  const ua = String(req.headers['user-agent'] || '');
  return crypto.createHash('sha256').update(`ua:${ip}:${ua}`).digest('hex').slice(0, 20);
}

function recordStorefrontEvent(params: {
  type: AnalyticsEventType;
  visitorHash: string;
  device: 'mobile' | 'desktop';
  deviceName: string;
  os: string;
  browser: string;
  screenSize?: string;
  location: ResolvedGeoLocation;
  productId?: number;
  productName?: string;
  orderId?: string;
  orderTotal?: number;
  customerName?: string;
}): void {
  const data = loadAnalyticsData();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const applyVisitorMetadata = (target: StoredVisitorInfo) => {
    target.lastSeenAt = nowIso;
    target.device = params.device;
    target.deviceName = params.deviceName;
    target.os = params.os;
    target.browser = params.browser;
    if (params.screenSize) target.screenSize = params.screenSize;
    if (params.location.timezone) target.timezone = params.location.timezone;
    if (params.location.language) target.language = params.location.language;
    target.lastEventType = params.type;

    const existingPriority =
      target.locationSource === 'order'
        ? 4
        : target.locationSource === 'proxy'
          ? 3
          : target.locationSource === 'ip'
            ? 2
            : 1;
    const incomingPriority =
      params.location.locationSource === 'order'
        ? 4
        : params.location.locationSource === 'proxy'
          ? 3
          : params.location.locationSource === 'ip'
            ? 2
            : 1;

    if (
      !target.locationLabel ||
      target.locationLabel === 'موقع غير محدد' ||
      incomingPriority >= existingPriority
    ) {
      target.locationLabel = params.location.locationLabel;
      target.city = params.location.city ?? target.city;
      target.region = params.location.region ?? target.region;
      target.country = params.location.country ?? target.country;
      target.locationSource = params.location.locationSource;
    }

    if (params.type === 'purchase') {
      target.ordersCount = (target.ordersCount ?? 0) + 1;
      target.totalSpent = (target.totalSpent ?? 0) + (params.orderTotal ?? 0);
      if (params.customerName) {
        target.customerName = sanitizeTextField(params.customerName, 48);
      }
    }
  };

  const existingVisitor = data.visitors[params.visitorHash];
  if (params.type === 'visit') {
    if (existingVisitor) {
      const lastVisitMs = Date.parse(existingVisitor.lastVisitEventAt || existingVisitor.firstSeenAt);
      const isNewSessionVisit = Number.isNaN(lastVisitMs) || nowMs - lastVisitMs > 10 * 60 * 1000;
      applyVisitorMetadata(existingVisitor);
      if (isNewSessionVisit) {
        existingVisitor.visitCount += 1;
        existingVisitor.lastVisitEventAt = nowIso;
        data.events.push({
          id: `EVT-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'visit',
          timestamp: nowIso,
          visitorHash: params.visitorHash,
          device: params.device,
          deviceName: params.deviceName,
          locationLabel: existingVisitor.locationLabel || params.location.locationLabel,
        });
      }
    } else {
      const newVisitor: StoredVisitorInfo = {
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        device: params.device,
        visitCount: 1,
        lastVisitEventAt: nowIso,
      };
      applyVisitorMetadata(newVisitor);
      data.visitors[params.visitorHash] = newVisitor;
      data.events.push({
        id: `EVT-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'visit',
        timestamp: nowIso,
        visitorHash: params.visitorHash,
        device: params.device,
        deviceName: params.deviceName,
        locationLabel: newVisitor.locationLabel || params.location.locationLabel,
      });
    }
  } else {
    if (!existingVisitor) {
      const newVisitor: StoredVisitorInfo = {
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        device: params.device,
        visitCount: 1,
        lastVisitEventAt: nowIso,
      };
      applyVisitorMetadata(newVisitor);
      data.visitors[params.visitorHash] = newVisitor;
    } else {
      applyVisitorMetadata(existingVisitor);
    }

    const effectiveLocation =
      data.visitors[params.visitorHash]?.locationLabel || params.location.locationLabel;

    data.events.push({
      id: `EVT-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      type: params.type,
      timestamp: nowIso,
      visitorHash: params.visitorHash,
      device: params.device,
      deviceName: params.deviceName,
      locationLabel: effectiveLocation,
      productId: params.productId,
      productName: params.productName,
      orderId: params.orderId,
      orderTotal: params.orderTotal,
    });
  }

  saveAnalyticsData(data);

  if (
    params.location.publicIpToEnrich &&
    data.visitors[params.visitorHash]?.locationSource === 'timezone'
  ) {
    enqueuePublicIpGeoEnrichment(params.location.publicIpToEnrich, params.visitorHash);
  }
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildOwnerAnalyticsSummary(): OwnerAnalyticsSummary {
  const analytics = loadAnalyticsData();
  const orders = loadOrders().filter((o) => o.status !== 'cancelled');
  const now = new Date();
  const nowMs = now.getTime();
  const todayKey = toDateKey(now);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let activeVisitorsNow = 0;
  let mobileDevices = 0;
  let desktopDevices = 0;

  for (const v of Object.values(analytics.visitors)) {
    const lastMs = Date.parse(v.lastSeenAt);
    if (!Number.isNaN(lastMs) && nowMs - lastMs <= 5 * 60 * 1000) {
      activeVisitorsNow += 1;
    }
    if (v.device === 'mobile') mobileDevices += 1;
    else desktopDevices += 1;
  }

  const dailyBuckets = new Map<
    string,
    { visits: number; visitors: Set<string>; orders: number; revenue: number }
  >();

  for (let offset = 13; offset >= 0; offset--) {
    const dayDate = new Date(now);
    dayDate.setDate(now.getDate() - offset);
    dailyBuckets.set(toDateKey(dayDate), {
      visits: 0,
      visitors: new Set<string>(),
      orders: 0,
      revenue: 0,
    });
  }

  let todayVisits = 0;
  const todayUniqueSet = new Set<string>();
  let monthVisits = 0;
  const monthUniqueSet = new Set<string>();
  let totalVisits = 0;
  const allUniqueSet = new Set<string>(Object.keys(analytics.visitors));

  let productViews = 0;
  let addToCarts = 0;
  let checkoutsStarted = 0;

  const productEngagementMap = new Map<
    number,
    { views: number; addToCarts: number; unitsSold: number; revenue: number }
  >();

  for (const evt of analytics.events) {
    const evtDate = new Date(evt.timestamp);
    if (Number.isNaN(evtDate.getTime())) continue;
    const key = toDateKey(evtDate);
    const isToday = key === todayKey;
    const isThisMonth =
      evtDate.getFullYear() === currentYear && evtDate.getMonth() === currentMonth;

    if (evt.type === 'visit') {
      totalVisits += 1;
      allUniqueSet.add(evt.visitorHash);
      if (isToday) {
        todayVisits += 1;
        todayUniqueSet.add(evt.visitorHash);
      }
      if (isThisMonth) {
        monthVisits += 1;
        monthUniqueSet.add(evt.visitorHash);
      }
      const bucket = dailyBuckets.get(key);
      if (bucket) {
        bucket.visits += 1;
        bucket.visitors.add(evt.visitorHash);
      }
    } else if (evt.type === 'product_view') {
      productViews += 1;
      if (typeof evt.productId === 'number') {
        const entry = productEngagementMap.get(evt.productId) ?? {
          views: 0,
          addToCarts: 0,
          unitsSold: 0,
          revenue: 0,
        };
        entry.views += 1;
        productEngagementMap.set(evt.productId, entry);
      }
    } else if (evt.type === 'add_to_cart') {
      addToCarts += 1;
      if (typeof evt.productId === 'number') {
        const entry = productEngagementMap.get(evt.productId) ?? {
          views: 0,
          addToCarts: 0,
          unitsSold: 0,
          revenue: 0,
        };
        entry.addToCarts += 1;
        productEngagementMap.set(evt.productId, entry);
      }
    } else if (evt.type === 'checkout_start') {
      checkoutsStarted += 1;
    }
  }

  let todayOrders = 0;
  let todayRevenue = 0;
  let monthOrders = 0;
  let monthRevenue = 0;
  let totalUnitsSold = 0;
  let totalRevenue = 0;
  const buyerPhones = new Set<string>();

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    if (Number.isNaN(orderDate.getTime())) continue;
    const key = toDateKey(orderDate);
    const isToday = key === todayKey;
    const isThisMonth =
      orderDate.getFullYear() === currentYear && orderDate.getMonth() === currentMonth;

    totalRevenue += order.total;
    const normalizedPhone = order.customer.phone.replace(/[^\d]/g, '');
    if (normalizedPhone) buyerPhones.add(normalizedPhone);

    if (isToday) {
      todayOrders += 1;
      todayRevenue += order.total;
    }
    if (isThisMonth) {
      monthOrders += 1;
      monthRevenue += order.total;
    }

    const bucket = dailyBuckets.get(key);
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += order.total;
    }

    for (const item of order.items) {
      totalUnitsSold += item.quantity;
      const entry = productEngagementMap.get(item.productId) ?? {
        views: 0,
        addToCarts: 0,
        unitsSold: 0,
        revenue: 0,
      };
      entry.unitsSold += item.quantity;
      entry.revenue += item.lineTotal;
      productEngagementMap.set(item.productId, entry);
    }
  }

  const totalUniqueVisitors = allUniqueSet.size;
  const totalBuyers = buyerPhones.size || orders.length;
  const conversionBase = Math.max(totalUniqueVisitors, orders.length);
  const conversionRatePct =
    conversionBase > 0
      ? Math.min(100, Math.round((orders.length / conversionBase) * 1000) / 10)
      : 0;
  const averageOrderValue =
    orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;

  const dayFormatter = new Intl.DateTimeFormat('ar-MA', {
    day: 'numeric',
    month: 'short',
  });

  const dailySeries: OwnerDailyAnalyticsPoint[] = Array.from(dailyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, bucket]) => ({
      dateKey,
      label: dayFormatter.format(new Date(`${dateKey}T12:00:00`)),
      visits: bucket.visits,
      uniqueVisitors: bucket.visitors.size,
      orders: bucket.orders,
      revenue: bucket.revenue,
    }));

  const productEngagement: OwnerProductEngagement[] = PRODUCTS.map((p) => {
    const stats = productEngagementMap.get(p.id) ?? {
      views: 0,
      addToCarts: 0,
      unitsSold: 0,
      revenue: 0,
    };
    return {
      productId: p.id,
      productName: p.name,
      category: p.category,
      views: stats.views,
      addToCarts: stats.addToCarts,
      unitsSold: stats.unitsSold,
      revenue: stats.revenue,
    };
  })
    .filter((p) => p.views > 0 || p.addToCarts > 0 || p.unitsSold > 0)
    .sort(
      (a, b) =>
        b.unitsSold - a.unitsSold ||
        b.revenue - a.revenue ||
        b.addToCarts - a.addToCarts ||
        b.views - a.views,
    );

  const visitorLookup = analytics.visitors;

  const recentEvents: OwnerRecentActivityItem[] = [...analytics.events]
    .reverse()
    .slice(0, 20)
    .map((evt) => {
      const visitor = visitorLookup[evt.visitorHash];
      return {
        id: evt.id,
        type: evt.type,
        timestamp: evt.timestamp,
        device: evt.device,
        deviceName:
          evt.deviceName ||
          visitor?.deviceName ||
          (evt.device === 'mobile' ? 'هاتف محمول' : 'جهاز حاسوب'),
        locationLabel: evt.locationLabel || visitor?.locationLabel || 'موقع غير محدد',
        productName: evt.productName,
        orderId: evt.orderId,
        orderTotal: evt.orderTotal,
      };
    });

  const locationAggMap = new Map<string, OwnerLocationSummary>();
  const devices: OwnerDeviceRecord[] = Object.entries(analytics.visitors)
    .map(([hash, v]) => {
      const lastMs = Date.parse(v.lastSeenAt);
      const isOnlineNow = !Number.isNaN(lastMs) && nowMs - lastMs <= 5 * 60 * 1000;
      const defaultName = v.device === 'mobile' ? 'هاتف محمول' : 'جهاز حاسوب';
      const locationLabel = v.locationLabel || 'موقع غير محدد';
      const ordersCount = v.ordersCount ?? 0;

      const locEntry = locationAggMap.get(locationLabel) ?? {
        locationLabel,
        city: v.city,
        country: v.country,
        devicesCount: 0,
        activeNowCount: 0,
        ordersCount: 0,
      };
      locEntry.devicesCount += 1;
      if (isOnlineNow) locEntry.activeNowCount += 1;
      locEntry.ordersCount += ordersCount;
      locationAggMap.set(locationLabel, locEntry);

      return {
        visitorId: hash.slice(0, 8).toUpperCase(),
        deviceType: v.device,
        deviceName: v.deviceName || defaultName,
        os: v.os || (v.device === 'mobile' ? 'نظام هاتف' : 'نظام حاسوب'),
        browser: v.browser || 'متصفح ويب',
        screenSize: v.screenSize,
        locationLabel,
        city: v.city,
        region: v.region,
        country: v.country,
        timezone: v.timezone,
        language: v.language,
        locationSource: v.locationSource || 'timezone',
        firstSeenAt: v.firstSeenAt,
        lastSeenAt: v.lastSeenAt,
        visitCount: v.visitCount,
        isOnlineNow,
        lastEventType: v.lastEventType,
        ordersCount,
        totalSpent: v.totalSpent ?? 0,
        customerName: v.customerName,
      };
    })
    .sort((a, b) => {
      if (a.isOnlineNow !== b.isOnlineNow) return a.isOnlineNow ? -1 : 1;
      return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
    })
    .slice(0, 100);

  const locationBreakdown: OwnerLocationSummary[] = Array.from(locationAggMap.values())
    .sort((a, b) => b.devicesCount - a.devicesCount || b.activeNowCount - a.activeNowCount)
    .slice(0, 20);

  return {
    generatedAt: now.toISOString(),
    activeVisitorsNow,
    todayVisits,
    todayUniqueVisitors: todayUniqueSet.size,
    todayOrders,
    todayRevenue,
    monthVisits,
    monthUniqueVisitors: monthUniqueSet.size,
    monthOrders,
    monthRevenue,
    totalVisits,
    totalUniqueVisitors,
    totalBuyers,
    totalOrders: orders.length,
    totalUnitsSold,
    totalRevenue,
    conversionRatePct,
    averageOrderValue,
    funnel: {
      visits: Math.max(totalVisits, totalUniqueVisitors),
      productViews,
      addToCarts,
      checkoutsStarted,
      purchases: orders.length,
    },
    deviceBreakdown: {
      mobile: mobileDevices,
      desktop: desktopDevices,
    },
    dailySeries,
    productEngagement,
    recentEvents,
    devices,
    locationBreakdown,
  };
}

function buildInventoryList(data: PersistedInventoryData): InventoryItem[] {
  return PRODUCTS.map((product) => {
    const entry = data.entries[String(product.id)];
    return {
      productId: product.id,
      productName: product.name,
      category: product.category,
      unitLabel: product.unitLabel,
      stock: typeof entry?.stock === 'number' ? entry.stock : DEFAULT_STOCK,
      lowStockThreshold:
        typeof entry?.lowStockThreshold === 'number'
          ? entry.lowStockThreshold
          : DEFAULT_LOW_STOCK_THRESHOLD,
      lastAlertedAt: entry?.lastAlertedAt,
    };
  });
}

function buildLowStockWhatsappMessage(items: Array<{ productName: string; stock: number; threshold: number }>): string {
  const lines = items.map((it) =>
    it.stock === 0
      ? `• ${it.productName}: نفد المخزون (0 متبقي)`
      : `• ${it.productName}: متبقي ${it.stock} فقط (الحد الأدنى ${it.threshold})`,
  );
  return [`⚠️ تنبيه انخفاض المخزون — متجر كرامو راشد`, ...lines, `يرجى إعادة التزويد قريبًا.`].join('\n');
}

async function dispatchLowStockNotifications(
  items: Array<{ productId: number; productName: string; stock: number; threshold: number }>,
  settings: PersistedSettings,
): Promise<{ emailResult: DeliveryChannelResult; whatsappResult: DeliveryChannelResult; whatsappUrl: string }> {
  const message = buildLowStockWhatsappMessage(items);
  const whatsappUrl = `https://wa.me/${settings.ownerWhatsapp}?text=${encodeURIComponent(message)}`;
  const timestamp = new Date().toISOString();

  let emailResult: DeliveryChannelResult;
  if (!settings.ownerEmail || !settings.smtpUser || !settings.smtpPass) {
    emailResult = {
      sent: false,
      destination: settings.ownerEmail || 'غير محدد',
      message: 'بيانات SMTP غير مكتملة؛ تم تسجيل التنبيه في لوحة التحكم.',
      timestamp,
    };
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost || 'smtp.gmail.com',
        port: settings.smtpPort || 587,
        secure: settings.smtpPort === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      });
      const rows = items
        .map(
          (it) =>
            `<tr><td style="padding:10px;border-bottom:1px solid #2f2817;color:#f4ecd8;">${escapeHtml(it.productName)}</td><td style="padding:10px;border-bottom:1px solid #2f2817;color:${it.stock === 0 ? '#f87171' : '#fbbf24'};font-weight:bold;text-align:center;">${it.stock}</td><td style="padding:10px;border-bottom:1px solid #2f2817;color:#a99d83;text-align:center;">${it.threshold}</td></tr>`,
        )
        .join('');
      await transporter.sendMail({
        from: settings.smtpFrom || settings.smtpUser,
        to: settings.ownerEmail,
        subject: `⚠️ تنبيه مخزون منخفض — ${items.length === 1 ? items[0].productName : `${items.length} منتجات`} | كرامو راشد`,
        text: message,
        html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;padding:24px;background:#090806;color:#f4ecd8;font-family:Tahoma,Arial,sans-serif;"><div style="max-width:580px;margin:0 auto;background:#13110c;border:1px solid #6b5420;border-radius:16px;padding:24px;"><h1 style="margin:0 0 8px;color:#fbbf24;font-size:20px;">تنبيه وصول المخزون إلى مستوى منخفض</h1><p style="margin:0 0 16px;color:#a99d83;font-size:13px;">المنتجات التالية وصلت إلى حد التنبيه أو نفدت من المخزون في متجر كرامو راشد:</p><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr><th style="padding:10px;border-bottom:1px solid #4a3a14;text-align:right;color:#a99d83;">المنتج</th><th style="padding:10px;border-bottom:1px solid #4a3a14;text-align:center;color:#a99d83;">المتبقي</th><th style="padding:10px;border-bottom:1px solid #4a3a14;text-align:center;color:#a99d83;">حد التنبيه</th></tr></thead><tbody>${rows}</tbody></table></div></body></html>`,
      });
      emailResult = {
        sent: true,
        destination: settings.ownerEmail,
        message: 'تم إرسال تنبيه المخزون إلى البريد الإلكتروني.',
        timestamp,
      };
    } catch (err) {
      emailResult = {
        sent: false,
        destination: settings.ownerEmail,
        message: `تعذر إرسال تنبيه البريد: ${err instanceof Error ? err.message : 'SMTP error'}`,
        timestamp,
      };
    }
  }

  const whatsappResult = await sendWhatsappCloudMessage(message, settings);
  return { emailResult, whatsappResult, whatsappUrl };
}

async function evaluateAndRecordLowStock(
  productIdsToCheck: number[],
  settings: PersistedSettings,
  forceAlert = false,
): Promise<LowStockAlert[]> {
  const data = loadInventoryData();
  const newlyTriggered: Array<{
    productId: number;
    productName: string;
    stock: number;
    threshold: number;
  }> = [];

  for (const pid of new Set(productIdsToCheck)) {
    const product = PRODUCTS.find((p) => p.id === pid);
    if (!product) continue;
    const entry = data.entries[String(pid)] ?? {
      stock: DEFAULT_STOCK,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    };
    if (entry.stock <= entry.lowStockThreshold) {
      const hasActiveUnacked = data.alerts.some(
        (a) => a.productId === pid && !a.acknowledged && a.stock === entry.stock,
      );
      if (forceAlert || !hasActiveUnacked) {
        newlyTriggered.push({
          productId: pid,
          productName: product.name,
          stock: entry.stock,
          threshold: entry.lowStockThreshold,
        });
      }
    } else {
      for (const a of data.alerts) {
        if (a.productId === pid && !a.acknowledged) {
          a.acknowledged = true;
        }
      }
      if (entry.lastAlertedAt) {
        entry.lastAlertedAt = undefined;
        data.entries[String(pid)] = entry;
      }
    }
  }

  if (newlyTriggered.length === 0) {
    saveInventoryData(data);
    return [];
  }

  const { emailResult, whatsappResult, whatsappUrl } = await dispatchLowStockNotifications(
    newlyTriggered,
    settings,
  );
  const now = new Date().toISOString();

  const createdAlerts: LowStockAlert[] = newlyTriggered.map((item, idx) => {
    const entry = data.entries[String(item.productId)] ?? {
      stock: item.stock,
      lowStockThreshold: item.threshold,
    };
    entry.lastAlertedAt = now;
    data.entries[String(item.productId)] = entry;

    return {
      id: `LSA-${Date.now()}-${idx}`,
      createdAt: now,
      productId: item.productId,
      productName: item.productName,
      stock: item.stock,
      threshold: item.threshold,
      emailSent: emailResult.sent,
      emailMessage: emailResult.message,
      whatsappSent: whatsappResult.sent,
      whatsappUrl,
      acknowledged: false,
    };
  });

  data.alerts = [...createdAlerts, ...data.alerts].slice(0, 60);
  saveInventoryData(data);
  return createdAlerts;
}

function buildWhatsappMessage(
  order: Omit<Order, 'whatsappUrl' | 'whatsappMessage' | 'delivery'>,
  receiptPageUrl?: string,
): string {
  const itemLines = order.items.map(
    (item) => `• ${item.productName} (${item.sizeLabel}) × ${item.quantity} = ${item.lineTotal} درهم`,
  );
  const shippingNote = order.freeShipping
    ? 'التوصيل: مجاني داخل الدار البيضاء'
    : 'التوصيل: الدفع عند الاستلام (حسب المنطقة)';
  return [
    `طلب جديد #${order.id} — كرامو راشد`,
    ...itemLines,
    `المجموع: ${order.total} درهم`,
    shippingNote,
    `الاسم: ${order.customer.name}`,
    `الهاتف: ${order.customer.phone}`,
    `العنوان: ${order.customer.address}`,
    order.customer.notes ? `ملاحظات: ${order.customer.notes}` : '',
    receiptPageUrl ? `صورة وصل التوصيل: ${receiptPageUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCustomerVerificationWhatsappUrl(
  order: Pick<Order, 'id' | 'customer' | 'items' | 'total' | 'freeShipping'>,
  receiptPageUrl?: string,
): string {
  const customerDigits = normalizeWhatsappNumber(order.customer.phone);
  const itemLines = order.items.map(
    (item) => `• ${item.productName} (${item.sizeLabel}) × ${item.quantity} = ${item.lineTotal} درهم`,
  );
  const msg = [
    `مرحبًا ${order.customer.name}، شكرًا لطلبك من متجر كرامو راشد 🍯`,
    `تأكيد الطلب #${order.id}:`,
    ...itemLines,
    `المجموع: ${order.total} درهم (${order.freeShipping ? 'توصيل مجاني' : 'الدفع عند الاستلام'})`,
    `العنوان: ${order.customer.address}`,
    receiptPageUrl ? `صورة وصل التوصيل: ${receiptPageUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `https://wa.me/${customerDigits}?text=${encodeURIComponent(msg)}`;
}

function buildOrderEmailHtml(order: Order, hasAttachedReceiptPng: boolean): string {
  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #2f2817;color:#f4ecd8;">${escapeHtml(item.productName)} (${escapeHtml(item.sizeLabel)})</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2f2817;color:#f4ecd8;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2f2817;color:#e9c565;text-align:left;">${item.lineTotal} درهم</td>
      </tr>`,
    )
    .join('');

  const customerWhatsappUrl =
    order.customerWhatsappUrl ||
    buildCustomerVerificationWhatsappUrl(order, order.receiptPageUrl);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:24px;background:#090806;color:#f4ecd8;font-family:Tahoma,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#13110c;border:1px solid #4a3a14;border-radius:16px;padding:24px;">
    <h1 style="margin:0 0 8px;color:#e9c565;font-size:22px;">طلب جديد #${escapeHtml(order.id)}</h1>
    <p style="margin:0 0 20px;color:#a99d83;font-size:14px;">متجر كرامو راشد · الدفع عند الاستلام</p>

    <div style="background:#090806;border:1px solid #2f2817;border-radius:12px;padding:16px;margin-bottom:20px;">
      <p style="margin:4px 0;"><strong>العميل:</strong> ${escapeHtml(order.customer.name)}</p>
      <p style="margin:4px 0;"><strong>الهاتف:</strong> <span dir="ltr">${escapeHtml(order.customer.phone)}</span></p>
      <p style="margin:4px 0;"><strong>العنوان:</strong> ${escapeHtml(order.customer.address)}</p>
      ${order.customer.notes ? `<p style="margin:4px 0;"><strong>ملاحظات:</strong> ${escapeHtml(order.customer.notes)}</p>` : ''}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr>
          <th style="padding:10px 12px;border-bottom:1px solid #4a3a14;text-align:right;color:#a99d83;">المنتج</th>
          <th style="padding:10px 12px;border-bottom:1px solid #4a3a14;text-align:center;color:#a99d83;">الكمية</th>
          <th style="padding:10px 12px;border-bottom:1px solid #4a3a14;text-align:left;color:#a99d83;">المجموع</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid #4a3a14;font-size:18px;font-weight:bold;color:#e9c565;">
      <span>الإجمالي: ${order.total} درهم</span>
    </div>

    ${
      hasAttachedReceiptPng
        ? `<div style="margin:18px 0;border:1px solid #4a3a14;border-radius:12px;overflow:hidden;"><img src="cid:receipt-image" alt="وصل التوصيل" style="display:block;width:100%;height:auto;" /></div>`
        : ''
    }

    <p style="margin:18px 0 0;">
      <a href="${escapeHtml(customerWhatsappUrl)}" style="display:inline-block;background:#25d366;color:#07210f;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">
        إرسال تأكيد الطلب للعميل عبر واتساب
      </a>
      ${
        order.receiptPageUrl
          ? `<a href="${escapeHtml(order.receiptPageUrl)}" style="display:inline-block;margin-right:10px;border:1px solid #d4a537;color:#e9c565;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;">عرض صورة الوصل</a>`
          : ''
      }
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendOrderEmail(
  order: Order,
  settings: PersistedSettings,
): Promise<DeliveryChannelResult> {
  const timestamp = new Date().toISOString();
  if (!settings.ownerEmail) {
    return {
      sent: false,
      destination: 'غير محدد',
      message: 'لم يتم تحديد بريد التاجر في الإعدادات بعد.',
      timestamp,
    };
  }
  if (!settings.smtpUser || !settings.smtpPass) {
    return {
      sent: false,
      destination: settings.ownerEmail,
      message: 'تم حفظ الطلب، لكن بيانات SMTP غير مكتملة لإرسال البريد تلقائيًا.',
      timestamp,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost || 'smtp.gmail.com',
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
    });

    const receiptPath = getReceiptFilePath(order.id);
    const hasAttachedReceipt = fs.existsSync(receiptPath);

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to: settings.ownerEmail,
      subject: `طلب جديد #${order.id} — ${order.customer.name} (${order.total} درهم)`,
      text: order.whatsappMessage,
      html: buildOrderEmailHtml(order, hasAttachedReceipt),
      attachments: hasAttachedReceipt
        ? [
            {
              filename: `kramo-rachid-${safeOrderId(order.id)}.png`,
              path: receiptPath,
              cid: 'receipt-image',
            },
          ]
        : undefined,
    });

    return {
      sent: true,
      destination: settings.ownerEmail,
      message: 'تم إرسال تفاصيل الطلب وصورة الوصل إلى البريد الإلكتروني بنجاح.',
      timestamp,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'SMTP error';
    return {
      sent: false,
      destination: settings.ownerEmail,
      message: `تعذر إرسال البريد الإلكتروني: ${reason}`,
      timestamp,
    };
  }
}

async function sendWhatsappCloudMessage(
  whatsappMessage: string,
  settings: PersistedSettings,
  publicReceiptImageUrl?: string,
): Promise<DeliveryChannelResult> {
  const timestamp = new Date().toISOString();
  const dest = settings.ownerWhatsapp;
  if (!settings.whatsappCloudToken || !settings.whatsappPhoneNumberId) {
    return {
      sent: false,
      destination: dest,
      message: 'سيتم فتح واتساب مباشرة برابط الطلب الجاهز (WhatsApp Cloud API اختياري).',
      timestamp,
    };
  }

  try {
    const payload =
      publicReceiptImageUrl && publicReceiptImageUrl.startsWith('https://')
        ? {
            messaging_product: 'whatsapp',
            to: dest,
            type: 'image',
            image: {
              link: publicReceiptImageUrl,
              caption: whatsappMessage,
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: dest,
            type: 'text',
            text: { body: whatsappMessage },
          };

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(settings.whatsappPhoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.whatsappCloudToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      return {
        sent: false,
        destination: dest,
        message: `تعذر الإرسال التلقائي عبر WhatsApp API (${response.status}): ${errBody.slice(0, 120)}`,
        timestamp,
      };
    }

    return {
      sent: true,
      destination: dest,
      message: 'تم إرسال الطلب وصورة الوصل تلقائيًا إلى رقم واتساب التاجر.',
      timestamp,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Network error';
    return {
      sent: false,
      destination: dest,
      message: `تعذر الاتصال بـ WhatsApp API: ${reason}`,
      timestamp,
    };
  }
}

function toSafeAdminSettings(s: PersistedSettings): AdminStoreSettings {
  return {
    ownerEmail: s.ownerEmail,
    ownerWhatsapp: s.ownerWhatsapp,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser,
    smtpFrom: s.smtpFrom,
    hasSmtpPass: Boolean(s.smtpPass),
    whatsappPhoneNumberId: s.whatsappPhoneNumberId,
    hasWhatsappToken: Boolean(s.whatsappCloudToken),
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    const settings = loadSettings();
    res.json({
      ownerWhatsapp: settings.ownerWhatsapp,
      hasOwnerEmail: Boolean(settings.ownerEmail),
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      storePhoneDisplay: formatPhoneDisplay(settings.ownerWhatsapp),
    });
  });

  app.get('/api/products', (_req, res) => {
    const reviews = loadReviews();
    const enrichedProducts = PRODUCTS.map((p) => {
      const summary = computeProductRatingSummary(p.id, reviews);
      return {
        ...p,
        rating: summary.rating,
        reviewCount: summary.reviewCount,
      };
    });
    res.json({ products: enrichedProducts, categories: CATEGORIES });
  });

  const reviewSubmitBuckets = new Map<string, { count: number; resetAt: number }>();

  app.get('/api/products/:productId/reviews', (req, res) => {
    const productId = Number(req.params.productId);
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!Number.isInteger(productId) || !product) {
      res.status(404).json({ error: 'المنتج غير موجود.' });
      return;
    }
    const allReviews = loadReviews();
    const productReviews = allReviews
      .filter((r) => r.productId === productId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const summary = computeProductRatingSummary(productId, allReviews);
    res.json({ reviews: productReviews, summary });
  });

  app.post('/api/products/:productId/reviews', (req, res) => {
    const productId = Number(req.params.productId);
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!Number.isInteger(productId) || !product) {
      res.status(404).json({ error: 'المنتج غير موجود.' });
      return;
    }

    const bucketKey = getClientBucketKey(req);
    const nowMs = Date.now();
    const bucket = reviewSubmitBuckets.get(bucketKey);
    if (bucket && bucket.resetAt > nowMs && bucket.count >= 12) {
      res.status(429).json({ error: 'لقد أرسلت عددًا كبيرًا من التقييمات مؤخرًا. حاول بعد قليل.' });
      return;
    }

    const body = req.body as {
      authorName?: unknown;
      city?: unknown;
      rating?: unknown;
      comment?: unknown;
    };

    const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const ratingNum = Number(body.rating);

    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ error: 'يرجى اختيار تقييم من 1 إلى 5 نجوم.' });
      return;
    }
    if (authorName.length < 2 || authorName.length > 60) {
      res.status(400).json({ error: 'يرجى إدخال الاسم (من حرفين إلى 60 حرفًا).' });
      return;
    }
    if (city.length > 40) {
      res.status(400).json({ error: 'اسم المدينة طويل جدًا (الحد الأقصى 40 حرفًا).' });
      return;
    }
    if (comment.length < 5 || comment.length > 500) {
      res.status(400).json({ error: 'يرجى كتابة رأيك حول جودة المنتج (من 5 إلى 500 حرف).' });
      return;
    }

    const newReview: ProductReview = {
      id: `REV-${nowMs}-${crypto.randomBytes(3).toString('hex')}`,
      productId,
      authorName,
      city: city || undefined,
      rating: ratingNum,
      comment,
      createdAt: new Date().toISOString(),
    };

    const allReviews = loadReviews();
    allReviews.unshift(newReview);
    saveReviews(allReviews);

    if (!bucket || bucket.resetAt <= nowMs) {
      reviewSubmitBuckets.set(bucketKey, { count: 1, resetAt: nowMs + 5 * 60 * 1000 });
    } else {
      bucket.count += 1;
    }

    const productReviews = allReviews
      .filter((r) => r.productId === productId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const summary = computeProductRatingSummary(productId, allReviews);

    res.status(201).json({
      review: newReview,
      reviews: productReviews,
      summary,
    });
  });

  app.post('/api/orders', async (req, res) => {
    const body = req.body as {
      name?: string;
      phone?: string;
      address?: string;
      notes?: string;
      visitorId?: string;
      deferNotifications?: boolean;
      items?: Array<{ productId: number; sizeIndex: number; quantity: number }>;
    };

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const address = String(body.address || '').trim();
    const notes = String(body.notes || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (name.length < 3) {
      res.status(400).json({ error: 'يرجى إدخال الاسم الكامل (3 أحرف على الأقل).' });
      return;
    }
    if (!/^(\+?212|0)[5-7][0-9]{8}$/.test(phone.replace(/\s+/g, ''))) {
      res.status(400).json({ error: 'يرجى إدخال رقم هاتف مغربي صحيح (مثال: 0612345678).' });
      return;
    }
    if (address.length < 5) {
      res.status(400).json({ error: 'يرجى إدخال عنوان التوصيل بالتفصيل.' });
      return;
    }
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'السلة فارغة. أضف منتجًا واحدًا على الأقل.' });
      return;
    }

    const orderItems: OrderItem[] = [];
    for (const entry of rawItems) {
      const product = PRODUCTS.find((p) => p.id === Number(entry.productId));
      if (!product) continue;
      const sizeIdx = Number(entry.sizeIndex);
      const size = product.sizes[sizeIdx] || product.sizes[product.defaultSizeIndex];
      const quantity = Math.max(1, Math.min(50, Math.floor(Number(entry.quantity) || 1)));
      const unitPrice = calcVariantPrice(product.basePrice, size.multiplier);
      orderItems.push({
        productId: product.id,
        productName: product.name,
        sizeLabel: size.label,
        unitLabel: product.unitLabel,
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
      });
    }

    if (orderItems.length === 0) {
      res.status(400).json({ error: 'لم يتم العثور على منتجات صالحة في الطلب.' });
      return;
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const freeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
    const existingOrders = loadOrders();
    const orderNumber = `KR-${1001 + existingOrders.length}`;
    const settings = loadSettings();
    const baseUrl = getPublicBaseUrl(req);
    const receiptImageUrl = `${baseUrl}/api/orders/${encodeURIComponent(orderNumber)}/receipt.png`;
    const receiptPageUrl = `${baseUrl}/receipt/${encodeURIComponent(orderNumber)}`;

    const baseOrder = {
      id: orderNumber,
      createdAt: new Date().toISOString(),
      status: 'new' as OrderStatus,
      customer: {
        name,
        phone,
        address,
        notes: notes || undefined,
      },
      items: orderItems,
      subtotal,
      freeShipping,
      total: subtotal,
    };

    const whatsappMessage = buildWhatsappMessage(baseOrder, receiptPageUrl);
    const whatsappUrl = `https://wa.me/${settings.ownerWhatsapp}?text=${encodeURIComponent(whatsappMessage)}`;
    const customerWhatsappUrl = buildCustomerVerificationWhatsappUrl(baseOrder, receiptPageUrl);

    const preliminaryOrder: Order = {
      ...baseOrder,
      whatsappMessage,
      whatsappUrl,
      customerWhatsappUrl,
      receiptImageUrl,
      receiptPageUrl,
      delivery: {
        email: {
          sent: false,
          destination: settings.ownerEmail || 'غير محدد',
          message: body.deferNotifications ? 'جاري إرفاق صورة الوصل وإرسال البريد…' : 'قيد المعالجة',
          timestamp: new Date().toISOString(),
        },
        whatsappApi: {
          sent: false,
          destination: settings.ownerWhatsapp,
          message: 'قيد المعالجة',
          timestamp: new Date().toISOString(),
        },
      },
    };

    if (!body.deferNotifications) {
      const [emailResult, whatsappApiResult] = await Promise.all([
        sendOrderEmail(preliminaryOrder, settings),
        sendWhatsappCloudMessage(whatsappMessage, settings, receiptImageUrl),
      ]);
      preliminaryOrder.delivery = {
        email: emailResult,
        whatsappApi: whatsappApiResult,
      };
    }

    existingOrders.unshift(preliminaryOrder);
    saveOrders(existingOrders);

    // Deduct ordered quantities from inventory and trigger low-stock alerts if threshold reached
    const invData = loadInventoryData();
    const touchedIds: number[] = [];
    for (const item of orderItems) {
      const current = invData.entries[String(item.productId)] ?? {
        stock: DEFAULT_STOCK,
        lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      };
      invData.entries[String(item.productId)] = {
        ...current,
        stock: Math.max(0, current.stock - item.quantity),
      };
      touchedIds.push(item.productId);
    }
    saveInventoryData(invData);
    await evaluateAndRecordLowStock(touchedIds, settings);

    const orderBodyMeta = body as {
      device?: string;
      deviceName?: string;
      os?: string;
      browser?: string;
      screenSize?: string;
      timezone?: string;
      language?: string;
    };
    const orderDeviceMeta = parseDeviceMetadataFromRequest(req, orderBodyMeta);
    const orderLocation = resolveLocationFromRequest(
      req,
      orderBodyMeta.timezone,
      orderBodyMeta.language,
      address,
    );

    recordStorefrontEvent({
      type: 'purchase',
      visitorHash: deriveVisitorHash(req, body.visitorId),
      device: inferDeviceFromRequest(req, orderBodyMeta.device),
      deviceName: orderDeviceMeta.deviceName,
      os: orderDeviceMeta.os,
      browser: orderDeviceMeta.browser,
      screenSize: orderDeviceMeta.screenSize,
      location: orderLocation,
      orderId: preliminaryOrder.id,
      orderTotal: preliminaryOrder.total,
      productName: orderItems[0]?.productName,
      productId: orderItems[0]?.productId,
      customerName: name,
    });

    res.status(201).json({ order: preliminaryOrder });
  });

  app.post('/api/track', (req, res) => {
    const body = req.body as {
      type?: string;
      visitorId?: string;
      productId?: number;
      device?: string;
      deviceName?: string;
      os?: string;
      browser?: string;
      screenSize?: string;
      timezone?: string;
      language?: string;
    };
    const allowedTypes: AnalyticsEventType[] = [
      'visit',
      'product_view',
      'add_to_cart',
      'checkout_start',
    ];
    if (!body.type || !allowedTypes.includes(body.type as AnalyticsEventType)) {
      res.status(400).json({ ok: false });
      return;
    }

    const product =
      typeof body.productId === 'number'
        ? PRODUCTS.find((p) => p.id === body.productId)
        : undefined;

    const deviceMeta = parseDeviceMetadataFromRequest(req, body);
    const location = resolveLocationFromRequest(req, body.timezone, body.language);

    recordStorefrontEvent({
      type: body.type as AnalyticsEventType,
      visitorHash: deriveVisitorHash(req, body.visitorId),
      device: inferDeviceFromRequest(req, body.device),
      deviceName: deviceMeta.deviceName,
      os: deviceMeta.os,
      browser: deviceMeta.browser,
      screenSize: deviceMeta.screenSize,
      location,
      productId: product?.id,
      productName: product?.name,
    });

    res.json({ ok: true });
  });

  app.get('/api/owner/auth/status', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json({
      configured: isOwnerAuthConfigured(),
      authenticated: verifyOwnerSessionToken(req.headers.authorization),
      envLocked: Boolean(getEnvOwnerPasscode()),
    });
  });

  app.post('/api/owner/auth/setup', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (isOwnerAuthConfigured()) {
      res.status(403).json({ error: 'تم إعداد كلمة مرور المالك مسبقاً.' });
      return;
    }

    const passcode = String((req.body as { passcode?: string }).passcode || '').trim();
    if (passcode.length < 6 || passcode.length > 128) {
      res.status(400).json({ error: 'يرجى اختيار رمز مرور من 6 أحرف على الأقل.' });
      return;
    }

    ensureDataDir();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
    const record: StoredOwnerAuth = {
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(OWNER_AUTH_FILE, JSON.stringify(record, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch {
      res.status(409).json({ error: 'تم إعداد رمز الدخول بالفعل.' });
      return;
    }

    const session = issueOwnerSessionToken();
    res.status(201).json(session);
  });

  app.post('/api/owner/auth/login', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const bucketKey = getClientBucketKey(req);
    if (isLoginRateLimited(bucketKey)) {
      res.status(429).json({
        error: 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد 5 دقائق.',
      });
      return;
    }

    if (!isOwnerAuthConfigured()) {
      res.status(400).json({ error: 'يرجى إعداد رمز مرور المالك أولاً.' });
      return;
    }

    const passcode = String((req.body as { passcode?: string }).passcode || '');
    if (!verifyOwnerPasscode(passcode)) {
      recordFailedLoginAttempt(bucketKey);
      res.status(401).json({ error: 'رمز الدخول غير صحيح.' });
      return;
    }

    clearFailedLoginAttempts(bucketKey);
    const session = issueOwnerSessionToken();
    res.json(session);
  });

  app.get('/api/owner/analytics', requireOwnerAuth, (_req, res) => {
    res.json({ analytics: buildOwnerAnalyticsSummary() });
  });

  app.post('/api/orders/:id/receipt', async (req, res) => {
    const id = safeOrderId(req.params.id);
    const orders = loadOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'الطلب غير موجود.' });
      return;
    }

    const body = req.body as { imageBase64?: string; sendNotifications?: boolean };
    const rawBase64 = String(body.imageBase64 || '');
    const match = rawBase64.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'صيغة صورة الوصل غير صالحة.' });
      return;
    }

    ensureDataDir();
    const buffer = Buffer.from(match[1], 'base64');
    fs.writeFileSync(getReceiptFilePath(id), buffer);

    const baseUrl = getPublicBaseUrl(req);
    const receiptImageUrl = `${baseUrl}/api/orders/${encodeURIComponent(id)}/receipt.png`;
    const receiptPageUrl = `${baseUrl}/receipt/${encodeURIComponent(id)}`;
    const settings = loadSettings();

    const order = orders[idx];
    order.receiptImageUrl = receiptImageUrl;
    order.receiptPageUrl = receiptPageUrl;
    order.whatsappMessage = buildWhatsappMessage(order, receiptPageUrl);
    order.whatsappUrl = `https://wa.me/${settings.ownerWhatsapp}?text=${encodeURIComponent(order.whatsappMessage)}`;
    order.customerWhatsappUrl = buildCustomerVerificationWhatsappUrl(order, receiptPageUrl);

    if (body.sendNotifications && !order.delivery.email.sent) {
      const [emailResult, whatsappApiResult] = await Promise.all([
        sendOrderEmail(order, settings),
        sendWhatsappCloudMessage(order.whatsappMessage, settings, receiptImageUrl),
      ]);
      order.delivery = {
        email: emailResult,
        whatsappApi: whatsappApiResult,
      };
    }

    orders[idx] = order;
    saveOrders(orders);

    res.json({
      order,
      receiptImageUrl,
      receiptPageUrl,
      whatsappUrl: order.whatsappUrl,
      customerWhatsappUrl: order.customerWhatsappUrl,
    });
  });

  app.post('/api/orders/:id/notify', async (req, res) => {
    const id = safeOrderId(req.params.id);
    const orders = loadOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'الطلب غير موجود.' });
      return;
    }
    const settings = loadSettings();
    const order = orders[idx];
    if (!order.delivery.email.sent) {
      const [emailResult, whatsappApiResult] = await Promise.all([
        sendOrderEmail(order, settings),
        sendWhatsappCloudMessage(order.whatsappMessage, settings, order.receiptImageUrl),
      ]);
      order.delivery = {
        email: emailResult,
        whatsappApi: whatsappApiResult,
      };
      orders[idx] = order;
      saveOrders(orders);
    }
    res.json({ order });
  });

  app.get('/api/orders/:id/receipt.png', (req, res) => {
    const id = safeOrderId(req.params.id);
    const filePath = getReceiptFilePath(id);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'صورة الوصل غير متوفرة بعد.' });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  });

  app.get('/receipt/:id', (req, res) => {
    const id = safeOrderId(req.params.id);
    const orders = loadOrders();
    const order = orders.find((o) => o.id === id);
    if (!order) {
      res.status(404).send('<!doctype html><html lang="ar" dir="rtl"><body style="background:#090806;color:#f4ecd8;font-family:Tahoma,sans-serif;padding:40px;text-align:center;"><h1>الوصل غير موجود</h1></body></html>');
      return;
    }

    const baseUrl = getPublicBaseUrl(req);
    const imgUrl = `${baseUrl}/api/orders/${encodeURIComponent(id)}/receipt.png`;
    const hasPng = fs.existsSync(getReceiptFilePath(id));
    const itemRows = order.items
      .map(
        (it) =>
          `<tr><td style="padding:10px;border-bottom:1px solid #2f2817;">${escapeHtml(it.productName)} (${escapeHtml(it.sizeLabel)})</td><td style="padding:10px;border-bottom:1px solid #2f2817;text-align:center;">× ${it.quantity}</td><td style="padding:10px;border-bottom:1px solid #2f2817;text-align:left;color:#e9c565;font-weight:bold;">${it.lineTotal} درهم</td></tr>`,
      )
      .join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>وصل الطلب #${escapeHtml(order.id)} | كرامو راشد</title>
  <meta property="og:title" content="وصل الطلب #${escapeHtml(order.id)} — كرامو راشد (${order.total} درهم)" />
  <meta property="og:description" content="وصل التوصيل للعميل ${escapeHtml(order.customer.name)} · المجموع ${order.total} درهم" />
  ${hasPng ? `<meta property="og:image" content="${escapeHtml(imgUrl)}" />` : ''}
  <meta property="og:type" content="website" />
</head>
<body style="margin:0;padding:24px;background:#090806;color:#f4ecd8;font-family:Tahoma,Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;background:#13110c;border:1px solid #6b5420;border-radius:18px;padding:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-bottom:1px solid #2f2817;padding-bottom:16px;margin-bottom:20px;">
      <div>
        <h1 style="margin:0;color:#e9c565;font-size:24px;">كرامو راشد · وصل التوصيل #${escapeHtml(order.id)}</h1>
        <p style="margin:4px 0 0;color:#a99d83;font-size:14px;">${escapeHtml(order.customer.name)} · <span dir="ltr">${escapeHtml(order.customer.phone)}</span></p>
      </div>
      ${
        hasPng
          ? `<a href="${escapeHtml(imgUrl)}" download="kramo-rachid-${escapeHtml(order.id)}.png" style="background:linear-gradient(135deg,#f6dc8a,#c8961f);color:#120e05;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:bold;font-size:14px;">تحميل صورة الوصل</a>`
          : ''
      }
    </div>
    ${
      hasPng
        ? `<img src="${escapeHtml(imgUrl)}" alt="وصل التوصيل #${escapeHtml(order.id)}" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid #4a3a14;margin-bottom:20px;" />`
        : ''
    }
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tbody>${itemRows}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;color:#e9c565;padding-top:12px;border-top:1px solid #2f2817;">
      <span>المجموع الإجمالي (الدفع عند الاستلام)</span>
      <span>${order.total} درهم</span>
    </div>
  </div>
</body>
</html>`);
  });

  app.get('/api/orders/track', (req, res) => {
    const query = String(req.query.q || '').trim().toUpperCase();
    if (!query) {
      res.status(400).json({ error: 'أدخل رقم الطلب أو رقم الهاتف للبحث.' });
      return;
    }
    const cleanPhoneQuery = query.replace(/\s+/g, '');
    const orders = loadOrders();
    const matches = orders.filter(
      (o) =>
        o.id.toUpperCase() === query ||
        o.customer.phone.replace(/\s+/g, '') === cleanPhoneQuery,
    );

    res.json({
      orders: matches.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        customer: o.customer,
        items: o.items,
        total: o.total,
        freeShipping: o.freeShipping,
        whatsappUrl: o.whatsappUrl,
        receiptImageUrl: o.receiptImageUrl,
        receiptPageUrl: o.receiptPageUrl,
      })),
    });
  });

  app.get('/api/push/vapid-public-key', (_req, res) => {
    const keys = getOrCreateVapidKeys();
    res.json({ publicKey: keys.publicKey });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const body = req.body as {
      orderIds?: unknown;
      subscription?: {
        endpoint?: unknown;
        expirationTime?: unknown;
        keys?: { p256dh?: unknown; auth?: unknown };
      };
    };

    const rawOrderIds = Array.isArray(body.orderIds) ? body.orderIds : [];
    const existingOrders = new Set(loadOrders().map((o) => o.id));
    const validOrderIds = Array.from(
      new Set(
        rawOrderIds
          .map((id) => safeOrderId(String(id || '').trim()))
          .filter((id) => id.length >= 3 && existingOrders.has(id)),
      ),
    ).slice(0, 20);

    if (validOrderIds.length === 0) {
      res.status(400).json({ error: 'لا توجد أرقام طلبات صالحة للاشتراك في الإشعارات.' });
      return;
    }

    const endpoint =
      typeof body.subscription?.endpoint === 'string'
        ? body.subscription.endpoint.trim()
        : '';
    const p256dh =
      typeof body.subscription?.keys?.p256dh === 'string'
        ? body.subscription.keys.p256dh.trim()
        : '';
    const auth =
      typeof body.subscription?.keys?.auth === 'string'
        ? body.subscription.keys.auth.trim()
        : '';

    let parsedEndpoint: URL | null = null;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      parsedEndpoint = null;
    }

    if (
      !parsedEndpoint ||
      parsedEndpoint.protocol !== 'https:' ||
      p256dh.length < 16 ||
      auth.length < 8
    ) {
      res.status(400).json({ error: 'بيانات اشتراك إشعارات المتصفح غير صالحة.' });
      return;
    }

    const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
    const records = loadPushSubscriptions();
    const existingIdx = records.findIndex((r) => r.endpointHash === endpointHash);
    const nowIso = new Date().toISOString();

    if (existingIdx >= 0) {
      const mergedOrders = Array.from(
        new Set([...validOrderIds, ...records[existingIdx].orderIds]),
      ).slice(0, 25);
      records[existingIdx] = {
        endpointHash,
        subscription: {
          endpoint,
          expirationTime:
            typeof body.subscription?.expirationTime === 'number'
              ? body.subscription.expirationTime
              : null,
          keys: { p256dh, auth },
        },
        orderIds: mergedOrders,
        updatedAt: nowIso,
      };
    } else {
      records.unshift({
        endpointHash,
        subscription: {
          endpoint,
          expirationTime:
            typeof body.subscription?.expirationTime === 'number'
              ? body.subscription.expirationTime
              : null,
          keys: { p256dh, auth },
        },
        orderIds: validOrderIds,
        updatedAt: nowIso,
      });
    }

    savePushSubscriptions(records);
    res.json({ ok: true, orderIds: validOrderIds });
  });

  app.get('/api/orders/stream', (req, res) => {
    const rawIds = String(req.query.orderIds || '');
    const existingOrders = new Set(loadOrders().map((o) => o.id));
    const orderIds = Array.from(
      new Set(
        rawIds
          .split(',')
          .map((part) => safeOrderId(part.trim()))
          .filter((id) => id.length >= 3 && existingOrders.has(id)),
      ),
    ).slice(0, 20);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: connected\ndata: ${JSON.stringify({ orderIds })}\n\n`);

    for (const orderId of orderIds) {
      registerOrderStreamClient(orderId, res);
    }

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      for (const orderId of orderIds) {
        unregisterOrderStreamClient(orderId, res);
      }
    });
  });

  app.get('/api/admin/orders', requireOwnerAuth, (_req, res) => {
    const orders = loadOrders();
    const settings = loadSettings();
    res.json({
      orders,
      settings: toSafeAdminSettings(settings),
    });
  });

  app.patch('/api/admin/orders/:id', requireOwnerAuth, async (req, res) => {
    const { id } = req.params;
    const status = String((req.body as { status?: string }).status || '') as OrderStatus;
    const validStatuses: OrderStatus[] = ['new', 'preparing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'حالة الطلب غير صالحة.' });
      return;
    }
    const orders = loadOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'الطلب غير موجود.' });
      return;
    }
    const previousStatus = orders[idx].status;
    orders[idx].status = status;
    saveOrders(orders);

    let notifiedCount = 0;
    if (previousStatus !== status) {
      notifiedCount = await notifyOrderStatusChange(orders[idx]);
    }

    res.json({ order: orders[idx], notifiedCount });
  });

  app.get('/api/admin/settings', requireOwnerAuth, (_req, res) => {
    const settings = loadSettings();
    res.json({ settings: toSafeAdminSettings(settings) });
  });

  app.put('/api/admin/settings', requireOwnerAuth, (req, res) => {
    const current = loadSettings();
    const body = req.body as Partial<PersistedSettings>;

    const next: PersistedSettings = {
      ownerEmail:
        typeof body.ownerEmail === 'string' ? body.ownerEmail.trim() : current.ownerEmail,
      ownerWhatsapp:
        typeof body.ownerWhatsapp === 'string' && body.ownerWhatsapp.trim()
          ? normalizeWhatsappNumber(body.ownerWhatsapp.trim())
          : current.ownerWhatsapp,
      smtpHost:
        typeof body.smtpHost === 'string' && body.smtpHost.trim()
          ? body.smtpHost.trim()
          : current.smtpHost,
      smtpPort:
        body.smtpPort && Number(body.smtpPort) > 0
          ? Number(body.smtpPort)
          : current.smtpPort,
      smtpUser:
        typeof body.smtpUser === 'string' ? body.smtpUser.trim() : current.smtpUser,
      smtpPass:
        typeof body.smtpPass === 'string' && body.smtpPass.trim()
          ? body.smtpPass.trim()
          : current.smtpPass,
      smtpFrom:
        typeof body.smtpFrom === 'string' && body.smtpFrom.trim()
          ? body.smtpFrom.trim()
          : current.smtpFrom,
      whatsappPhoneNumberId:
        typeof body.whatsappPhoneNumberId === 'string'
          ? body.whatsappPhoneNumberId.trim()
          : current.whatsappPhoneNumberId,
      whatsappCloudToken:
        typeof body.whatsappCloudToken === 'string' && body.whatsappCloudToken.trim()
          ? body.whatsappCloudToken.trim()
          : current.whatsappCloudToken,
    };

    saveSettings(next);
    res.json({ settings: toSafeAdminSettings(next) });
  });

  app.post('/api/admin/test-email', requireOwnerAuth, async (_req, res) => {
    const settings = loadSettings();
    if (!settings.ownerEmail || !settings.smtpUser || !settings.smtpPass) {
      res.status(400).json({
        ok: false,
        message: 'يرجى حفظ البريد الإلكتروني المستلم + اسم مستخدم وكلمة مرور تطبيق SMTP أولًا.',
      });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost || 'smtp.gmail.com',
        port: settings.smtpPort || 587,
        secure: settings.smtpPort === 465,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass,
        },
      });

      await transporter.sendMail({
        from: settings.smtpFrom || settings.smtpUser,
        to: settings.ownerEmail,
        subject: 'رسالة اختبار — إشعارات طلبات متجر كرامو راشد',
        text: 'تم ربط البريد الإلكتروني بنجاح. ستصلك هنا جميع الطلبات الجديدة من متجر كرامو راشد.',
      });

      res.json({
        ok: true,
        message: `تم إرسال رسالة الاختبار بنجاح إلى ${settings.ownerEmail}`,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'SMTP error';
      res.status(500).json({
        ok: false,
        message: `فشل إرسال رسالة الاختبار: ${reason}`,
      });
    }
  });

  app.get('/api/admin/inventory', requireOwnerAuth, (_req, res) => {
    const data = loadInventoryData();
    const items = buildInventoryList(data);
    res.json({
      items,
      alerts: data.alerts,
    });
  });

  app.patch('/api/admin/inventory/:productId', requireOwnerAuth, async (req, res) => {
    const productId = Number(req.params.productId);
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      res.status(404).json({ error: 'المنتج غير موجود.' });
      return;
    }

    const body = req.body as { stock?: number; lowStockThreshold?: number };
    const data = loadInventoryData();
    const current = data.entries[String(productId)] ?? {
      stock: DEFAULT_STOCK,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    };

    const nextStock =
      body.stock !== undefined
        ? Math.max(0, Math.min(9999, Math.floor(Number(body.stock))))
        : current.stock;
    const nextThreshold =
      body.lowStockThreshold !== undefined
        ? Math.max(0, Math.min(999, Math.floor(Number(body.lowStockThreshold))))
        : current.lowStockThreshold;

    if (Number.isNaN(nextStock) || Number.isNaN(nextThreshold)) {
      res.status(400).json({ error: 'يرجى إدخال أرقام صالحة للمخزون وحد التنبيه.' });
      return;
    }

    data.entries[String(productId)] = {
      ...current,
      stock: nextStock,
      lowStockThreshold: nextThreshold,
    };
    saveInventoryData(data);

    const settings = loadSettings();
    const triggeredAlerts = await evaluateAndRecordLowStock([productId], settings);
    const updatedData = loadInventoryData();

    res.json({
      items: buildInventoryList(updatedData),
      alerts: updatedData.alerts,
      triggeredAlerts,
    });
  });

  app.post('/api/admin/inventory/send-alert', requireOwnerAuth, async (req, res) => {
    const body = req.body as { productId?: number };
    const data = loadInventoryData();
    const allItems = buildInventoryList(data);
    const settings = loadSettings();

    const targetIds =
      typeof body.productId === 'number'
        ? [body.productId]
        : allItems.filter((it) => it.stock <= it.lowStockThreshold).map((it) => it.productId);

    if (targetIds.length === 0) {
      res.status(400).json({
        ok: false,
        message: 'لا توجد منتجات بمستوى مخزون منخفض حاليًا.',
      });
      return;
    }

    const alerts = await evaluateAndRecordLowStock(targetIds, settings, true);
    const updatedData = loadInventoryData();
    const first = alerts[0];
    res.json({
      ok: true,
      alerts: updatedData.alerts,
      triggeredAlerts: alerts,
      whatsappUrl: first?.whatsappUrl,
      message: first?.emailSent
        ? `تم إرسال تنبيه المخزون المنخفض إلى البريد الإلكتروني (${settings.ownerEmail}).`
        : 'تم تسجيل تنبيه المخزون المنخفض وتجهيز رابط الواتساب.',
    });
  });

  app.patch('/api/admin/inventory/alerts/:alertId/ack', requireOwnerAuth, (req, res) => {
    const { alertId } = req.params;
    const data = loadInventoryData();
    const idx = data.alerts.findIndex((a) => a.id === alertId);
    if (idx === -1) {
      res.status(404).json({ error: 'التنبيه غير موجود.' });
      return;
    }
    data.alerts[idx].acknowledged = true;
    saveInventoryData(data);
    res.json({ alerts: data.alerts });
  });

  app.use('/owner', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
