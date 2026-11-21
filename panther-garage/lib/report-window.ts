export function isCalendarMonthWindow(from: string, to: string, now = new Date()): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(from) || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(to) || from > to) {
    return false;
  }

  const [year, month] = from.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const currentMonthToDate = from.slice(0, 7) === today.slice(0, 7) && to === today;

  return to === monthEnd || currentMonthToDate;
}
