import { useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BillingPartner,
  useBillingPartners,
  useCreateBillingPartner,
  useDeleteBillingPartner,
  useToggleBillingPartnerActive,
  useUpdateBillingPartner,
} from "@/hooks/useBillingPartners";

export default function SettingsHotels() {
  const { data: hotels = [], isLoading } = useBillingPartners();
  const createHotel = useCreateBillingPartner();
  const updateHotel = useUpdateBillingPartner();
  const toggleActive = useToggleBillingPartnerActive();
  const deleteHotel = useDeleteBillingPartner();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BillingPartner | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const openNew = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setAddress("");
    setDialogOpen(true);
  };

  const openEdit = (hotel: BillingPartner) => {
    setEditing(hotel);
    setName(hotel.name);
    setEmail(hotel.billing_email || "");
    setAddress(hotel.address || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (editing) {
      await updateHotel.mutateAsync({
        id: editing.id,
        name,
        billing_email: email,
        address,
      });
    } else {
      await createHotel.mutateAsync({ name, billing_email: email, address });
    }
    setDialogOpen(false);
  };

  return (
    <SettingsLayout
      title="Hotels"
      description="Stammdaten der Hotels, die Buchungen auf Rechnung übernehmen"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Nur aktive Hotels können bei neuen Buchungen als Rechnungsempfänger gewählt werden.
          </p>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Hotel hinzufügen
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Rechnungs-E-Mail</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Aktiv</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Lädt…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && hotels.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      Noch keine Hotels erfasst
                    </TableCell>
                  </TableRow>
                )}
                {hotels.map((hotel) => (
                  <TableRow key={hotel.id}>
                    <TableCell className="font-medium">
                      {hotel.name}
                      {!hotel.is_active && (
                        <Badge variant="outline" className="ml-2">
                          Inaktiv
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {hotel.billing_email || "–"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{hotel.address || "–"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={hotel.is_active}
                        onCheckedChange={(checked) =>
                          toggleActive.mutate({ id: hotel.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(hotel)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteHotel.mutate(hotel.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Hotel bearbeiten" : "Neues Hotel"}</DialogTitle>
            <DialogDescription>
              Hotels, die für Buchungen ihrer Gäste die Rechnung übernehmen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hotel-name">Name *</Label>
              <Input
                id="hotel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hotel Gorfion"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel-email">Rechnungs-E-Mail</Label>
              <Input
                id="hotel-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="buchhaltung@hotel.li"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel-address">Adresse</Label>
              <Textarea
                id="hotel-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
