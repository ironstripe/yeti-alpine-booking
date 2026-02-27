import { Link } from "react-router-dom";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InventoryItemsTab } from "@/components/settings/inventory/InventoryItemsTab";
import { InventoryCategoriesTab } from "@/components/settings/inventory/InventoryCategoriesTab";
import { Boxes } from "lucide-react";

export default function SettingsInventory() {
  return (
    <SettingsLayout title="Inventar" description="Verwalte Kategorien und Artikel für die Materialausleihe.">
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/rentals">
            <Boxes className="h-4 w-4 mr-2" />
            Ausleihen-Übersicht
          </Link>
        </Button>
      </div>
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
