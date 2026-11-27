// "Sara Ahmed" -> "SA" (for the round avatar next to a name)
export function initials(name: string): string {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
