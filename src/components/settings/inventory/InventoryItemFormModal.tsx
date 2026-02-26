import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryCategories, useCreateItem, useUpdateItem, SIZES, CONDITIONS, ITEM_STATUSES, InventoryItem } from "@/hooks/useInventory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: InventoryItem | null;
}

export function InventoryItemFormModal({ open, onOpenChange, editingItem }: Props) {
  const { data: categories } = useInventoryCategories();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [inventoryNumber, setInventoryNumber] = useState("");
  const [size, setSize] = useState<string>("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState<string>("Neu");
  const [status, setStatus] = useState<string>("Verfügbar");

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setCategoryId(editingItem.category_id || "");
      setInventoryNumber(editingItem.inventory_number || "");
      setSize(editingItem.size || "");
      setColor(editingItem.color || "");
      setCondition(editingItem.condition);
      setStatus(editingItem.status);
    } else {
      setName(""); setCategoryId(""); setInventoryNumber(""); setSize(""); setColor(""); setCondition("Neu"); setStatus("Verfügbar");
    }
  }, [editingItem, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    const values = {
      name: name.trim(),
      category_id: categoryId || null,
      inventory_number: inventoryNumber.trim() || null,
      size: size || null,
      color: color.trim() || null,
      condition,
      status,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, ...values }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(values, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Artikel bearbeiten" : "Neuer Artikel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Skijacke Rot" />
          </div>
          <div>
            <label className="text-sm font-medium">Kategorie</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Inventarnummer</label>
            <Input value={inventoryNumber} onChange={(e) => setInventoryNumber(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Grösse</label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger><SelectValue placeholder="–" /></SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Farbe</label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Zustand</label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {editingItem ? "Speichern" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
