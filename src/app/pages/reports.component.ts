import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <h2>Attendance reports</h2>
      <p class="muted">Download attendance for a date range. The Excel file also has a per-employee summary sheet.</p>

      <div class="filters">
        <label>From <input type="date" [(ngModel)]="from" /></label>
        <label>To <input type="date" [(ngModel)]="to" /></label>
        <button class="btn" (click)="thisMonth()">This month</button>
        <button class="btn" (click)="lastMonth()">Last month</button>
      </div>

      <div class="actions left">
        <button class="btn primary" [disabled]="busy()" (click)="download('xlsx')">Download Excel (.xlsx)</button>
        <button class="btn" [disabled]="busy()" (click)="download('csv')">Download CSV</button>
      </div>

      @if (msg()) { <div class="error">{{ msg() }}</div> }
    </section>
  `,
})
export class ReportsComponent {
  private api = inject(ApiService);
  busy = signal(false);
  msg = signal('');
  from = '';
  to = '';

  constructor() { this.thisMonth(); }

  thisMonth() {
    const n = new Date();
    this.from = fmt(new Date(n.getFullYear(), n.getMonth(), 1));
    this.to = fmt(n);
  }

  lastMonth() {
    const n = new Date();
    this.from = fmt(new Date(n.getFullYear(), n.getMonth() - 1, 1));
    this.to = fmt(new Date(n.getFullYear(), n.getMonth(), 0));
  }

  download(format: 'csv' | 'xlsx') {
    this.busy.set(true);
    this.msg.set('');
    this.api.downloadReport(format, this.from, this.to).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${this.from}_to_${this.to}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        this.busy.set(false);
      },
      error: () => { this.msg.set('Could not download the report'); this.busy.set(false); },
    });
  }
}
