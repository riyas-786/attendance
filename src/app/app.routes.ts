import { Routes } from '@angular/router';
import { adminGuard, ownerGuard, permGuard, staffGuard } from './core/guards';
import { LoginComponent } from './pages/login.component';
import { DashboardComponent } from './pages/dashboard.component';
import { HistoryComponent } from './pages/history.component';
import { LeaveComponent } from './pages/leave.component';
import { AdminComponent } from './pages/admin.component';
import { StaffComponent } from './pages/staff.component';
import { LeaveAdminComponent } from './pages/leave-admin.component';
import { ReportsComponent } from './pages/reports.component';
import { PayrollComponent } from './pages/payroll.component';
import { SalarySummaryComponent } from './pages/salary-summary.component';
import { SettingsComponent } from './pages/settings.component';
import { SitesComponent } from './pages/sites.component';
import { OwnerComponent } from './pages/owner.component';
import { NoAccessComponent } from './pages/no-access.component';
import { MySalaryComponent } from './pages/my-salary.component';
import { HoursComponent } from './pages/hours.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: DashboardComponent, canActivate: [staffGuard] },
  { path: 'history', component: HistoryComponent, canActivate: [staffGuard] },
  { path: 'leave', component: LeaveComponent, canActivate: [staffGuard] },
  { path: 'salary', component: MySalaryComponent, canActivate: [staffGuard] },
  { path: 'owner', component: OwnerComponent, canActivate: [ownerGuard] },
  { path: 'no-access', component: NoAccessComponent },
  { path: 'admin', component: AdminComponent, canActivate: [permGuard], data: { perms: ['attendance_view', 'attendance_edit'] } },
  { path: 'admin/leaves', component: LeaveAdminComponent, canActivate: [permGuard], data: { perms: ['leaves'] } },
  { path: 'admin/hours', component: HoursComponent, canActivate: [permGuard], data: { perms: ['reports', 'attendance_view', 'attendance_edit'] } },
  { path: 'admin/reports', component: ReportsComponent, canActivate: [permGuard], data: { perms: ['reports'] } },
  { path: 'admin/salary-summary', component: SalarySummaryComponent, canActivate: [permGuard], data: { perms: ['salary_summary'] } },
  { path: 'admin/payroll', component: PayrollComponent, canActivate: [permGuard], data: { perms: ['payroll_view'] } },
  { path: 'admin/sites', component: SitesComponent, canActivate: [adminGuard] },
  { path: 'admin/settings', component: SettingsComponent, canActivate: [adminGuard] },
  { path: 'admin/staff', component: StaffComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' },
];
