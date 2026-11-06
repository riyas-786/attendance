import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, AttendanceRecord, PresencePayload, Rules } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { LocationService } from '../core/location.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card center">
      <p class="muted">Welcome, {{ auth.user()?.name }}</p>
      <div class="clock">{{ now() | date: 'HH:mm:ss' }}</div>
      <div class="muted">{{ now() | date: 'EEEE, d MMMM y' }}</div>

      <div class="status-line">
        @if (!record()?.checkIn) {
          <span class="badge" [class]="record()?.status === 'leave' ? 'leave' : ''">
            {{ record()?.status === 'leave' ? 'On approved leave today' : 'Not checked in' }}
          </span>
        }
        @else if (!record()?.checkOut) {
          <span class="badge" [class]="record()!.status">Checked in at {{ record()!.checkIn | date: 'HH:mm' }}
            @if (record()!.status === 'late') { (late) }
          </span>
        } @else {
          <span class="badge done">Done for today · {{ hours() }}</span>
        }
      </div>

      @if (rules()?.workStart; as start) {
        <p class="muted">
          Your duty starts at {{ start }}{{ rules()?.shiftName ? ' (' + rules()?.shiftName + ')' : '' }}@if (rules()?.graceMinutes) {, {{ rules()?.graceMinutes }} min grace}
        </p>
      }

      @if (rules()?.qrRequired) {
        <div class="notice">Your workplace requires scanning the office QR code. Scan it with your phone camera and sign in.</div>
      } @else {
        <div class="actions">
          <button class="btn primary big" (click)="checkIn()" [disabled]="busy() || !!record()?.checkIn">Check in</button>
          <button class="btn big" (click)="checkOut()" [disabled]="busy() || !record()?.checkIn || !!record()?.checkOut">Check out</button>
        </div>
        @if (rules()?.locationRequired) {
          <p class="muted hint">
            Your location is checked when you check in or out
            @if (rules()?.places?.length) { (allowed: {{ rules()!.places!.join(', ') }}) }.
            Allow location access if your browser asks.
          </p>
        }
      }

      @if (busy()) { <p class="muted">{{ busyText() }}</p> }
      @if (error()) { <div class="error">{{ error() }}</div> }
    </section>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  api = inject(ApiService);
  auth = inject(AuthService);
  private loc = inject(LocationService);

  record = signal<AttendanceRecord | null>(null);
  rules = signal<Rules | null>(null);
  now = signal(new Date());
  busy = signal(false);
  busyText = signal('');
  error = signal('');
  private timer?: ReturnType<typeof setInterval>;

  hours = computed(() => {
    const m = this.record()?.workedMinutes ?? 0;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  });

  ngOnInit() {
    this.timer = setInterval(() => this.now.set(new Date()), 1000);
    this.api.today().subscribe((r) => this.record.set(r));
    this.api.rules().subscribe((r) => this.rules.set(r));
  }
  ngOnDestroy() { clearInterval(this.timer); }

  checkIn() { this.run('in'); }
  checkOut() { this.run('out'); }

  private async run(kind: 'in' | 'out') {
    this.busy.set(true);
    this.error.set('');

    const payload: PresencePayload = {};
    this.busyText.set('Getting your location…');
    const pos = await this.loc.getPosition();
    if (pos) Object.assign(payload, pos);

    this.busyText.set(kind === 'in' ? 'Checking in…' : 'Checking out…');
    const obs = kind === 'in' ? this.api.checkIn(payload) : this.api.checkOut(payload);
    obs.subscribe({
      next: (r) => { this.record.set(r); this.busy.set(false); },
      error: (e) => { this.error.set(e.error?.message || 'Something went wrong'); this.busy.set(false); },
    });
  }
}
