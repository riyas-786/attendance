import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, MyPayroll } from '../core/api.service';

@Component({
  selector: 'app-my-salary',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <h2>My salary</h2>
      <label>Pay month
        <input type="month" name="month" [ngModel]="month()" (ngModelChange)="load($event)" />
      </label>
      @if (error()) { <div class="error">{{ error() }}</div> }
    </section>

    @if (d(); as p) {
      @let r = p.row;
      <section class="card">
        <h3>{{ p.from }} to {{ p.to }}</h3>
        @if (p.inProgress) { <p class="muted">This month is not finished yet. The figures are so far and can still change.</p> }
        <p style="font-size:1.8rem;margin:.4rem 0"><b>{{ p.currency }} {{ fmt(r.netSalary) }}</b> <small class="muted">net salary</small></p>
        @if (r.shortfall > 0) { <p class="muted">{{ fmt(r.shortfall) }} of deductions could not be recovered this month.</p> }
      </section>

      <section class="card">
        <h3>How it is worked out</h3>
        <table>
          <tbody>
            <tr><td>{{ r.payType === 'monthly' ? 'Monthly salary' : r.payType === 'daily' ? 'Rate per day' : 'Rate per hour' }}</td><td style="text-align:right">{{ fmt(r.rate) }}</td></tr>
            <tr><td>Salary earned</td><td style="text-align:right">{{ fmt(r.baseSalary) }}</td></tr>
            @for (a of earnings(r); track $index) {
              <tr><td>+ {{ a.label }} <small class="muted">{{ a.date }} {{ a.note }}</small></td><td style="text-align:right">{{ fmt(a.amount) }}</td></tr>
            }
            @if (r.deduction > 0) {
              <tr><td>− Attendance deduction <small class="muted">(absent, unpaid leave, late)</small></td><td style="text-align:right">{{ fmt(r.deduction) }}</td></tr>
            }
            @for (a of deductions(r); track $index) {
              <tr><td>− {{ a.label }} <small class="muted">{{ a.date }} {{ a.note }}</small></td><td style="text-align:right">{{ fmt(a.amount) }}</td></tr>
            }
            <tr><td><b>Net salary</b></td><td style="text-align:right"><b>{{ p.currency }} {{ fmt(r.netSalary) }}</b></td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h3>My attendance this period</h3>
        <table>
          <tbody>
            <tr><td>Attendance</td><td style="text-align:right">{{ r.attendancePct ?? 0 }}% ({{ r.worked }} of {{ r.workingDaysSoFar ?? r.workingDays }} working days)</td></tr>
            <tr><td>Paid leave</td><td style="text-align:right">{{ r.paidLeave }}</td></tr>
            <tr><td>Unpaid leave</td><td style="text-align:right">{{ r.unpaidLeave }}</td></tr>
            <tr><td>Absent</td><td style="text-align:right">{{ r.absent }}</td></tr>
            <tr><td>Late arrivals</td><td style="text-align:right">{{ r.late }}</td></tr>
            @if (r.payType === 'hourly') { <tr><td>Hours worked</td><td style="text-align:right">{{ r.hours }}</td></tr> }
          </tbody>
        </table>
        <p class="muted">Questions about your salary? Please ask the admin.</p>
      </section>
    }
  `,
})
export class MySalaryComponent implements OnInit {
  private api = inject(ApiService);
  d = signal<MyPayroll | null>(null);
  month = signal('');
  error = signal('');

  ngOnInit() { this.load(); }

  load(month?: string) {
    this.error.set('');
    this.api.myPayroll(month || undefined).subscribe({
      next: (p) => { this.d.set(p); this.month.set(p.month); },
      error: (e) => { this.d.set(null); this.error.set(e?.error?.message || 'Could not load your salary'); },
    });
  }

  fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  earnings(r: MyPayroll['row']) { return r.adjustments.filter((a) => a.type === 'earning'); }
  deductions(r: MyPayroll['row']) { return r.adjustments.filter((a) => a.type === 'deduction'); }
}
