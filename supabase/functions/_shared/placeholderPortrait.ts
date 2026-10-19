// Neutral illustrated placeholder portraits for public team members without a photo.
// The images ship with the Core frontend (public/images) and are served from the
// published Core site, so the Onepager can show them without any change on its side.

const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://yeti-alpine-booking.lovable.app").replace(/\/+$/, "");

export function placeholderPortraitUrl(gender: string | null | undefined): string {
  const female = (gender ?? "").trim().toLowerCase();
  const file = female === "f" || female === "female" || female === "weiblich"
    ? "instructor-placeholder-female.jpg"
    : "instructor-placeholder-male.jpg";
  return `${PUBLIC_SITE_URL}/images/${file}`;
}
