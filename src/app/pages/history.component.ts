import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AttendanceRecord } from '../core/api.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <section class="card">
      <h2>My attendance</h2>
      <div class="filters">
        <label>From <input type="date" [(ngModel)]="from" /></label>
        <label>To <input type="date" [(ngModel)]="to" /></label>
        <button class="btn" (click)="load()">Filter</button>
      </div>

      <table>
        <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr>
              <td>{{ r.date }}</td>
              <td>{{ r.checkIn ? (r.checkIn | date: 'HH:mm') : '—' }}</td>
              <td>{{ r.checkOut ? (r.checkOut | date: 'HH:mm') : '—' }}</td>
              <td>{{ r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : '—' }}</td>
              <td><span class="badge" [class]="r.status">{{ r.status }}</span></td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="muted">No records</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class HistoryComponent implements OnInit {
  private api = inject(ApiService);
  rows = signal<AttendanceRecord[]>([]);
  from = '';
  to = '';

  ngOnInit() { this.load(); }
  load() { this.api.myHistory(this.from, this.to).subscribe((r) => this.rows.set(r)); }
}
