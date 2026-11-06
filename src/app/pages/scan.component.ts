import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, AttendanceRecord, PresencePayload } from '../core/api.service';
import { LocationService } from '../core/location.service';

// Opened when staff scan the office QR code with their phone camera: /scan?t=TOKEN
@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="card center">
      <h2>Office QR scan</h2>

      @if (state() === 'working') { <p class="muted">{{ text() }}</p> }

      @if (state() === 'done') {
        <div class="big-icon ok">✓</div>
        <p><strong>{{ action() === 'in' ? 'Checked in' : 'Checked out' }}</strong>
          at {{ (action() === 'in' ? record()?.checkIn : record()?.checkOut) | date: 'HH:mm' }}</p>
        @if (action() === 'in' && record()?.status === 'late') { <p class="muted">Marked as late.</p> }
      }

      @if (state() === 'already') {
        <div class="big-icon ok">✓</div>
        <p>You have already checked in and out today.</p>
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

  state = signal<'working' | 'done' | 'already' | 'error'>('working');
  text = signal('Getting your location…');
  error = signal('');
  action = signal<'in' | 'out'>('in');
  record = signal<AttendanceRecord | null>(null);

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('t');
    if (!token) {
      this.error.set('This link has no QR code token.');
      this.state.set('error');
      return;
    }

    this.api.today().subscribe({
      next: async (today) => {
        if (today?.checkIn && today.checkOut) return this.state.set('already');

        const kind: 'in' | 'out' = today?.checkIn ? 'out' : 'in';
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
