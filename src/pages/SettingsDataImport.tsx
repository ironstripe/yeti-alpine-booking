import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { DataImportWizard } from "@/components/settings/DataImportWizard";
import { TestDataGenerator } from "@/components/settings/TestDataGenerator";
import { Separator } from "@/components/ui/separator";

export default function SettingsDataImport() {
  return (
    <SettingsLayout
      title="Datenimport"
      description="Importieren Sie Testdaten aus einer ZIP-Datei mit CSV-Dateien für Kunden, Teilnehmer, Instruktoren, Produkte und Buchungen."
    >
      <div className="space-y-8">
        <TestDataGenerator />
        
        <Separator />
        
        <DataImportWizard />
      </div>
    </SettingsLayout>
  );
}
