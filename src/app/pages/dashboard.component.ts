import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { TimeFormat } from '../core/time-format';
import { ClockPipe } from '../core/clock.pipe';
import { ApiService, AttendanceRecord, PresencePayload, Rules } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { LocationService } from '../core/location.service';
import { preloadShareAssets } from '../core/share-image';
import { ShareDayComponent } from './share-day.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ClockPipe, ShareDayComponent],
  template: `
    <section class="card center">
      <p class="muted">Welcome, {{ auth.user()?.name }}</p>
      <div class="clock">{{ now() | clock: tf.is24() : tf.tz() : 'hms' }}</div>
      <div class="muted">{{ now() | clock: tf.is24() : tf.tz() : 'date' }}</div>
      @if (tf.tz()) { <div class="muted">Company time · {{ tf.tz() }}</div> }

      <div class="status-line">
        @if (sessions().length === 0) {
          <span class="badge" [class]="record()?.status === 'leave' ? 'leave' : ''">
            {{ record()?.status === 'leave' ? 'On approved leave today' : 'Not checked in' }}
          </span>
        }
        @else if (isIn()) {
          <span class="badge" [class]="record()!.status">Checked in at {{ sessions()[sessions().length - 1].in | clock: tf.is24() : tf.tz() }}
            @if (record()!.status === 'late' && sessions().length === 1) { (late) }
          </span>
        } @else {
          <span class="badge done">Checked out at {{ sessions()[sessions().length - 1].out | clock: tf.is24() : tf.tz() }}</span>
        }
      </div>

      @if (rules()?.workStart; as start) {
        <p class="muted">
          Your duty starts at {{ start }}{{ rules()?.workEnd ? ' and ends at ' + rules()?.workEnd : '' }}{{ rules()?.shiftName ? ' (' + rules()?.shiftName + ')' : '' }}@if (rules()?.graceMinutes) {, {{ rules()?.graceMinutes }} min grace}
        </p>
      }

      @if (prompt(); as p) {
        <div class="share-prompt">
          <strong>{{ p === 'in' ? 'You are checked in ✓' : 'You are checked out ✓' }}</strong>
          <span class="muted">Send it to your WhatsApp group?</span>
          <app-share-day [record]="record()" />
          <button class="btn small" type="button" (click)="prompt.set('')">Not now</button>
        </div>
      }

      <div class="actions">
        <button class="btn primary big" (click)="checkIn()" [disabled]="busy() || isIn()">Check in</button>
        <button class="btn big" (click)="checkOut()" [disabled]="busy() || !isIn()">Check out</button>
      </div>
      <p class="muted hint" style="margin-top:8px">You can check in and out as many times as you need during the day.</p>
      @if (rules()?.locationRequired) {
        <p class="muted hint">
          Your location is checked when you check in or out@if (rules()?.places?.length) { (allowed: {{ rules()!.places!.join(', ') }})}.
          Allow location access if your browser asks.
        </p>
      }

      @if (busy()) { <p class="muted">{{ busyText() }}</p> }
      @if (error()) { <div class="error">{{ error() }}</div> }
    </section>

    @if (sessions().length) {
      <section class="card">
        <div class="row-between">
          <h3>Today's check-ins</h3>
          <strong>Total today: {{ fmt(totalMinutes()) }}</strong>
        </div>
        @if (!prompt()) { <app-share-day [record]="record()" /> }
        <table>
          <thead><tr><th>#</th><th>In</th><th>Out</th><th>Time</th></tr></thead>
          <tbody>
            @for (s of sessions(); track $index) {
              <tr>
                <td>{{ $index + 1 }}</td>
                <td>{{ s.in | clock: tf.is24() : tf.tz() }}</td>
                <td>{{ s.out ? (s.out | clock: tf.is24() : tf.tz()) : 'still in' }}</td>
                <td>{{ fmt(sessionMinutes(s)) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  tf = inject(TimeFormat);
  api = inject(ApiService);
  auth = inject(AuthService);
  private loc = inject(LocationService);

  record = signal<AttendanceRecord | null>(null);
  rules = signal<Rules | null>(null);
  now = signal(new Date());
  busy = signal(false);
  busyText = signal('');
  error = signal('');
  // set right after a check-in / check-out so staff can send it to the WhatsApp group straight away
  prompt = signal<'' | 'in' | 'out'>('');
  private timer?: ReturnType<typeof setInterval>;

  sessions = computed(() => this.record()?.sessions ?? []);
  // checked in right now = the last session has no check-out yet
  isIn = computed(() => {
    const s = this.sessions();
    return s.length > 0 && !s[s.length - 1].out;
  });
  // all sessions added up; a session that is still running counts up to the current time
  totalMinutes = computed(() => this.sessions().reduce((t, s) => t + this.sessionMinutes(s), 0));

  sessionMinutes(s: { in: string; out?: string }) {
    const end = s.out ? new Date(s.out).getTime() : this.now().getTime();
    return Math.max(0, Math.round((end - new Date(s.in).getTime()) / 60000));
  }

  fmt(m: number) {
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  ngOnInit() {
    preloadShareAssets();
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
    this.prompt.set('');

    const payload: PresencePayload = {};
    this.busyText.set('Getting your location…');
    const pos = await this.loc.getPosition();
    if (pos) Object.assign(payload, pos);

    this.busyText.set(kind === 'in' ? 'Checking in…' : 'Checking out…');
    const obs = kind === 'in' ? this.api.checkIn(payload) : this.api.checkOut(payload);
    obs.subscribe({
      next: (r) => { this.record.set(r); this.prompt.set(kind); this.busy.set(false); },
      error: (e) => { this.error.set(e.error?.message || 'Something went wrong'); this.busy.set(false); },
    });
  }
}
