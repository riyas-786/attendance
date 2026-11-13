import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, AttendanceRecord, PresencePayload } from '../core/api.service';
import { LocationService } from '../core/location.service';
import { ShareDayComponent } from './share-day.component';
import { preloadShareAssets } from '../core/share-image';

// Opened when staff scan the office QR code with their phone camera: /scan?t=TOKEN
@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [DatePipe, RouterLink, ShareDayComponent],
  template: `
    <section class="card center">
      <h2>Office QR scan</h2>

      @if (state() === 'working') { <p class="muted">{{ text() }}</p> }

      @if (state() === 'done') {
        <div class="big-icon ok">✓</div>
        <p><strong>{{ action() === 'in' ? 'Checked in' : 'Checked out' }}</strong>
          at {{ when() | date: 'HH:mm' }}</p>
        @if (action() === 'in' && record()?.status === 'late' && record()?.sessions?.length === 1) { <p class="muted">Marked as late.</p> }
        @if (action() === 'out') { <p class="muted">Worked today: {{ hoursToday() }}</p> }
        <div class="share-prompt">
          <span class="muted">Send it to your WhatsApp group?</span>
          <app-share-day [record]="record()" />
        </div>
        <p class="muted">Scan again later to {{ action() === 'in' ? 'check out' : 'check in again' }}.</p>
      }

      @if (state() === 'error') {
        <div class="error">{{ error() }}</div>
        <p class="muted">Scan the QR code again, or ask your admin for help.</p>
      }

      <p><a routerLink="/">Go to my dashboard</a></p>
    </section>
  `,
})
export class ScanComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private loc = inject(LocationService);

  state = signal<'working' | 'done' | 'error'>('working');
  text = signal('Getting your location…');
  error = signal('');
  action = signal<'in' | 'out'>('in');
  record = signal<AttendanceRecord | null>(null);

  // time of the check-in / check-out that was just recorded (the latest session)
  when() {
    const s = this.record()?.sessions ?? [];
    const last = s[s.length - 1];
    return this.action() === 'in' ? last?.in : last?.out;
  }

  hoursToday() {
    const m = this.record()?.workedMinutes ?? 0;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  async ngOnInit() {
    preloadShareAssets();
    const token = this.route.snapshot.queryParamMap.get('t');
    if (!token) {
      this.error.set('This link has no QR code token.');
      this.state.set('error');
      return;
    }

    this.api.today().subscribe({
      next: async (today) => {
        // scanning toggles: checked in right now -> check out, otherwise -> check in (any number of times a day)
        const s = today?.sessions ?? [];
        const kind: 'in' | 'out' = s.length > 0 && !s[s.length - 1].out ? 'out' : 'in';
        this.action.set(kind);

        const payload: PresencePayload = { qrToken: token };
        const pos = await this.loc.getPosition();
        if (pos) Object.assign(payload, pos);

        this.text.set(kind === 'in' ? 'Checking in…' : 'Checking out…');
        const obs = kind === 'in' ? this.api.checkIn(payload) : this.api.checkOut(payload);
        obs.subscribe({
          next: (r) => { this.record.set(r); this.state.set('done'); },
          error: (e) => { this.error.set(e.error?.message || 'Could not record attendance'); this.state.set('error'); },
        });
      },
      error: () => { this.error.set('Could not load your attendance'); this.state.set('error'); },
    });
  }
}
