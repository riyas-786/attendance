import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';
import { LoginComponent } from './pages/login.component';
import { DashboardComponent } from './pages/dashboard.component';
import { HistoryComponent } from './pages/history.component';
import { LeaveComponent } from './pages/leave.component';
import { ScanComponent } from './pages/scan.component';
import { AdminComponent } from './pages/admin.component';
import { StaffComponent } from './pages/staff.component';
import { LeaveAdminComponent } from './pages/leave-admin.component';
import { ReportsComponent } from './pages/reports.component';
import { QrComponent } from './pages/qr.component';
import { PayrollComponent } from './pages/payroll.component';
import { SettingsComponent } from './pages/settings.component';
import { SitesComponent } from './pages/sites.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'history', component: HistoryComponent, canActivate: [authGuard] },
  { path: 'leave', component: LeaveComponent, canActivate: [authGuard] },
  { path: 'scan', component: ScanComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  { path: 'admin/leaves', component: LeaveAdminComponent, canActivate: [adminGuard] },
  { path: 'admin/reports', component: ReportsComponent, canActivate: [adminGuard] },
  { path: 'admin/payroll', component: PayrollComponent, canActivate: [adminGuard] },
  { path: 'admin/qr', component: QrComponent, canActivate: [adminGuard] },
  { path: 'admin/sites', component: SitesComponent, canActivate: [adminGuard] },
  { path: 'admin/settings', component: SettingsComponent, canActivate: [adminGuard] },
  { path: 'admin/staff', component: StaffComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' },
];
