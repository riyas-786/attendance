import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { todayDate } from '../core/time-format';
import { FormsModule } from '@angular/forms';
import { ApiService, ReportFilters, ReportPreview, Shift, StaffMember, WorkLocation } from '../core/api.service';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const STATUSES = [
  { key: 'present', label: 'Present' },
  { key: 'late', label: 'Late' },
  { key: 'leave', label: 'On leave' },
  { key: 'absent', label: 'Absent' },
];

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <h2>Attendance reports</h2>
      <p class="muted">Choose what to include, check the preview, then download. The filters apply to the preview, the Excel file and the CSV.</p>

      <div class="filters">
        <label>From <input type="date" [(ngModel)]="from" /></label>
        <label>To <input type="date" [(ngModel)]="to" /></label>
        <button class="btn" (click)="range('today')">Today</button>
        <button class="btn" (click)="range('week')">Last 7 days</button>
        <button class="btn" (click)="range('month')">This month</button>
        <button class="btn" (click)="range('last')">Last month</button>
      </div>

      <div class="filters">
        <label>Employee
          <select [(ngModel)]="userId">
            <option value="">All employees</option>
            @for (u of staff(); track u._id) { <option [value]="u._id">{{ u.name }}{{ u.employeeId ? ' (' + u.employeeId + ')' : '' }}{{ u.active ? '' : ' – inactive' }}</option> }
          </select>
        </label>
        <label>Department
          <select [(ngModel)]="department">
            <option value="">All departments</option>
            @for (d of departments(); track d) { <option [value]="d">{{ d }}</option> }
          </select>
        </label>
        <label>Shift
          <select [(ngModel)]="shift">
            <option value="">All shifts</option>
            @for (s of shifts(); track s._id) { <option [value]="s._id">{{ s.name }} ({{ s.workStart }})</option> }
          </select>
        </label>
        <label>Check-in place
          <select [(ngModel)]="place">
            <option value="">Any place</option>
            @for (l of places(); track l._id) { <option [value]="l.name">{{ l.name }}</option> }
            <option value="__none__">Not at a saved place</option>
          </select>
        </label>
      </div>

      <div class="filters">
        <span class="muted">Status</span>
        @for (s of statusList; track s.key) {
          <label class="check"><input type="checkbox" [checked]="status().includes(s.key)" (change)="toggleStatus(s.key)" /> {{ s.label }}</label>
        }
        <label class="check" title="Lists working days where a person has no record at all as absent (active staff, up to yesterday; weekends and holidays from Settings are skipped)">
          <input type="checkbox" [(ngModel)]="includeAbsent" /> Include days with no record as absent
        </label>
      </div>

      <div class="actions left">
        <button class="btn primary" [disabled]="busy()" (click)="preview()">Show preview</button>
        <button class="btn" [disabled]="busy()" (click)="download('xlsx')">Download Excel (.xlsx)</button>
        <button class="btn" [disabled]="busy()" (click)="download('csv')">Download CSV</button>
        <button class="btn" (click)="reset()">Reset filters</button>
      </div>

      @if (msg()) { <div class="error">{{ msg() }}</div> }
    </section>

    @if (data(); as d) {
      <section class="card">
        <div class="row-between">
          <h3>{{ d.total }} record{{ d.total === 1 ? '' : 's' }}</h3>
          <span class="muted">{{ d.from }} to {{ d.to }}</span>
        </div>
        <p class="report-badges">
          <span class="badge present">{{ d.counts.present }} present</span>
          <span class="badge late">{{ d.counts.late }} late</span>
          <span class="badge leave">{{ d.counts.leave }} on leave</span>
          <span class="badge absent">{{ d.counts.absent }} absent</span>
          <span class="muted"> · {{ d.hours }} hours worked</span>
        </p>
        @if (d.total > d.rows.length) { <p class="muted">Showing the first {{ d.rows.length }} rows. The downloads contain all {{ d.total }}.</p> }
        <div style="overflow-x:auto">
          <table>
            <thead><tr>@for (c of cols(); track c) { <th>{{ c }}</th> }</tr></thead>
            <tbody>
              @for (r of d.rows; track $index) {
                <tr>
                  <td>{{ r[0] }}</td>
                  <td>{{ r[2] }}<div class="muted">{{ r[1] }}{{ r[3] ? ' · ' + r[3] : '' }}</div></td>
                  <td>{{ r[7] || '—' }}</td>
                  <td>{{ r[6] || '—' }}</td>
                  <td>{{ r[8] || '—' }}</td>
                  <td><span class="badge" [class]="r[9]">{{ r[9] }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="muted">Nothing matches these filters</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);
  busy = signal(false);
  msg = signal('');
  data = signal<ReportPreview | null>(null);
  staff = signal<StaffMember[]>([]);
  shifts = signal<Shift[]>([]);
  places = signal<WorkLocation[]>([]);
  status = signal<string[]>([]);
  statusList = STATUSES;

  from = '';
  to = '';
  userId = '';
  department = '';
  shift = '';
  place = '';
  includeAbsent = false;

  departments = computed(() => [...new Set(this.staff().map((u) => u.department).filter((d): d is string => !!d))].sort());
  cols = () => ['Date', 'Employee', 'Sessions', 'Hours', 'Places', 'Status'];

  constructor() { this.range('month'); }

  ngOnInit() {
    this.api.staff().subscribe((s) => this.staff.set(s.filter((u) => u.role === 'staff')));
    this.api.shifts().subscribe((s) => this.shifts.set(s));
    this.api.locations().subscribe((l) => this.places.set(l));
    this.preview();
  }

  range(kind: 'today' | 'week' | 'month' | 'last') {
    const n = todayDate();
    if (kind === 'today') { this.from = this.to = fmt(n); }
    else if (kind === 'week') { this.from = fmt(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6)); this.to = fmt(n); }
    else if (kind === 'month') { this.from = fmt(new Date(n.getFullYear(), n.getMonth(), 1)); this.to = fmt(n); }
    else { this.from = fmt(new Date(n.getFullYear(), n.getMonth() - 1, 1)); this.to = fmt(new Date(n.getFullYear(), n.getMonth(), 0)); }
  }

  toggleStatus(key: string) {
    this.status.update((l) => (l.includes(key) ? l.filter((k) => k !== key) : [...l, key]));
  }

  reset() {
    this.range('month');
    this.userId = this.department = this.shift = this.place = '';
    this.includeAbsent = false;
    this.status.set([]);
    this.preview();
  }

  private filters(): ReportFilters {
    return {
      from: this.from, to: this.to,
      userId: this.userId, department: this.department, shift: this.shift, place: this.place,
      status: this.status().join(','),
      includeAbsent: this.includeAbsent ? 'true' : '',
    };
  }

  private valid() {
    if (!this.from || !this.to) { this.msg.set('Choose the From and To dates'); return false; }
    if (this.from > this.to) { this.msg.set('The From date must be on or before the To date'); return false; }
    this.msg.set('');
    return true;
  }

  preview() {
    if (!this.valid()) return;
    this.busy.set(true);
    this.api.reportPreview(this.filters()).subscribe({
      next: (d) => { this.data.set(d); this.busy.set(false); },
      error: (e) => { this.msg.set(e.error?.message || 'Could not load the preview'); this.busy.set(false); },
    });
  }

  download(format: 'csv' | 'xlsx') {
    if (!this.valid()) return;
    this.busy.set(true);
    this.api.downloadReport(format, this.filters()).subscribe({
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
