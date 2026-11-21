import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, OwnerOverview } from '../core/api.service';
import { TimeFormat, todayKey } from '../core/time-format';
import { ClockPipe } from '../core/clock.pipe';

const today = () => todayKey();

// Read-only attendance status for owners: who is in, late, on leave or not in. Nothing can be changed here.
@Component({
  selector: 'app-owner',
  standalone: true,
  imports: [ClockPipe, FormsModule],
  template: `
    <section class="card">
      <div class="row-between">
        <h2>Attendance status</h2>
        <label>Date <input type="date" [(ngModel)]="date" (change)="load()" /></label>
      </div>

      @if (data(); as d) {
        <div class="stats">
          <div class="stat"><b>{{ d.counts.total }}</b><span>Staff</span></div>
          <div class="stat ok"><b>{{ d.counts.present }}</b><span>Present</span></div>
          <div class="stat warn"><b>{{ d.counts.late }}</b><span>Late</span></div>
          <div class="stat"><b>{{ d.counts.leave }}</b><span>On leave</span></div>
          <div class="stat bad"><b>{{ d.counts.absent + d.counts.notIn }}</b><span>{{ date === todayKey ? 'Not in' : 'Absent' }}</span></div>
        </div>

        <table>
          <thead><tr><th>Name</th><th>Dept</th><th>Check in / out</th><th>Total hours</th><th>Status</th></tr></thead>
          <tbody>
            @for (p of d.people; track p.id) {
              <tr>
                <td>{{ p.name }}</td>
                <td>{{ p.department || '—' }}</td>
                <td>
                  @for (s of p.sessions; track $index) {
                    <div>{{ s.in | clock: tf.is24() : tf.tz() }} – {{ s.out ? (s.out | clock: tf.is24() : tf.tz()) : 'still in' }}</div>
                  } @empty { — }
                </td>
                <td>{{ p.workedMinutes ? (p.workedMinutes / 60).toFixed(1) : '—' }}</td>
                <td><span class="badge" [class]="p.status === 'not in' ? '' : p.status">{{ p.status === 'not in' && date !== todayKey ? 'absent' : p.status }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="muted">No staff</td></tr>
            }
          </tbody>
        </table>
      } @else if (error()) {
        <p class="muted">{{ error() }}</p>
      }
      @if (date === todayKey) { <p class="muted">Updates automatically every minute.</p> }
    </section>
  `,
})
export class OwnerComponent implements OnInit, OnDestroy {
  tf = inject(TimeFormat);
  private api = inject(ApiService);
  date = today();
  todayKey = today();
  data = signal<OwnerOverview | null>(null);
  error = signal('');
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => { if (this.date === today()) this.load(); }, 60000);
  }
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  load() {
    if (!this.date) return;
    this.api.ownerOverview(this.date).subscribe({
      next: (r) => { this.data.set(r); this.error.set(''); },
      error: (e) => this.error.set(e.error?.message || 'Could not load attendance'),
    });
  }
}
