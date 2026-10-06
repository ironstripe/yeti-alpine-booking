// Swiss standard VAT (MWST) for the booking summary. Prices are gross (VAT included), so the shown
// VAT is the included share: gross * rate / (100 + rate). The rate follows the service date
// (7.7 % until 2023-12-31, 8.1 % from 2024-01-01). Display only: gross tariffs are never changed.
const SWISS_STANDARD_VAT: { from: string; percent: number }[] = [
  { from: "2018-01-01", percent: 7.7 },
  { from: "2024-01-01", percent: 8.1 },
];

export function swissVatPercent(serviceDate: string | null | undefined, today = new Date().toISOString().slice(0, 10)): number {
  const d = serviceDate && /^\d{4}-\d{2}-\d{2}/.test(serviceDate) ? serviceDate.slice(0, 10) : today;
  let pct = SWISS_STANDARD_VAT[0].percent;
  for (const r of SWISS_STANDARD_VAT) if (d >= r.from) pct = r.percent;
  return pct;
}

/** VAT contained in a gross (VAT-inclusive) amount, rounded to 5 Rappen like the totals. */
export function includedVat(gross: number, percent: number): number {
  return Math.round((gross * percent) / (100 + percent) * 20) / 20;
}

export const formatVatPercent = (p: number) => `${p.toFixed(1).replace(/\.0$/, "")}%`;
