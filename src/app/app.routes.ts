import { Routes } from '@angular/router';
import { adminGuard, staffGuard } from './core/guards';
import { LoginComponent } from './pages/login.component';
import { DashboardComponent } from './pages/dashboard.component';
import { HistoryComponent } from './pages/history.component';
import { LeaveComponent } from './pages/leave.component';
import { AdminComponent } from './pages/admin.component';
import { StaffComponent } from './pages/staff.component';
import { LeaveAdminComponent } from './pages/leave-admin.component';
import { ReportsComponent } from './pages/reports.component';
import { PayrollComponent } from './pages/payroll.component';
import { SettingsComponent } from './pages/settings.component';
import { SitesComponent } from './pages/sites.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: DashboardComponent, canActivate: [staffGuard] },
  { path: 'history', component: HistoryComponent, canActivate: [staffGuard] },
  { path: 'leave', component: LeaveComponent, canActivate: [staffGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  { path: 'admin/leaves', component: LeaveAdminComponent, canActivate: [adminGuard] },
  { path: 'admin/reports', component: ReportsComponent, canActivate: [adminGuard] },
  { path: 'admin/payroll', component: PayrollComponent, canActivate: [adminGuard] },
  { path: 'admin/sites', component: SitesComponent, canActivate: [adminGuard] },
  { path: 'admin/settings', component: SettingsComponent, canActivate: [adminGuard] },
  { path: 'admin/staff', component: StaffComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' },
];
