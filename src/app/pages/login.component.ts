import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-wrap">
      <form class="card login" (ngSubmit)="submit()">
        <h1>Staff Attendance</h1>
        <p class="muted">Sign in to record your attendance</p>

        <label>Email
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="username" />
        </label>
        <label>Password
          <input type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
        </label>

        @if (error()) { <div class="error">{{ error() }}</div> }

        <button class="btn primary" type="submit" [disabled]="loading()">
          {{ loading() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  loading = signal(false);
  error = signal('');

  submit() {
    this.error.set('');
    this.loading.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        // only follow in-app paths
        if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
          this.router.navigateByUrl(returnUrl);
        } else {
          this.router.navigate([res.user.role === 'admin' ? '/admin' : '/']);
        }
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Could not sign in');
        this.loading.set(false);
      },
    });
  }
}
