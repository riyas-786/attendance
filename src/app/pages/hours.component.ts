import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, HoursReport, PayPeriodInfo } from '../core/api.service';
import { ClockPipe } from '../core/clock.pipe';
import { initials } from '../core/initials';
import { TimeFormat, todayDate } from '../core/time-format';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// How many hours each staff member worked in a period: days present, total, average per day, longest day,
// hours expected from their shift, and the days they forgot to check out.
@Component({
  selector: 'app-hours',
  standalone: true,
  imports: [FormsModule, ClockPipe],
  styles: [`
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 12px; }
    .chip { border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); border-radius: 99px; padding: 5px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .chip.on { background: var(--ink); color: var(--card); border-color: var(--ink); }
    .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .bar label { display: grid; gap: 4px; font-size: 13px; color: var(--label); font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th.num { text-align: right; }
    .scroll { overflow-x: auto; }
    .neg { color: var(--bad); font-weight: 700; } .pos { color: var(--ok); font-weight: 700; }
    .detail td { background: var(--surface-2); }
    .link { background: none; border: 0; padding: 0; font: inherit; font-weight: 700; color: var(--ink); cursor: pointer; text-align: left; }
    .link:hover { text-decoration: underline; }
    .warn { color: var(--warn); font-weight: 600; }
    .tbar { height: 6px; border-radius: 99px; background: var(--chip); overflow: hidden; margin-top: 4px; min-width: 90px; }
    .tbar i { display: block; height: 100%; background: var(--ok); border-radius: 99px; }
  `],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <div class="pay-title">
          <h2>Working hours</h2>
          @if (d(); as r) {
            <div class="pay-meta">
              <span class="period-pill">{{ pretty(r.from) }} – {{ pretty(r.to) }}</span>
              <span class="muted">{{ r.workingDays }} working days</span>
            </div>
          }
        </div>
        <div class="pay-downloads no-print">
          <button class="btn primary" type="button" (click)="download()" [disabled]="!d() || busy()">{{ busy() ? 'Preparing…' : 'Download Excel' }}</button>
          <button class="btn" type="button" (click)="print()" [disabled]="!d()">Print</button>
        </div>
      </header>

      <div class="card pay-filters no-print">
        <div class="chips" style="margin-top:0">
          <button type="button" class="chip" [class.on]="preset === 'today'" (click)="range('today')">Today</button>
          <button type="button" class="chip" [class.on]="preset === 'week'" (click)="range('week')">Last 7 days</button>
          <button type="button" class="chip" [class.on]="preset === 'month'" (click)="range('month')">{{ pp()?.custom ? 'This pay period' : 'This month' }}</button>
          <button type="button" class="chip" [class.on]="preset === 'last'" (click)="range('last')">{{ pp()?.custom ? 'Last pay period' : 'Last month' }}</button>
        </div>
        <div class="bar">
          <label>From <input type="date" [(ngModel)]="from" name="from" (change)="preset = ''" /></label>
          <label>To <input type="date" [(ngModel)]="to" name="to" (change)="preset = ''" /></label>
          <label>Sort by
            <select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)" name="sort">
              <option value="name">Name</option>
              <option value="most">Most hours first</option>
              <option value="least">Fewest hours first</option>
            </select>
          </label>
          <button class="btn primary" type="button" (click)="load()">Show</button>
        </div>
        @if (error()) { <div class="error">{{ error() }}</div> }
      </div>

      @if (d(); as r) {
        <div class="pay-stats">
          <div class="pstat"><span>Staff</span><b>{{ r.totals.staff }}</b></div>
          <div class="pstat net"><span>Total hours worked</span><b>{{ hm(r.totals.totalMinutes) }}</b></div>
          <div class="pstat"><span>Average per person</span><b>{{ hm(r.totals.avgMinutesPerStaff) }}</b></div>
          <div class="pstat"><span>Working days in range</span><b>{{ r.workingDays }}</b></div>
          @if (r.totals.openDays > 0) { <div class="pstat"><span>Days without check-out</span><b style="color: var(--warn)">{{ r.totals.openDays }}</b></div> }
        </div>

        <div class="table-wrap card">
          <table class="plain" style="min-width:860px">
            <thead>
              <tr>
                <th>Name</th><th class="num">Days present</th><th class="num">Total hours</th><th class="num">Average / day</th>
                <th class="num">Longest day</th><th class="num">Expected</th><th class="num">Over / under</th><th class="num">Late</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (p of rows(); track p.userId) {
                <tr>
                  <td>
                    <div class="emp">
                      <span class="avatar" aria-hidden="true">{{ ini(p.name) }}</span>
                      <div class="emp-text">
                        <button class="link" type="button" (click)="toggle(p.userId)">{{ openId() === p.userId ? '▾' : '▸' }} {{ p.name }}</button>
                        <span class="muted">{{ p.department || 'No department' }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="num">{{ p.daysPresent }}</td>
                  <td class="num">
                    <b>{{ hm(p.totalMinutes) }}</b>
                    <div class="tbar"><i [style.width.%]="share(p.totalMinutes)"></i></div>
                  </td>
                  <td class="num">{{ p.avgMinutes ? hm(p.avgMinutes) : '—' }}</td>
                  <td class="num">{{ p.longestMinutes ? hm(p.longestMinutes) : '—' }}</td>
                  <td class="num">{{ p.expectedMinutes === null ? '—' : hm(p.expectedMinutes) }}</td>
                  <td class="num" [class.neg]="(p.diffMinutes ?? 0) < 0" [class.pos]="(p.diffMinutes ?? 0) > 0">
                    {{ p.diffMinutes === null ? '—' : (p.diffMinutes > 0 ? '+' : p.diffMinutes < 0 ? '−' : '') + hm(abs(p.diffMinutes)) }}
                  </td>
                  <td class="num">{{ p.lateDays || '—' }}</td>
                  <td>@if (p.openDays) { <span class="warn" title="Hours for these days are missing until a check-out is set (Overview)">⚠ {{ p.openDays }} without check-out</span> }</td>
                </tr>
                @if (openId() === p.userId) {
                  <tr class="detail">
                    <td colspan="9">
                      <table>
                        <thead><tr><th>Date</th><th>Check in – out</th><th class="num">Hours</th><th>Status</th></tr></thead>
                        <tbody>
                          @for (x of p.days; track x.date) {
                            <tr>
                              <td>{{ dayName(x.date) }}</td>
                              <td>
                                {{ x.in | clock: tf.is24() : tf.tz() }} – {{ x.out ? (x.out | clock: tf.is24() : tf.tz()) : 'still in' }}
                                @if (x.sessions > 1) { <span class="muted"> ({{ x.sessions }} check-ins)</span> }
                                @if (x.auto) { <span class="badge late" title="Closed automatically (forgotten check-out)">auto</span> }
                              </td>
                              <td class="num">{{ x.open ? '—' : hm(x.minutes) }}</td>
                              <td><span class="badge" [class]="x.status">{{ x.status }}</span>@if (x.open) { <span class="warn"> no check-out</span> }</td>
                            </tr>
                          } @empty {
                            <tr><td colspan="4" class="muted">No attendance in this range</td></tr>
                          }
                        </tbody>
                      </table>
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="9" class="muted">No staff</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted" style="margin:0">Hours are the time between check-in and check-out, added up for every check-in of the day. Click a name for the day-by-day hours. Expected hours = working days so far × the length of the person's shift (shown only for staff with a shift that has an end time). Days they forgot to check out show no hours until the check-out is set on the Overview, or until the automatic check-out closes them.</p>
      }
    </section>
  `,
})
export class HoursComponent implements OnInit {
  tf = inject(TimeFormat);
  private api = inject(ApiService);

  from = '';
  to = '';
  preset: '' | 'today' | 'week' | 'month' | 'last' = 'month';
  sortBy = signal<'name' | 'most' | 'least'>('name'); // a signal so the table re-sorts as soon as it changes
  d = signal<HoursReport | null>(null);
  error = signal('');
  busy = signal(false);
  openId = signal('');

  rows = computed(() => {
    const list = [...(this.d()?.rows ?? [])];
    const s = this.sortBy();
    if (s === 'most') list.sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name));
    else if (s === 'least') list.sort((a, b) => a.totalMinutes - b.totalMinutes || a.name.localeCompare(b.name));
    return list;
  });
  private maxMinutes = computed(() => Math.max(1, ...(this.d()?.rows ?? []).map((r) => r.totalMinutes)));

  pretty = (iso: string) => dmy(iso);
  dayName = (iso: string) => dmy(iso);
  abs = (n: number) => Math.abs(n);
  share(minutes: number) { return Math.round((minutes / this.maxMinutes()) * 100); }
  // 510 -> "8h 30m"
  hm(minutes: number) {
    const m = Math.max(0, Math.round(minutes));
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }

  pp = signal<PayPeriodInfo | null>(null);
  ini = initials;
  constructor() { this.range('month', false); }
  ngOnInit() {
    // start on the pay period set in Settings; if it cannot be loaded, the calendar month is used
    this.api.payPeriod().subscribe({
      next: (p) => { this.pp.set(p); this.range('month'); },
      error: () => this.load(),
    });
  }

  range(kind: 'today' | 'week' | 'month' | 'last', reload = true) {
    const n = todayDate();
    if (kind === 'today') { this.from = this.to = ymd(n); }
    else if (kind === 'week') { this.from = ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6)); this.to = ymd(n); }
    else if (kind === 'month' && this.pp()) { this.from = this.pp()!.current.from; this.to = ymd(n); }
    else if (kind === 'last' && this.pp()) { this.from = this.pp()!.previous.from; this.to = this.pp()!.previous.to; }
    else if (kind === 'month') { this.from = ymd(new Date(n.getFullYear(), n.getMonth(), 1)); this.to = ymd(n); }
    else { this.from = ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)); this.to = ymd(new Date(n.getFullYear(), n.getMonth(), 0)); }
    this.preset = kind;
    if (reload) this.load();
  }

  load() {
    if (!this.from || !this.to) { this.error.set('Choose the From and To dates'); return; }
    if (this.from > this.to) { this.error.set('The From date must be on or before the To date'); return; }
    this.error.set('');
    this.api.hours(this.from, this.to).subscribe({
      next: (r) => { this.d.set(r); this.openId.set(''); },
      error: (e) => this.error.set(e.error?.message || 'Could not load the hours'),
    });
  }

  toggle(id: string) { this.openId.set(this.openId() === id ? '' : id); }
  print() { window.print(); }

  download() {
    this.busy.set(true);
    this.api.downloadHours(this.from, this.to).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `working_hours_${this.from}_to_${this.to}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.busy.set(false);
      },
      error: () => { this.error.set('Could not download the file'); this.busy.set(false); },
    });
  }
}
