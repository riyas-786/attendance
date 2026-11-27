import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { initials } from '../core/initials';
import { ApiService, PayType, Shift, StaffMember, WorkLocation } from '../core/api.service';

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <div class="pay-title">
          <h2>Staff</h2>
          <div class="pay-meta"><span class="muted">Add people, set their pay, duty time and where they may check in.</span></div>
        </div>
        <div class="pay-downloads">
          <a class="btn primary" href="#add-staff">Add staff member</a>
        </div>
      </header>

      <div class="pay-stats">
        <div class="pstat"><span>Active</span><b>{{ countBy('active') }}</b></div>
        <div class="pstat"><span>Inactive</span><b style="color: var(--muted)">{{ staff().length - countBy('active') }}</b></div>
        <div class="pstat"><span>Auto attendance</span><b style="color: var(--warn)">{{ countBy('auto') }}</b></div>
        <div class="pstat net"><span>Total people</span><b>{{ staff().length }}</b></div>
      </div>

      <div class="table-wrap card">
      <table class="plain" style="min-width:980px">
        <thead>
          <tr><th>Employee</th><th>Role</th><th>Pay</th><th>Duty time</th><th>Check-in places</th><th>Phone lock</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          @for (u of staff(); track u._id) {
            <tr [class.inactive-row]="!u.active">
              <td>
                <div class="emp">
                  <span class="avatar" aria-hidden="true">{{ ini(u.name) }}</span>
                  <div class="emp-text"><b>{{ u.name }}</b><span class="muted">{{ u.department || 'No department' }}{{ u.employeeId ? ' · ' + u.employeeId : '' }}</span><span class="muted">{{ u.email }}</span></div>
                </div>
              </td>
              <td><span class="badge" style="text-transform:capitalize">{{ u.role }}</span></td>
              <td>
                @if (u.baseSalary) { <b>{{ u.baseSalary | number: '1.2-2' }}</b><div class="muted">{{ payUnit(u.payType) }}</div> } @else { <span class="muted">—</span> }
              </td>
              <td>{{ shiftLabel(u) }}</td>
              <td>{{ placesLabel(u) }}</td>
              <td>
                @if (u.role !== 'staff') { <span class="muted">—</span> }
                @else if (u.autoAttendance) { <span class="badge late" title="Recorded automatically, no phone needed">Auto attendance</span> }
                @else if (u.deviceLock === false) { <span class="muted">Not locked</span> }
                @else if (u.hasDevice) {
                  <span class="badge present">Registered</span>
                  <button class="btn small" (click)="resetDevice(u)">Reset</button>
                } @else { <span class="muted">Not yet</span> }
              </td>
              <td><span class="badge" [class]="u.active ? 'present' : 'absent'">{{ u.active ? 'active' : 'inactive' }}</span></td>
              <td class="row-actions">
                <button class="btn small" (click)="startEdit(u)">Edit</button>
                <button class="btn small" (click)="toggle(u)">{{ u.active ? 'Deactivate' : 'Activate' }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      </div>
      <p class="muted" style="margin:0">“Default” means the duty time or office from <b>Settings</b> is used.</p>
    </section>

    @if (editing(); as u) {
      <section class="card pay-filters edit-card">
        <div class="emp" style="margin-bottom:16px"><span class="avatar" aria-hidden="true">{{ ini(u.name) }}</span><h3 style="margin:0">Edit {{ u.name }}</h3></div>
        <div class="group">
          <p class="group-title">Pay</p>
          <div class="grid">
            <label>Paid by
              <select [(ngModel)]="e.payType" name="epay">
                <option value="monthly">Monthly salary</option>
                <option value="daily">Per day worked</option>
                <option value="hourly">Per hour worked</option>
              </select>
            </label>
            <label>{{ payLabel(e.payType) }} <input type="number" min="0" step="0.01" [(ngModel)]="e.salary" name="esal" /></label>
            @if (e.payType === 'monthly') {
              <label>Monthly pay method
                <select [(ngModel)]="e.monthlyMethod" name="emethod">
                  <option value="">Use the default (Settings)</option>
                  <option value="fixed">Fixed salary</option>
                  <option value="days">By days present</option>
                </select>
              </label>
            }
            <label>Company <input [(ngModel)]="e.company" name="ecompany" maxlength="60" placeholder="e.g. TP Group" /></label>
            <label>Salary balance paid by
              <select [(ngModel)]="e.salaryMode" name="emode">
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </select>
            </label>
          </div>
        </div>

        @if (u.role === 'accountant') {
          <div class="group">
            <div class="perm-box">
              <b>Accountant permissions</b>
              <span class="muted"> Changes apply the next time they open the app.</span>
              @for (p of permissionOptions; track p.key) {
                <label class="check"><input type="checkbox" [name]="'eperm-' + p.key" [ngModel]="e.permissions.includes(p.key)" (ngModelChange)="e.permissions = togglePerm(e.permissions, p.key)" /> {{ p.label }}</label>
              }
            </div>
          </div>
        }

        <div class="group">
          <p class="group-title">Work</p>
          <div class="grid">
            <label>Join date (optional) <input type="date" [(ngModel)]="e.joinDate" name="ejoin" /></label>
            <label>Duty time (shift)
              <select [(ngModel)]="e.shift" name="eshift">
                <option value="">Default (from Settings)</option>
                @for (s of shifts(); track s._id) { <option [value]="s._id">{{ s.name }} · starts {{ s.workStart }}</option> }
              </select>
            </label>
            <label>WhatsApp number <input type="tel" [(ngModel)]="e.phone" name="ephone" placeholder="country code + number, e.g. 919876543210" /></label>
          </div>
          <div style="margin-top:12px">
            <label class="check"><input type="checkbox" [(ngModel)]="e.autoAttendance" name="eauto" /> Auto attendance (no smartphone): recorded present for their shift every working day. Mark leave or absence on the Overview for the days they do not come.</label>
            <label class="check"><input type="checkbox" [(ngModel)]="e.deviceLock" name="edev" /> Lock to one phone or browser (stops someone else signing in as this person from their own phone)</label>
          </div>
        </div>

        <div class="group">
          <p class="group-title">Where can they check in?</p>
          <label class="check"><input type="checkbox" [(ngModel)]="e.anyLocation" name="eany" /> Anywhere (field or remote staff, no location check)</label>
          @if (!e.anyLocation) {
            <div class="days">
              @for (l of locations(); track l._id) {
                <label class="pill-check">
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

    <section class="card pay-filters" id="add-staff" style="margin-top:18px">
      <h3>Add staff member</h3>
      <form class="grid" (ngSubmit)="add()">
        <input name="name" placeholder="Full name" [(ngModel)]="form.name" required />
        <input name="email" type="email" placeholder="Email" [(ngModel)]="form.email" required />
        <input name="password" type="password" placeholder="Temporary password (min 6)" [(ngModel)]="form.password" required minlength="6" />
        <input name="employeeId" placeholder="Employee ID" [(ngModel)]="form.employeeId" />
        <input name="department" placeholder="Department" [(ngModel)]="form.department" />
        <input name="phone" type="tel" placeholder="WhatsApp number with country code (e.g. 919876543210)" [(ngModel)]="form.phone" />
        <input name="company" placeholder="Company (e.g. TP Group)" [(ngModel)]="form.company" maxlength="60" />
        <select name="salaryMode" [(ngModel)]="form.salaryMode">
          <option value="bank">Salary paid by bank</option>
          <option value="cash">Salary paid in cash</option>
        </select>
        <select name="payType" [(ngModel)]="form.payType">
          <option value="monthly">Paid monthly</option>
          <option value="daily">Paid per day</option>
          <option value="hourly">Paid per hour</option>
        </select>
        <input name="baseSalary" type="number" min="0" step="0.01" [placeholder]="payLabel(form.payType)" [(ngModel)]="form.baseSalary" />
        <label>Join date <input name="joinDate" type="date" [(ngModel)]="form.joinDate" /></label>
        <select name="role" [(ngModel)]="form.role">
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner (view attendance only)</option>
          <option value="accountant">Accountant (you choose what they can use)</option>
        </select>
        @if (form.role === 'accountant') {
          <div class="perm-box" style="grid-column: 1 / -1">
            <b>Accountant permissions</b>
            <span class="muted"> Tick what this accountant may use. Nothing else is visible to them.</span>
            @for (p of permissionOptions; track p.key) {
              <label class="check"><input type="checkbox" [name]="'perm-' + p.key" [ngModel]="form.permissions.includes(p.key)" (ngModelChange)="form.permissions = togglePerm(form.permissions, p.key)" /> {{ p.label }}</label>
            }
          </div>
        }
        <button class="btn primary" type="submit">Add</button>
      </form>
      <p class="muted">After adding, click <b>Edit</b> on the new person to set their duty time and check-in places.</p>
      @if (msg()) { <div class="muted">{{ msg() }}</div> }
    </section>
  `,
})
export class StaffComponent implements OnInit {
  private api = inject(ApiService);
  ini = initials;
  staff = signal<StaffMember[]>([]);
  shifts = signal<Shift[]>([]);
  locations = signal<WorkLocation[]>([]);
  msg = signal('');
  editMsg = signal('');
  editing = signal<StaffMember | null>(null);
  e = { phone: '', permissions: [] as string[], company: '', salaryMode: 'bank' as 'bank' | 'cash', monthlyMethod: '' as '' | 'fixed' | 'days', payType: 'monthly' as PayType, salary: 0 as number | null, joinDate: '', shift: '', anyLocation: false, locations: [] as string[], deviceLock: true, autoAttendance: false };

  // What the admin can allow an accountant to use
  permissionOptions = [
    { key: 'attendance_view', label: 'Attendance overview (view only)' },
    { key: 'attendance_edit', label: 'Attendance: mark leave / absence, half days, accept or reject weekend OT' },
    { key: 'reports', label: 'Reports (view and download)' },
    { key: 'payroll_view', label: 'Payroll (view, download, salary slips)' },
    { key: 'payroll_edit', label: 'Payroll: add or remove extra earnings and deductions' },
    { key: 'salary_summary', label: 'Salary summary' },
    { key: 'leaves', label: 'Leave requests (approve / reject)' },
  ];
  // editing needs viewing: ticking an edit option ticks its view option, and unticking view unticks edit
  togglePerm(list: string[], key: string): string[] {
    const on = list.includes(key);
    let next = on ? list.filter((x) => x !== key) : [...list, key];
    if (!on && key === 'attendance_edit' && !next.includes('attendance_view')) next.push('attendance_view');
    if (!on && key === 'payroll_edit' && !next.includes('payroll_view')) next.push('payroll_view');
    if (on && key === 'attendance_view') next = next.filter((x) => x !== 'attendance_edit');
    if (on && key === 'payroll_view') next = next.filter((x) => x !== 'payroll_edit');
    return next;
  }

  private blank() {
    return {
      name: '', email: '', password: '', employeeId: '', department: '', phone: '',
      role: 'staff' as 'staff' | 'admin' | 'owner' | 'accountant', permissions: [] as string[], company: '', salaryMode: 'bank' as 'bank' | 'cash', payType: 'monthly' as PayType, baseSalary: null as number | null, joinDate: '',
    };
  }
  form = this.blank();

  ngOnInit() {
    this.load();
    this.api.shifts().subscribe((s) => this.shifts.set(s));
    this.api.locations().subscribe((l) => this.locations.set(l));
  }
  load() { this.api.staff().subscribe((s) => this.staff.set(s)); }

  countBy(k: 'active' | 'auto') {
    return this.staff().filter((u) => (k === 'active' ? u.active : !!u.autoAttendance)).length;
  }

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
      phone: u.phone || '',
      permissions: [...(u.permissions ?? [])],
      company: u.company || '',
      salaryMode: u.salaryMode === 'cash' ? 'cash' : 'bank',
      monthlyMethod: u.monthlyMethod || '',
      payType: u.payType || 'monthly',
      salary: u.baseSalary ?? 0,
      joinDate: u.joinDate || '',
      shift: u.shift || '',
      anyLocation: !!u.anyLocation,
      locations: [...(u.locations || [])],
      deviceLock: u.deviceLock !== false,
      autoAttendance: !!u.autoAttendance,
    };
  }

  toggleLocation(id: string) {
    this.e.locations = this.e.locations.includes(id) ? this.e.locations.filter((x) => x !== id) : [...this.e.locations, id];
  }

  saveEdit(u: StaffMember) {
    this.api
      .updateStaff(u._id, {
        payType: this.e.payType,
        phone: this.e.phone.trim(),
        ...(u.role === 'accountant' ? { permissions: this.e.permissions } : {}),
        company: this.e.company.trim(),
        salaryMode: this.e.salaryMode,
        monthlyMethod: this.e.monthlyMethod,
        baseSalary: this.e.salary ?? 0,
        joinDate: this.e.joinDate,
        shift: this.e.shift || null,
        deviceLock: this.e.deviceLock,
        autoAttendance: this.e.autoAttendance,
        anyLocation: this.e.anyLocation,
        locations: this.e.anyLocation ? [] : this.e.locations,
      })
      .subscribe({
        next: () => { this.editing.set(null); this.load(); },
        error: (err) => this.editMsg.set(err.error?.message || 'Could not save'),
      });
  }

  payLabel(t?: PayType) {
    return t === 'daily' ? 'Rate per day' : t === 'hourly' ? 'Rate per hour' : 'Monthly salary';
  }
  payUnit(t?: PayType) {
    return t === 'daily' ? 'per day' : t === 'hourly' ? 'per hour' : 'per month';
  }

  resetDevice(u: StaffMember) {
    if (!confirm(`Reset the registered phone for ${u.name}? Their next sign-in will register a new phone or browser.`)) return;
    this.api.resetDevice(u._id).subscribe(() => this.load());
  }

  toggle(u: StaffMember) {
    this.api.updateStaff(u._id, { active: !u.active }).subscribe(() => this.load());
  }
}
