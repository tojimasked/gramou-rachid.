import type { OrderItem } from '../types.ts';

export interface ReceiptRenderInput {
  id: string;
  createdAt: string;
  customer: {
    name: string;
    phone: string;
    address: string;
    notes?: string;
  };
  items: OrderItem[];
  total: number;
  freeShipping: boolean;
  storePhoneDisplay?: string;
}

export interface GeneratedReceipt {
  blob: Blob;
  dataUrl: string;
  objectUrl: string;
  filename: string;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generateDeliveryReceiptPng(
  order: ReceiptRenderInput,
): Promise<GeneratedReceipt> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const width = 840;
  const padX = 48;
  const innerX = 28;
  const innerW = width - innerX * 2;
  const contentW = innerW - 48;

  // Measure wrapped address & notes beforehand to compute exact height
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('Canvas 2D context unavailable');
  }
  mCtx.font = '400 20px "Readex Pro", Tahoma, Arial, sans-serif';
  const addressLines = wrapTextLines(mCtx, order.customer.address, contentW - 120);
  const notesLines = order.customer.notes
    ? wrapTextLines(mCtx, order.customer.notes, contentW - 120)
    : [];

  const customerBoxHeight =
    96 + addressLines.length * 30 + (notesLines.length > 0 ? notesLines.length * 30 + 14 : 0);
  const itemsHeaderHeight = 46;
  const itemsHeight = order.items.length * 64;
  const totalBoxHeight = 148;
  const headerHeight = 148;
  const footerHeight = 96;
  const totalHeight =
    28 +
    headerHeight +
    24 +
    customerBoxHeight +
    28 +
    itemsHeaderHeight +
    itemsHeight +
    28 +
    totalBoxHeight +
    footerHeight +
    28;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.scale(scale, scale);

  // Outer obsidian backdrop
  ctx.fillStyle = '#090806';
  ctx.fillRect(0, 0, width, totalHeight);

  // Subtle top warm amber radial glow
  const topGlow = ctx.createRadialGradient(width * 0.72, 60, 20, width * 0.72, 60, 420);
  topGlow.addColorStop(0, 'rgba(212, 165, 55, 0.14)');
  topGlow.addColorStop(1, 'rgba(9, 8, 6, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, totalHeight);

  // Main elevated receipt card
  drawRoundedRect(ctx, innerX, 28, innerW, totalHeight - 56, 20);
  ctx.fillStyle = '#13110c';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#6b5420';
  ctx.stroke();

  const goldGrad = ctx.createLinearGradient(padX, 0, width - padX, 0);
  goldGrad.addColorStop(0, '#f6dc8a');
  goldGrad.addColorStop(0.55, '#c8961f');
  goldGrad.addColorStop(1, '#f0cd6a');

  // Brand + Order header
  const rightEdge = width - innerX - 32;
  const leftEdge = innerX + 32;
  let y = 28 + 36;

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = goldGrad;
  ctx.font = '700 38px "Reem Kufi", "Readex Pro", Tahoma, sans-serif';
  ctx.fillText('كرامو راشد', rightEdge, y + 32);

  ctx.fillStyle = '#a99d83';
  ctx.font = '400 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('عسل مغربي طبيعي ومنتجات النحل · الدار البيضاء', rightEdge, y + 66);

  // Order badge on left side
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e9c565';
  ctx.font = '700 28px "Reem Kufi", "Readex Pro", Tahoma, sans-serif';
  ctx.fillText(`#${order.id}`, leftEdge, y + 28);

  const formattedDate = new Date(order.createdAt).toLocaleDateString('ar-MA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  ctx.fillStyle = '#a99d83';
  ctx.font = '400 16px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText(formattedDate, leftEdge, y + 58);
  ctx.fillStyle = '#d4a537';
  ctx.font = '600 16px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('وصل التوصيل والتحقق', leftEdge, y + 86);

  y += headerHeight - 36;
  ctx.strokeStyle = '#2f2817';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftEdge, y);
  ctx.lineTo(rightEdge, y);
  ctx.stroke();

  y += 24;

  // Customer info panel
  drawRoundedRect(ctx, leftEdge, y, rightEdge - leftEdge, customerBoxHeight, 14);
  ctx.fillStyle = '#0c0a07';
  ctx.fill();
  ctx.strokeStyle = '#2f2817';
  ctx.stroke();

  let cy = y + 34;
  const infoRight = rightEdge - 22;

  ctx.textAlign = 'right';
  ctx.fillStyle = '#a99d83';
  ctx.font = '600 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('العميل:', infoRight, cy);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '600 20px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText(order.customer.name, infoRight - 82, cy);

  // Phone on left of first customer line
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e9c565';
  ctx.font = '600 20px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText(order.customer.phone, leftEdge + 22, cy);

  cy += 38;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a99d83';
  ctx.font = '600 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('العنوان:', infoRight, cy);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '400 19px "Readex Pro", Tahoma, Arial, sans-serif';
  addressLines.forEach((line, idx) => {
    ctx.fillText(line, infoRight - 82, cy + idx * 30);
  });

  if (notesLines.length > 0) {
    cy += addressLines.length * 30 + 12;
    ctx.fillStyle = '#a99d83';
    ctx.font = '600 18px "Readex Pro", Tahoma, Arial, sans-serif';
    ctx.fillText('ملاحظات:', infoRight, cy);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '400 18px "Readex Pro", Tahoma, Arial, sans-serif';
    notesLines.forEach((line, idx) => {
      ctx.fillText(line, infoRight - 96, cy + idx * 30);
    });
  }

  y += customerBoxHeight + 28;

  // Items table header
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a99d83';
  ctx.font = '600 17px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('المنتج والحجم', rightEdge, y + 22);

  ctx.textAlign = 'center';
  ctx.fillText('الكمية', leftEdge + 190, y + 22);

  ctx.textAlign = 'left';
  ctx.fillText('الثمن', leftEdge, y + 22);

  y += itemsHeaderHeight;
  ctx.strokeStyle = '#4a3a14';
  ctx.beginPath();
  ctx.moveTo(leftEdge, y - 8);
  ctx.lineTo(rightEdge, y - 8);
  ctx.stroke();

  // Order items
  for (const item of order.items) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '600 19px "Readex Pro", Tahoma, Arial, sans-serif';
    ctx.fillText(item.productName, rightEdge, y + 24);

    ctx.fillStyle = '#a99d83';
    ctx.font = '400 15px "Readex Pro", Tahoma, Arial, sans-serif';
    ctx.fillText(`${item.unitLabel} · ${item.sizeLabel} (${item.unitPrice} درهم للوحدة)`, rightEdge, y + 48);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '600 19px "Readex Pro", Tahoma, Arial, sans-serif';
    ctx.fillText(`× ${item.quantity}`, leftEdge + 190, y + 32);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9c565';
    ctx.font = '700 20px "Readex Pro", Tahoma, Arial, sans-serif';
    ctx.fillText(`${item.lineTotal} درهم`, leftEdge, y + 32);

    y += 64;
    ctx.strokeStyle = '#2f2817';
    ctx.beginPath();
    ctx.moveTo(leftEdge, y - 4);
    ctx.lineTo(rightEdge, y - 4);
    ctx.stroke();
  }

  y += 24;

  // Totals box
  drawRoundedRect(ctx, leftEdge, y, rightEdge - leftEdge, totalBoxHeight, 14);
  ctx.fillStyle = '#18150e';
  ctx.fill();
  ctx.strokeStyle = '#6b5420';
  ctx.stroke();

  const ty = y + 36;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a99d83';
  ctx.font = '400 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('التوصيل:', rightEdge - 22, ty);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '600 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText(
    order.freeShipping ? 'مجاني داخل الدار البيضاء' : 'الدفع عند الاستلام',
    leftEdge + 22,
    ty,
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#a99d83';
  ctx.font = '400 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('طريقة الدفع:', rightEdge - 22, ty + 34);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '600 18px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('نقدًا عند الاستلام', leftEdge + 22, ty + 34);

  ctx.strokeStyle = '#2f2817';
  ctx.beginPath();
  ctx.moveTo(leftEdge + 22, ty + 54);
  ctx.lineTo(rightEdge - 22, ty + 54);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '700 24px "Reem Kufi", "Readex Pro", Tahoma, sans-serif';
  ctx.fillText('المجموع الإجمالي', rightEdge - 22, ty + 90);

  ctx.textAlign = 'left';
  ctx.fillStyle = goldGrad;
  ctx.font = '700 32px "Reem Kufi", "Readex Pro", Tahoma, sans-serif';
  ctx.fillText(`${order.total} درهم`, leftEdge + 22, ty + 92);

  y += totalBoxHeight + 36;

  // Footer
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a99d83';
  ctx.font = '400 16px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText('شكرًا لثقتكم في كرامو راشد · عسل طبيعي 100%', rightEdge, y);

  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillStyle = '#e9c565';
  ctx.font = '600 16px "Readex Pro", Tahoma, Arial, sans-serif';
  ctx.fillText(order.storePhoneDisplay || '+212 615 994 602', leftEdge, y);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to export receipt PNG'));
    }, 'image/png');
  });

  const dataUrl = canvas.toDataURL('image/png');
  const objectUrl = URL.createObjectURL(blob);
  const filename = `kramo-rachid-${order.id}.png`;

  return { blob, dataUrl, objectUrl, filename };
}

export async function copyReceiptImageToClipboard(blob: Blob): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof ClipboardItem !== 'undefined'
  ) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function downloadReceiptImage(objectUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function shareReceiptImageOrDownload(
  blob: Blob,
  objectUrl: string,
  filename: string,
  title: string,
  text: string,
): Promise<'shared' | 'downloaded'> {
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'image/png' });
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text,
          files: [file],
        });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
    }
  }
  downloadReceiptImage(objectUrl, filename);
  return 'downloaded';
}
