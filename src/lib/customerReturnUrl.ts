export function customerReturnUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/customers")) return "/customers";
  try {
    const url = new URL(value, "https://yeti.invalid");
    if (url.origin !== "https://yeti.invalid" || url.pathname !== "/customers") return "/customers";
    const query = url.searchParams.get("q");
    return query === null ? "/customers" : `/customers?q=${encodeURIComponent(query)}`;
  } catch {
    return "/customers";
  }
}
