import { COMPANY_NAME } from '../config';
import { PayrollRow } from './api.service';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * The salary details that are sent to one staff member on WhatsApp: attendance and its percentage,
 * basic salary, what was added and deducted, and the net salary. WhatsApp formatting: *bold*.
 */
export function salaryMessage(r: PayrollRow, period: { from: string; to: string; inProgress: boolean }, currency: string): string {
  const rate =
    r.payType === 'monthly' ? `Basic salary: ${money(r.rate)} per month`
    : r.payType === 'daily' ? `Rate: ${money(r.rate)} per day`
    : `Rate: ${money(r.rate)} per hour`;
  const soFar = r.workingDaysSoFar ?? r.workingDays;
  const lines: string[] = [
    `💰 *${COMPANY_NAME} – Salary details*`,
    `👤 ${r.name}${r.employeeId ? ` (ID ${r.employeeId})` : ''}`,
    `📅 ${day(period.from)} – ${day(period.to)}`,
  ];
  if (period.inProgress) lines.push('⏳ This month is not finished yet: figures are so far.');
  lines.push('');
  lines.push(`📊 *Attendance: ${r.attendancePct ?? 0}%*`);
  lines.push(`${r.worked} of ${soFar} working days present`);
  lines.push(`Paid leave ${r.paidLeave} · Unpaid leave ${r.unpaidLeave} · Absent ${r.absent} · Late ${r.late}`);
  if (r.payType === 'hourly') lines.push(`Hours worked: ${r.hours}`);
  lines.push('');
  lines.push(rate);
  lines.push(`Salary earned: ${money(r.baseSalary)}`);
  for (const a of r.adjustments.filter((x) => x.type === 'earning')) lines.push(`➕ ${a.label}: ${money(a.amount)}`);
  if (r.deduction > 0) lines.push(`➖ Attendance deduction: ${money(r.deduction)}`);
  for (const a of r.adjustments.filter((x) => x.type === 'deduction')) lines.push(`➖ ${a.label}: ${money(a.amount)}`);
  lines.push('');
  lines.push(`💵 *Net salary: ${currency} ${money(r.netSalary)}*`);
  if (r.shortfall > 0) lines.push(`(${money(r.shortfall)} of deductions could not be recovered this month)`);
  return lines.join('\n');
}
