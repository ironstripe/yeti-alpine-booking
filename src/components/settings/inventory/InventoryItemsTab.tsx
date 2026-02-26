import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useInventoryItems, useDeleteItem, InventoryItem } from "@/hooks/useInventory";
import { InventoryItemFormModal } from "./InventoryItemFormModal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  "Verfügbar": "bg-green-100 text-green-800",
  "Ausgeliehen": "bg-blue-100 text-blue-800",
  "Verloren": "bg-red-100 text-red-800",
  "In Reparatur": "bg-amber-100 text-amber-800",
};

const conditionColors: Record<string, string> = {
  "Neu": "bg-green-100 text-green-800",
  "Ok": "bg-blue-100 text-blue-800",
  "Ausgebleicht": "bg-amber-100 text-amber-800",
  "Ersetzen": "bg-red-100 text-red-800",
};

export function InventoryItemsTab() {
  const { data: items, isLoading } = useInventoryItems();
  const deleteMutation = useDeleteItem();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const openCreate = () => { setEditingItem(null); setModalOpen(true); };
  const openEdit = (item: InventoryItem) => { setEditingItem(item); setModalOpen(true); };

  if (isLoading) {
    return <div className="space-y-2 mt-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Neuer Artikel</Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Inv.-Nr.</TableHead>
              <TableHead>Grösse</TableHead>
              <TableHead>Zustand</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Artikel vorhanden</TableCell></TableRow>
            )}
            {items?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{(item.category as any)?.name || "–"}</TableCell>
                <TableCell className="font-mono text-sm">{item.inventory_number || "–"}</TableCell>
                <TableCell>{item.size || "–"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={conditionColors[item.condition] || ""}>{item.condition}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusColors[item.status] || ""}>{item.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)} disabled={item.status === "Ausgeliehen"}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <InventoryItemFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingItem={editingItem}
      />
    </div>
  );
}
