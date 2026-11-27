import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TimeFormat, formatClock, todayKey, zonedTimeToIso } from '../core/time-format';
import { ClockPipe } from '../core/clock.pipe';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { initials } from '../core/initials';
import { ApiService, AttendanceRecord, Place, StaffMember, Summary } from '../core/api.service';

const today = () => todayKey();

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [ClockPipe, FormsModule],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <div class="pay-title">
          <h2>Attendance overview</h2>
          <div class="pay-meta">
            <span class="period-pill">{{ dayLabel() }}</span>
            @if (date === todayKey) { <span class="badge present" style="text-transform:none">Today</span> }
          </div>
        </div>
        <div class="day-nav">
          <button class="btn small" type="button" (click)="moveDay(-1)" aria-label="Previous day">‹</button>
          <input type="date" [(ngModel)]="date" (change)="load()" aria-label="Date" />
          <button class="btn small" type="button" (click)="moveDay(1)" aria-label="Next day">›</button>
          @if (date !== todayKey) { <button class="btn small" type="button" (click)="goToday()">Today</button> }
        </div>
      </header>

      @if (summary(); as s) {
        <div class="pay-stats">
          <div class="pstat"><span>Staff</span><b>{{ s.totalStaff }}</b></div>
          <div class="pstat"><span>Present</span><b class="pos">{{ s.present }}</b></div>
          <div class="pstat"><span>Late</span><b style="color: var(--warn)">{{ s.late }}</b></div>
          <div class="pstat"><span>On leave</span><b style="color: var(--info)">{{ s.leave }}</b></div>
          <div class="pstat net"><span>Not in</span><b>{{ s.notIn }}</b></div>
        </div>
      }

      <div class="table-wrap card">
      <table class="plain" style="min-width:820px">
        <thead><tr><th>Employee</th><th>Check in / out</th><th>Total hours</th><th>Status</th><th>Where / actions</th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr>
              <td>
                <div class="emp">
                  <span class="avatar" aria-hidden="true">{{ ini(r.user?.name || '') }}</span>
                  <div class="emp-text"><b>{{ r.user?.name }}</b><span class="muted">{{ r.user?.department || 'No department' }}</span></div>
                </div>
              </td>
              <td>
                @for (s of r.sessions ?? []; track $index) {
                  <div>{{ s.in | clock: tf.is24() : tf.tz() }} – {{ s.out ? (s.out | clock: tf.is24() : tf.tz()) : 'still in' }}@if (s.outMethod === 'auto' && !r.auto) { <span class="badge late" title="The person forgot to check out, so the system closed it at the end of their shift. Use Set check-out below if the time is wrong.">auto</span> }@if (r.auto) { <span class="badge late" title="Recorded automatically for this person (no smartphone). Mark leave or absence below if they did not come.">auto</span> }@if (s.outMethod === 'admin') { <span class="muted" title="Time typed in by an admin"> (set by admin)</span> }</div>
                } @empty { — }
              </td>
              <td>{{ r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : '—' }}</td>
              <td><span class="badge" [class]="r.status">{{ r.status }}{{ r.halfDay ? ' · ½ day' : '' }}</span></td>
              <td>
                @if (r.sessions?.length) {
                  <button class="btn small" (click)="toggle(r._id)">{{ isOpen(r._id) ? 'Hide' : 'Locations' }}</button>
                  @if (needsAttention(r)) { <span class="warn-dot" title="Some check-ins are outside known places or have no location">!</span> }
                }
                @if (canFixOut(r) && auth.can('attendance_edit')) {
                  <div style="margin-top:6px">
                    <span class="muted">{{ hasOpen(r) ? 'Forgot to check out?' : 'Auto check-out wrong?' }}</span>
                    <input class="pct" style="width:112px" type="time" [ngModel]="outTime(r)" (ngModelChange)="outTimes[r._id] = $event" title="The time they left (company time)" />
                    <button class="btn small primary" (click)="setCheckout(r)" title="Close the open check-in at this time">Set check-out</button>
                  </div>
                }
                @if ((r.status === 'leave' || r.status === 'absent') && auth.can('attendance_edit')) {
                  <button class="btn small" (click)="clearMark(r.user?._id, r.user?.name)" title="Remove this leave / absence mark">Clear mark</button>
                }
                @if (isOffDay() && r.sessions?.length && r.status !== 'leave' && r.status !== 'absent') {
                  <div style="margin-top:6px">
                    <span class="badge">Weekend / holiday</span>
                    @if (r.otStatus === 'accepted') {
                      <span class="badge present">OT accepted{{ r.otPercent && r.otPercent < 100 ? ' · ' + r.otPercent + '%' : '' }}</span>
                      @if (auth.can('attendance_edit')) { <button class="btn small" (click)="setOt(r, 'pending')">Undo</button> }
                    } @else if (r.otStatus === 'rejected') {
                      <span class="badge absent">OT rejected</span>
                      @if (auth.can('attendance_edit')) { <button class="btn small" (click)="setOt(r, 'pending')">Undo</button> }
                    } @else if (!auth.can('attendance_edit')) {
                      <span class="badge late">Waiting for a decision</span>
                    } @else {
                      <span class="badge late">Waiting for you</span>
                      <span class="muted">Pay</span>
                      <input class="pct" type="number" min="1" max="100" step="1" [ngModel]="pctOf(r.user?._id)" (ngModelChange)="setPct(r.user?._id, $event)" title="Percentage of a day's pay (100 = full day)" />
                      <span class="muted">%</span>
                      <button class="btn small primary" (click)="setOt(r, 'accepted', pctOf(r.user?._id))" title="Pay this attendance as overtime at this percentage">Accept as OT</button>
                      <button class="btn small" (click)="setOt(r, 'rejected')" title="Do not pay this attendance">Reject</button>
                    }
                  </div>
                }
              </td>
            </tr>
            @if (isOpen(r._id)) {
              <tr class="detail">
                <td colspan="5">
                  <table class="inner">
                    <thead><tr><th>#</th><th>Check in</th><th>Where</th><th>Check out</th><th>Where</th></tr></thead>
                    <tbody>
                      @for (s of r.sessions ?? []; track $index) {
                        <tr>
                          <td>{{ $index + 1 }}</td>
                          <td>{{ s.in | clock: tf.is24() : tf.tz() }}</td>
                          <td>
                            @if (place(s.inLocation, s.inMethod); as p) {
                              <span [class]="p.cls">{{ p.text }}</span>
                              @if (p.url) { <a [href]="p.url" target="_blank" rel="noopener">Map</a> }
                              @if (p.note) { <div class="muted">{{ p.note }}</div> }
                            }
                          </td>
                          <td>{{ s.out ? (s.out | clock: tf.is24() : tf.tz()) : 'still in' }}</td>
                          <td>
                            @if (s.out) {
                              @if (place(s.outLocation, s.inMethod); as p) {
                                <span [class]="p.cls">{{ p.text }}</span>
                                @if (p.url) { <a [href]="p.url" target="_blank" rel="noopener">Map</a> }
                                @if (p.note) { <div class="muted">{{ p.note }}</div> }
                              }
                            } @else { — }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </td>
              </tr>
            }
          }
          @for (u of notIn(); track u._id) {
            <tr class="not-in">
              <td>
                <div class="emp">
                  <span class="avatar" aria-hidden="true">{{ ini(u.name) }}</span>
                  <div class="emp-text"><b>{{ u.name }}</b><span class="muted">{{ u.department || 'No department' }}</span></div>
                </div>
              </td>
              <td>—</td>
              <td>—</td>
              <td><span class="badge">{{ date === todayKey ? 'Not in yet' : 'No record' }}</span></td>
              <td></td>
            </tr>
          }
          @if (!rows().length && !notIn().length) {
            <tr><td colspan="5" class="muted">No records for this date</td></tr>
          }
        </tbody>
      </table>
      </div>

    @if (auth.can('attendance_edit')) {
    <section class="card pay-filters">
      <h3 style="margin-bottom:4px">Mark leave / absence</h3>
      <p class="pay-sub" style="margin-bottom:12px">For the date chosen above. Staff on auto attendance who did not come are marked here.</p>
      <div class="filters manual">
        <select [(ngModel)]="manualUser">
          <option value="">Select staff…</option>
          @for (u of staff(); track u._id) { <option [value]="u._id">{{ u.name }}</option> }
        </select>
        <select [(ngModel)]="manualStatus">
          <option value="leave">Paid leave</option>
          <option value="unpaid">Unpaid leave (deducted from salary)</option>
          <option value="absent">Absent (deducted from salary)</option>
        </select>
        @if (halfOn()) {
          <select [(ngModel)]="manualHalf" title="Full day, or half the day (the other half is counted as worked)">
            <option [ngValue]="false">Full day</option>
            <option [ngValue]="true">Half day (½)</option>
          </select>
        }
        <input type="text" placeholder="Note (optional)" [(ngModel)]="manualNote" />
        <button class="btn primary" [disabled]="!manualUser || !date" (click)="saveManual()">Save for {{ date }}</button>
        <button class="btn" [disabled]="!manualUser || !date" (click)="clearMark(manualUser, nameOf(manualUser))" title="Remove the leave / absence mark of the selected person on this date">Clear mark</button>
      </div>
      @if (msg()) { <div class="muted">{{ msg() }}</div> }
    </section>
    }
    </section>
  `,
})
export class AdminComponent implements OnInit {
  tf = inject(TimeFormat);
  auth = inject(AuthService); // an accountant with view-only permission cannot edit
  private api = inject(ApiService);
  ini = initials;
  date = today();
  todayKey = today();
  rows = signal<AttendanceRecord[]>([]);
  summary = signal<Summary | null>(null);
  staff = signal<StaffMember[]>([]);
  // active staff with no record on the chosen day, so the "Not in" number can be matched to names (not for future days)
  notIn = computed(() => {
    if (!this.date || this.date > this.todayKey) return [];
    const have = new Set(this.rows().map((r) => r.user?._id));
    return this.staff().filter((u) => !have.has(u._id));
  });
  msg = signal('');
  // rows whose locations are expanded (several can be open at once)
  openIds = signal<string[]>([]);

  isOpen(id: string) { return this.openIds().includes(id); }
  toggle(id: string) {
    this.openIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // How to show one check-in / check-out place: a readable label, a colour class and a map link
  place(loc: Place | undefined, method?: string): { text: string; cls: string; url: string; note: string } {
    if (method === 'admin') return { text: 'Added by admin', cls: 'muted', url: '', note: '' };
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return { text: 'Location not shared', cls: 'place-none', url: '', note: '' };
    }
    const url = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    const note = loc.accuracy ? `GPS accuracy ±${Math.round(loc.accuracy)} m` : '';
    if (loc.siteName) {
      return { text: loc.distanceM !== undefined ? `${loc.siteName} · ${loc.distanceM} m` : loc.siteName, cls: 'place-ok', url, note };
    }
    return { text: `Unknown place (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`, cls: 'place-unknown', url, note };
  }

  // true when any check-in/out of the day is outside every known place or has no location
  needsAttention(r: AttendanceRecord) {
    return (r.sessions ?? []).some((s) => {
      if (s.inMethod === 'admin') return false;
      const bad = (l?: Place) => !l || !l.siteName;
      return bad(s.inLocation) || (!!s.out && bad(s.outLocation));
    });
  }

  manualUser = '';
  manualStatus: 'leave' | 'unpaid' | 'absent' = 'leave';
  manualNote = '';
  manualHalf = false;
  settingsCfg = signal<{ weekendDays: number[]; holidays: string[] } | null>(null);
  halfOn = signal(true); // from Settings → "Allow half-day"

  ngOnInit() {
    this.api.settings().subscribe({ next: (s) => { this.halfOn.set(s.halfDayEnabled !== false); this.settingsCfg.set({ weekendDays: s.weekendDays || [], holidays: s.holidays || [] }); }, error: () => {} });
    this.api.staff().subscribe((s) => this.staff.set(s.filter((u) => u.active && u.role === 'staff')));
    this.load();
  }

  // "Fri, 27 Nov 2026"
  dayLabel() {
    return this.date ? new Date(`${this.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  }
  moveDay(n: number) {
    if (!this.date) return;
    const d = new Date(`${this.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    this.date = d.toISOString().slice(0, 10);
    this.load();
  }
  goToday() { this.date = this.todayKey; this.load(); }

  load() {
    if (!this.date) return;
    this.api.allAttendance({ date: this.date }).subscribe((r) => this.rows.set(r));
    this.api.summary(this.date).subscribe((s) => this.summary.set(s));
  }

  // ----- forgot to check out: the admin sets the time they left -----
  outTimes: Record<string, string> = {};
  hasOpen(r: AttendanceRecord) {
    const last = r.sessions?.[r.sessions.length - 1];
    return !!last && !last.out;
  }
  // a check-in that is still open, or one the system closed automatically (the admin can correct the time)
  canFixOut(r: AttendanceRecord) {
    const last = r.sessions?.[r.sessions.length - 1];
    return !!last && (!last.out || last.outMethod === 'auto');
  }
  // the box starts at the auto check-out time (or 18:00 when it is still open)
  outTime(r: AttendanceRecord) {
    const last = r.sessions?.[r.sessions.length - 1];
    if (this.outTimes[r._id]) return this.outTimes[r._id];
    if (last?.out) return formatClock(last.out, false, true, this.tf.tz());
    return '18:00'; // a sensible end of day; the admin types the real time
  }

  setCheckout(r: AttendanceRecord) {
    const id = r.user?._id;
    const list = r.sessions ?? [];
    const last = list[list.length - 1];
    const time = this.outTime(r);
    if (!id || !last || (last.out && last.outMethod !== 'auto') || !/^\d{2}:\d{2}$/.test(time)) return;
    const out = zonedTimeToIso(r.date, time, this.tf.tz());
    if (new Date(out) < new Date(last.in)) { this.msg.set('The check-out time must be after the check-in time. For a night shift that ends the next day, ask for it to be added.'); return; }
    const sessions = list.map((s, i) => ({ in: s.in, out: i === list.length - 1 ? out : s.out }));
    this.api.manual({ userId: id, date: r.date, sessions }).subscribe({
      next: () => { this.msg.set('Check-out saved'); delete this.outTimes[r._id]; this.load(); },
      error: (e) => this.msg.set(e.error?.message || 'Could not save the check-out'),
    });
  }

  // is the chosen day a weekend or a holiday (from Settings)?
  isOffDay() {
    const c = this.settingsCfg();
    if (!c || !this.date) return false;
    return c.weekendDays.includes(new Date(`${this.date}T00:00:00Z`).getUTCDay()) || c.holidays.includes(this.date);
  }

  // accept a weekend / holiday attendance as overtime (a full or half day), reject it, or put it back to "waiting"
  otPct: Record<string, number> = {}; // % typed per person (default 100)
  pctOf(id?: string) { return (id && this.otPct[id]) || 100; }
  setPct(id: string | undefined, v: number) { if (id) this.otPct[id] = v; }

  setOt(r: AttendanceRecord, decision: 'accepted' | 'rejected' | 'pending', percent = 100) {
    const id = r.user?._id;
    if (!id) return;
    this.api.setOt(id, this.date, decision, percent).subscribe({
      next: () => { this.msg.set('Saved'); this.load(); },
      error: (e) => this.msg.set(e.error?.message || 'Could not save the decision'),
    });
  }

  nameOf(id: string) { return this.staff().find((u) => u._id === id)?.name; }

  // Removes a leave / absence mark (full or half day) from the chosen day
  clearMark(userId?: string, name?: string) {
    if (!userId || !this.date) return;
    if (!confirm(`Clear the leave / absence mark for ${name || 'this person'} on ${this.date}?`)) return;
    this.api.clearMark(userId, this.date).subscribe({
      next: () => { this.msg.set('Mark cleared'); this.load(); },
      error: (e) => this.msg.set(e.error?.message || 'Could not clear the mark'),
    });
  }

  saveManual() {
    if (!this.date) { this.msg.set('Choose a date first'); return; }
    this.api
      .manual({
        userId: this.manualUser,
        date: this.date,
        status: this.manualStatus === 'unpaid' ? 'leave' : this.manualStatus,
        ...(this.manualStatus === 'unpaid' ? { leaveType: 'unpaid' } : this.manualStatus === 'leave' ? { leaveType: 'annual' } : {}),
        halfDay: this.halfOn() && this.manualHalf, // switched off in Settings: always a full day
        note: this.manualNote,
      })
      .subscribe({
        next: () => { this.msg.set('Saved'); this.manualNote = ''; this.manualHalf = false; this.load(); },
        error: (e) => this.msg.set(e.error?.message || 'Could not save'),
      });
  }
}
