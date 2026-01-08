import { Bell, Construction } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsNotifications() {
  return (
    <SettingsLayout 
      title="Benachrichtigungen" 
      description="Konfiguriere wann und wie Benachrichtigungen gesendet werden"
    >
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Construction className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Demnächst verfügbar</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Benachrichtigungseinstellungen werden in einer zukünftigen Version verfügbar sein.
            </p>
          </div>
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}
