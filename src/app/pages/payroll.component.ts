import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Payroll, PayrollQuery, Shift, StaffMember } from '../core/api.service';

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  template: `
    <section class="card">
      <div class="row-between">
        <h2>Payroll</h2>
        <div class="filters" style="margin:0">
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
        </div>
      </div>

      <div class="filters">
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

      <div class="actions left">
        <button class="btn primary" [disabled]="busy() || !data()" (click)="download('xlsx')">Download salary sheet (Excel)</button>
        <button class="btn" [disabled]="busy() || !data()" (click)="download('csv')">Download CSV</button>
        <button class="btn" [disabled]="busy() || !data()" (click)="slips()">Download salary slips (Excel)</button>
        @if (data(); as d) { <span class="muted">{{ d.rows.length }} employee{{ d.rows.length === 1 ? '' : 's' }}{{ hasFilters() ? ' (filtered)' : '' }} · the downloads match what is shown</span> }
      </div>

      @if (data(); as d) {
        <p style="margin:6px 0"><strong>{{ fmt(d.from) }} – {{ fmt(d.to) }}</strong></p>
        @if (d.inProgress) {
          <div class="notice">This period is still running. Absences are counted up to yesterday, so the figures can still change.</div>
        }
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

        <div style="overflow-x:auto">
        <table class="pay">
          <thead>
            <tr>
              <th>Name</th><th>Basic pay ({{ d.currency }})</th><th>Worked</th><th>Leave</th>
              <th>Absent</th><th>Late</th><th>Attendance deduction</th>
              <th>Extra earnings</th><th>Other deductions</th><th>Net salary</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of d.rows; track r.userId) {
              <tr>
                <td>{{ r.name }}<div class="muted">{{ r.department }}</div></td>
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
                  @if (r.payType === 'monthly') { {{ r.worked }} / {{ r.workingDays }} } @else { {{ r.worked }} days }
                  @if (r.payType !== 'monthly') { <div class="muted">{{ r.payType === 'daily' ? 'per day' : 'per hour' }}</div> }
                </td>
                <td>
                  {{ r.paidLeave + r.unpaidLeave || '—' }}
                  @if (r.unpaidLeave) { <div class="muted">{{ r.unpaidLeave }} unpaid</div> }
                </td>
                <td>
                  @if (r.payType === 'monthly') { <span class="badge" [class]="r.absent ? 'absent' : ''">{{ r.absent }}</span> } @else { <span class="muted">—</span> }
                </td>
                <td>
                  <span class="badge" [class]="r.lateDeductionDays ? 'late' : ''">{{ r.late }}</span>
                  @if (r.lateDeductionDays) { <div class="muted">−{{ r.lateDeductionDays }} day</div> }
                </td>
                <td>{{ r.deduction ? '−' + (r.deduction | number: '1.2-2') : '—' }}</td>
                <td class="pos">{{ r.additions ? '+' + (r.additions | number: '1.2-2') : '—' }}</td>
                <td class="neg">{{ r.otherDeductions ? '−' + (r.otherDeductions | number: '1.2-2') : '—' }}</td>
                <td>
                  <strong>{{ r.netSalary | number: '1.2-2' }}</strong>
                  @if (r.shortfall) { <div class="muted">{{ r.shortfall | number: '1.2-2' }} not recovered</div> }
                </td>
                <td>
                  <button class="btn" (click)="toggle(r.userId)">
                    {{ openId() === r.userId ? 'Close' : 'Add / edit' }}{{ r.adjustments.length ? ' (' + r.adjustments.length + ')' : '' }}
                  </button>
                </td>
              </tr>
              @if (openId() === r.userId) {
                <tr class="adj-row">
                  <td colspan="11">
                    <div class="adj-box">
                      <strong>Extra earnings and deductions for {{ r.name }} · {{ fmt(d.from) }} – {{ fmt(d.to) }}</strong>
                      @if (r.adjustments.length) {
                        <ul class="adj-list">
                          @for (a of r.adjustments; track a.id) {
                            <li>
                              <span class="badge" [class]="a.type === 'earning' ? 'present' : 'absent'">{{ a.type === 'earning' ? 'Earning' : 'Deduction' }}</span>
                              @if (a.date) { <span class="muted">{{ fmt(a.date) }}</span> }
                              <span>{{ a.label }}@if (a.note) { <span class="muted"> · {{ a.note }}</span> }</span>
                              <span class="amt" [class.pos]="a.type === 'earning'" [class.neg]="a.type === 'deduction'">
                                {{ a.type === 'earning' ? '+' : '−' }}{{ a.amount | number: '1.2-2' }}
                              </span>
                              <button class="btn" (click)="remove(a.id)">Remove</button>
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="muted" style="margin:6px 0">Nothing added for this month yet.</p>
                      }
                      <form class="adj-form" (ngSubmit)="add(r.userId)">
                        <label>Date
                          <input name="date" type="date" [min]="d.from" [max]="d.to" [(ngModel)]="form.date" required />
                        </label>
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
                      <datalist id="adj-names">
                        @for (n of form.type === 'earning' ? earningNames : deductionNames; track n) { <option [value]="n"></option> }
                      </datalist>
                      @if (formError()) { <div class="error">{{ formError() }}</div> }
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="11" class="muted">No active staff</td></tr>
            }
          </tbody>
          @if (d.rows.length) {
            <tfoot>
              <tr>
                <th>Total</th>
                <th>{{ d.totals.baseSalary | number: '1.2-2' }}</th>
                <th colspan="4"></th>
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
        <p class="muted">Daily staff are paid for each day with a check-in (plus paid leave), hourly staff for the hours between check-in and check-out; absences just earn nothing. Net salary = basic pay − attendance deduction + extra earnings − other deductions (never below 0). Extra items count in the period that contains their date.</p>
      } @else if (error()) {
        <div class="error">{{ error() }}</div>
      } @else {
        <p class="muted">Loading…</p>
      }
    </section>
  `,
})
export class PayrollComponent implements OnInit {
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
  form = { date: '', type: 'earning' as 'earning' | 'deduction', label: '', amount: null as number | null, note: '' };
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
      },
      error: (e) => this.error.set(e.error?.message || 'Could not load payroll'),
    });
  }

  toggle(id: string) {
    this.openId.set(this.openId() === id ? '' : id);
    this.formError.set('');
    this.form.date = this.defaultDate();
  }

  // today if it is inside the period on screen, otherwise the last day of the period
  private defaultDate() {
    const d = this.data();
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    if (!d) return today;
    return today < d.from ? d.from : today > d.to ? d.to : today;
  }

  add(userId: string) {
    const amount = Number(this.form.amount);
    const d = this.data()!;
    if (!this.form.date) return this.formError.set('Choose the date');
    if (this.form.date < d.from || this.form.date > d.to) return this.formError.set(`The date must be inside this period (${fmt(d.from)} – ${fmt(d.to)})`);
    if (!this.form.label.trim()) return this.formError.set('Enter an item name, e.g. Overtime or Advance');
    if (!this.form.note.trim()) return this.formError.set('Write a short narration');
    if (!Number.isFinite(amount) || amount <= 0) return this.formError.set('Amount must be more than 0');
    this.formError.set('');
    this.busy.set(true);
    this.api.addAdjustment({
      user: userId, date: this.form.date, type: this.form.type,
      label: this.form.label.trim(), amount, note: this.form.note.trim(),
    }).subscribe({
      next: () => {
        this.form = { ...this.form, label: '', amount: null, note: '' }; // keep the date and type for quick repeat entry
        this.busy.set(false);
        this.load();
      },
      error: (e) => { this.formError.set(e.error?.message || 'Could not save'); this.busy.set(false); },
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
