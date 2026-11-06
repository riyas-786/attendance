import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Shift, StaffMember, WorkLocation } from '../core/api.service';

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="card">
      <h2>Staff</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Dept</th><th>Role</th><th>Salary</th><th>Duty time</th><th>Check-in places</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          @for (u of staff(); track u._id) {
            <tr>
              <td>{{ u.name }}<div class="muted">{{ u.email }}{{ u.employeeId ? ' · ' + u.employeeId : '' }}</div></td>
              <td>{{ u.department || '—' }}</td>
              <td>{{ u.role }}</td>
              <td>{{ u.baseSalary ? (u.baseSalary | number: '1.2-2') : '—' }}</td>
              <td>{{ shiftLabel(u) }}</td>
              <td>{{ placesLabel(u) }}</td>
              <td><span class="badge" [class]="u.active ? 'present' : 'absent'">{{ u.active ? 'active' : 'inactive' }}</span></td>
              <td>
                <button class="btn small" (click)="startEdit(u)">Edit</button>
                <button class="btn small" (click)="toggle(u)">{{ u.active ? 'Deactivate' : 'Activate' }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      <p class="muted">“Default” means the duty time or office from <b>Settings</b> is used.</p>
    </section>

    @if (editing(); as u) {
      <section class="card edit-card">
        <h3>Edit {{ u.name }}</h3>
        <div class="grid">
          <label>Monthly salary <input type="number" min="0" step="0.01" [(ngModel)]="e.salary" name="esal" /></label>
          <label>Join date (optional) <input type="date" [(ngModel)]="e.joinDate" name="ejoin" /></label>
          <label>Duty time (shift)
            <select [(ngModel)]="e.shift" name="eshift">
              <option value="">Default (from Settings)</option>
              @for (s of shifts(); track s._id) { <option [value]="s._id">{{ s.name }} · starts {{ s.workStart }}</option> }
            </select>
          </label>
        </div>

        <div style="margin-top:12px">
          <b>Where can they check in?</b>
          <label class="check"><input type="checkbox" [(ngModel)]="e.anyLocation" name="eany" /> Anywhere (field or remote staff, no location check)</label>
          @if (!e.anyLocation) {
            <div class="days">
              @for (l of locations(); track l._id) {
                <label class="check pill">
                  <input type="checkbox" [checked]="e.locations.includes(l._id)" (change)="toggleLocation(l._id)" [name]="'loc' + l._id" />
                  {{ l.name }}
                </label>
              } @empty {
                <span class="muted">No locations yet. Add them on the “Locations &amp; shifts” page.</span>
              }
            </div>
            <p class="muted">They can check in at any ticked place. If none is ticked, the default office from Settings is used.</p>
          }
        </div>

        <div class="actions left" style="margin-top:14px">
          <button class="btn primary" (click)="saveEdit(u)">Save</button>
          <button class="btn" (click)="editing.set(null)">Cancel</button>
        </div>
        @if (editMsg()) { <div class="error">{{ editMsg() }}</div> }
      </section>
    }

    <section class="card">
      <h3>Add staff member</h3>
      <form class="grid" (ngSubmit)="add()">
        <input name="name" placeholder="Full name" [(ngModel)]="form.name" required />
        <input name="email" type="email" placeholder="Email" [(ngModel)]="form.email" required />
        <input name="password" type="password" placeholder="Temporary password (min 6)" [(ngModel)]="form.password" required minlength="6" />
        <input name="employeeId" placeholder="Employee ID" [(ngModel)]="form.employeeId" />
        <input name="department" placeholder="Department" [(ngModel)]="form.department" />
        <input name="baseSalary" type="number" min="0" step="0.01" placeholder="Monthly salary" [(ngModel)]="form.baseSalary" />
        <label>Join date <input name="joinDate" type="date" [(ngModel)]="form.joinDate" /></label>
        <select name="role" [(ngModel)]="form.role">
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <button class="btn primary" type="submit">Add</button>
      </form>
      <p class="muted">After adding, click <b>Edit</b> on the new person to set their duty time and check-in places.</p>
      @if (msg()) { <div class="muted">{{ msg() }}</div> }
    </section>
  `,
})
export class StaffComponent implements OnInit {
  private api = inject(ApiService);
  staff = signal<StaffMember[]>([]);
  shifts = signal<Shift[]>([]);
  locations = signal<WorkLocation[]>([]);
  msg = signal('');
  editMsg = signal('');
  editing = signal<StaffMember | null>(null);
  e = { salary: 0 as number | null, joinDate: '', shift: '', anyLocation: false, locations: [] as string[] };

  private blank() {
    return {
      name: '', email: '', password: '', employeeId: '', department: '',
      role: 'staff' as 'staff' | 'admin', baseSalary: null as number | null, joinDate: '',
    };
  }
  form = this.blank();

  ngOnInit() {
    this.load();
    this.api.shifts().subscribe((s) => this.shifts.set(s));
    this.api.locations().subscribe((l) => this.locations.set(l));
  }
  load() { this.api.staff().subscribe((s) => this.staff.set(s)); }

  shiftLabel(u: StaffMember) {
    if (!u.shift) return 'Default';
    const s = this.shifts().find((x) => x._id === u.shift);
    return s ? `${s.name} (${s.workStart})` : 'Default';
  }

  placesLabel(u: StaffMember) {
    if (u.anyLocation) return 'Anywhere';
    const names = (u.locations || []).map((id) => this.locations().find((l) => l._id === id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'Default';
  }

  add() {
    const { baseSalary, ...rest } = this.form;
    this.api.addStaff({ ...rest, ...(baseSalary !== null ? { baseSalary } : {}) }).subscribe({
      next: () => {
        this.msg.set('Staff member added');
        this.form = this.blank();
        this.load();
      },
      error: (e) => this.msg.set(e.error?.message || 'Could not add staff member'),
    });
  }

  startEdit(u: StaffMember) {
    this.editMsg.set('');
    this.editing.set(u);
    this.e = {
      salary: u.baseSalary ?? 0,
      joinDate: u.joinDate || '',
      shift: u.shift || '',
      anyLocation: !!u.anyLocation,
      locations: [...(u.locations || [])],
    };
  }

  toggleLocation(id: string) {
    this.e.locations = this.e.locations.includes(id) ? this.e.locations.filter((x) => x !== id) : [...this.e.locations, id];
  }

  saveEdit(u: StaffMember) {
    this.api
      .updateStaff(u._id, {
        baseSalary: this.e.salary ?? 0,
        joinDate: this.e.joinDate,
        shift: this.e.shift || null,
        anyLocation: this.e.anyLocation,
        locations: this.e.anyLocation ? [] : this.e.locations,
      })
      .subscribe({
        next: () => { this.editing.set(null); this.load(); },
        error: (err) => this.editMsg.set(err.error?.message || 'Could not save'),
      });
  }

  toggle(u: StaffMember) {
    this.api.updateStaff(u._id, { active: !u.active }).subscribe(() => this.load());
  }
}
