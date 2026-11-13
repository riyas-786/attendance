import { COMPANY_NAME } from '../config';
import { Place, Session } from './api.service';

// Builds the plain-text attendance messages staff share to a WhatsApp group.
// WhatsApp formatting: *bold*. Only the saved place NAME is shared (never GPS coordinates).

export interface DayLike {
  date: string;
  status?: string;
  sessions?: Session[];
}

const MAX_LENGTH = 3500; // keeps the wa.me link comfortably under WhatsApp's limit

export const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export const dateText = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

const place = (p?: Place) => (p?.siteName ? ` · ${p.siteName}` : '');

export function minutesOf(s: Session, nowMs: number) {
  const end = s.out ? new Date(s.out).getTime() : nowMs;
  return Math.max(0, Math.round((end - new Date(s.in).getTime()) / 60000));
}

export const statusText: Record<string, string> = {
  leave: 'On leave',
  absent: 'Absent',
  late: 'Late',
  present: 'Present',
};

/** One day: every check-in and check-out with its place, and the total. */
export function dayMessage(name: string, day: DayLike, nowMs = Date.now()): string {
  const lines = [`📋 *${COMPANY_NAME} – Attendance*`, `👤 ${name}`, `📅 ${dateText(day.date)}`];
  const sessions = day.sessions ?? [];
  if (!sessions.length) {
    lines.push(`Status: ${statusText[day.status || ''] || 'No check-in'}`);
    return lines.join('\n');
  }
  let total = 0;
  for (const s of sessions) {
    lines.push(`✅ In ${time(s.in)}${place(s.inLocation)}`);
    if (s.out) lines.push(`🏁 Out ${time(s.out)}${place(s.outLocation)}`);
    else lines.push('🟢 Still checked in');
    total += minutesOf(s, nowMs);
  }
  if (day.status === 'late') lines.push('⚠️ Late arrival');
  lines.push(`⏱ Total: ${hm(total)}`);
  return lines.join('\n');
}

/** A list of days (for example a month): one line per day. */
export function rangeMessage(name: string, days: DayLike[], from = '', to = '', nowMs = Date.now()): string {
  const head = [`📋 *${COMPANY_NAME} – Attendance*`, `👤 ${name}`];
  if (from || to) head.push(`📅 ${from ? dateText(from) : '…'} – ${to ? dateText(to) : '…'}`);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const lines: string[] = [];
  let worked = 0;
  let totalMin = 0;
  for (const d of sorted) {
    const sessions = d.sessions ?? [];
    if (sessions.length) {
      const mins = sessions.reduce((t, s) => t + minutesOf(s, nowMs), 0);
      worked += 1;
      totalMin += mins;
      const times = sessions.map((s) => `${time(s.in)}–${s.out ? time(s.out) : 'in'}`).join(', ');
      lines.push(`${dateText(d.date)}: ${times} (${hm(mins)})${d.status === 'late' ? ' ⚠️ late' : ''}`);
    } else {
      lines.push(`${dateText(d.date)}: ${statusText[d.status || ''] || '—'}`);
    }
  }
  let body = lines.join('\n');
  if ((head.join('\n') + '\n' + body).length > MAX_LENGTH) {
    // too long for one message: keep the most recent days
    while (lines.length > 1 && (head.join('\n') + '\n(earlier days left out)\n' + lines.join('\n')).length > MAX_LENGTH) lines.shift();
    body = '(earlier days left out)\n' + lines.join('\n');
  }
  return [...head, body, `⏱ Days worked: ${worked} · Total: ${hm(totalMin)}`].join('\n');
}

/** Opens WhatsApp (app on a phone, WhatsApp Web / desktop app on a computer) with the text filled in. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
