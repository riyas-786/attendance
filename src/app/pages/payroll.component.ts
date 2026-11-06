import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Payroll } from '../core/api.service';

const pad = (n: number) => String(n).padStart(2, '0');
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  template: `
    <section class="card">
      <div class="row-between">
        <h2>Payroll</h2>
        <div class="filters" style="margin:0">
          <label>Month <input type="month" [(ngModel)]="month" (change)="load()" /></label>
          <button class="btn primary" [disabled]="busy() || !data()" (click)="download()">Download Excel</button>
        </div>
      </div>

      @if (data(); as d) {
        @if (d.inProgress) {
          <div class="notice">This month is still running. Absences are counted up to yesterday, so the figures can still change.</div>
        }
        <p class="muted">
          {{ d.totalWorkingDays }} working days in the month (weekends and holidays excluded) ·
          each absent day deducts {{ d.deductionFactor }} day of pay · unpaid leave deducts 1 day · paid leave is not deducted ·
          @if (d.lateThreshold) {
            every {{ d.lateThreshold }} late arrivals deduct {{ d.lateDays }} day
          } @else {
            late arrivals are not deducted
          }
        </p>

        <table>
          <thead>
            <tr>
              <th>Name</th><th>Salary ({{ d.currency }})</th><th>Worked</th><th>Paid leave</th>
              <th>Unpaid leave</th><th>Absent</th><th>Late</th><th>Deduction</th><th>Net salary</th>
            </tr>
          </thead>
          <tbody>
            @for (r of d.rows; track r.userId) {
              <tr>
                <td>{{ r.name }}<div class="muted">{{ r.department }}</div></td>
                <td>
                  {{ r.baseSalary | number: '1.2-2' }}
                  @if (!r.baseSalary) { <div class="muted">No salary set</div> }
                </td>
                <td>{{ r.worked }} / {{ r.workingDays }}</td>
                <td>{{ r.paidLeave }}</td>
                <td>{{ r.unpaidLeave }}</td>
                <td><span class="badge" [class]="r.absent ? 'absent' : ''">{{ r.absent }}</span></td>
                <td>
                  <span class="badge" [class]="r.lateDeductionDays ? 'late' : ''">{{ r.late }}</span>
                  @if (r.lateDeductionDays) { <div class="muted">−{{ r.lateDeductionDays }} day</div> }
                </td>
                <td>{{ r.deduction ? '−' + (r.deduction | number: '1.2-2') : '—' }}</td>
                <td><strong>{{ r.netSalary | number: '1.2-2' }}</strong></td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="muted">No active staff</td></tr>
            }
          </tbody>
          @if (d.rows.length) {
            <tfoot>
              <tr>
                <th>Total</th>
                <th>{{ d.totals.baseSalary | number: '1.2-2' }}</th>
                <th colspan="5"></th>
                <th>{{ d.totals.deduction ? '−' + (d.totals.deduction | number: '1.2-2') : '—' }}</th>
                <th>{{ d.totals.netSalary | number: '1.2-2' }}</th>
              </tr>
            </tfoot>
          }
        </table>
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
  month = thisMonth();
  data = signal<Payroll | null>(null);
  error = signal('');
  busy = signal(false);

  ngOnInit() { this.load(); }

  load() {
    if (!this.month) return;
    this.error.set('');
    this.api.payroll(this.month).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(e.error?.message || 'Could not load payroll'),
    });
  }

  download() {
    this.busy.set(true);
    this.api.downloadPayroll(this.month).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll_${this.month}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.busy.set(false);
      },
      error: () => { this.error.set('Could not download the file'); this.busy.set(false); },
    });
  }
}
