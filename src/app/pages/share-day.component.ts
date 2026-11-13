import { Component, computed, inject, input, signal } from '@angular/core';
import { AttendanceRecord } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { copyText, dayMessage, whatsappUrl } from '../core/share';
import { dayImage, shareImage } from '../core/share-image';

// Buttons that send one day's attendance to WhatsApp: as a picture, as text, or copied.
@Component({
  selector: 'app-share-day',
  standalone: true,
  template: `
    <div class="share-row">
      <button class="btn whatsapp" type="button" (click)="sendImage()" [disabled]="busy() || !record()">Share as image</button>
      <a class="btn whatsapp" [href]="url()" target="_blank" rel="noopener">Share as text</a>
      <button class="btn" type="button" (click)="copy()">{{ copied() ? 'Copied' : 'Copy text' }}</button>
    </div>
    @if (msg()) { <p class="muted hint">{{ msg() }}</p> }
  `,
})
export class ShareDayComponent {
  private auth = inject(AuthService);
  record = input<AttendanceRecord | null>(null);

  busy = signal(false);
  copied = signal(false);
  msg = signal('');

  private text = computed(() => {
    const r = this.record();
    return r ? dayMessage(this.auth.user()?.name || '', r) : '';
  });
  url = computed(() => whatsappUrl(this.text()));

  // draws the picture, then opens the phone's share sheet (choose WhatsApp, then the group)
  // or, on a computer, copies it to the clipboard and saves a PNG
  async sendImage() {
    const r = this.record();
    if (!r) return;
    this.busy.set(true);
    this.msg.set('');
    try {
      const blob = await dayImage(this.auth.user()?.name || '', r);
      const res = await shareImage(blob, `attendance-${r.date}.png`);
      if (res === 'saved') this.msg.set('Picture copied and saved. In WhatsApp open the group and paste it (Ctrl+V), or attach the saved file.');
    } catch {
      this.msg.set('Could not create the picture. Please try again.');
    }
    this.busy.set(false);
  }

  async copy() {
    if (await copyText(this.text())) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }
}
