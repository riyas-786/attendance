import { Component } from '@angular/core';

// An accountant account that the admin has not given any permission yet
@Component({
  selector: 'app-no-access',
  standalone: true,
  template: `
    <section class="card">
      <h2>No access yet</h2>
      <p class="muted">Your accountant account has not been given any options yet. Ask the admin to tick what you may use (Staff page, Edit, Accountant permissions), then sign in again.</p>
    </section>
  `,
})
export class NoAccessComponent {}
