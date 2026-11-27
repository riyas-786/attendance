import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { TimeFormat } from './core/time-format';
import { COMPANY_NAME } from './config';

interface NavItem { label: string; link: string; icon: string; exact?: boolean }
interface NavGroup { title: string; items: NavItem[] }

// Simple line icons (24x24, drawn with a stroke)
const ICONS: Record<string, string> = {
  today: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l4 2',
  calendar: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18',
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  reports: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  hours: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  payroll: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  summary: 'M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z',
  staff: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  place: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  menu: 'M3 12h18 M3 6h18 M3 18h18',
  close: 'M18 6L6 18 M6 6l12 12',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell" [class.with-sidebar]="auth.isLoggedIn() && sidebar()" [class.has-tabbar]="auth.isLoggedIn() && !sidebar()">

      <!-- admin and accountant: menu on the left (a slide-in drawer on phones) -->
      @if (auth.isLoggedIn() && sidebar()) {
        @if (open()) { <div class="scrim" (click)="open.set(false)"></div> }
        <aside class="sidebar" [class.open]="open()" aria-label="Main menu">
          <div class="side-brand">
            <img class="brand-logo" src="logo-mark.png" alt="" />
            <div class="side-name"><strong>{{ company }}</strong><span>Attendance</span></div>
            <button class="icon-btn side-close" type="button" (click)="open.set(false)" aria-label="Close menu">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons['close']" /></svg>
            </button>
          </div>
          <nav class="side-nav">
            @for (g of groups(); track g.title) {
              <div class="side-group">{{ g.title }}</div>
              @for (i of g.items; track i.link) {
                <a class="side-link" [routerLink]="i.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!i.exact }">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons[i.icon]" /></svg>
                  <span>{{ i.label }}</span>
                </a>
              }
            }
          </nav>
        </aside>
      }

      <div class="content">
        @if (auth.isLoggedIn()) {
          <header class="topbar">
            @if (sidebar()) {
              <button class="icon-btn menu-btn" type="button" (click)="open.set(true)" aria-label="Open menu">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons['menu']" /></svg>
              </button>
              <h1 class="top-title">{{ title() }}</h1>
            } @else {
              <img class="brand-logo" src="logo-mark.png" alt="{{ company }}" />
              <strong class="top-brand">Attendance</strong>
              <nav class="tabs-inline" aria-label="Main menu">
                @for (i of flat(); track i.link) {
                  <a [routerLink]="i.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!i.exact }">{{ i.label }}</a>
                }
              </nav>
            }
            <span class="spacer"></span>
            <button class="icon-btn" type="button" (click)="toggleTheme()" [attr.aria-label]="dark() ? 'Switch to light mode' : 'Switch to dark mode'" [title]="dark() ? 'Light mode' : 'Dark mode'">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="dark() ? icons['sun'] : icons['moon']" /></svg>
            </button>
            <button class="btn small" type="button" (click)="tf.toggle()" [title]="tf.is24() ? 'Showing 24-hour time. Click for 12-hour' : 'Showing 12-hour time. Click for 24-hour'">{{ tf.is24() ? '24h' : '12h' }}</button>
            <span class="user-chip"><b>{{ auth.user()?.name }}</b><small>{{ roleLabel() }}</small></span>
            <button class="btn small signout" type="button" (click)="auth.logout()" aria-label="Sign out">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons['logout']" /></svg><span>Sign out</span>
            </button>
          </header>
        }
        <main><router-outlet /></main>
      </div>

      <!-- staff (and owner) on a phone: tabs along the bottom, like an app -->
      @if (auth.isLoggedIn() && !sidebar()) {
        <nav class="tabbar" aria-label="Main menu">
          @for (i of flat(); track i.link) {
            <a class="tab" [routerLink]="i.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!i.exact }">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons[i.icon]" /></svg>
              <span>{{ i.label }}</span>
            </a>
          }
        </nav>
      }
    </div>
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  tf = inject(TimeFormat);
  private router = inject(Router);

  company = COMPANY_NAME;
  icons = ICONS;
  open = signal(false); // the menu drawer on phones
  private url = signal(this.router.url);

  // admin and accountant get the side menu; staff and owner get the simple top / bottom tabs
  sidebar = computed(() => this.auth.isAdmin() || this.auth.isAccountant());

  roleLabel() {
    const r = this.auth.user()?.role;
    return r === 'admin' ? 'Admin' : r === 'accountant' ? 'Accountant' : r === 'owner' ? 'Owner' : 'Staff';
  }

  // the menu, grouped. An accountant only gets what the admin allowed.
  groups(): NavGroup[] {
    const a = this.auth;
    const pick = (items: [boolean, NavItem][]) => items.filter(([ok]) => ok).map(([, i]) => i);
    const all = [
      { title: 'Daily', items: pick([
        [a.can('attendance_view', 'attendance_edit'), { label: 'Overview', link: '/admin', icon: 'overview', exact: true }],
        [a.can('leaves'), { label: 'Leave requests', link: '/admin/leaves', icon: 'calendar' }],
        [a.can('reports', 'attendance_view', 'attendance_edit'), { label: 'Working hours', link: '/admin/hours', icon: 'hours' }],
        [a.can('reports'), { label: 'Reports', link: '/admin/reports', icon: 'reports' }],
      ]) },
      { title: 'Money', items: pick([
        [a.can('payroll_view'), { label: 'Payroll', link: '/admin/payroll', icon: 'payroll' }],
        [a.can('salary_summary'), { label: 'Salary summary', link: '/admin/salary-summary', icon: 'summary' }],
      ]) },
      { title: 'Setup', items: pick([
        [a.isAdmin(), { label: 'Staff', link: '/admin/staff', icon: 'staff' }],
        [a.isAdmin(), { label: 'Locations & shifts', link: '/admin/sites', icon: 'place' }],
        [a.isAdmin(), { label: 'Settings', link: '/admin/settings', icon: 'settings' }],
      ]) },
    ];
    return all.filter((g) => g.items.length > 0);
  }

  // staff and owner: a short flat list
  flat(): NavItem[] {
    if (this.auth.isOwner()) return [{ label: 'Attendance', link: '/owner', icon: 'overview', exact: true }];
    return [
      { label: 'Today', link: '/', icon: 'today', exact: true },
      { label: 'History', link: '/history', icon: 'history' },
      { label: 'Leave', link: '/leave', icon: 'calendar' },
      { label: 'Salary', link: '/salary', icon: 'payroll' },
    ];
  }

  // the name of the page being shown (top bar of the side-menu layout)
  title(): string {
    const path = this.url().split('?')[0].split('#')[0];
    const items = this.groups().flatMap((g) => g.items);
    const hit = items.filter((i) => path === i.link || path.startsWith(i.link + '/')).sort((x, y) => y.link.length - x.link.length)[0];
    return hit?.label ?? 'Attendance';
  }

  // light / dark: the saved choice, otherwise the device setting
  dark = signal(false);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.open.set(false); // close the phone menu after choosing a page
    });
    this.auth.refreshTimezone();
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
