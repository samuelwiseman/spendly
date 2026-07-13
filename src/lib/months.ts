const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: string): boolean {
  return MONTH.test(value);
}

/** The current month in Europe/London, as YYYY-MM. */
export function currentMonth(): string {
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return now.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (!match) throw new RangeError(`Not a valid month: ${month}`);

  const year = Number(match[1]);
  const zeroBased = Number(match[2]) - 1 + delta;

  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;

  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

export function formatMonthLong(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** The month a page should render: the requested one if it parses, else today's. */
export function resolveMonth(value: string | undefined): string {
  return value && isValidMonth(value) ? value : currentMonth();
}
