import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-qr',
  standalone: true,
  template: `
    <section class="card center">
      <h2>Office QR code</h2>
      <p class="muted">Show this on a screen at the entrance. Staff scan it with their phone camera, sign in, and are checked in (or out).</p>

      @if (image()) {
        <img class="qr" [src]="image()" alt="Check-in QR code" />
        <p class="muted">Changes automatically · refreshes in {{ left() }}s</p>
      } @else if (error()) {
        <div class="error">{{ error() }}</div>
      } @else {
        <p class="muted">Loading…</p>
      }
    </section>
  `,
})
export class QrComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  image = signal('');
  left = signal(0);
  error = signal('');
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => {
      if (this.left() <= 1) this.load();
      else this.left.update((v) => v - 1);
    }, 1000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  private load() {
    this.api.currentQr().subscribe({
      next: (r) => { this.image.set(r.image); this.left.set(r.secondsLeft); this.error.set(''); },
      error: () => this.error.set('Could not load the QR code'),
    });
  }
}
