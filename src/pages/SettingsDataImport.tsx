import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { DataImportWizard } from "@/components/settings/DataImportWizard";

export default function SettingsDataImport() {
  return (
    <SettingsLayout
      title="Datenimport"
      description="Importieren Sie Testdaten aus einer ZIP-Datei mit CSV-Dateien für Kunden, Teilnehmer, Instruktoren, Produkte und Buchungen."
    >
      <DataImportWizard />
    </SettingsLayout>
  );
}
