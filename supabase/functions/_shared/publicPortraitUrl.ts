// Public homepage portrait: only a URL from the public avatar bucket (or other public URL).
// Private HR photos / signed URLs are never exposed; missing photo → null (placeholder).
export function publicPortraitUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim();
  if (!url || url.includes("instructor-hr-photos") || url.includes("/object/sign/")) return null;
  return url;
}
