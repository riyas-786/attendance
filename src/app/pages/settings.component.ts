import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AppSettings } from '../core/api.service';
import { TimeFormat, formatClock } from '../core/time-format';

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
          <h2>Company time zone</h2>
          <p class="muted">Days, duty times, late checks, reports and payroll all follow this time zone, whatever country the phones or the server are in. Every screen shows times in it.</p>
          <div class="grid">
            <label>Time zone
              <select name="timezone" [(ngModel)]="v.timezone">
                <optgroup label="Common">
                  @for (z of commonZones; track z.id) { <option [value]="z.id">{{ z.label }}</option> }
                </optgroup>
                @if (!isCommon(v.timezone)) { <option [value]="v.timezone">{{ v.timezone }}</option> }
                <optgroup label="All time zones">
                  @for (z of allZones; track z) { <option [value]="z">{{ z }}</option> }
                </optgroup>
              </select>
            </label>
            <div class="muted" style="align-self:end">Right now there: <b>{{ nowThere(v.timezone) }}</b></div>
          </div>
          <p class="muted">Changing it only affects new check-ins and future days. Records already saved keep the day they were saved under.</p>
        </section>

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
            <label>Pay period starts on day (1 = calendar month)
              <input type="number" name="psd" min="1" max="28" step="1" [(ngModel)]="v.payrollStartDay" required />
            </label>
            <label>Monthly staff are paid
              <select name="mm" [(ngModel)]="v.monthlyMethod">
                <option value="fixed">Fixed salary</option>
                <option value="days">By days present</option>
              </select>
            </label>
            <label>Hours in one paid day (hourly staff)
              <input type="number" name="phd" min="1" max="24" step="0.5" [(ngModel)]="v.payHoursPerDay" required />
            </label>
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
            @if (v.payrollStartDay > 1) {
              Pay month runs from day {{ v.payrollStartDay }} of the previous month to day {{ v.payrollStartDay - 1 }} (for example 20 Oct to 19 Nov is the “November” payroll).
            } @else {
              Pay month is the calendar month (1st to last day).
            }
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
  private tf = inject(TimeFormat);

  commonZones = [
    { id: 'Asia/Kolkata', label: 'India (Asia/Kolkata, UTC+5:30)' },
    { id: 'Asia/Dubai', label: 'UAE / Oman (Asia/Dubai, UTC+4)' },
    { id: 'Asia/Riyadh', label: 'Saudi Arabia / Kuwait / Qatar (Asia/Riyadh, UTC+3)' },
    { id: 'Asia/Karachi', label: 'Pakistan (Asia/Karachi, UTC+5)' },
    { id: 'Asia/Dhaka', label: 'Bangladesh (Asia/Dhaka, UTC+6)' },
    { id: 'Asia/Colombo', label: 'Sri Lanka (Asia/Colombo, UTC+5:30)' },
    { id: 'Asia/Kathmandu', label: 'Nepal (Asia/Kathmandu, UTC+5:45)' },
    { id: 'Asia/Singapore', label: 'Singapore / Malaysia (Asia/Singapore, UTC+8)' },
    { id: 'Asia/Manila', label: 'Philippines (Asia/Manila, UTC+8)' },
    { id: 'Africa/Cairo', label: 'Egypt (Africa/Cairo)' },
    { id: 'Europe/London', label: 'United Kingdom (Europe/London)' },
    { id: 'Europe/Paris', label: 'Central Europe (Europe/Paris)' },
    { id: 'America/New_York', label: 'US Eastern (America/New_York)' },
    { id: 'America/Chicago', label: 'US Central (America/Chicago)' },
    { id: 'America/Los_Angeles', label: 'US Pacific (America/Los_Angeles)' },
    { id: 'Australia/Sydney', label: 'Australia East (Australia/Sydney)' },
    { id: 'UTC', label: 'UTC' },
  ];
  // every zone this browser knows (older browsers: only the common list above)
  allZones: string[] = (() => {
    try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'); }
    catch { return []; }
  })();
  isCommon(id: string) { return this.commonZones.some((z) => z.id === id); }
  nowThere(tz: string) { return formatClock(new Date(), false, this.tf.is24(), tz) || '—'; }

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
        this.tf.setTz(saved.timezone);
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
