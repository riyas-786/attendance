import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AttendanceRecord, StaffMember, Summary } from '../core/api.service';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <section class="card">
      <div class="row-between">
        <h2>Attendance overview</h2>
        <label>Date <input type="date" [(ngModel)]="date" (change)="load()" /></label>
      </div>

      @if (summary(); as s) {
        <div class="stats">
          <div class="stat"><b>{{ s.totalStaff }}</b><span>Staff</span></div>
          <div class="stat ok"><b>{{ s.present }}</b><span>Present</span></div>
          <div class="stat warn"><b>{{ s.late }}</b><span>Late</span></div>
          <div class="stat"><b>{{ s.leave }}</b><span>On leave</span></div>
          <div class="stat bad"><b>{{ s.notIn }}</b><span>Not in</span></div>
        </div>
      }

      <table>
        <thead><tr><th>Name</th><th>Dept</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr>
              <td>{{ r.user?.name }}</td>
              <td>{{ r.user?.department || '—' }}</td>
              <td>{{ r.checkIn ? (r.checkIn | date: 'HH:mm') : '—' }}</td>
              <td>{{ r.checkOut ? (r.checkOut | date: 'HH:mm') : '—' }}</td>
              <td>{{ r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : '—' }}</td>
              <td><span class="badge" [class]="r.status">{{ r.status }}</span></td>
              <td></td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="muted">No records for this date</td></tr>
          }
        </tbody>
      </table>
    </section>

    <section class="card">
      <h3>Mark leave / absence</h3>
      <div class="filters">
        <select [(ngModel)]="manualUser">
          <option value="">Select staff…</option>
          @for (u of staff(); track u._id) { <option [value]="u._id">{{ u.name }}</option> }
        </select>
        <select [(ngModel)]="manualStatus">
          <option value="leave">Paid leave</option>
          <option value="unpaid">Unpaid leave (deducted from salary)</option>
          <option value="absent">Absent (deducted from salary)</option>
        </select>
        <input type="text" placeholder="Note (optional)" [(ngModel)]="manualNote" />
        <button class="btn primary" [disabled]="!manualUser" (click)="saveManual()">Save for {{ date }}</button>
      </div>
      @if (msg()) { <div class="muted">{{ msg() }}</div> }
    </section>
  `,
})
export class AdminComponent implements OnInit {
  private api = inject(ApiService);
  date = today();
  rows = signal<AttendanceRecord[]>([]);
  summary = signal<Summary | null>(null);
  staff = signal<StaffMember[]>([]);
  msg = signal('');

  manualUser = '';
  manualStatus: 'leave' | 'unpaid' | 'absent' = 'leave';
  manualNote = '';

  ngOnInit() {
    this.api.staff().subscribe((s) => this.staff.set(s.filter((u) => u.active && u.role === 'staff')));
    this.load();
  }

  load() {
    this.api.allAttendance({ date: this.date }).subscribe((r) => this.rows.set(r));
    this.api.summary(this.date).subscribe((s) => this.summary.set(s));
  }

  saveManual() {
    this.api
      .manual({
        userId: this.manualUser,
        date: this.date,
        status: this.manualStatus === 'unpaid' ? 'leave' : this.manualStatus,
        ...(this.manualStatus === 'unpaid' ? { leaveType: 'unpaid' } : this.manualStatus === 'leave' ? { leaveType: 'annual' } : {}),
        note: this.manualNote,
      })
      .subscribe({
        next: () => { this.msg.set('Saved'); this.manualNote = ''; this.load(); },
        error: (e) => this.msg.set(e.error?.message || 'Could not save'),
      });
  }
}
