import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Shift, WorkLocation } from '../core/api.service';

@Component({
  selector: 'app-sites',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <h2>Work locations</h2>
      <p class="muted">Places where staff may check in and out. Assign them to people on the <b>Staff</b> page. Staff with no location assigned use the default office from <b>Settings</b>.</p>

      <table>
        <thead><tr><th>Name</th><th>Latitude</th><th>Longitude</th><th>Allowed distance</th><th>Staff</th><th></th></tr></thead>
        <tbody>
          @for (l of locations(); track l._id) {
            <tr>
              <td>{{ l.name }}</td><td>{{ l.lat }}</td><td>{{ l.lng }}</td><td>{{ l.radiusMeters }} m</td><td>{{ l.staffCount }}</td>
              <td>
                <button class="btn small" (click)="editLocation(l)">Edit</button>
                <button class="btn small" (click)="removeLocation(l)">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted">No locations yet</td></tr>
          }
        </tbody>
      </table>

      <h3 style="margin-top:18px">{{ locForm.id ? 'Edit location' : 'Add a location' }}</h3>
      <form class="grid" (ngSubmit)="saveLocation()">
        <input name="lname" placeholder="Name (e.g. Head office)" [(ngModel)]="locForm.name" required />
        <input name="llat" type="number" step="any" placeholder="Latitude" [(ngModel)]="locForm.lat" required />
        <input name="llng" type="number" step="any" placeholder="Longitude" [(ngModel)]="locForm.lng" required />
        <input name="lrad" type="number" min="10" placeholder="Allowed distance (m)" [(ngModel)]="locForm.radiusMeters" required />
        <div class="actions left">
          <button class="btn primary" type="submit">{{ locForm.id ? 'Save' : 'Add location' }}</button>
          <button class="btn" type="button" (click)="useMyLocation()" [disabled]="locating()">{{ locating() ? 'Getting…' : 'Use my current location' }}</button>
          @if (locForm.id) { <button class="btn" type="button" (click)="resetLocation()">Cancel</button> }
        </div>
      </form>
      <p class="muted">Tip: stand at the place, open this page on your phone and press “Use my current location”.</p>
      @if (locMsg()) { <div [class]="locErr() ? 'error' : 'muted'">{{ locMsg() }}</div> }
    </section>

    <section class="card">
      <h2>Shifts (duty times)</h2>
      <p class="muted">A check-in after the shift start plus the grace period is marked late. Staff with no shift use the default duty time from <b>Settings</b>.</p>

      <table>
        <thead><tr><th>Name</th><th>Starts</th><th>Grace</th><th>Staff</th><th></th></tr></thead>
        <tbody>
          @for (s of shifts(); track s._id) {
            <tr>
              <td>{{ s.name }}</td><td>{{ s.workStart }}</td><td>{{ s.graceMinutes }} min</td><td>{{ s.staffCount }}</td>
              <td>
                <button class="btn small" (click)="editShift(s)">Edit</button>
                <button class="btn small" (click)="removeShift(s)">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="muted">No shifts yet</td></tr>
          }
        </tbody>
      </table>

      <h3 style="margin-top:18px">{{ shiftForm.id ? 'Edit shift' : 'Add a shift' }}</h3>
      <form class="grid" (ngSubmit)="saveShift()">
        <input name="sname" placeholder="Name (e.g. Evening)" [(ngModel)]="shiftForm.name" required />
        <label>Starts at <input name="sstart" type="time" [(ngModel)]="shiftForm.workStart" required /></label>
        <label>Grace (minutes) <input name="sgrace" type="number" min="0" max="240" [(ngModel)]="shiftForm.graceMinutes" required /></label>
        <div class="actions left">
          <button class="btn primary" type="submit">{{ shiftForm.id ? 'Save' : 'Add shift' }}</button>
          @if (shiftForm.id) { <button class="btn" type="button" (click)="resetShift()">Cancel</button> }
        </div>
      </form>
      @if (shiftMsg()) { <div [class]="shiftErr() ? 'error' : 'muted'">{{ shiftMsg() }}</div> }
    </section>
  `,
})
export class SitesComponent implements OnInit {
  private api = inject(ApiService);

  locations = signal<WorkLocation[]>([]);
  shifts = signal<Shift[]>([]);
  locating = signal(false);
  locMsg = signal(''); locErr = signal(false);
  shiftMsg = signal(''); shiftErr = signal(false);

  locForm = this.blankLoc();
  shiftForm = this.blankShift();

  private blankLoc() { return { id: '', name: '', lat: null as number | null, lng: null as number | null, radiusMeters: 200 }; }
  private blankShift() { return { id: '', name: '', workStart: '09:00', graceMinutes: 0 }; }

  ngOnInit() { this.load(); }
  load() {
    this.api.locations().subscribe((l) => this.locations.set(l));
    this.api.shifts().subscribe((s) => this.shifts.set(s));
  }

  // ---- locations ----
  editLocation(l: WorkLocation) {
    this.locForm = { id: l._id, name: l.name, lat: l.lat, lng: l.lng, radiusMeters: l.radiusMeters };
    this.locMsg.set('');
  }
  resetLocation() { this.locForm = this.blankLoc(); }

  useMyLocation() {
    if (!('geolocation' in navigator)) { this.locErr.set(true); this.locMsg.set('This browser cannot share its location'); return; }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.locForm.lat = Number(p.coords.latitude.toFixed(6));
        this.locForm.lng = Number(p.coords.longitude.toFixed(6));
        this.locating.set(false);
      },
      () => { this.locErr.set(true); this.locMsg.set('Could not get your location. Allow location access and try again.'); this.locating.set(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  saveLocation() {
    const f = this.locForm;
    const body = { name: f.name, lat: Number(f.lat), lng: Number(f.lng), radiusMeters: Number(f.radiusMeters) };
    const req = f.id ? this.api.updateLocation(f.id, body) : this.api.addLocation(body);
    req.subscribe({
      next: () => { this.locErr.set(false); this.locMsg.set('Saved'); this.resetLocation(); this.load(); },
      error: (e) => { this.locErr.set(true); this.locMsg.set(e.error?.message || 'Could not save'); },
    });
  }

  removeLocation(l: WorkLocation) {
    const note = l.staffCount ? ` It will be removed from ${l.staffCount} staff member(s).` : '';
    if (!confirm(`Delete location “${l.name}”?${note}`)) return;
    this.api.deleteLocation(l._id).subscribe({ next: () => this.load(), error: (e) => { this.locErr.set(true); this.locMsg.set(e.error?.message || 'Could not delete'); } });
  }

  // ---- shifts ----
  editShift(s: Shift) {
    this.shiftForm = { id: s._id, name: s.name, workStart: s.workStart, graceMinutes: s.graceMinutes };
    this.shiftMsg.set('');
  }
  resetShift() { this.shiftForm = this.blankShift(); }

  saveShift() {
    const f = this.shiftForm;
    const body = { name: f.name, workStart: f.workStart, graceMinutes: Number(f.graceMinutes) };
    const req = f.id ? this.api.updateShift(f.id, body) : this.api.addShift(body);
    req.subscribe({
      next: () => { this.shiftErr.set(false); this.shiftMsg.set('Saved'); this.resetShift(); this.load(); },
      error: (e) => { this.shiftErr.set(true); this.shiftMsg.set(e.error?.message || 'Could not save'); },
    });
  }

  removeShift(s: Shift) {
    const note = s.staffCount ? ` ${s.staffCount} staff member(s) will go back to the default duty time.` : '';
    if (!confirm(`Delete shift “${s.name}”?${note}`)) return;
    this.api.deleteShift(s._id).subscribe({ next: () => this.load(), error: (e) => { this.shiftErr.set(true); this.shiftMsg.set(e.error?.message || 'Could not delete'); } });
  }
}
