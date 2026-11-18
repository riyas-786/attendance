import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.isLoggedIn()) {
      <header class="nav">
        <img class="nav-logo" src="logo-mark.png" alt="Teepee Group" />
        <strong>Attendance</strong>
        <nav>
          @if (!auth.isAdmin()) {
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Today</a>
            <a routerLink="/history" routerLinkActive="active">History</a>
            <a routerLink="/leave" routerLinkActive="active">Leave</a>
          } @else {
            <a routerLink="/admin" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Overview</a>
            <a routerLink="/admin/leaves" routerLinkActive="active">Leave requests</a>
            <a routerLink="/admin/reports" routerLinkActive="active">Reports</a>
            <a routerLink="/admin/payroll" routerLinkActive="active">Payroll</a>
            <a routerLink="/admin/staff" routerLinkActive="active">Staff</a>
            <a routerLink="/admin/sites" routerLinkActive="active">Locations &amp; shifts</a>
            <a routerLink="/admin/settings" routerLinkActive="active">Settings</a>
          }
        </nav>
        <span class="spacer"></span>
        <button class="btn small theme-btn" type="button" (click)="toggleTheme()" [attr.aria-label]="dark() ? 'Switch to light mode' : 'Switch to dark mode'" [title]="dark() ? 'Light mode' : 'Dark mode'">{{ dark() ? '☀' : '☾' }}</button>
        <span class="muted">{{ auth.user()?.name }}</span>
        <button class="btn small" (click)="auth.logout()">Sign out</button>
      </header>
    }
    <main><router-outlet /></main>
  `,
})
export class AppComponent {
  auth = inject(AuthService);

  // light / dark: the saved choice, otherwise the device setting
  dark = signal(false);

  constructor() {
    let saved = '';
    try { saved = localStorage.getItem('theme') || ''; } catch { /* storage blocked */ }
    const system = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved === 'dark' || (saved !== 'light' && system));
    if (saved) document.documentElement.dataset['theme'] = saved;
  }

  toggleTheme() {
    const next = !this.dark();
    this.apply(next);
    document.documentElement.dataset['theme'] = next ? 'dark' : 'light';
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  }

  private apply(dark: boolean) { this.dark.set(dark); }
}
