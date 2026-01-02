/**
 * Language code to display label mapping
 */
export const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  it: "Italiano",
  es: "Español",
  pt: "Português",
  nl: "Nederlands",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
};

export function getLanguageLabels(codes: string[] | null): string[] {
  if (!codes || codes.length === 0) return [];
  return codes.map((code) => LANGUAGE_LABELS[code] || code);
}

export function formatLanguages(codes: string[] | null): string {
  const labels = getLanguageLabels(codes);
  return labels.length > 0 ? labels.join(", ") : "Keine Angabe";
}
