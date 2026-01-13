import { useState } from "react";
import { Plus, Trash2, Star, Phone, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateCustomerContact,
  useUpdateCustomerContact,
  useDeleteCustomerContact,
  CustomerContact,
} from "@/hooks/useCustomerContacts";
import { normalizePhoneNumber, formatPhoneDisplay } from "@/lib/phone-utils";

const CONTACT_ROLES = [
  "Hauptkontakt",
  "Klassenlehrer/in",
  "Begleitlehrer/in",
  "Schulleitung",
  "Notfallkontakt",
] as const;

interface ContactPersonsCardProps {
  customerId: string;
  contacts: CustomerContact[];
}

export function ContactPersonsCard({ customerId, contacts }: ContactPersonsCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    role: "Begleitlehrer/in",
    phone: "",
    email: "",
  });

  const createContact = useCreateCustomerContact();
  const updateContact = useUpdateCustomerContact();
  const deleteContact = useDeleteCustomerContact();

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      toast.error("Name und Telefon sind erforderlich");
      return;
    }

    await createContact.mutateAsync({
      customer_id: customerId,
      name: newContact.name.trim(),
      role: newContact.role,
      phone: normalizePhoneNumber(newContact.phone),
      email: newContact.email.trim() || null,
      is_primary: contacts.length === 0,
    });

    setNewContact({ name: "", role: "Begleitlehrer/in", phone: "", email: "" });
    setIsAdding(false);
  };

  const handleSetPrimary = async (contact: CustomerContact) => {
    if (contact.is_primary) return;
    
    await updateContact.mutateAsync({
      id: contact.id,
      customerId,
      is_primary: true,
    });
  };

  const handleDeleteContact = async (contact: CustomerContact) => {
    if (!window.confirm(`Möchten Sie ${contact.name} wirklich löschen?`)) return;
    
    await deleteContact.mutateAsync({
      id: contact.id,
      customerId,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Ansprechpartner</CardTitle>
        {!isAdding && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Hinzufügen
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {contacts.length === 0 && !isAdding ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Noch keine Ansprechpartner erfasst
          </p>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
                <button
                  onClick={() => handleSetPrimary(contact)}
                  className={`mt-1 ${
                    contact.is_primary
                      ? "text-yellow-500"
                      : "text-muted-foreground hover:text-yellow-400"
                  }`}
                  title={contact.is_primary ? "Hauptkontakt" : "Als Hauptkontakt setzen"}
                >
                  <Star className="h-4 w-4" fill={contact.is_primary ? "currentColor" : "none"} />
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{contact.name}</span>
                    {contact.role && (
                      <Badge variant="secondary" className="text-xs">
                        {contact.role}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <a href={`tel:${contact.phone}`} className="hover:underline">
                      {formatPhoneDisplay(contact.phone)}
                    </a>
                  </div>
                  {contact.email && (
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <a href={`mailto:${contact.email}`} className="hover:underline">
                        {contact.email}
                      </a>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteContact(contact)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {isAdding && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  placeholder="Max Müller"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rolle</label>
                <Select
                  value={newContact.role}
                  onValueChange={(value) => setNewContact({ ...newContact, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Telefon <span className="text-destructive">*</span>
                </label>
                <Input
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  placeholder="+41 79 123 45 67"
                  type="tel"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">E-Mail</label>
                <Input
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  placeholder="max@schule.ch"
                  type="email"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setNewContact({ name: "", role: "Begleitlehrer/in", phone: "", email: "" });
                }}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleAddContact}
                disabled={createContact.isPending}
              >
                {createContact.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Speichern
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
