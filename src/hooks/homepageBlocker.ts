type Row = { status: string | null; website_teaser: string | null; show_on_website: boolean | null };

/** Why the homepage switch cannot be turned on (null = allowed). */
export function homepageBlocker(i: Row): string | null {
  if (i.show_on_website) return null; // turning off is always allowed
  if (i.status !== "active") return "Nur aktive Lehrpersonen können auf der Homepage erscheinen";
  if (!i.website_teaser?.trim()) return "Kurzbeschreibung fehlt – im Websiteprofil ergänzen";
  return null;
}
