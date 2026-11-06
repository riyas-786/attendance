import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, LeaveRequest } from '../core/api.service';

@Component({
  selector: 'app-leave-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <div class="row-between">
        <h2>Leave requests</h2>
        <label>Show
          <select [(ngModel)]="filter" (change)="load()">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      @if (msg()) { <div class="error">{{ msg() }}</div> }

      <table>
        <thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead>
        <tbody>
          @for (l of leaves(); track l._id) {
            <tr>
              <td>{{ l.user?.name }}<div class="muted">{{ l.user?.department }}</div></td>
              <td style="text-transform:capitalize">{{ l.type }}</td>
              <td>{{ l.from }}</td>
              <td>{{ l.to }}</td>
              <td>{{ l.reason || '—' }}</td>
              <td><span class="badge" [class]="l.status">{{ l.status }}</span></td>
              <td>
                @if (l.status === 'pending') {
                  <input class="note" type="text" placeholder="Note (optional)" [(ngModel)]="notes[l._id]" />
                  <button class="btn small primary" (click)="decide(l, 'approved')">Approve</button>
                  <button class="btn small" (click)="decide(l, 'rejected')">Reject</button>
                } @else {
                  <span class="muted">{{ l.reviewedBy?.name }}{{ l.reviewNote ? ' · ' + l.reviewNote : '' }}</span>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="muted">Nothing here</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class LeaveAdminComponent implements OnInit {
  private api = inject(ApiService);
  leaves = signal<LeaveRequest[]>([]);
  msg = signal('');
  filter = 'pending';
  notes: Record<string, string> = {};

  ngOnInit() { this.load(); }
  load() { this.api.allLeaves(this.filter).subscribe((l) => this.leaves.set(l)); }

  decide(l: LeaveRequest, decision: 'approved' | 'rejected') {
    this.msg.set('');
    this.api.reviewLeave(l._id, decision, this.notes[l._id] || '').subscribe({
      next: () => this.load(),
      error: (e) => { this.msg.set(e.error?.message || 'Could not save decision'); this.load(); },
    });
  }
}
