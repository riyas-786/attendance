import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, LeaveRequest } from '../core/api.service';
import { initials } from '../core/initials';

@Component({
  selector: 'app-leave-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <div class="pay-title">
          <h2>Leave requests</h2>
          <div class="pay-meta">
            <span class="muted">{{ leaves().length }} request{{ leaves().length === 1 ? '' : 's' }} shown</span>
          </div>
        </div>
        <div class="chips-row">
          @for (o of options; track o.key) {
            <button type="button" class="pill-btn" [class.on]="filter === o.key" (click)="filter = o.key; load()">{{ o.label }}</button>
          }
        </div>
      </header>

      @if (msg()) { <div class="error">{{ msg() }}</div> }

      <div class="table-wrap card">
        <table class="plain" style="min-width:860px">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead>
          <tbody>
            @for (l of leaves(); track l._id) {
              <tr>
                <td>
                  <div class="emp">
                    <span class="avatar" aria-hidden="true">{{ ini(l.user?.name || '') }}</span>
                    <div class="emp-text"><b>{{ l.user?.name }}</b><span class="muted">{{ l.user?.department || 'No department' }}</span></div>
                  </div>
                </td>
                <td><span class="badge leave" style="text-transform:capitalize">{{ l.type }}</span></td>
                <td style="white-space:nowrap">
                  <b>{{ l.from }}</b>@if (l.to !== l.from) { <span class="muted"> → </span><b>{{ l.to }}</b> }
                  <div class="muted">{{ days(l) }} day{{ days(l) === 1 ? '' : 's' }}</div>
                </td>
                <td style="max-width:240px">{{ l.reason || '—' }}</td>
                <td><span class="badge" [class]="l.status">{{ l.status }}</span></td>
                <td>
                  @if (l.status === 'pending') {
                    <div class="decide">
                      <input class="note" type="text" placeholder="Note (optional)" [(ngModel)]="notes[l._id]" />
                      <button class="btn small primary" (click)="decide(l, 'approved')">Approve</button>
                      <button class="btn small" (click)="decide(l, 'rejected')">Reject</button>
                    </div>
                  } @else {
                    <span class="muted">{{ l.reviewedBy?.name }}{{ l.reviewNote ? ' · ' + l.reviewNote : '' }}</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">Nothing here</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class LeaveAdminComponent implements OnInit {
  private api = inject(ApiService);
  leaves = signal<LeaveRequest[]>([]);
  msg = signal('');
  filter = 'pending';
  ini = initials;
  options = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: '', label: 'All' },
  ];
  // number of days in the request, both ends included
  days(l: LeaveRequest) {
    return Math.round((Date.parse(l.to) - Date.parse(l.from)) / 86400000) + 1;
  }
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
