// Neutral illustrated placeholder portraits for public team members without a photo.
// The images ship with the Core frontend (public/images) and are served from the
// published Core site, so the Onepager can show them without any change on its side.

type DenoLike = { env?: { get?: (name: string) => string | undefined } };

function envUrl(): string | undefined {
  const deno = (globalThis as { Deno?: DenoLike }).Deno;
  const fromDeno = deno?.env?.get?.("PUBLIC_SITE_URL");
  if (fromDeno) return fromDeno;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.PUBLIC_SITE_URL;
}

export const PUBLIC_SITE_URL = (envUrl() ?? "https://yeti-alpine-booking.lovable.app").replace(/\/+$/, "");

export function placeholderPortraitUrl(gender: string | null | undefined): string {
  const female = (gender ?? "").trim().toLowerCase();
  const file = female === "f" || female === "female" || female === "weiblich"
    ? "instructor-placeholder-female.jpg"
    : "instructor-placeholder-male.jpg";
  return `${PUBLIC_SITE_URL}/images/${file}`;
}
