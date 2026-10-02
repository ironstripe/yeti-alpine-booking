import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { DataImportWizard } from "@/components/settings/DataImportWizard";
import { TestDataGenerator } from "@/components/settings/TestDataGenerator";
import { BookingMigrationPrep } from "@/components/settings/BookingMigrationPrep";
import { Separator } from "@/components/ui/separator";

export default function SettingsDataImport() {
  return (
    <SettingsLayout
      title="Datenimport"
      description="Importieren Sie Testdaten aus einer ZIP-Datei mit CSV-Dateien für Kunden, Teilnehmer, Instruktoren, Produkte und Buchungen."
    >
      <div className="space-y-8">
        <BookingMigrationPrep />

        <Separator />

        <TestDataGenerator />
        
        <Separator />
        
        <DataImportWizard />
      </div>
    </SettingsLayout>
  );
}
