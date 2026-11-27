import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { todayKey } from '../core/time-format';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { ApiService, HolidayEntry, Payroll, PayrollQuery, PayrollRow, Shift, StaffMember } from '../core/api.service';
import { salaryMessage } from '../core/salary-message';
import { whatsappToUrl } from '../core/share';

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <div class="pay-title">
          <h2>Payroll</h2>
          @if (data(); as d) {
            <div class="pay-meta">
              <span class="period-pill">{{ fmt(d.from) }} – {{ fmt(d.to) }}</span>
              <span class="badge" [class]="d.inProgress ? 'late' : 'present'">{{ d.inProgress ? 'In progress' : 'Period ended' }}</span>
              <span class="muted">{{ d.rows.length }} employee{{ d.rows.length === 1 ? '' : 's' }}{{ hasFilters() ? ' (filtered)' : '' }}</span>
            </div>
          }
        </div>
        <div class="pay-downloads">
          <button class="btn primary" [disabled]="busy() || !data()" (click)="download('xlsx')">Salary sheet (Excel)</button>
          <button class="btn" [disabled]="busy() || !data()" (click)="slips()">Salary slips</button>
          <button class="btn" [disabled]="busy() || !data()" (click)="download('csv')">CSV</button>
        </div>
      </header>

      @if (data(); as d) {
        <div class="pay-stats">
          <div class="pstat"><span>Employees</span><b>{{ d.rows.length }}</b></div>
          <div class="pstat"><span>Basic pay</span><b>{{ d.totals.baseSalary | number: '1.2-2' }}</b></div>
          <div class="pstat"><span>Extra earnings</span><b class="pos">{{ d.totals.additions | number: '1.2-2' }}</b></div>
          <div class="pstat"><span>Deductions</span><b class="neg">{{ d.totals.deduction + d.totals.otherDeductions | number: '1.2-2' }}</b></div>
          <div class="pstat net"><span>Net payable ({{ d.currency }})</span><b>{{ d.totals.netSalary | number: '1.2-2' }}</b></div>
        </div>
      }

      <div class="card pay-filters">
        <div class="filters">
          <label>Period
            <select [(ngModel)]="mode" (change)="load()">
              <option value="month">Pay month</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          @if (mode === 'month') {
            <label>Month <input type="month" [(ngModel)]="month" (change)="load()" /></label>
          } @else {
            <label>From <input type="date" [(ngModel)]="from" (change)="load()" /></label>
            <label>To <input type="date" [(ngModel)]="to" (change)="load()" /></label>
          }
          <span class="filter-sep" aria-hidden="true"></span>
          <label>Employee
            <select [(ngModel)]="userId" (change)="load()">
              <option value="">All employees</option>
              @for (u of staff(); track u._id) { <option [value]="u._id">{{ u.name }}{{ u.employeeId ? ' (' + u.employeeId + ')' : '' }}</option> }
            </select>
          </label>
          <label>Department
            <select [(ngModel)]="department" (change)="load()">
              <option value="">All departments</option>
              @for (d of departments(); track d) { <option [value]="d">{{ d }}</option> }
            </select>
          </label>
          <label>Shift
            <select [(ngModel)]="shift" (change)="load()">
              <option value="">All shifts</option>
              @for (s of shifts(); track s._id) { <option [value]="s._id">{{ s.name }} ({{ s.workStart }})</option> }
            </select>
          </label>
          <label>Paid by
            <select [(ngModel)]="payType" (change)="load()">
              <option value="">All</option>
              <option value="monthly">Monthly salary</option>
              <option value="daily">Per day</option>
              <option value="hourly">Per hour</option>
            </select>
          </label>
          @if (hasFilters()) { <button class="btn" (click)="clearFilters()">Clear filters</button> }
        </div>
      </div>

      @if (data(); as d) {
        @if (ot(); as o) {
          @if (o.items.length) {
            <div class="card ot-card">
              <h3>Weekend / holiday attendance</h3>
              <p class="muted" style="margin-top:0">
                Staff who came in on a weekend or holiday. It is paid only when you accept it as overtime
                ({{ o.items[0].multiplier === 1 ? 'the same as a normal day' : o.items[0].multiplier + ' x a normal day' }}, set in Settings).
                @if (otPending() > 0) { <b style="color: var(--warn)"> {{ otPending() }} waiting for your decision, not paid yet.</b> }
              </p>
              <div style="overflow-x:auto">
                <table>
                  <thead><tr><th>Staff</th><th>Date</th><th>Hours</th><th>Decision</th><th></th></tr></thead>
                  <tbody>
                    @for (e of o.items; track e.userId + e.date) {
                      <tr>
                        <td><b>{{ e.name }}</b></td>
                        <td>{{ fmt(e.date) }}</td>
                        <td>{{ e.hours | number: '1.0-2' }}</td>
                        <td>
                          @if (e.status === 'accepted') { <span class="badge present">OT accepted{{ e.percent < 100 ? ' · ' + e.percent + '%' : '' }} · {{ e.amount | number: '1.2-2' }} {{ o.currency }}</span> }
                          @else if (e.status === 'rejected') { <span class="badge absent">Rejected</span> }
                          @else { <span class="badge late">Waiting</span> <span class="muted">100% pays {{ e.amount | number: '1.2-2' }} {{ o.currency }}</span> }
                        </td>
                        <td>
                          @if (!auth.can('attendance_edit')) {
                            <!-- view only: the decision is made by someone with attendance editing -->
                          } @else if (e.status === 'pending') {
                            <span class="muted">Pay</span>
                            <input class="pct" type="number" min="1" max="100" step="1" [ngModel]="pctOf(e)" (ngModelChange)="otPct[e.userId + e.date] = $event" title="Percentage of a day's pay (100 = full day)" />
                            <span class="muted">%</span>
                            <button class="btn small primary" (click)="decide(e, 'accepted', pctOf(e))">Accept as OT</button>
                            <button class="btn small" (click)="decide(e, 'rejected')">Reject</button>
                          } @else {
                            <button class="btn small" (click)="decide(e, 'pending')">Undo</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }
        @if (d.inProgress) {
          <div class="notice">This period is still running. Absences are counted up to yesterday, so the figures can still change.</div>
        }
        <details class="how">
          <summary>How pay is calculated</summary>
          <p class="muted">
            Monthly staff paid "by days present": salary ÷ {{ d.totalWorkingDays }} working days × days present (paid leave counts as present).
          </p>
          <p class="muted">
            Monthly staff: {{ d.totalWorkingDays }} working days in the period (weekends and holidays excluded) ·
            each absent day deducts {{ d.deductionFactor }} day of pay · unpaid leave deducts 1 day · paid leave is not deducted ·
            @if (d.lateThreshold) {
              every {{ d.lateThreshold }} late arrivals deduct {{ d.lateDays }} day
            } @else {
              late arrivals are not deducted
            }
          </p>
          <p class="muted">Daily staff are paid for each day with a check-in (plus paid leave), hourly staff for the hours between check-in and check-out; absences just earn nothing. Net salary = basic pay − attendance deduction + extra earnings − other deductions (never below 0). Extra items count in the period that contains their date.</p>
        </details>

        <div class="table-wrap card">
        <table class="pay">
          <thead>
            <tr>
              <th>Employee</th><th>Basic pay ({{ d.currency }})</th><th>Attendance</th>
              <th>Attendance deduction</th><th>Extra earnings</th><th>Other deductions</th><th>Net salary</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of d.rows; track r.userId) {
              <tr>
                <td>
                  <div class="emp">
                    <span class="avatar" aria-hidden="true">{{ initials(r.name) }}</span>
                    <div class="emp-text">
                      <b>{{ r.name }}</b>
                      <span class="muted">{{ r.department || 'No department' }}{{ r.employeeId ? ' · ' + r.employeeId : '' }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  {{ r.baseSalary | number: '1.2-2' }}
                  @if (r.payType === 'daily') { <div class="muted">{{ r.paidDays }} days × {{ r.rate | number: '1.0-2' }}</div> }
                  @else if (r.payMethod === 'days') { <div class="muted">{{ r.paidDays }} days × {{ r.dailyRate | number: '1.2-2' }}</div> }
                  @else if (r.payType === 'hourly') {
                    <div class="muted">{{ r.hours | number: '1.0-2' }} h × {{ r.rate | number: '1.0-2' }}@if (r.paidLeave) { + {{ r.paidLeave }} leave }</div>
                  }
                  @else if (!r.rate) { <div class="muted">No salary set</div> }
                </td>
                <td>
                  <div class="att-top">
                    <b>{{ r.worked }}</b>
                    <span class="muted">{{ r.payType === 'monthly' ? '/ ' + r.workingDays + ' days' : 'days worked' }}</span>
                    @if (r.payType === 'monthly') { <span class="att-pct">{{ r.attendancePct ?? 0 }}%</span> }
                  </div>
                  @if (r.payType === 'monthly') { <div class="att-bar"><i [style.width.%]="r.attendancePct ?? 0"></i></div> }
                  <div class="att-chips">
                    @if (r.paidLeave + r.unpaidLeave) { <span class="badge leave" [title]="r.unpaidLeave + ' unpaid'">Leave {{ r.paidLeave + r.unpaidLeave }}</span> }
                    @if (r.payType === 'monthly' && r.absent) { <span class="badge absent">Absent {{ r.absent }}</span> }
                    @if (r.late) { <span class="badge late" [title]="r.lateDeductionDays ? '−' + r.lateDeductionDays + ' day deducted' : ''">Late {{ r.late }}</span> }
                  </div>
                </td>
                <td class="num">{{ r.deduction ? '−' + (r.deduction | number: '1.2-2') : '—' }}</td>
                <td class="num pos">{{ r.additions ? '+' + (r.additions | number: '1.2-2') : '—' }}</td>
                <td class="num neg">{{ r.otherDeductions ? '−' + (r.otherDeductions | number: '1.2-2') : '—' }}</td>
                <td class="num net-cell">
                  <strong>{{ r.netSalary | number: '1.2-2' }}</strong>
                  @if (r.shortfall) { <div class="muted">{{ r.shortfall | number: '1.2-2' }} not recovered</div> }
                </td>
                <td class="row-actions">
                  <button class="btn small whatsapp" (click)="send(r, d)" [title]="r.phone ? 'Send the salary details and attendance % to ' + r.name + ' on WhatsApp' : 'No WhatsApp number saved for ' + r.name + ' (Staff page). WhatsApp will let you choose the contact.'">
                    Send{{ r.phone ? '' : ' *' }}
                  </button>
                  <button class="btn small" (click)="toggle(r.userId)">
                    {{ openId() === r.userId ? 'Close' : (auth.can('payroll_edit') ? 'Add / edit' : 'View') }}{{ r.adjustments.length ? ' (' + r.adjustments.length + ')' : '' }}
                  </button>
                </td>
              </tr>
              @if (openId() === r.userId) {
                <tr class="adj-row">
                  <td colspan="8">
                    <div class="adj-box">
                      <strong>Extra earnings and deductions for {{ r.name }} · {{ fmt(d.from) }} – {{ fmt(d.to) }}</strong>
                      @if (r.adjustments.length) {
                        <ul class="adj-list">
                          @for (a of r.adjustments; track a.id) {
                            <li>
                              <span class="badge" [class]="a.type === 'earning' ? 'present' : 'absent'">{{ a.type === 'earning' ? 'Earning' : 'Deduction' }}</span>
                              @if (a.date) { <span class="muted">{{ fmt(a.date) }}</span> } @else { <span class="muted">Whole month</span> }
                              <span>{{ a.label }}@if (a.note) { <span class="muted"> · {{ a.note }}</span> }</span>
                              <span class="amt" [class.pos]="a.type === 'earning'" [class.neg]="a.type === 'deduction'">
                                {{ a.type === 'earning' ? '+' : '−' }}{{ a.amount | number: '1.2-2' }}
                              </span>
                              @if (!a.id) { <span class="muted">automatic</span> } @else if (auth.can('payroll_edit')) { <button class="btn" (click)="remove(a.id)">Remove</button> }
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="muted" style="margin:6px 0">Nothing added for this month yet.</p>
                      }
                      @if (auth.can('payroll_edit')) {
                      <form class="adj-form" (ngSubmit)="add(r.userId)">
                        @if (!d.custom) {
                          <label>For
                            <select name="when" [(ngModel)]="form.when">
                              <option value="month">Whole month ({{ monthName(d.month) }})</option>
                              <option value="date">A specific date</option>
                            </select>
                          </label>
                        }
                        @if (d.custom || form.when === 'date') {
                          <label>Date
                            <input name="date" type="date" [min]="d.from" [max]="d.to" [(ngModel)]="form.date" required />
                          </label>
                        }
                        <label>Type
                          <select name="type" [(ngModel)]="form.type">
                            <option value="earning">Add to salary (earning)</option>
                            <option value="deduction">Subtract from salary (deduction)</option>
                          </select>
                        </label>
                        <label>Item
                          <input name="label" [(ngModel)]="form.label" list="adj-names" placeholder="e.g. Overtime, Advance" maxlength="60" required />
                        </label>
                        <label>Amount ({{ d.currency }})
                          <input name="amount" type="number" min="0.01" step="0.01" [(ngModel)]="form.amount" required />
                        </label>
                        <label class="wide">Narration (what is it for?)
                          <input name="note" [(ngModel)]="form.note" maxlength="300" placeholder="e.g. 3 extra hours for the stock count" required />
                        </label>
                        <button class="btn primary" type="submit" [disabled]="busy()">Add</button>
                      </form>
                      }
                      <datalist id="adj-names">
                        @for (n of form.type === 'earning' ? earningNames : deductionNames; track n) { <option [value]="n"></option> }
                      </datalist>
                      @if (formError()) { <div class="error">{{ formError() }}</div> }
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="8" class="muted">No active staff</td></tr>
            }
          </tbody>
          @if (d.rows.length) {
            <tfoot>
              <tr>
                <th>Total</th>
                <th>{{ d.totals.baseSalary | number: '1.2-2' }}</th>
                <th></th>
                <th>{{ d.totals.deduction ? '−' + (d.totals.deduction | number: '1.2-2') : '—' }}</th>
                <th>{{ d.totals.additions ? '+' + (d.totals.additions | number: '1.2-2') : '—' }}</th>
                <th>{{ d.totals.otherDeductions ? '−' + (d.totals.otherDeductions | number: '1.2-2') : '—' }}</th>
                <th>{{ d.totals.netSalary | number: '1.2-2' }}</th>
                <th></th>
              </tr>
            </tfoot>
          }
        </table>
        </div>
      } @else if (error()) {
        <div class="error">{{ error() }}</div>
      } @else {
        <p class="muted">Loading…</p>
      }
    </section>
  `,
})
export class PayrollComponent implements OnInit {
  auth = inject(AuthService); // an accountant may be allowed to view only
  private api = inject(ApiService);
  mode: 'month' | 'custom' = 'month';
  month = '';
  from = '';
  to = '';
  fmt = fmt;
  data = signal<Payroll | null>(null);
  error = signal('');
  busy = signal(false);
  openId = signal('');
  staff = signal<StaffMember[]>([]);
  shifts = signal<Shift[]>([]);
  userId = '';
  department = '';
  shift = '';
  payType = '';
  departments = computed(() => [...new Set(this.staff().map((u) => u.department).filter((d): d is string => !!d))].sort());
  formError = signal('');
  form = { when: 'month' as 'month' | 'date', date: '', type: 'earning' as 'earning' | 'deduction', label: '', amount: null as number | null, note: '' };
  earningNames = ['Overtime', 'Incentive', 'Bonus', 'Allowance', 'Commission'];
  deductionNames = ['Advance', 'Loan repayment', 'Fine', 'Damage recovery'];

  ngOnInit() {
    this.api.staff().subscribe((s) => this.staff.set(s.filter((u) => u.role === 'staff' && u.active)));
    this.api.shifts().subscribe((s) => this.shifts.set(s));
    this.load();
  }

  hasFilters() { return !!(this.userId || this.department || this.shift || this.payType); }

  clearFilters() {
    this.userId = this.department = this.shift = this.payType = '';
    this.load();
  }

  private filters(): PayrollQuery {
    return { userId: this.userId, department: this.department, shift: this.shift, payType: this.payType };
  }

  // the same query is used for the table, the Excel file and the extra items
  private query(): PayrollQuery | null {
    const f = this.filters();
    if (this.mode === 'custom') return this.from && this.to ? { from: this.from, to: this.to, ...f } : null;
    return this.month ? { month: this.month, ...f } : this.data() ? null : { ...f }; // no month on first load = current period
  }

  load() {
    // switching to custom dates starts from the period that is on screen
    if (this.mode === 'custom' && !this.from && this.data()) { this.from = this.data()!.from; this.to = this.data()!.to; }
    const q = this.query();
    if (!q) return;
    this.error.set('');
    this.api.payroll(q).subscribe({
      next: (d) => {
        this.data.set(d);
        if (!d.custom && !this.month) this.month = d.month; // first load: show which pay month is current
        if (d.custom || this.mode === 'custom') { this.from = this.from || d.from; this.to = this.to || d.to; }
        this.api.holidayAttendance(q).subscribe({ next: (o) => this.ot.set(o), error: () => this.ot.set(null) });
      },
      error: (e) => this.error.set(e.error?.message || 'Could not load payroll'),
    });
  }

  // Opens WhatsApp with this person's salary details and attendance % ready to send
  send(r: PayrollRow, d: Payroll) {
    const text = salaryMessage(r, { from: d.from, to: d.to, inProgress: d.inProgress }, d.currency);
    window.open(whatsappToUrl(r.phone, text), '_blank', 'noopener');
  }

  toggle(id: string) {
    this.openId.set(this.openId() === id ? '' : id);
    this.formError.set('');
    this.form.date = this.defaultDate();
  }

  // today if it is inside the period on screen, otherwise the last day of the period
  private defaultDate() {
    const d = this.data();
    const today = todayKey();
    if (!d) return today;
    return today < d.from ? d.from : today > d.to ? d.to : today;
  }

  add(userId: string) {
    const amount = Number(this.form.amount);
    const d = this.data()!;
    const byMonth = !d.custom && this.form.when === 'month'; // no particular day: counts in this whole pay month
    if (!byMonth && !this.form.date) return this.formError.set('Choose the date');
    if (!byMonth && (this.form.date < d.from || this.form.date > d.to)) return this.formError.set(`The date must be inside this period (${fmt(d.from)} – ${fmt(d.to)})`);
    if (!this.form.label.trim()) return this.formError.set('Enter an item name, e.g. Overtime or Advance');
    if (!this.form.note.trim()) return this.formError.set('Write a short narration');
    if (!Number.isFinite(amount) || amount <= 0) return this.formError.set('Amount must be more than 0');
    this.formError.set('');
    this.busy.set(true);
    this.api.addAdjustment({
      user: userId, ...(byMonth ? { month: d.month } : { date: this.form.date }), type: this.form.type,
      label: this.form.label.trim(), amount, note: this.form.note.trim(),
    }).subscribe({
      next: () => {
        this.form = { ...this.form, label: '', amount: null, note: '' }; // keep the date / month choice and type for quick repeat entry
        this.busy.set(false);
        this.load();
      },
      error: (e) => { this.formError.set(e.error?.message || 'Could not save'); this.busy.set(false); },
    });
  }

  // 'YYYY-MM' (or a custom range key) -> 'December 2026'
  initials(name: string) {
    const p = (name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
  }

  monthName(key: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : key;
  }

  ot = signal<{ currency: string; items: HolidayEntry[] } | null>(null);
  otPending() { return (this.ot()?.items ?? []).filter((e) => e.status === 'pending').length; }

  // accept a weekend / holiday attendance as overtime, reject it, or put it back to "waiting"
  otPct: Record<string, number> = {}; // % typed per entry (default 100)
  pctOf(e: HolidayEntry) { return this.otPct[e.userId + e.date] || 100; }

  decide(e: HolidayEntry, decision: 'accepted' | 'rejected' | 'pending', percent = 100) {
    this.api.setOt(e.userId, e.date, decision, percent).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err.error?.message || 'Could not save the decision'),
    });
  }

  remove(id: string) {
    if (!confirm('Remove this item?')) return;
    this.api.deleteAdjustment(id).subscribe({
      next: () => this.load(),
      error: (e) => this.formError.set(e.error?.message || 'Could not remove'),
    });
  }

  // one printable slip per employee shown (one sheet each)
  slips() {
    const q = this.query();
    if (!q) return;
    this.busy.set(true);
    this.api.downloadSlips(q).subscribe({
      next: (blob) => {
        const d = this.data();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `salary_slips_${d?.custom ? d.from + '_to_' + d.to : d?.month}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.busy.set(false);
      },
      error: () => { this.error.set('Could not download the salary slips'); this.busy.set(false); },
    });
  }

  download(format: 'xlsx' | 'csv') {
    const q = this.query();
    if (!q) return;
    this.busy.set(true);
    this.api.downloadPayroll(q, format).subscribe({
      next: (blob) => {
        const d = this.data();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll_${d?.custom ? d.from + '_to_' + d.to : d?.month}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        this.busy.set(false);
      },
      error: () => { this.error.set('Could not download the file'); this.busy.set(false); },
    });
  }
}
