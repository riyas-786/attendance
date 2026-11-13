import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_URL } from '../config';

// Where a check-in / check-out happened (saved when the browser shares the location)
export interface Place {
  lat: number;
  lng: number;
  accuracy?: number;
  distanceM?: number;
  siteName?: string;
}

export interface Session {
  in: string;
  out?: string;
  inLocation?: Place;
  outLocation?: Place;
  inMethod?: 'button' | 'qr' | 'admin';
}

export interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'present' | 'late' | 'absent' | 'leave';
  workedMinutes: number;
  note?: string;
  // every check-in / check-out pair of the day; the last one has no `out` while the person is still in
  sessions?: Session[];
  inMethod?: 'button' | 'qr';
  inLocation?: { lat: number; lng: number; distanceM?: number };
  user?: { _id: string; name: string; email: string; department?: string; employeeId?: string };
}

export interface Summary {
  date: string;
  totalStaff: number;
  present: number;
  late: number;
  leave: number;
  notIn: number;
}

export type PayType = 'monthly' | 'daily' | 'hourly';

export interface StaffMember {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  department?: string;
  employeeId?: string;
  active: boolean;
  payType?: PayType;
  baseSalary?: number; // monthly salary, rate per day or rate per hour, depending on payType
  joinDate?: string;
  shift?: string | null;
  locations?: string[];
  anyLocation?: boolean;
  hasDevice?: boolean;
  deviceLock?: boolean;
}

export interface WorkLocation {
  _id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  staffCount?: number;
}

export interface Shift {
  _id: string;
  name: string;
  workStart: string;
  graceMinutes: number;
  staffCount?: number;
}

export interface PayrollRow {
  userId: string;
  name: string;
  employeeId: string;
  department: string;
  payType: PayType;
  rate: number;
  baseSalary: number; // pay earned before deductions
  paidDays: number;
  hours: number;
  workingDays: number;
  worked: number;
  paidLeave: number;
  unpaidLeave: number;
  absent: number;
  late: number;
  lateDeductionDays: number;
  dailyRate: number;
  deduction: number;
  additions: number;
  otherDeductions: number;
  adjustments: PayAdjustment[];
  netSalary: number;
  shortfall: number;
}

export interface PayAdjustment {
  id: string;
  date: string; // the day it is for (empty on older entries)
  type: 'earning' | 'deduction';
  label: string;
  amount: number;
  note: string;
}

export interface AppSettings {
  workStart: string;
  lateGraceMinutes: number;
  officeLat: number | null;
  officeLng: number | null;
  officeRadiusMeters: number;
  requireQr: boolean;
  qrWindowMinutes: number;
  frontendUrl: string;
  weekendDays: number[];
  holidays: string[];
  absentDeductionFactor: number;
  lateCountThreshold: number;
  lateDeductionDays: number;
  salaryCurrency: string;
  payrollStartDay: number;
  payHoursPerDay: number;
}

export interface Payroll {
  month: string; // pay month (YYYY-MM) or, for custom dates, 'from..to'
  from: string;
  to: string;
  custom: boolean;
  currency: string;
  totalWorkingDays: number;
  deductionFactor: number;
  lateThreshold: number;
  lateDays: number;
  inProgress: boolean;
  rows: PayrollRow[];
  totals: { baseSalary: number; deduction: number; additions: number; otherDeductions: number; netSalary: number };
}

export interface Rules {
  locationRequired: boolean;
  qrRequired: boolean;
  workStart?: string;
  graceMinutes?: number;
  shiftName?: string;
  places?: string[];
}

export interface PresencePayload {
  note?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  qrToken?: string;
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  _id: string;
  type: LeaveType;
  from: string;
  to: string;
  reason?: string;
  status: LeaveStatus;
  reviewNote?: string;
  createdAt: string;
  user?: { _id: string; name: string; department?: string; employeeId?: string };
  reviewedBy?: { name: string };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // --- attendance (staff) ---
  rules() { return this.http.get<Rules>(`${API_URL}/attendance/rules`); }
  today() { return this.http.get<AttendanceRecord | null>(`${API_URL}/attendance/today`); }
  checkIn(body: PresencePayload = {}) { return this.http.post<AttendanceRecord>(`${API_URL}/attendance/check-in`, body); }
  checkOut(body: PresencePayload = {}) { return this.http.post<AttendanceRecord>(`${API_URL}/attendance/check-out`, body); }
  myHistory(from?: string, to?: string) {
    return this.http.get<AttendanceRecord[]>(`${API_URL}/attendance/my`, { params: this.params({ from, to }) });
  }

  // --- attendance (admin) ---
  allAttendance(filters: { date?: string; from?: string; to?: string; userId?: string; status?: string }) {
    return this.http.get<AttendanceRecord[]>(`${API_URL}/attendance`, { params: this.params(filters) });
  }
  summary(date?: string) { return this.http.get<Summary>(`${API_URL}/attendance/summary`, { params: this.params({ date }) }); }
  manual(body: { userId: string; date: string; status?: string; checkIn?: string | null; checkOut?: string | null; note?: string; leaveType?: LeaveType }) {
    return this.http.put<AttendanceRecord>(`${API_URL}/attendance/manual`, body);
  }

  // --- reports (file download through the authenticated client) ---
  downloadReport(format: 'csv' | 'xlsx', from: string, to: string) {
    return this.http.get(`${API_URL}/attendance/export.${format}`, {
      params: this.params({ from, to }),
      responseType: 'blob',
    });
  }

  // --- staff ---
  staff() { return this.http.get<StaffMember[]>(`${API_URL}/staff`); }
  addStaff(body: Partial<StaffMember> & { password: string }) { return this.http.post(`${API_URL}/staff`, body); }
  resetDevice(id: string) { return this.http.post(`${API_URL}/staff/${id}/reset-device`, {}); }
  updateStaff(id: string, body: Partial<StaffMember> & { password?: string }) { return this.http.put(`${API_URL}/staff/${id}`, body); }

  // --- leave ---
  requestLeave(body: { type: LeaveType; from: string; to: string; reason?: string }) {
    return this.http.post<LeaveRequest>(`${API_URL}/leaves`, body);
  }
  myLeaves() { return this.http.get<LeaveRequest[]>(`${API_URL}/leaves/my`); }
  cancelLeave(id: string) { return this.http.put<LeaveRequest>(`${API_URL}/leaves/${id}/cancel`, {}); }
  allLeaves(status?: string) { return this.http.get<LeaveRequest[]>(`${API_URL}/leaves`, { params: this.params({ status }) }); }
  reviewLeave(id: string, decision: 'approved' | 'rejected', note = '') {
    return this.http.put<LeaveRequest>(`${API_URL}/leaves/${id}/review`, { decision, note });
  }

  // --- payroll (admin) ---
  // no argument = the current pay period; { month } = a pay month; { from, to } = custom dates
  payroll(q: { month?: string; from?: string; to?: string } = {}) { return this.http.get<Payroll>(`${API_URL}/payroll`, { params: this.params(q) }); }
  addAdjustment(body: { user: string; date: string; type: 'earning' | 'deduction'; label: string; amount: number; note: string }) {
    return this.http.post(`${API_URL}/adjustments`, body);
  }
  deleteAdjustment(id: string) { return this.http.delete(`${API_URL}/adjustments/${id}`); }
  downloadPayroll(q: { month?: string; from?: string; to?: string }) {
    return this.http.get(`${API_URL}/payroll/export.xlsx`, { params: this.params(q), responseType: 'blob' });
  }

  // --- locations and shifts (admin) ---
  locations() { return this.http.get<WorkLocation[]>(`${API_URL}/locations`); }
  addLocation(b: Omit<WorkLocation, '_id' | 'staffCount'>) { return this.http.post<WorkLocation>(`${API_URL}/locations`, b); }
  updateLocation(id: string, b: Omit<WorkLocation, '_id' | 'staffCount'>) { return this.http.put<WorkLocation>(`${API_URL}/locations/${id}`, b); }
  deleteLocation(id: string) { return this.http.delete(`${API_URL}/locations/${id}`); }

  shifts() { return this.http.get<Shift[]>(`${API_URL}/shifts`); }
  addShift(b: Omit<Shift, '_id' | 'staffCount'>) { return this.http.post<Shift>(`${API_URL}/shifts`, b); }
  updateShift(id: string, b: Omit<Shift, '_id' | 'staffCount'>) { return this.http.put<Shift>(`${API_URL}/shifts/${id}`, b); }
  deleteShift(id: string) { return this.http.delete(`${API_URL}/shifts/${id}`); }

  // --- settings (admin) ---
  settings() { return this.http.get<AppSettings>(`${API_URL}/settings`); }
  saveSettings(body: AppSettings) { return this.http.put<AppSettings>(`${API_URL}/settings`, body); }

  // --- QR (admin) ---
  currentQr() { return this.http.get<{ image: string; url: string; secondsLeft: number }>(`${API_URL}/qr/current`); }

  private params(obj: Record<string, string | undefined>) {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => { if (v) p = p.set(k, v); });
    return p;
  }
}
