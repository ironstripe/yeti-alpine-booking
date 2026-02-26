import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryItemsTab } from "@/components/settings/inventory/InventoryItemsTab";
import { InventoryCategoriesTab } from "@/components/settings/inventory/InventoryCategoriesTab";

export default function SettingsInventory() {
  return (
    <SettingsLayout title="Inventar" description="Verwalte Kategorien und Artikel für die Materialausleihe.">
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Artikel</TabsTrigger>
          <TabsTrigger value="categories">Kategorien</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <InventoryItemsTab />
        </TabsContent>
        <TabsContent value="categories">
          <InventoryCategoriesTab />
        </TabsContent>
      </Tabs>
    </SettingsLayout>
  );
}
