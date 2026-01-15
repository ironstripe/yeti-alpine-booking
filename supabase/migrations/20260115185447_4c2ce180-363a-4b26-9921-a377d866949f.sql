-- Insert default channel-specific configurations
INSERT INTO public.ai_configuration (key, value) VALUES
  ('tonality_email', 'Freundlich und professionell. Wir duzen unsere Gäste. Vollständige Sätze, klare Struktur.'),
  ('tonality_whatsapp', 'Locker und herzlich. Wir duzen unsere Gäste. Kurz und prägnant, gerne mit 1-2 passenden Emojis (🎿⛷️❄️).'),
  ('signature_email', 'Liebe Grüsse aus Malbun
Dein Yeti Team

Schneesportschule Malbun
+423 263 97 00
info@schneesportschule.li'),
  ('signature_whatsapp', 'Liebe Grüsse, dein Yeti Team 🎿')
ON CONFLICT (key) DO NOTHING;