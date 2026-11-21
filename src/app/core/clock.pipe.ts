import { Pipe, PipeTransform } from '@angular/core';
import { formatClock, formatDay } from './time-format';

/**
 * Shows a time in the company time zone, in 24h or 12h.
 *   {{ s.in | clock: tf.is24() : tf.tz() }}            17:30  /  5:30 PM
 *   {{ now() | clock: tf.is24() : tf.tz() : 'hms' }}   17:30:05
 *   {{ now() | clock: tf.is24() : tf.tz() : 'date' }}  Saturday, 21 November 2026
 * The 24h flag and zone are passed in so the text updates the moment either changes.
 */
@Pipe({ name: 'clock', standalone: true })
export class ClockPipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, is24 = true, tz = '', mode: 'hm' | 'hms' | 'date' = 'hm'): string {
    if (value === null || value === undefined || value === '') return '';
    return mode === 'date' ? formatDay(value, tz) : formatClock(value, mode === 'hms', is24, tz);
  }
}
