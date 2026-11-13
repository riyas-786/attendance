import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AttendanceRecord } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { dayMessage, rangeMessage, whatsappUrl } from '../core/share';
import { dayImage, preloadShareAssets, rangeImage, shareImage } from '../core/share-image';

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
        @if (rows().length) {
          <a class="btn whatsapp" [href]="wa(allText())" target="_blank" rel="noopener">Share list to WhatsApp</a>
          <button class="btn whatsapp" type="button" (click)="listImage()" [disabled]="busy()">Share list as image</button>
        }
      </div>
      @if (msg()) { <p class="muted hint">{{ msg() }}</p> }

      <table>
        <thead><tr><th>Date</th><th>Check in / out</th><th>Total hours</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r._id) {
            <tr>
              <td>{{ r.date }}</td>
              <td>
                @for (s of r.sessions ?? []; track $index) {
                  <div>{{ s.in | date: 'HH:mm' }} – {{ s.out ? (s.out | date: 'HH:mm') : 'in' }}</div>
                } @empty { — }
              </td>
              <td>{{ r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : '—' }}</td>
              <td><span class="badge" [class]="r.status">{{ r.status }}</span></td>
              <td class="share-cell">
                <a class="btn small whatsapp" [href]="wa(dayText(r))" target="_blank" rel="noopener">Share</a>
                <button class="btn small whatsapp" type="button" (click)="dayPicture(r)" [disabled]="busy()">Image</button>
              </td>
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
  private auth = inject(AuthService);
  rows = signal<AttendanceRecord[]>([]);
  busy = signal(false);
  msg = signal('');
  from = '';
  to = '';

  ngOnInit() { preloadShareAssets(); this.load(); }

  private async send(make: () => Promise<Blob>, fileName: string) {
    this.busy.set(true);
    this.msg.set('');
    try {
      const res = await shareImage(await make(), fileName);
      if (res === 'saved') this.msg.set('Picture copied and saved. In WhatsApp open the group and paste it (Ctrl+V), or attach the saved file.');
    } catch {
      this.msg.set('Could not create the picture. Please try again.');
    }
    this.busy.set(false);
  }
  dayPicture(r: AttendanceRecord) { return this.send(() => dayImage(this.name(), r), `attendance-${r.date}.png`); }
  listImage() { return this.send(() => rangeImage(this.name(), this.rows(), this.from, this.to), 'attendance-list.png'); }
  wa = whatsappUrl;
  private name() { return this.auth.user()?.name || ''; }
  dayText(r: AttendanceRecord) { return dayMessage(this.name(), r); }
  allText() { return rangeMessage(this.name(), this.rows(), this.from, this.to); }

  load() { this.api.myHistory(this.from, this.to).subscribe((r) => this.rows.set(r)); }
}
