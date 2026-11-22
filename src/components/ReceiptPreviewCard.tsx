import { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import type { Order } from '../types.ts';
import {
  copyReceiptImageToClipboard,
  downloadReceiptImage,
  generateDeliveryReceiptPng,
  shareReceiptImageOrDownload,
  type GeneratedReceipt,
  type ReceiptRenderInput,
} from '../utils/receiptGenerator.ts';

interface ReceiptPreviewCardProps {
  order: ReceiptRenderInput;
  whatsappHref: string;
  whatsappButtonLabel: string;
  receiptPageUrl?: string;
  onUploaded?: (urls: {
    receiptImageUrl: string;
    receiptPageUrl: string;
    whatsappUrl?: string;
    order?: Order;
  }) => void;
  autoUpload?: boolean;
  deferNotification?: boolean;
}

export function ReceiptPreviewCard({
  order,
  whatsappHref,
  whatsappButtonLabel,
  receiptPageUrl,
  onUploaded,
  autoUpload = true,
  deferNotification = false,
}: ReceiptPreviewCardProps) {
  const [receipt, setReceipt] = useState<GeneratedReceipt | null>(null);
  const [rendering, setRendering] = useState(true);
  const [copied, setCopied] = useState(false);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [liveWhatsappHref, setLiveWhatsappHref] = useState(whatsappHref);
  const [liveReceiptPageUrl, setLiveReceiptPageUrl] = useState(receiptPageUrl);

  useEffect(() => {
    setLiveWhatsappHref(whatsappHref);
  }, [whatsappHref]);

  useEffect(() => {
    setLiveReceiptPageUrl(receiptPageUrl);
  }, [receiptPageUrl]);

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;

    async function buildAndUpload() {
      setRendering(true);
      try {
        const generated = await generateDeliveryReceiptPng(order);
        if (!active) {
          URL.revokeObjectURL(generated.objectUrl);
          return;
        }
        createdObjectUrl = generated.objectUrl;
        setReceipt(generated);

        if (autoUpload) {
          try {
            const res = await fetch(
              `/api/orders/${encodeURIComponent(order.id)}/receipt`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  imageBase64: generated.dataUrl,
                  sendNotifications: deferNotification,
                }),
              },
            );
            if (res.ok && active) {
              const data = (await res.json()) as {
                order?: Order;
                receiptImageUrl?: string;
                receiptPageUrl?: string;
                whatsappUrl?: string;
              };
              if (data.whatsappUrl) setLiveWhatsappHref(data.whatsappUrl);
              if (data.receiptPageUrl) setLiveReceiptPageUrl(data.receiptPageUrl);
              if (data.receiptImageUrl && data.receiptPageUrl) {
                onUploaded?.({
                  receiptImageUrl: data.receiptImageUrl,
                  receiptPageUrl: data.receiptPageUrl,
                  whatsappUrl: data.whatsappUrl,
                  order: data.order,
                });
              }
            } else if (deferNotification) {
              await fetch(`/api/orders/${encodeURIComponent(order.id)}/notify`, {
                method: 'POST',
              }).catch(() => {});
            }
          } catch {
            if (deferNotification) {
              await fetch(`/api/orders/${encodeURIComponent(order.id)}/notify`, {
                method: 'POST',
              }).catch(() => {});
            }
          }
        }
      } finally {
        if (active) setRendering(false);
      }
    }

    buildAndUpload();

    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [order.id]);

  async function handleCopy() {
    if (!receipt) return;
    const ok = await copyReceiptImageToClipboard(receipt.blob);
    if (ok) {
      setCopied(true);
      setActionHint('تم نسخ صورة الوصل — يمكنك لصقها مباشرة في محادثة واتساب.');
      setTimeout(() => setCopied(false), 2500);
    } else {
      downloadReceiptImage(receipt.objectUrl, receipt.filename);
      setActionHint('تم تحميل صورة الوصل على جهازك لإرفاقها في واتساب.');
    }
  }

  async function handleShareOrDownload() {
    if (!receipt) return;
    const outcome = await shareReceiptImageOrDownload(
      receipt.blob,
      receipt.objectUrl,
      receipt.filename,
      `وصل طلب #${order.id} — كرامو راشد`,
      `طلب #${order.id} · المجموع ${order.total} درهم`,
    );
    if (outcome === 'downloaded') {
      setActionHint('تم تحميل صورة الوصل بنجاح.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-[#4a3a14] bg-[#090806]">
        {rendering || !receipt ? (
          <div className="flex aspect-[4/3] items-center justify-center text-sm text-[#a99d83]">
            جاري تجهيز صورة وصل التوصيل…
          </div>
        ) : (
          <img
            src={receipt.objectUrl}
            alt={`صورة وصل التوصيل للطلب ${order.id}`}
            className="block w-full object-contain"
          />
        )}
      </div>

      {actionHint && (
        <p className="rounded-lg border border-[#4a3a14] bg-[#13110c] px-3.5 py-2 text-xs text-[#e9c565]">
          {actionHint}
        </p>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          disabled={!receipt}
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d4a537]/70 bg-[#13110c] px-4 py-2.5 text-sm font-semibold text-[#e9c565] transition-colors hover:bg-[#d4a537]/10 disabled:opacity-40"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          <span>{copied ? 'تم نسخ الصورة' : 'نسخ صورة الوصل'}</span>
        </button>

        <button
          type="button"
          disabled={!receipt}
          onClick={handleShareOrDownload}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2f2817] bg-[#13110c] px-4 py-2.5 text-sm font-semibold text-[#f4ecd8] transition-colors hover:border-[#d4a537] disabled:opacity-40"
        >
          {typeof navigator !== 'undefined' && 'share' in navigator ? (
            <Share2 className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span>تحميل / مشاركة الصورة</span>
        </button>
      </div>

      <a
        href={liveWhatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25d366] px-5 py-3 text-sm font-bold text-[#07210f] transition-all hover:brightness-105"
      >
        <MessageCircle className="h-4 w-4" />
        <span>{whatsappButtonLabel}</span>
      </a>

      {liveReceiptPageUrl && (
        <a
          href={liveReceiptPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 text-xs text-[#a99d83] hover:text-[#e9c565]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>فتح رابط الوصل القابل للمشاركة</span>
        </a>
      )}
    </div>
  );
}
