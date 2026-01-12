import { useState, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { format, addDays, differenceInDays, parse, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Copy,
  Clock,
  Users,
  Calendar,
  GraduationCap,
  ChevronLeft,
  Check,
  Loader2,
  Phone,
  Star,
  ArrowRight,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EnhancedDatePicker } from "@/components/ui/enhanced-date-picker";
import { PageHeader } from "@/components/layout/PageHeader";

import { useSchoolTariff } from "@/hooks/useSchoolTariff";
import { useInstructors } from "@/hooks/useInstructors";
import { useCustomers } from "@/hooks/useCustomers";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { supabase } from "@/integrations/supabase/client";

interface ScheduleSlot {
  date: string;
  start_time: string;
  end_time: string;
  instructor_id: string;
}

interface SchoolGroup {
  id: string;
  group_name: string;
  skill_level: "beginner" | "intermediate" | "advanced";
  participant_count: number;
  schedule: ScheduleSlot[];
}

interface SchoolCampFormData {
  customer_id: string;
  camp_start_date: Date | undefined;
  camp_end_date: Date | undefined;
  total_participants: number;
  notes_for_instructors: string;
  send_invoice: boolean;
}

const SKILL_LEVELS = [
  { value: "beginner", label: "Anfänger", color: "bg-green-100 text-green-800" },
  { value: "intermediate", label: "Fortgeschritten", color: "bg-blue-100 text-blue-800" },
  { value: "advanced", label: "Könner", color: "bg-purple-100 text-purple-800" },
];

export default function SchoolCampBooking() {
  const navigate = useNavigate();
  const { data: schoolTariff, isLoading: tariffLoading } = useSchoolTariff();
  const { data: instructorsData } = useInstructors();
  const instructors = instructorsData || [];
  const [searchQuery, setSearchQuery] = useState("");
  const { data: customers } = useCustomers(searchQuery);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const { data: contacts } = useCustomerContacts(selectedCustomerId || undefined);
  const [groups, setGroups] = useState<SchoolGroup[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<SchoolCampFormData>({
    customer_id: "",
    camp_start_date: undefined,
    camp_end_date: undefined,
    total_participants: 0,
    notes_for_instructors: "",
    send_invoice: true,
  });

  // Filter customers to only show schools
  const schoolCustomers = useMemo(() => {
    return (customers || []).filter(
      (c) => (c as any).customer_type === "school" || (c as any).organization_name
    );
  }, [customers]);

  const selectedCustomer = useMemo(() => {
    return schoolCustomers.find((c) => c.id === selectedCustomerId);
  }, [schoolCustomers, selectedCustomerId]);

  // Generate camp dates
  const campDates = useMemo(() => {
    if (!formData.camp_start_date || !formData.camp_end_date) return [];
    const dates: string[] = [];
    let current = new Date(formData.camp_start_date);
    const end = new Date(formData.camp_end_date);
    while (current <= end) {
      dates.push(format(current, "yyyy-MM-dd"));
      current = addDays(current, 1);
    }
    return dates;
  }, [formData.camp_start_date, formData.camp_end_date]);

  // Add new group with schedule for all camp dates
  const addGroup = () => {
    const newGroup: SchoolGroup = {
      id: crypto.randomUUID(),
      group_name: `Gruppe ${groups.length + 1}`,
      skill_level: "beginner",
      participant_count: 10,
      schedule: campDates.map((date) => ({
        date,
        start_time: "10:00",
        end_time: "11:30",
        instructor_id: "",
      })),
    };
    setGroups([...groups, newGroup]);
  };

  const removeGroup = (groupId: string) => {
    setGroups(groups.filter((g) => g.id !== groupId));
  };

  const updateGroup = (groupId: string, updates: Partial<SchoolGroup>) => {
    setGroups(
      groups.map((g) => (g.id === groupId ? { ...g, ...updates } : g))
    );
  };

  const updateScheduleSlot = (
    groupId: string,
    slotIndex: number,
    updates: Partial<ScheduleSlot>
  ) => {
    setGroups(
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const newSchedule = [...g.schedule];
        newSchedule[slotIndex] = { ...newSchedule[slotIndex], ...updates };
        return { ...g, schedule: newSchedule };
      })
    );
  };

  // Apply same time to all days in a group
  const applyTimeToAllDays = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.schedule.length === 0) return;

    const firstSlot = group.schedule[0];
    updateGroup(groupId, {
      schedule: group.schedule.map((s) => ({
        ...s,
        start_time: firstSlot.start_time,
        end_time: firstSlot.end_time,
      })),
    });
    toast.success("Zeit für alle Tage übernommen");
  };

  // Apply same instructor to all days in a group
  const applyInstructorToAllDays = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.schedule.length === 0) return;

    const firstSlot = group.schedule[0];
    if (!firstSlot.instructor_id) {
      toast.error("Bitte zuerst einen Lehrer für den ersten Tag auswählen");
      return;
    }
    updateGroup(groupId, {
      schedule: group.schedule.map((s) => ({
        ...s,
        instructor_id: firstSlot.instructor_id,
      })),
    });
    toast.success("Lehrer für alle Tage übernommen");
  };

  // Calculate hours for a single slot
  const parseTime = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours + minutes / 60;
  };

  const calculateSlotHours = (start: string, end: string): number => {
    return Math.max(0, parseTime(end) - parseTime(start));
  };

  // Calculate total price
  const totalPrice = useMemo(() => {
    if (!schoolTariff) return 0;

    return groups.reduce((total, group) => {
      const groupHours = group.schedule.reduce((hours, slot) => {
        return hours + calculateSlotHours(slot.start_time, slot.end_time);
      }, 0);
      return total + groupHours * schoolTariff.hourly_rate;
    }, 0);
  }, [groups, schoolTariff]);

  // Calculate total participants
  const totalParticipants = useMemo(() => {
    return groups.reduce((sum, g) => sum + g.participant_count, 0);
  }, [groups]);

  // When dates change, update all groups' schedules
  const handleDatesChange = (startDate: Date | undefined, endDate: Date | undefined) => {
    setFormData((prev) => ({
      ...prev,
      camp_start_date: startDate,
      camp_end_date: endDate,
    }));

    if (startDate && endDate && groups.length > 0) {
      const newDates: string[] = [];
      let current = new Date(startDate);
      while (current <= endDate) {
        newDates.push(format(current, "yyyy-MM-dd"));
        current = addDays(current, 1);
      }

      setGroups(
        groups.map((group) => ({
          ...group,
          schedule: newDates.map((date) => {
            const existingSlot = group.schedule.find((s) => s.date === date);
            return (
              existingSlot || {
                date,
                start_time: "10:00",
                end_time: "11:30",
                instructor_id: "",
              }
            );
          }),
        }))
      );
    }
  };

  const handleSubmit = async () => {
    if (!selectedCustomerId) {
      toast.error("Bitte wähle eine Schule aus");
      return;
    }
    if (!formData.camp_start_date || !formData.camp_end_date) {
      toast.error("Bitte wähle den Zeitraum aus");
      return;
    }
    if (groups.length === 0) {
      toast.error("Bitte füge mindestens eine Gruppe hinzu");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create ticket with type 'school_camp'
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          customer_id: selectedCustomerId,
          ticket_type: "school_camp",
          camp_start_date: format(formData.camp_start_date, "yyyy-MM-dd"),
          camp_end_date: format(formData.camp_end_date, "yyyy-MM-dd"),
          total_participants: totalParticipants,
          skip_documents: true,
          notes_for_instructors: formData.notes_for_instructors || null,
          total_amount: totalPrice,
          status: "confirmed",
        } as never)
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Create ticket_items for each group/day combination
      const ticketItems = groups.flatMap((group) =>
        group.schedule.map((slot) => ({
          ticket_id: ticket.id,
          item_type: "school_group",
          group_name: group.group_name,
          skill_level: group.skill_level,
          group_participant_count: group.participant_count,
          date: slot.date,
          custom_start_time: slot.start_time,
          custom_end_time: slot.end_time,
          instructor_id: slot.instructor_id || null,
          unit_price: calculateSlotHours(slot.start_time, slot.end_time) * (schoolTariff?.hourly_rate || 95),
          product_id: null, // School bookings don't have a standard product
        }))
      );

      const { error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems as never);

      if (itemsError) throw itemsError;

      toast.success("Skilager erfolgreich gebucht");
      navigate(`/bookings/${ticket.id}`);
    } catch (error) {
      console.error("Error creating school camp booking:", error);
      toast.error("Fehler beim Erstellen der Buchung");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (tariffLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container max-w-5xl py-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Skilager buchen</h1>
              <p className="text-muted-foreground">
                Buchung für Schulen und Gruppen mit individuellem Stundenplan
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-6 space-y-6">
        {/* Customer Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Schule auswählen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Schule suchen</Label>
              <Input
                placeholder="Schulname eingeben..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>

            {searchQuery && schoolCustomers.length > 0 && !selectedCustomerId && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {schoolCustomers.slice(0, 5).map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setFormData((prev) => ({ ...prev, customer_id: customer.id }));
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-accent flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {(customer as any).organization_name || `${customer.first_name} ${customer.last_name}`}
                      </p>
                      <p className="text-sm text-muted-foreground">{customer.email}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}

            {searchQuery && schoolCustomers.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <p>Keine Schulen gefunden.</p>
                <Button
                  variant="link"
                  onClick={() => navigate("/customers")}
                  className="mt-1"
                >
                  Neue Schule als Kunde erfassen
                </Button>
              </div>
            )}

            {selectedCustomer && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <p className="font-medium">
                          {(selectedCustomer as any).organization_name ||
                            `${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedCustomer.email}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomerId(null)}
                    >
                      Ändern
                    </Button>
                  </div>

                  {contacts && contacts.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium mb-2">Ansprechpartner:</p>
                      <div className="space-y-2">
                        {contacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-center gap-3 text-sm"
                          >
                            {contact.is_primary && (
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            )}
                            <span className="font-medium">{contact.name}</span>
                            {contact.role && (
                              <Badge variant="outline" className="text-xs">
                                {contact.role}
                              </Badge>
                            )}
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Camp Period */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Zeitraum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <Label>Von</Label>
                <EnhancedDatePicker
                  value={formData.camp_start_date}
                  onChange={(date) =>
                    handleDatesChange(date, formData.camp_end_date)
                  }
                />
              </div>
              <div>
                <Label>Bis</Label>
                <EnhancedDatePicker
                  value={formData.camp_end_date}
                  onChange={(date) =>
                    handleDatesChange(formData.camp_start_date, date)
                  }
                />
              </div>
              {campDates.length > 0 && (
                <Badge variant="secondary" className="h-fit">
                  {campDates.length} Tage
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Groups */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Gruppen & Lehrerzuweisung
              </CardTitle>
              <Button
                onClick={addGroup}
                disabled={campDates.length === 0}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Gruppe hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {campDates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Bitte zuerst den Zeitraum festlegen
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Noch keine Gruppen erfasst. Klicke auf "Gruppe hinzufügen".
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group, groupIndex) => (
                  <Card key={group.id} className="border-dashed">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Input
                            value={group.group_name}
                            onChange={(e) =>
                              updateGroup(group.id, { group_name: e.target.value })
                            }
                            className="w-40 font-medium"
                          />
                          <Select
                            value={group.skill_level}
                            onValueChange={(v) =>
                              updateGroup(group.id, {
                                skill_level: v as SchoolGroup["skill_level"],
                              })
                            }
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SKILL_LEVELS.map((level) => (
                                <SelectItem key={level.value} value={level.value}>
                                  {level.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              min={1}
                              value={group.participant_count}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  participant_count: parseInt(e.target.value) || 1,
                                })
                              }
                              className="w-16"
                            />
                            <span className="text-sm text-muted-foreground">
                              Schüler
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroup(group.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Quick actions */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applyTimeToAllDays(group.id)}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          Zeit für alle Tage
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applyInstructorToAllDays(group.id)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Lehrer für alle Tage
                        </Button>
                      </div>

                      {/* Schedule table */}
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-32">Tag</TableHead>
                              <TableHead className="w-24">Von</TableHead>
                              <TableHead className="w-24">Bis</TableHead>
                              <TableHead>Skilehrer</TableHead>
                              <TableHead className="w-20 text-right">Std.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.schedule.map((slot, slotIndex) => {
                              const hours = calculateSlotHours(
                                slot.start_time,
                                slot.end_time
                              );
                              return (
                                <TableRow key={slot.date}>
                                  <TableCell className="font-medium">
                                    {format(parseISO(slot.date), "EEE, dd.MM.", {
                                      locale: de,
                                    })}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="time"
                                      value={slot.start_time}
                                      onChange={(e) =>
                                        updateScheduleSlot(group.id, slotIndex, {
                                          start_time: e.target.value,
                                        })
                                      }
                                      className="w-24"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="time"
                                      value={slot.end_time}
                                      onChange={(e) =>
                                        updateScheduleSlot(group.id, slotIndex, {
                                          end_time: e.target.value,
                                        })
                                      }
                                      className="w-24"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={slot.instructor_id || "none"}
                                      onValueChange={(v) =>
                                        updateScheduleSlot(group.id, slotIndex, {
                                          instructor_id: v === "none" ? "" : v,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Auswählen..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">
                                          Nicht zugewiesen
                                        </SelectItem>
                                        {instructors.map((instructor) => (
                                          <SelectItem
                                            key={instructor.id}
                                            value={instructor.id}
                                          >
                                            {instructor.first_name} {instructor.last_name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {hours.toFixed(1)}h
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Group subtotal */}
                      <div className="flex justify-end text-sm text-muted-foreground">
                        Gruppenpreis:{" "}
                        <span className="ml-2 font-medium text-foreground">
                          {group.schedule
                            .reduce(
                              (h, s) =>
                                h + calculateSlotHours(s.start_time, s.end_time),
                              0
                            )
                            .toFixed(1)}
                          h × CHF {schoolTariff?.hourly_rate.toFixed(2)} = CHF{" "}
                          {(
                            group.schedule.reduce(
                              (h, s) =>
                                h + calculateSlotHours(s.start_time, s.end_time),
                              0
                            ) * (schoolTariff?.hourly_rate || 0)
                          ).toFixed(2)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes for instructors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hinweise für Skilehrer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Besondere Hinweise, Treffpunkt, Kontaktpersonen vor Ort..."
              value={formData.notes_for_instructors}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  notes_for_instructors: e.target.value,
                }))
              }
              rows={3}
            />

            {contacts && contacts.length > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm font-medium mb-2">Ansprechpartner vor Ort:</div>
                {contacts.map((contact) => (
                  <div key={contact.id} className="text-sm">
                    {contact.name} ({contact.role}): {contact.phone}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle>Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Anzahl Gruppen:</span>
                <span>{groups.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Anzahl Schüler:</span>
                <span>{totalParticipants}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Zeitraum:</span>
                <span>{campDates.length} Tage</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Schultarif:</span>
                <span>
                  CHF {schoolTariff?.hourly_rate.toFixed(2)} / Gruppe / Stunde
                </span>
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span>
                  CHF{" "}
                  {totalPrice.toLocaleString("de-CH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send_invoice"
                  checked={formData.send_invoice}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      send_invoice: !!checked,
                    }))
                  }
                />
                <Label htmlFor="send_invoice">Rechnung an Schule senden</Label>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4" />
                <span>
                  Keine Teilnehmerlisten oder Tickets (Schule verwaltet selbst)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={groups.length === 0 || isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Skilager buchen
          </Button>
        </div>
      </div>
    </div>
  );
}
