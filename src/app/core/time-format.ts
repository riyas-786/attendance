import { Injectable, signal } from '@angular/core';

const KEY = 'timeFormat'; // '24' or '12', saved per device
const TZ_KEY = 'companyTz'; // the company time zone (IANA name, e.g. Asia/Kolkata), sent by the server

/** True when times should be shown as 24-hour (the default). Safe to call anywhere, including plain functions. */
export function use24h(): boolean {
  try { return localStorage.getItem(KEY) !== '12'; } catch { return true; }
}

/** The company time zone saved from the server ('' = use the device's own time zone). */
export function companyTz(): string {
  try { return localStorage.getItem(TZ_KEY) || ''; } catch { return ''; }
}

type Input = string | number | Date;

// Date parts in a time zone. An unknown or empty zone falls back to the device's own.
function parts(value: Input, tz: string, opts: Intl.DateTimeFormatOptions) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  let f: Intl.DateTimeFormat;
  try { f = new Intl.DateTimeFormat('en-GB', { ...opts, ...(tz ? { timeZone: tz } : {}) }); }
  catch { f = new Intl.DateTimeFormat('en-GB', opts); }
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** HH:mm (24h) or h:mm AM/PM (12h) in the company time zone. */
export function formatClock(value: Input, seconds = false, is24 = use24h(), tz = companyTz()): string {
  const p = parts(value, tz, { hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  if (!p) return '';
  const h = Number(p['hour']) % 24;
  const ss = seconds ? `:${p['second']}` : '';
  if (is24) return `${String(h).padStart(2, '0')}:${p['minute']}${ss}`;
  return `${h % 12 || 12}:${p['minute']}${ss} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Saturday, 21 November 2026" in the company time zone. */
export function formatDay(value: Input, tz = companyTz()): string {
  const p = parts(value, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return p ? `${p['weekday']}, ${p['day']} ${p['month']} ${p['year']}` : '';
}

/** The moment (ISO string) when the clock in the company time zone shows `hhmm` on `dateKey` (YYYY-MM-DD). */
export function zonedTimeToIso(dateKey: string, hhmm: string, tz = companyTz()): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [H, M] = hhmm.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, H, M);
  if (!tz) return new Date(y, m - 1, d, H, M).toISOString(); // no company zone known: the device's own
  // how far the zone is ahead of UTC at a given moment
  const offset = (t: number) => {
    const p = parts(t, tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    if (!p) return 0;
    return Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']) % 24, Number(p['minute']), Number(p['second'])) - Math.floor(t / 1000) * 1000;
  };
  let t = wanted - offset(wanted);
  t = wanted - offset(t); // second pass handles clock changes (daylight saving)
  return new Date(t).toISOString();
}

/** Today's date as YYYY-MM-DD in the company time zone (what the server calls "today"). */
export function todayKey(tz = companyTz()): string {
  const p = parts(new Date(), tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return p ? `${p['year']}-${p['month']}-${p['day']}` : '';
}

/** Today in the company time zone as a local Date at midnight (for date arithmetic). */
export function todayDate(tz = companyTz()): Date {
  const [y, m, d] = todayKey(tz).split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Injectable({ providedIn: 'root' })
export class TimeFormat {
  is24 = signal(use24h());
  tz = signal(companyTz());

  toggle() {
    const next = !this.is24();
    this.is24.set(next);
    try { localStorage.setItem(KEY, next ? '24' : '12'); } catch { /* storage blocked */ }
  }

  /** Called with the time zone the server reports (at sign-in, on start-up and after the admin changes it). */
  setTz(tz: string | undefined | null) {
    const v = tz || '';
    this.tz.set(v);
    try { localStorage.setItem(TZ_KEY, v); } catch { /* storage blocked */ }
  }
}
