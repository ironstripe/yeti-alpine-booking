export const WHATSAPP_TEMPLATES = {
  welcome: "Hallo {CustomerName}! Willkommen bei der Schneesportschule Malbun. Wir freuen uns auf Ihren Besuch am {Date}!",
  bbq: "Liebe Gäste, diesen Donnerstag findet unser Skischul-BBQ statt! {CustomerName}, wir würden uns freuen Sie zu sehen.",
  thank_you: "Vielen Dank {CustomerName} für Ihren Besuch bei der Schneesportschule Malbun! Wir hoffen, Sie hatten eine tolle Zeit.",
  review: "Hallo {CustomerName}! Wenn Ihnen Ihr Unterricht gefallen hat, würden wir uns über eine Google-Bewertung freuen: https://g.page/r/schneesportschule-malbun/review"
} as const;

export type WhatsAppTemplate = keyof typeof WHATSAPP_TEMPLATES;

export function getWhatsAppUrl(
  template: WhatsAppTemplate, 
  customerName?: string, 
  phone?: string
): string {
  const today = new Date().toLocaleDateString("de-CH", { 
    weekday: "long", 
    day: "numeric", 
    month: "long" 
  });
  
  let text = WHATSAPP_TEMPLATES[template]
    .replace("{CustomerName}", customerName || "")
    .replace("{Date}", today);
  
  // Clean up double spaces if name was empty
  text = text.replace(/\s+/g, " ").trim();
  
  const baseUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "https://wa.me/";
  return `${baseUrl}?text=${encodeURIComponent(text)}`;
}
