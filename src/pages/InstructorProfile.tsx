import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { LogOut, Save, Phone, Mail, Shield, Award, Languages, Target } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { getLevelLabel } from "@/lib/instructor-utils";
import { getSpecializationLabel } from "@/hooks/useInstructors";

const languageOptions = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "Englisch" },
  { value: "fr", label: "Französisch" },
  { value: "it", label: "Italienisch" },
  { value: "es", label: "Spanisch" },
];

const specializationOptions = [
  { value: "kids", label: "Kinderunterricht" },
  { value: "beginner", label: "Anfänger" },
  { value: "advanced", label: "Fortgeschrittene" },
  { value: "race", label: "Renntraining" },
  { value: "freeride", label: "Freeriding" },
  { value: "telemark", label: "Telemark" },
];

export default function InstructorProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { instructorId } = useUserRole();

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);

  // Fetch instructor data
  const { data: instructor, isLoading } = useQuery({
    queryKey: ["instructor-profile", instructorId],
    queryFn: async () => {
      if (!instructorId) return null;

      const { data, error } = await supabase
        .from("instructors")
        .select("*")
        .eq("id", instructorId)
        .single();

      if (error) throw error;

      // Initialize form state
      setPhone(data.phone || "");
      setEmail(data.email || "");
      setLanguages(data.languages || []);

      return data;
    },
    enabled: !!instructorId,
  });

  // Fetch season stats
  const { data: seasonStats } = useQuery({
    queryKey: ["instructor-season-stats-profile", instructorId],
    queryFn: async () => {
      if (!instructorId) return null;

      const now = new Date();
      const seasonStart = now.getMonth() >= 11
        ? new Date(now.getFullYear(), 11, 1)
        : new Date(now.getFullYear() - 1, 11, 1);

      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          time_start,
          time_end,
          participant_id,
          products (type)
        `)
        .eq("instructor_id", instructorId)
        .gte("date", seasonStart.toISOString().split("T")[0]);

      if (error) throw error;

      let totalMinutes = 0;
      let privateMinutes = 0;
      let groupMinutes = 0;
      const participantIds = new Set<string>();

      (data || []).forEach((item: any) => {
        if (item.time_start && item.time_end) {
          const [startH, startM] = item.time_start.split(":").map(Number);
          const [endH, endM] = item.time_end.split(":").map(Number);
          const mins = (endH * 60 + endM) - (startH * 60 + startM);
          totalMinutes += mins;

          if (item.products?.type === "private") {
            privateMinutes += mins;
          } else {
            groupMinutes += mins;
          }
        }
        if (item.participant_id) {
          participantIds.add(item.participant_id);
        }
      });

      return {
        totalHours: Math.round(totalMinutes / 60),
        privateHours: Math.round(privateMinutes / 60),
        groupHours: Math.round(groupMinutes / 60),
        participantCount: participantIds.size,
      };
    },
    enabled: !!instructorId,
  });

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!instructorId) throw new Error("No instructor ID");

      const { error } = await supabase
        .from("instructors")
        .update({
          phone,
          email,
          languages,
        })
        .eq("id", instructorId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profil aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["instructor-profile"] });
    },
    onError: (error) => {
      console.error("Error updating profile:", error);
      toast.error("Fehler beim Speichern");
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang)
        ? prev.filter((l) => l !== lang)
        : [...prev, lang]
    );
  };

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </InstructorLayout>
    );
  }

  if (!instructor) {
    return (
      <InstructorLayout>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Profil nicht gefunden</p>
          </CardContent>
        </Card>
      </InstructorLayout>
    );
  }

  const getInitials = () => {
    return `${instructor.first_name?.charAt(0) || ""}${instructor.last_name?.charAt(0) || ""}`.toUpperCase();
  };

  return (
    <InstructorLayout>
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="text-center">
          <Avatar className="h-24 w-24 mx-auto mb-4">
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-xl font-bold">
            {instructor.first_name} {instructor.last_name}
          </h1>
          <p className="text-muted-foreground">
            Skilehrer seit {instructor.entry_date 
              ? new Date(instructor.entry_date).getFullYear() 
              : "N/A"}
          </p>
        </div>

        {/* Contact Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Kontaktdaten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+41 79 123 45 67"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="max@example.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Qualifications (Read-only) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4" />
              Qualifikationen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="secondary" className="mr-2">
                🎿 {getLevelLabel(instructor.level)}
              </Badge>
              {instructor.specialization && (
                <Badge variant="outline">
                  {getSpecializationLabel(instructor.specialization)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Änderungen nur durch das Büro möglich
            </p>
          </CardContent>
        </Card>

        {/* Languages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Languages className="h-4 w-4" />
              Sprachen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {languageOptions.map((lang) => (
                <div key={lang.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={lang.value}
                    checked={languages.includes(lang.value)}
                    onCheckedChange={() => toggleLanguage(lang.value)}
                  />
                  <Label htmlFor={lang.value} className="cursor-pointer">
                    {lang.label}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Season Stats */}
        {seasonStats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" />
                Saison-Statistik
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Diese Saison (2025/26):
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold">{seasonStats.totalHours}h</p>
                  <p className="text-sm text-muted-foreground">Unterrichtsstunden</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{seasonStats.participantCount}</p>
                  <p className="text-sm text-muted-foreground">Teilnehmer betreut</p>
                </div>
                <div>
                  <p className="text-lg font-medium">{seasonStats.privateHours}h</p>
                  <p className="text-sm text-muted-foreground">Privatstunden</p>
                </div>
                <div>
                  <p className="text-lg font-medium">{seasonStats.groupHours}h</p>
                  <p className="text-sm text-muted-foreground">Gruppenkurse</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Wird gespeichert..." : "Änderungen speichern"}
          </Button>

          <Separator />

          <Button
            variant="destructive"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Abmelden
          </Button>
        </div>
      </div>
    </InstructorLayout>
  );
}
