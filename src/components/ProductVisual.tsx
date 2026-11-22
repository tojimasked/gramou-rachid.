import { useEffect, useState } from 'react';
import type { Product } from '../types.ts';

interface ProductVisualProps {
  product: Product;
  imageOverride?: string;
  className?: string;
}

export function ProductVisual({ product, imageOverride, className = '' }: ProductVisualProps) {
  const src = imageOverride || product.image;
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (!imgError && src) {
    return (
      <img
        src={src}
        alt={product.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`h-full w-full object-cover object-center ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-[#120f09] ${className}`}
      style={{
        backgroundImage: `radial-gradient(ellipse at 50% 35%, ${product.color}33 0%, #0d0b07 75%)`,
      }}
    >
      <svg
        viewBox="0 0 100 120"
        className="h-3/4 w-auto drop-shadow-lg"
        style={{ color: product.color }}
        role="img"
        aria-label={product.name}
      >
        <defs>
          <linearGradient id={`gd-${product.id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#b98a1f" />
            <stop offset="0.4" stopColor="#f6dc8a" />
            <stop offset="1" stopColor="#a87814" />
          </linearGradient>
        </defs>
        {product.shape === 'comb' && (
          <>
            <path d="M14 34h72l8 12v54c0 9-6 14-15 14H21c-9 0-15-5-15-14V46z" fill="currentColor" />
            <path
              d="M6 46h88v12c-6 0-6 8-12 8s-6-6-12-6-6 10-12 10-6-8-12-8-6 8-12 8-6-6-12-6-6 6-12 6z"
              fill="currentColor"
              opacity="0.85"
            />
          </>
        )}
        {product.shape === 'bottle' && (
          <>
            <rect
              x="39"
              y="3"
              width="22"
              height="20"
              rx="4"
              fill="#0c0a06"
              stroke={`url(#gd-${product.id})`}
              strokeWidth="2"
            />
            <path
              d="M40 23h20v10c14 6 18 14 18 26v45c0 8-5 12-12 12H34c-7 0-12-4-12-12V59c0-12 4-20 18-26z"
              fill="currentColor"
            />
          </>
        )}
        {product.shape === 'bag' && (
          <>
            <path d="M22 10h56l7 16-5 82H20l-5-82z" fill="currentColor" />
            <rect x="22" y="10" width="56" height="9" fill="#0c0a06" />
          </>
        )}
        {product.shape === 'box' && (
          <>
            <rect
              x="8"
              y="56"
              width="84"
              height="58"
              rx="3"
              fill="#0c0a06"
              stroke={`url(#gd-${product.id})`}
              strokeWidth="2"
            />
            <rect
              x="4"
              y="40"
              width="92"
              height="20"
              rx="3"
              fill="#17140e"
              stroke={`url(#gd-${product.id})`}
              strokeWidth="2"
            />
            <rect x="44" y="40" width="12" height="74" fill={`url(#gd-${product.id})`} />
          </>
        )}
        {product.shape === 'jar' && (
          <>
            <rect
              x="27"
              y="3"
              width="46"
              height="17"
              rx="4"
              fill="#0c0a06"
              stroke={`url(#gd-${product.id})`}
              strokeWidth="2"
            />
            <rect x="25" y="18" width="50" height="6" rx="2" fill={`url(#gd-${product.id})`} />
            <path
              d="M26 24h48v8c11 6 16 14 16 27v43c0 10-6 16-16 16H26c-10 0-16-6-16-16V59c0-13 5-21 16-27z"
              fill="#fff"
              fillOpacity="0.1"
              stroke="#d4a537"
              strokeOpacity="0.6"
              strokeWidth="1.5"
            />
            <path d="M12 58h76v44c0 9-5 13-13 13H25c-8 0-13-4-13-13z" fill="currentColor" />
          </>
        )}
      </svg>
    </div>
  );
}
