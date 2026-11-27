import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API_URL } from '../config';
import { TimeFormat } from './time-format';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'owner' | 'accountant';
  permissions?: string[]; // accountant only: what the admin allowed
  department?: string;
  employeeId?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private tf = inject(TimeFormat);

  private _user = signal<User | null>(this.readUser());
  user = this._user.asReadonly();
  isLoggedIn = computed(() => !!this._user() && !!this.token);
  isAdmin = computed(() => this._user()?.role === 'admin');
  isOwner = computed(() => this._user()?.role === 'owner');
  isAccountant = computed(() => this._user()?.role === 'accountant');

  /** Admin can do everything. An accountant can do what the admin ticked (any one of the given permissions). */
  can(...perms: string[]): boolean {
    const u = this._user();
    if (!u) return false;
    if (u.role === 'admin') return true;
    return u.role === 'accountant' && perms.some((p) => (u.permissions ?? []).includes(p));
  }

  /** Where this person lands after signing in */
  firstPage(): string {
    const u = this._user();
    if (!u) return '/login';
    if (u.role === 'admin') return '/admin';
    if (u.role === 'owner') return '/owner';
    if (u.role === 'accountant') {
      const order: [string, string[]][] = [
        ['/admin', ['attendance_view', 'attendance_edit']],
        ['/admin/payroll', ['payroll_view']],
        ['/admin/salary-summary', ['salary_summary']],
        ['/admin/reports', ['reports']],
        ['/admin/leaves', ['leaves']],
      ];
      return order.find(([, perms]) => this.can(...perms))?.[0] ?? '/no-access';
    }
    return '/';
  }

  get token(): string | null {
    return localStorage.getItem('token');
  }

  login(email: string, password: string) {
    return this.http
      .post<{ token: string; user: User; timezone?: string }>(`${API_URL}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem('token', res.token);
          localStorage.setItem('user', JSON.stringify(res.user));
          this._user.set(res.user);
          this.tf.setTz(res.timezone);
        })
      );
  }

  /** Re-reads the company time zone (the admin may have changed it since this person signed in). */
  refreshTimezone() {
    if (!this.token) return;
    this.http.get<User & { timezone?: string }>(`${API_URL}/auth/me`).subscribe({
      next: (me) => {
        this.tf.setTz(me.timezone);
        // the admin may have changed this person's permissions since they signed in
        const u = this._user();
        if (u && u.role === 'accountant' && JSON.stringify(u.permissions ?? []) !== JSON.stringify(me.permissions ?? [])) {
          const next = { ...u, permissions: me.permissions ?? [] };
          this._user.set(next);
          localStorage.setItem('user', JSON.stringify(next));
        }
      },
      error: () => { /* keep the saved one */ },
    });
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  private readUser(): User | null {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }
}
