import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, SalarySummary } from '../core/api.service';
import { initials } from '../core/initials';

const dmy = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Salary summary: total salary, advance already paid, balance to pay, how it is paid (cash / bank),
// the money ready, and how much more is needed. Prints on one page.
@Component({
  selector: 'app-salary-summary',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  styles: [`
    .head { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: flex-end; justify-content: space-between; margin-bottom: 18px; }
    .head h1 { margin: 0 0 4px; font-size: 28px; }
    .tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .tools label { display: grid; gap: 4px; font-size: 13px; color: var(--label); font-weight: 600; }

    .flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 10px; align-items: stretch; margin-bottom: 18px; }
    .flow.four { grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; }
    .op { align-self: center; font-size: 26px; font-weight: 700; color: var(--muted); }
    .tile { border-radius: var(--radius); padding: 16px 18px; border: 1px solid var(--line); background: var(--card); }
    .tile .k { font-size: 12.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
    .tile .v { font-family: var(--display); font-size: 30px; font-weight: 700; margin-top: 6px; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
    .tile .s { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .tile.adv { background: var(--bad-soft); border-color: transparent; } .tile.adv .v { color: var(--bad); }
    .tile.bal { background: var(--ok-soft); border-color: transparent; } .tile.bal .v { color: var(--ok); font-size: 34px; }
    .tile.oth { background: var(--warn-soft); border-color: transparent; } .tile.oth .v { color: var(--warn); }

    .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    .pay { border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; background: var(--surface-2); }
    .pay .top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .pay .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.cash { background: #e08a00; } .dot.bank { background: #3a49c9; }
    .pay .amt { font-family: var(--display); font-size: 28px; font-weight: 700; margin: 6px 0 10px; font-variant-numeric: tabular-nums; }
    .bar { height: 8px; border-radius: 99px; background: var(--chip); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 99px; }
    .bar i.cash { background: #e08a00; } .bar i.bank { background: #3a49c9; }

    .funds { width: 100%; border-collapse: separate; border-spacing: 0; }
    .funds th, .funds td { padding: 12px 10px; border-bottom: 1px solid var(--line-soft); text-align: right; white-space: nowrap; }
    .funds th:first-child, .funds td:first-child { text-align: left; }
    .funds input { width: 150px; text-align: right; font-variant-numeric: tabular-nums; }
    .need { margin-top: 16px; border-radius: var(--radius); padding: 16px 20px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 20px; }
    .need.short { background: var(--bad-soft); color: var(--bad); }
    .need.ok { background: var(--ok-soft); color: var(--ok); }
    .need .big { font-family: var(--display); font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .need .lbl { font-weight: 700; }
    .need .sub { font-size: 14px; opacity: .9; }

    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .chip { border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); border-radius: 99px; padding: 5px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .chip.on { background: var(--ink); color: var(--card); border-color: var(--ink); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th.num { text-align: right; }
    .scroll { overflow-x: auto; }
    .badge.cash { background: var(--warn-soft); color: var(--warn); } .badge.bank { background: var(--info-soft); color: var(--info); }
    .neg { color: var(--bad); }
    @media (max-width: 760px) {
      .flow, .flow.four { grid-template-columns: 1fr; }
      .op { display: none; }
      .tile .v, .tile.bal .v { font-size: 26px; }
      .funds input { width: 110px; }
    }
    @media print {
      .tile, .pay, .need { break-inside: avoid; }
      .scroll { overflow: visible; }
    }
  `],
  template: `
    <header class="pay-head" style="margin-bottom:18px">
      <div class="pay-title">
        <h2>Salary summary</h2>
        @if (d(); as s) {
          <div class="pay-meta">
            <span class="period-pill">{{ pretty(s.period.from) }} – {{ pretty(s.period.to) }}</span>
            <span class="badge" [class]="s.period.inProgress ? 'late' : 'present'" style="text-transform:none">{{ s.period.inProgress ? 'In progress' : 'Period ended' }}</span>
            <span class="muted">{{ s.company }} · amounts in {{ s.currency }}</span>
          </div>
        }
      </div>
      <div class="tools no-print">
        <label>Pay month <input type="month" [(ngModel)]="month" name="month" (change)="load()" /></label>
        <button class="btn" type="button" (click)="print()" [disabled]="!d()">Print</button>
        <button class="btn primary" type="button" (click)="download()" [disabled]="!d() || busy()">{{ busy() ? 'Preparing…' : 'Download Excel' }}</button>
      </div>
    </header>

    @if (error()) { <p class="card" style="color: var(--bad)">{{ error() }}</p> }

    @if (d(); as s) {
      @if (s.period.inProgress) {
        <p class="card" style="background: var(--warn-soft); color: var(--warn); border-color: transparent">This pay period is still running, so the figures are “so far”. They update as attendance and advances are added.</p>
      }

      <!-- 1. salary - advance = balance -->
      <div class="flow" [class.four]="s.totals.otherDeductions > 0">
        <div class="tile"><div class="k">Total salary</div><div class="v">{{ s.totals.earned | number: '1.0-2' }}</div><div class="s">{{ s.totals.staff }} staff</div></div>
        <div class="op">−</div>
        <div class="tile adv"><div class="k">Advance paid</div><div class="v">{{ s.totals.advance | number: '1.0-2' }}</div><div class="s">already given</div></div>
        @if (s.totals.otherDeductions > 0) {
          <div class="op">−</div>
          <div class="tile oth"><div class="k">Other deductions</div><div class="v">{{ s.totals.otherDeductions | number: '1.0-2' }}</div><div class="s">fines, loans</div></div>
        }
        <div class="op">=</div>
        <div class="tile bal"><div class="k">Balance to pay</div><div class="v">{{ s.totals.balance | number: '1.0-2' }}</div><div class="s">still to be paid</div></div>
      </div>

      <!-- 2. cash vs bank -->
      <section class="card">
        <h2>How the balance is paid</h2>
        <div class="two">
          <div class="pay">
            <div class="top"><span class="name"><i class="dot cash"></i> Cash</span><span class="muted">{{ s.payBy.cash.staff }} staff</span></div>
            <div class="amt">{{ s.payBy.cash.amount | number: '1.0-2' }}</div>
            <div class="bar"><i class="cash" [style.width.%]="share(s.payBy.cash.amount, s.totals.balance)"></i></div>
          </div>
          <div class="pay">
            <div class="top"><span class="name"><i class="dot bank"></i> Bank</span><span class="muted">{{ s.payBy.bank.staff }} staff</span></div>
            <div class="amt">{{ s.payBy.bank.amount | number: '1.0-2' }}</div>
            <div class="bar"><i class="bank" [style.width.%]="share(s.payBy.bank.amount, s.totals.balance)"></i></div>
          </div>
        </div>
        <p class="muted no-print" style="margin-bottom:0">Choose cash or bank for each person on the <b>Staff</b> page (Edit → Salary balance paid by).</p>
      </section>

      <!-- 3. money ready vs needed -->
      <section class="card">
        <h2>Money ready vs money needed</h2>
        <div class="scroll">
          <table class="funds">
            <thead><tr><th></th><th>To pay</th><th>Available now</th><th>Result</th></tr></thead>
            <tbody>
              <tr>
                <td><b>Cash</b> <span class="muted">(in hand)</span></td>
                <td class="num">{{ s.payBy.cash.amount | number: '1.0-2' }}</td>
                <td><input type="number" min="0" step="0.01" name="cash" [(ngModel)]="cash" (change)="saveFunds()" placeholder="0" /></td>
                <td>
                  @if (needCash() > 0) { <span class="badge absent">Short by {{ needCash() | number: '1.0-2' }}</span> }
                  @else { <span class="badge present">Covered{{ spareCash() > 0 ? ' · spare ' + (spareCash() | number: '1.0-2') : '' }}</span> }
                </td>
              </tr>
              <tr>
                <td><b>Bank</b> <span class="muted">(balance)</span></td>
                <td class="num">{{ s.payBy.bank.amount | number: '1.0-2' }}</td>
                <td><input type="number" min="0" step="0.01" name="bank" [(ngModel)]="bank" (change)="saveFunds()" placeholder="0" /></td>
                <td>
                  @if (needBank() > 0) { <span class="badge absent">Short by {{ needBank() | number: '1.0-2' }}</span> }
                  @else { <span class="badge present">Covered{{ spareBank() > 0 ? ' · spare ' + (spareBank() | number: '1.0-2') : '' }}</span> }
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="need" [class.short]="needTotal() > 0" [class.ok]="needTotal() === 0">
          <div>
            <div class="lbl">{{ needTotal() > 0 ? 'Additional amount needed for salary' : 'Funds cover all salaries' }}</div>
            @if (needTotal() > 0) { <div class="sub">Cash {{ needCash() | number: '1.0-2' }} · Bank {{ needBank() | number: '1.0-2' }}</div> }
          </div>
          <div class="big">{{ needTotal() | number: '1.0-2' }}</div>
        </div>
        <p class="muted no-print" style="margin-bottom:0">Type the cash and bank money you have ready. It is saved for this pay month{{ saved() ? ' ✓ saved' : '' }}.</p>
      </section>

      <!-- 4. by company -->
      @if (hasCompanies()) {
        <section class="card">
          <h2>By company</h2>
          <div class="scroll">
            <table>
              <thead><tr><th>Company</th><th class="num">Staff</th><th class="num">Total salary</th><th class="num">Advance paid</th><th class="num">Balance</th><th class="num">By cash</th><th class="num">By bank</th></tr></thead>
              <tbody>
                @for (g of s.byCompany; track g.company) {
                  <tr>
                    <td><b>{{ g.company || 'No company set' }}</b></td>
                    <td class="num">{{ g.staff }}</td>
                    <td class="num">{{ g.earned | number: '1.0-2' }}</td>
                    <td class="num">{{ g.advance | number: '1.0-2' }}</td>
                    <td class="num"><b>{{ g.balance | number: '1.0-2' }}</b></td>
                    <td class="num">{{ g.cash | number: '1.0-2' }}</td>
                    <td class="num">{{ g.bank | number: '1.0-2' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr><th>Total</th><th class="num">{{ s.totals.staff }}</th><th class="num">{{ s.totals.earned | number: '1.0-2' }}</th><th class="num">{{ s.totals.advance | number: '1.0-2' }}</th><th class="num">{{ s.totals.balance | number: '1.0-2' }}</th><th class="num">{{ s.payBy.cash.amount | number: '1.0-2' }}</th><th class="num">{{ s.payBy.bank.amount | number: '1.0-2' }}</th></tr>
              </tfoot>
            </table>
          </div>
        </section>
      }

      <!-- 5. every person -->
      <section class="card">
        <h2>Staff</h2>
        <div class="chips no-print">
          <button type="button" class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">All ({{ s.rows.length }})</button>
          <button type="button" class="chip" [class.on]="filter() === 'cash'" (click)="filter.set('cash')">Cash ({{ countMode('cash') }})</button>
          <button type="button" class="chip" [class.on]="filter() === 'bank'" (click)="filter.set('bank')">Bank ({{ countMode('bank') }})</button>
        </div>
        <div class="scroll">
          <table>
            <thead><tr><th>Name</th>@if (hasCompanies()) { <th>Company</th> }<th class="num">Salary</th><th class="num">Advance</th><th class="num">Balance</th><th>Paid by</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.userId) {
                <tr>
                  <td>
                    <div class="emp">
                      <span class="avatar" aria-hidden="true">{{ ini(r.name) }}</span>
                      <div class="emp-text"><b>{{ r.name }}</b>@if (r.employeeId) { <span class="muted">{{ r.employeeId }}</span> }</div>
                    </div>
                  </td>
                  @if (hasCompanies()) { <td>{{ r.company || '—' }}</td> }
                  <td class="num">{{ r.earned | number: '1.0-2' }}</td>
                  <td class="num" [class.neg]="r.advance > 0">{{ r.advance ? (r.advance | number: '1.0-2') : '—' }}</td>
                  <td class="num"><b>{{ r.balance | number: '1.0-2' }}</b>@if (r.shortfall) { <div class="muted">{{ r.shortfall | number: '1.0-2' }} not recovered</div> }</td>
                  <td><span class="badge" [class]="r.mode">{{ r.mode }}</span></td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="hasCompanies() ? 6 : 5" class="muted">No staff in this list</td></tr>
              }
            </tbody>
            <tfoot>
              <tr><th>Total</th>@if (hasCompanies()) { <th></th> }<th class="num">{{ sum('earned') | number: '1.0-2' }}</th><th class="num">{{ sum('advance') | number: '1.0-2' }}</th><th class="num">{{ sum('balance') | number: '1.0-2' }}</th><th></th></tr>
            </tfoot>
          </table>
        </div>
      </section>
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class SalarySummaryComponent implements OnInit {
  private api = inject(ApiService);
  d = signal<SalarySummary | null>(null);
  ini = initials;
  error = signal('');
  busy = signal(false);
  saved = signal(false);
  filter = signal<'all' | 'cash' | 'bank'>('all');
  month = '';
  cash: number | null = 0;
  bank: number | null = 0;

  // live: recalculated as the admin types the money available
  private cashIn = signal(0);
  private bankIn = signal(0);
  needCash = computed(() => Math.max(0, this.round((this.d()?.payBy.cash.amount ?? 0) - this.cashIn())));
  needBank = computed(() => Math.max(0, this.round((this.d()?.payBy.bank.amount ?? 0) - this.bankIn())));
  spareCash = computed(() => Math.max(0, this.round(this.cashIn() - (this.d()?.payBy.cash.amount ?? 0))));
  spareBank = computed(() => Math.max(0, this.round(this.bankIn() - (this.d()?.payBy.bank.amount ?? 0))));
  needTotal = computed(() => this.round(this.needCash() + this.needBank()));

  hasCompanies = computed(() => !!this.d()?.byCompany.some((g) => g.company));
  rows = computed(() => (this.d()?.rows ?? []).filter((r) => this.filter() === 'all' || r.mode === this.filter()));

  pretty = dmy;
  private round(n: number) { return Math.round(n * 100) / 100; }
  share(part: number, whole: number) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
  countMode(m: 'cash' | 'bank') { return (this.d()?.rows ?? []).filter((r) => r.mode === m).length; }
  sum(f: 'earned' | 'advance' | 'balance') { return this.round(this.rows().reduce((t, r) => t + r[f], 0)); }

  ngOnInit() { this.load(); }

  private query() { return this.month ? { month: this.month } : {}; }

  load() {
    this.error.set('');
    this.api.salarySummary(this.query()).subscribe({
      next: (s) => {
        this.d.set(s);
        if (!s.period.custom) this.month = s.period.month;
        this.cash = s.funds.cash;
        this.bank = s.funds.bank;
        this.cashIn.set(s.funds.cash);
        this.bankIn.set(s.funds.bank);
        this.saved.set(false);
      },
      error: (e) => this.error.set(e.error?.message || 'Could not load the salary summary'),
    });
  }

  saveFunds() {
    const s = this.d();
    if (!s) return;
    const cash = Math.max(0, Number(this.cash) || 0);
    const bank = Math.max(0, Number(this.bank) || 0);
    this.cashIn.set(cash);
    this.bankIn.set(bank);
    this.api.saveSalaryFunds(s.period.key, cash, bank).subscribe({
      next: () => { this.saved.set(true); setTimeout(() => this.saved.set(false), 2500); },
      error: (e) => this.error.set(e.error?.message || 'Could not save the amounts'),
    });
  }

  print() { window.print(); }

  download() {
    this.busy.set(true);
    this.api.downloadSalarySummary(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `salary_summary_${this.d()?.period.month ?? ''}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.busy.set(false);
      },
      error: () => { this.error.set('Could not download the file'); this.busy.set(false); },
    });
  }
}
