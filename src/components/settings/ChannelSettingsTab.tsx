import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, MessageCircle, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ChannelConfig {
  tonality_email: string;
  tonality_whatsapp: string;
  signature_email: string;
  signature_whatsapp: string;
}

const defaultConfig: ChannelConfig = {
  tonality_email: "Freundlich und professionell. Wir duzen unsere Gäste. Vollständige Sätze, klare Struktur.",
  tonality_whatsapp: "Locker und herzlich. Wir duzen unsere Gäste. Kurz und prägnant, gerne mit 1-2 passenden Emojis (🎿⛷️❄️).",
  signature_email: `Liebe Grüsse aus Malbun
Dein Yeti Team

Schneesportschule Malbun
+423 263 97 00
info@schneesportschule.li`,
  signature_whatsapp: "Liebe Grüsse, dein Yeti Team 🎿",
};

export function ChannelSettingsTab() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ChannelConfig>(defaultConfig);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current configuration
  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ["ai-channel-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_configuration")
        .select("key, value")
        .in("key", ["tonality_email", "tonality_whatsapp", "signature_email", "signature_whatsapp"]);

      if (error) throw error;
      
      const configMap: Partial<ChannelConfig> = {};
      data?.forEach((item) => {
        configMap[item.key as keyof ChannelConfig] = item.value;
      });
      
      return { ...defaultConfig, ...configMap };
    },
  });

  useEffect(() => {
    if (savedConfig) {
      setConfig(savedConfig);
    }
  }, [savedConfig]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newConfig: ChannelConfig) => {
      const entries = Object.entries(newConfig);
      
      for (const [key, value] of entries) {
        const { error } = await supabase
          .from("ai_configuration")
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-channel-config"] });
      queryClient.invalidateQueries({ queryKey: ["ai-configuration"] });
      setHasChanges(false);
      toast.success("Kanal-Einstellungen gespeichert");
    },
    onError: (error) => {
      console.error("Save error:", error);
      toast.error("Fehler beim Speichern");
    },
  });

  const handleChange = (key: keyof ChannelConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <CardTitle>E-Mail</CardTitle>
          </div>
          <CardDescription>
            Einstellungen für E-Mail-Antworten. Etwas formeller, mit vollständiger Signatur.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tonality_email">Tonalität</Label>
            <Textarea
              id="tonality_email"
              value={config.tonality_email}
              onChange={(e) => handleChange("tonality_email", e.target.value)}
              placeholder="Beschreibe den gewünschten Ton für E-Mails..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Beispiel: "Hallo Julia" / "Liebe Julia" – vollständige Sätze, keine Emojis
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signature_email">Signatur</Label>
            <Textarea
              id="signature_email"
              value={config.signature_email}
              onChange={(e) => handleChange("signature_email", e.target.value)}
              placeholder="E-Mail-Signatur..."
              rows={5}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <CardTitle>WhatsApp</CardTitle>
          </div>
          <CardDescription>
            Einstellungen für WhatsApp-Antworten. Lockerer, kürzer, mit dezenten Emojis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tonality_whatsapp">Tonalität</Label>
            <Textarea
              id="tonality_whatsapp"
              value={config.tonality_whatsapp}
              onChange={(e) => handleChange("tonality_whatsapp", e.target.value)}
              placeholder="Beschreibe den gewünschten Ton für WhatsApp..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Beispiel: "Hoi Julia" / "Hey Julia" – kurz, persönlich, 1-2 Emojis erlaubt
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signature_whatsapp">Signatur</Label>
            <Textarea
              id="signature_whatsapp"
              value={config.signature_whatsapp}
              onChange={(e) => handleChange("signature_whatsapp", e.target.value)}
              placeholder="WhatsApp-Signatur (kurz)..."
              rows={2}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate(config)}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </div>
  );
}
