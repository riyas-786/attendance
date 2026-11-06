import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AppSettings } from '../core/api.service';

const DAYS = [
  { n: 0, label: 'Sun' }, { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' },
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (s(); as v) {
      <form (ngSubmit)="save()" (input)="ok.set(false)" (change)="ok.set(false)">
        <section class="card">
          <h2>Default working hours and late rule</h2>
          <p class="muted">Used for staff who have no shift. For different duty times, create shifts on the <b>Locations &amp; shifts</b> page.</p>
          <div class="grid">
            <label>Work day starts at
              <input type="time" name="workStart" [(ngModel)]="v.workStart" required />
            </label>
            <label>Grace period (minutes)
              <input type="number" name="grace" min="0" max="240" [(ngModel)]="v.lateGraceMinutes" required />
            </label>
          </div>
          <p class="muted">A check-in after the start time plus the grace period is marked <b>late</b>.</p>
        </section>

        <section class="card">
          <h2>Default office location</h2>
          <p class="muted">Used for staff who have no location assigned. When set, they can only check in or out within the allowed distance. Leave latitude and longitude empty to switch the check off for them. For several sites, add them on the <b>Locations &amp; shifts</b> page.</p>
          <div class="grid">
            <label>Latitude <input type="number" name="lat" step="any" [(ngModel)]="v.officeLat" /></label>
            <label>Longitude <input type="number" name="lng" step="any" [(ngModel)]="v.officeLng" /></label>
            <label>Allowed distance (metres) <input type="number" name="radius" min="10" [(ngModel)]="v.officeRadiusMeters" /></label>
          </div>
          <div class="actions left" style="margin-top:12px">
            <button class="btn" type="button" (click)="useMyLocation()" [disabled]="locating()">
              {{ locating() ? 'Getting location…' : 'Use my current location' }}
            </button>
            <button class="btn" type="button" (click)="clearLocation()">Switch location check off</button>
          </div>
          <p class="muted">Tip: stand in the office, open this page on your phone or laptop and press “Use my current location”.</p>
        </section>

        <section class="card">
          <h2>QR code</h2>
          <div class="grid">
            <label class="check"><input type="checkbox" name="reqqr" [(ngModel)]="v.requireQr" /> Staff must scan the QR code to check in or out</label>
            <label>QR changes every (minutes) <input type="number" name="qrwin" min="1" max="60" [(ngModel)]="v.qrWindowMinutes" required /></label>
            <label class="wide">App address the QR code opens
              <input type="url" name="url" [(ngModel)]="v.frontendUrl" required placeholder="http://192.168.1.20:4200" />
            </label>
          </div>
          <p class="muted">Use an address that staff phones can reach (not <code>localhost</code>).</p>
        </section>

        <section class="card">
          <h2>Weekends and holidays</h2>
          <p class="muted">Days off are not counted as working days in payroll.</p>
          <div class="days">
            @for (d of days; track d.n) {
              <label class="check pill"><input type="checkbox" [name]="'d' + d.n" [checked]="v.weekendDays.includes(d.n)" (change)="toggleDay(d.n)" /> {{ d.label }}</label>
            }
          </div>
          <div class="filters" style="margin-top:14px">
            <label>Add a public holiday <input type="date" name="newHoliday" [(ngModel)]="newHoliday" /></label>
            <button class="btn" type="button" (click)="addHoliday()" [disabled]="!newHoliday">Add</button>
          </div>
          <div class="days">
            @for (h of v.holidays; track h) {
              <span class="chip">{{ h }} <button type="button" class="x" (click)="removeHoliday(h)" aria-label="Remove">×</button></span>
            } @empty {
              <span class="muted">No holidays added</span>
            }
          </div>
        </section>

        <section class="card">
          <h2>Salary deductions</h2>
          <div class="grid">
            <label>Currency <input type="text" name="cur" maxlength="8" [(ngModel)]="v.salaryCurrency" required /></label>
            <label>Days of pay deducted per absent day
              <input type="number" name="abs" min="0" max="10" step="0.25" [(ngModel)]="v.absentDeductionFactor" required />
            </label>
            <label>Late arrivals per penalty (0 = no late deduction)
              <input type="number" name="lthr" min="0" max="100" step="1" [(ngModel)]="v.lateCountThreshold" required />
            </label>
            <label>Days of pay deducted per penalty
              <input type="number" name="ldays" min="0" max="10" step="0.25" [(ngModel)]="v.lateDeductionDays" required />
            </label>
          </div>
          <p class="muted">
            @if (v.lateCountThreshold > 0) {
              Example: every {{ v.lateCountThreshold }} late arrivals in a month deduct {{ v.lateDeductionDays }} day of pay.
            } @else {
              Late arrivals are not deducted.
            }
            Unpaid leave always deducts 1 day per day.
          </p>
        </section>

        <div class="savebar">
          <button class="btn primary big" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
          @if (ok()) { <span class="saved">Saved. Changes apply immediately.</span> }
          @if (error()) { <span class="error" style="margin:0">{{ error() }}</span> }
        </div>
      </form>
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class SettingsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private hideTimer?: ReturnType<typeof setTimeout>;
  ngOnDestroy() { clearTimeout(this.hideTimer); }
  s = signal<AppSettings | null>(null);
  days = DAYS;
  newHoliday = '';
  saving = signal(false);
  locating = signal(false);
  ok = signal(false);
  error = signal('');

  ngOnInit() {
    this.api.settings().subscribe({
      next: (v) => this.s.set(v),
      error: (e) => this.error.set(e.error?.message || 'Could not load settings'),
    });
  }

  toggleDay(n: number) {
    const v = this.s()!;
    v.weekendDays = v.weekendDays.includes(n) ? v.weekendDays.filter((x) => x !== n) : [...v.weekendDays, n].sort((a, b) => a - b);
  }

  addHoliday() {
    const v = this.s()!;
    if (this.newHoliday && !v.holidays.includes(this.newHoliday)) v.holidays = [...v.holidays, this.newHoliday].sort();
    this.newHoliday = '';
  }

  removeHoliday(h: string) {
    const v = this.s()!;
    v.holidays = v.holidays.filter((x) => x !== h);
  }

  useMyLocation() {
    const v = this.s()!;
    if (!('geolocation' in navigator)) { this.error.set('This browser cannot share its location'); return; }
    this.error.set('');
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        v.officeLat = Number(p.coords.latitude.toFixed(6));
        v.officeLng = Number(p.coords.longitude.toFixed(6));
        this.locating.set(false);
      },
      () => { this.error.set('Could not get your location. Allow location access and try again.'); this.locating.set(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  clearLocation() {
    const v = this.s()!;
    v.officeLat = null;
    v.officeLng = null;
  }

  save() {
    const v = this.s()!;
    this.ok.set(false);
    this.error.set('');
    this.saving.set(true);
    // empty number inputs arrive as null/'' -> send null so the server treats the location as off
    const body: AppSettings = {
      ...v,
      officeLat: v.officeLat === null || (v.officeLat as unknown) === '' ? null : Number(v.officeLat),
      officeLng: v.officeLng === null || (v.officeLng as unknown) === '' ? null : Number(v.officeLng),
    };
    this.api.saveSettings(body).subscribe({
      next: (saved) => {
        this.s.set(saved);
        this.ok.set(true);
        this.saving.set(false);
        // the green note hides itself after a few seconds
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.ok.set(false), 3000);
      },
      error: (e) => { this.error.set(e.error?.message || 'Could not save settings'); this.saving.set(false); },
    });
  }
}
