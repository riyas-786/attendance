import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, LeaveRequest, LeaveType } from '../core/api.service';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-leave',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <h2>Request leave</h2>
      <form class="grid" (ngSubmit)="submit()">
        <label>Type
          <select name="type" [(ngModel)]="form.type">
            <option value="annual">Annual leave</option>
            <option value="sick">Sick leave</option>
            <option value="unpaid">Unpaid leave</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>From <input type="date" name="from" [(ngModel)]="form.from" required /></label>
        <label>To <input type="date" name="to" [(ngModel)]="form.to" required [min]="form.from" /></label>
        <label class="wide">Reason (optional)
          <input type="text" name="reason" [(ngModel)]="form.reason" />
        </label>
        <div><button class="btn primary" type="submit" [disabled]="busy()">Submit request</button></div>
      </form>
      @if (msg()) { <div [class]="isError() ? 'error' : 'muted'">{{ msg() }}</div> }
    </section>

    <section class="card">
      <h3>My requests</h3>
      <table>
        <thead><tr><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Admin note</th><th></th></tr></thead>
        <tbody>
          @for (l of leaves(); track l._id) {
            <tr>
              <td style="text-transform:capitalize">{{ l.type }}</td>
              <td>{{ l.from }}</td>
              <td>{{ l.to }}</td>
              <td><span class="badge" [class]="l.status">{{ l.status }}</span></td>
              <td>{{ l.reviewNote || '—' }}</td>
              <td>
                @if (l.status === 'pending') {
                  <button class="btn small" (click)="cancel(l)">Cancel</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted">No leave requests yet</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class LeaveComponent implements OnInit {
  private api = inject(ApiService);
  leaves = signal<LeaveRequest[]>([]);
  msg = signal('');
  isError = signal(false);
  busy = signal(false);
  form: { type: LeaveType; from: string; to: string; reason: string } = {
    type: 'annual', from: today(), to: today(), reason: '',
  };

  ngOnInit() { this.load(); }
  load() { this.api.myLeaves().subscribe((l) => this.leaves.set(l)); }

  submit() {
    this.busy.set(true);
    this.msg.set('');
    this.api.requestLeave(this.form).subscribe({
      next: () => {
        this.isError.set(false);
        this.msg.set('Request sent. You will see the decision here.');
        this.form.reason = '';
        this.busy.set(false);
        this.load();
      },
      error: (e) => {
        this.isError.set(true);
        this.msg.set(e.error?.message || 'Could not send request');
        this.busy.set(false);
      },
    });
  }

  cancel(l: LeaveRequest) {
    this.api.cancelLeave(l._id).subscribe(() => this.load());
  }
}
