const AMOUNT = /^\d+(\.\d{1,2})?$/;

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/** Parse a user-supplied amount into integer pence. Throws on anything invalid. */
export function toPence(input: string | number): number {
  const raw = typeof input === "number" ? input.toFixed(2) : input;
  const cleaned = raw.trim().replace(/[£,\s]/g, "");

  if (!AMOUNT.test(cleaned)) {
    throw new RangeError(`Not a valid amount: ${JSON.stringify(input)}`);
  }

  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatGBP(pence: number): string {
  return gbp.format(pence / 100);
}

/** For axis ticks, where precision is noise. */
export function formatGBPCompact(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) {
    return `£${(pounds / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `£${Math.round(pounds)}`;
}
