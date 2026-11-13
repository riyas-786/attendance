import { COMPANY_NAME } from '../config';
import { DayLike, dateText, hm, minutesOf, statusText, time } from './share';

// Draws the attendance as a picture (PNG) that staff can send to WhatsApp.
// Only place NAMES are drawn, never GPS coordinates.

const W = 720;
const SCALE = 2; // sharp on phone screens
const PAD = 28;
const HEADER = 88;
const MAX_ROWS = 40; // the most recent days if a list is longer

const C = {
  brand: '#ed193a', ink: '#1f2937', muted: '#6b7280', line: '#e5e7eb', soft: '#f8fafc', white: '#ffffff',
  green: '#15803d', amber: '#b45309', red: '#b91c1c', blue: '#1d4ed8',
};
const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

const statusColor = (s?: string) =>
  s === 'late' ? C.amber : s === 'absent' ? C.red : s === 'leave' ? C.blue : C.green;

// the logo is loaded once and reused; if it cannot load the card is drawn without it
let logoPromise: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'logo-mark.png';
    });
  }
  return logoPromise;
}
export const preloadShareAssets = () => { void logo(); };

type Ctx = CanvasRenderingContext2D;

function fit(ctx: Ctx, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(ctx: Ctx, text: string, rightX: number, y: number, color: string) {
  ctx.font = font(14, 700);
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = color + '1f';
  roundRect(ctx, rightX - w, y, w, 28, 14);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, rightX - w + 12, y + 14);
}

async function canvasFor(height: number): Promise<{ canvas: HTMLCanvasElement; ctx: Ctx; img: HTMLImageElement | null }> {
  const img = await logo();
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, height);
  // header band
  ctx.fillStyle = C.brand;
  ctx.fillRect(0, 0, W, HEADER);
  if (img) ctx.drawImage(img, PAD, 20, 48, 48);
  ctx.fillStyle = C.white;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(24, 700);
  ctx.fillText(COMPANY_NAME, PAD + (img ? 62 : 0), 46);
  ctx.font = font(15, 400);
  ctx.fillText('Attendance', PAD + (img ? 62 : 0), 68);
  return { canvas, ctx, img };
}

function footer(ctx: Ctx, height: number, nowMs: number) {
  const d = new Date(nowMs);
  const stamp = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}, ${time(d.toISOString())}`;
  ctx.fillStyle = C.muted;
  ctx.font = font(12);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`Staff Attendance · ${stamp}`, PAD, height - 16);
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png')
  );

/** One day: every check-in / check-out with place names and the total. */
export async function dayImage(name: string, day: DayLike, nowMs = Date.now()): Promise<Blob> {
  const sessions = day.sessions ?? [];
  const ROW = 44;
  const tableH = sessions.length ? 40 + sessions.length * ROW : 0;
  const height = HEADER + 24 + 78 + (sessions.length ? tableH + 16 + 70 : 70) + 46;
  const { canvas, ctx } = await canvasFor(height);

  let y = HEADER + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = font(26, 700);
  ctx.fillText(fit(ctx, name, W - PAD * 2 - 130), PAD, y + 28);
  ctx.fillStyle = C.muted;
  ctx.font = font(16);
  ctx.fillText(dateText(day.date), PAD, y + 56);
  pill(ctx, (statusText[day.status || ''] || 'No check-in').toUpperCase(), W - PAD, y + 6, statusColor(day.status));
  y += 78;

  if (!sessions.length) {
    ctx.fillStyle = C.soft;
    roundRect(ctx, PAD, y, W - PAD * 2, 56, 10);
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.font = font(16);
    ctx.textBaseline = 'middle';
    ctx.fillText('No check-ins on this day', PAD + 16, y + 28);
  } else {
    // columns
    const cols = { inT: PAD + 12, inP: PAD + 86, outT: PAD + 292, outP: PAD + 366, dur: W - PAD - 12 };
    ctx.fillStyle = C.soft;
    roundRect(ctx, PAD, y, W - PAD * 2, 32, 8);
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.font = font(12, 700);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('IN', cols.inT, y + 16);
    ctx.fillText('PLACE', cols.inP, y + 16);
    ctx.fillText('OUT', cols.outT, y + 16);
    ctx.fillText('PLACE', cols.outP, y + 16);
    ctx.textAlign = 'right';
    ctx.fillText('TIME', cols.dur, y + 16);
    y += 40;

    let total = 0;
    sessions.forEach((s, i) => {
      const mins = minutesOf(s, nowMs);
      total += mins;
      const mid = y + ROW / 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.ink;
      ctx.font = font(18, 700);
      ctx.fillText(time(s.in), cols.inT, mid);
      ctx.fillText(s.out ? time(s.out) : '—', cols.outT, mid);
      ctx.font = font(14);
      ctx.fillStyle = s.inLocation?.siteName ? C.green : C.muted;
      ctx.fillText(fit(ctx, s.inLocation?.siteName || '—', 190), cols.inP, mid);
      ctx.fillStyle = s.out && s.outLocation?.siteName ? C.green : C.muted;
      ctx.fillText(fit(ctx, s.out ? s.outLocation?.siteName || '—' : 'still in', 190), cols.outP, mid);
      ctx.textAlign = 'right';
      ctx.fillStyle = C.ink;
      ctx.font = font(15, 600);
      ctx.fillText(hm(mins), cols.dur, mid);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      if (i < sessions.length - 1) {
        ctx.beginPath();
        ctx.moveTo(PAD, y + ROW);
        ctx.lineTo(W - PAD, y + ROW);
        ctx.stroke();
      }
      y += ROW;
    });
    y += 16;
    ctx.fillStyle = '#fef2f4';
    roundRect(ctx, PAD, y, W - PAD * 2, 56, 12);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = font(16, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(sessions.some((x) => !x.out) ? 'Total so far (still checked in)' : 'Total time', PAD + 18, y + 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.brand;
    ctx.font = font(26, 700);
    ctx.fillText(hm(total), W - PAD - 18, y + 28);
  }
  footer(ctx, height, nowMs);
  return toBlob(canvas);
}

/** A list of days (for example a month): one row per day. */
export async function rangeImage(name: string, days: DayLike[], from = '', to = '', nowMs = Date.now()): Promise<Blob> {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = sorted.length > MAX_ROWS;
  const rows = trimmed ? sorted.slice(-MAX_ROWS) : sorted;
  const ROW = 36;
  const height = HEADER + 24 + 78 + 40 + Math.max(rows.length, 1) * ROW + (trimmed ? 26 : 0) + 16 + 70 + 46;
  const { canvas, ctx } = await canvasFor(height);

  let y = HEADER + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = font(26, 700);
  ctx.fillText(fit(ctx, name, W - PAD * 2), PAD, y + 28);
  ctx.fillStyle = C.muted;
  ctx.font = font(16);
  const span = from || to ? `${from ? dateText(from) : '…'} – ${to ? dateText(to) : '…'}` : 'Attendance list';
  ctx.fillText(span, PAD, y + 56);
  y += 78;

  const cols = { date: PAD + 12, times: PAD + 170, dur: PAD + 520, status: W - PAD - 12 };
  ctx.fillStyle = C.soft;
  roundRect(ctx, PAD, y, W - PAD * 2, 32, 8);
  ctx.fill();
  ctx.fillStyle = C.muted;
  ctx.font = font(12, 700);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('DATE', cols.date, y + 16);
  ctx.fillText('CHECK IN – OUT', cols.times, y + 16);
  ctx.textAlign = 'right';
  ctx.fillText('TIME', cols.dur + 40, y + 16);
  ctx.fillText('STATUS', cols.status, y + 16);
  y += 40;

  if (trimmed) {
    ctx.fillStyle = C.muted;
    ctx.font = font(12);
    ctx.textAlign = 'left';
    ctx.fillText(`Showing the latest ${MAX_ROWS} days`, PAD + 12, y + 8);
    y += 26;
  }

  let worked = 0;
  let totalMin = 0;
  rows.forEach((d, i) => {
    const sessions = d.sessions ?? [];
    const mins = sessions.reduce((t, s) => t + minutesOf(s, nowMs), 0);
    if (sessions.length) { worked += 1; totalMin += mins; }
    const mid = y + ROW / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink;
    ctx.font = font(14, 600);
    ctx.fillText(dateText(d.date).replace(/ \d{4}$/, ''), cols.date, mid);
    ctx.font = font(14);
    const times = sessions.length ? sessions.map((s) => `${time(s.in)}–${s.out ? time(s.out) : 'in'}`).join(', ') : '—';
    ctx.fillText(fit(ctx, times, 330), cols.times, mid);
    ctx.textAlign = 'right';
    ctx.font = font(14, 600);
    ctx.fillText(sessions.length ? hm(mins) : '—', cols.dur + 40, mid);
    ctx.fillStyle = statusColor(d.status);
    ctx.font = font(13, 700);
    ctx.fillText((statusText[d.status || ''] || '—').toUpperCase(), cols.status, mid);
    if (i < rows.length - 1) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(PAD, y + ROW);
      ctx.lineTo(W - PAD, y + ROW);
      ctx.stroke();
    }
    y += ROW;
  });
  if (!rows.length) y += ROW;
  y += 16;
  ctx.fillStyle = '#fef2f4';
  roundRect(ctx, PAD, y, W - PAD * 2, 56, 12);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = font(16, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${worked} day${worked === 1 ? '' : 's'} worked`, PAD + 18, y + 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.brand;
  ctx.font = font(24, 700);
  ctx.fillText(hm(totalMin), W - PAD - 18, y + 28);

  footer(ctx, height, nowMs);
  return toBlob(canvas);
}

export type ShareResult = 'shared' | 'cancelled' | 'saved';

/**
 * Phones: opens the share sheet with the picture (choose WhatsApp, then the group).
 * Computers: WhatsApp Web cannot be sent a picture from a link, so the picture is copied to the clipboard
 * (paste it into the chat with Ctrl+V) and also downloaded.
 */
export async function shareImage(blob: Blob, fileName: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${COMPANY_NAME} attendance` });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'; // the person closed the share sheet
      // any other failure: fall through to saving the picture
    }
  }
  try {
    const CI = (window as unknown as { ClipboardItem?: new (i: Record<string, Blob>) => unknown }).ClipboardItem;
    if (CI && navigator.clipboard?.write) await navigator.clipboard.write([new CI({ 'image/png': blob }) as ClipboardItem]);
  } catch {
    /* clipboard images are not allowed everywhere; the download below still works */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}
