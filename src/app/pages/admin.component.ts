import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AttendanceRecord, Place, StaffMember, Summary } from '../core/api.service';

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
        <thead><tr><th>Name</th><th>Dept</th><th>Check in / out</th><th>Total hours</th><th>Status</th><th>Where</th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr>
              <td>{{ r.user?.name }}</td>
              <td>{{ r.user?.department || '—' }}</td>
              <td>
                @for (s of r.sessions ?? []; track $index) {
                  <div>{{ s.in | date: 'HH:mm' }} – {{ s.out ? (s.out | date: 'HH:mm') : 'still in' }}</div>
                } @empty { — }
              </td>
              <td>{{ r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : '—' }}</td>
              <td><span class="badge" [class]="r.status">{{ r.status }}</span></td>
              <td>
                @if (r.sessions?.length) {
                  <button class="btn small" (click)="toggle(r._id)">{{ isOpen(r._id) ? 'Hide' : 'Locations' }}</button>
                  @if (needsAttention(r)) { <span class="warn-dot" title="Some check-ins are outside known places or have no location">!</span> }
                }
              </td>
            </tr>
            @if (isOpen(r._id)) {
              <tr class="detail">
                <td colspan="6">
                  <table class="inner">
                    <thead><tr><th>#</th><th>Check in</th><th>Where</th><th>Check out</th><th>Where</th></tr></thead>
                    <tbody>
                      @for (s of r.sessions ?? []; track $index) {
                        <tr>
                          <td>{{ $index + 1 }}</td>
                          <td>{{ s.in | date: 'HH:mm' }}</td>
                          <td>
                            @if (place(s.inLocation, s.inMethod); as p) {
                              <span [class]="p.cls">{{ p.text }}</span>
                              @if (p.url) { <a [href]="p.url" target="_blank" rel="noopener">Map</a> }
                              @if (p.note) { <div class="muted">{{ p.note }}</div> }
                            }
                          </td>
                          <td>{{ s.out ? (s.out | date: 'HH:mm') : 'still in' }}</td>
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
          } @empty {
            <tr><td colspan="6" class="muted">No records for this date</td></tr>
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
