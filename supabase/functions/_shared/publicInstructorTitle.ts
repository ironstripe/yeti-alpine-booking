export interface PublicInstructorTitleFields {
  specialization: string | null;
  roles: string[] | null;
  gender: string | null;
  website_role_title: string | null;
}

/** Only public website wording; operational instructor role and access remain untouched. */
export function publicInstructorTitle(fields: PublicInstructorTitleFields): string {
  const explicit = fields.website_role_title?.trim();
  if (explicit) return explicit;

  const hay = [fields.specialization ?? "", ...(fields.roles ?? [])].join(" ").toLowerCase();
  const ski = hay.includes("ski") || hay.includes("both");
  const snowboard = hay.includes("snowboard") || hay.includes("board") || hay.includes("both");
  const gender = fields.gender?.toLowerCase();

  if (gender === "female") {
    if (ski && snowboard) return "Ski- und Snowboardlehrerin";
    if (snowboard) return "Snowboardlehrerin";
    if (ski) return "Skilehrerin";
    return "Schneesportlehrerin";
  }
  if (gender === "male") {
    if (ski && snowboard) return "Ski- und Snowboardlehrer";
    if (snowboard) return "Snowboardlehrer";
    if (ski) return "Skilehrer";
    return "Schneesportlehrer";
  }
  // Unknown/other gender is not inferred from the name or portrait.
  if (ski && snowboard) return "Ski- und Snowboardlehrperson";
  if (snowboard) return "Snowboardlehrperson";
  if (ski) return "Skilehrperson";
  return "Schneesportlehrperson";
}
