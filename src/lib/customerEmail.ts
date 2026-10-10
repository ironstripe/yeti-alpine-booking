/** Customers may have no known email (archive import). Never send without a real recipient. */
export function customerEmailRecipient(customer: { email?: string | null } | null | undefined): string | null {
  const e = customer?.email?.trim();
  return e ? e : null;
}
