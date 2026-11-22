export interface ClientDeviceProfile {
  device: 'mobile' | 'desktop';
  deviceName: string;
  os: string;
  browser: string;
  screenSize: string;
  timezone: string;
  language: string;
}

interface NavigatorUAData {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (
    hints: string[],
  ) => Promise<{
    model?: string;
    platform?: string;
    platformVersion?: string;
  }>;
}

let cachedProfilePromise: Promise<ClientDeviceProfile> | null = null;

function detectBrowserName(ua: string): string {
  if (/EdgA?\/|EdgiOS\//i.test(ua)) return 'Edge';
  if (/SamsungBrowser\//i.test(ua)) return 'Samsung Internet';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//i.test(ua)) return 'Firefox';
  if (/CriOS\/|Chrome\//i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS/i.test(ua)) return 'Safari';
  return 'Browser';
}

function detectAppleDeviceName(ua: string): { hardware: string; os: string } {
  const iosMatch = ua.match(/OS (\d+[_\d]*)/i);
  const iosVer = iosMatch ? iosMatch[1].replace(/_/g, '.') : '';

  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return {
      hardware: 'Apple iPad',
      os: iosVer ? `iPadOS ${iosVer}` : 'iPadOS',
    };
  }
  if (/iPhone/i.test(ua)) {
    return {
      hardware: 'Apple iPhone',
      os: iosVer ? `iOS ${iosVer}` : 'iOS',
    };
  }
  const macMatch = ua.match(/Mac OS X (\d+[_\d]*)/i);
  const macVer = macMatch ? macMatch[1].replace(/_/g, '.') : '';
  return {
    hardware: 'Apple Mac',
    os: macVer ? `macOS ${macVer}` : 'macOS',
  };
}

function formatAndroidBrandModel(rawModel: string): string {
  const trimmed = rawModel.trim();
  if (!trimmed) return 'Android Device';
  if (/^SM-/i.test(trimmed)) return `Samsung ${trimmed}`;
  if (/^(Pixel|Nexus)/i.test(trimmed)) return `Google ${trimmed}`;
  if (/^(Redmi|POCO|Mi |M\d{4}|2\d{6})/i.test(trimmed)) return `Xiaomi ${trimmed}`;
  if (/^(CPH|RMX)/i.test(trimmed)) return `OPPO / Realme ${trimmed}`;
  if (/^(ELS|ANA|NOH|JAD|VOG|ELE|HMA|LYA)/i.test(trimmed)) return `Huawei ${trimmed}`;
  return trimmed;
}

function parseAndroidFromUA(ua: string): { hardware: string; os: string } {
  const androidVerMatch = ua.match(/Android\s+([0-9.]+)/i);
  const os = androidVerMatch ? `Android ${androidVerMatch[1]}` : 'Android';
  const modelMatch = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
  const rawModel = modelMatch?.[1]?.trim() || '';
  if (rawModel && rawModel !== 'K' && rawModel.toLowerCase() !== 'wv') {
    return { hardware: formatAndroidBrandModel(rawModel), os };
  }
  return { hardware: 'Android Phone', os };
}

export function getSyncDeviceProfile(): ClientDeviceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      device: 'desktop',
      deviceName: 'Desktop Browser',
      os: 'Unknown',
      browser: 'Unknown',
      screenSize: '',
      timezone: '',
      language: '',
    };
  }

  const ua = navigator.userAgent || '';
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const isMobile =
    Boolean(uaData?.mobile) ||
    window.innerWidth < 768 ||
    /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  const browser = detectBrowserName(ua);
  let hardware = 'Desktop PC';
  let os = uaData?.platform || 'Unknown';

  if (/iPhone|iPad|Macintosh/i.test(ua)) {
    const apple = detectAppleDeviceName(ua);
    hardware = apple.hardware;
    os = apple.os;
  } else if (/Android/i.test(ua)) {
    const android = parseAndroidFromUA(ua);
    hardware = android.hardware;
    os = android.os;
  } else if (/Windows NT/i.test(ua)) {
    hardware = 'Windows PC';
    os = /Windows NT 10\.0/i.test(ua) ? 'Windows 10/11' : 'Windows';
  } else if (/CrOS/i.test(ua)) {
    hardware = 'Chromebook';
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    hardware = 'Linux PC';
    os = 'Linux';
  }

  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  const screenSize =
    window.screen?.width && window.screen?.height
      ? `${window.screen.width}×${window.screen.height}`
      : `${window.innerWidth}×${window.innerHeight}`;

  return {
    device: isMobile ? 'mobile' : 'desktop',
    deviceName: `${hardware} · ${browser}`,
    os,
    browser,
    screenSize,
    timezone,
    language: navigator.language || '',
  };
}

export async function getDeviceProfile(): Promise<ClientDeviceProfile> {
  if (cachedProfilePromise) return cachedProfilePromise;

  cachedProfilePromise = (async () => {
    const base = getSyncDeviceProfile();
    if (typeof navigator === 'undefined') return base;

    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
    if (!uaData?.getHighEntropyValues) return base;

    try {
      const hints = await Promise.race([
        uaData.getHighEntropyValues(['model', 'platform', 'platformVersion']),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
      ]);
      if (!hints) return base;

      let os = base.os;
      if (hints.platform === 'Windows' && hints.platformVersion) {
        const major = Number.parseInt(hints.platformVersion.split('.')[0] || '0', 10);
        os = major >= 13 ? 'Windows 11' : 'Windows 10';
      } else if (hints.platform === 'macOS' && hints.platformVersion) {
        os = `macOS ${hints.platformVersion.split('.').slice(0, 2).join('.')}`;
      } else if (hints.platform === 'Android' && hints.platformVersion) {
        os = `Android ${hints.platformVersion}`;
      }

      let hardware = base.deviceName.split(' · ')[0] || 'Device';
      if (hints.model && hints.model.trim()) {
        hardware =
          hints.platform === 'Android'
            ? formatAndroidBrandModel(hints.model)
            : hints.model.trim();
      } else if (os.startsWith('Windows 11')) {
        hardware = 'Windows 11 PC';
      }

      return {
        ...base,
        os,
        deviceName: `${hardware} · ${base.browser}`,
      };
    } catch {
      return base;
    }
  })();

  return cachedProfilePromise;
}
