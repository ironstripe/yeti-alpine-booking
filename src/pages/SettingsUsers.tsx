import { Loader2, Users, Crown, Briefcase, GraduationCap } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useSettingsUsers } from "@/hooks/useSettingsUsers";
import { useAuth } from "@/contexts/AuthContext";

const roleConfig = {
  admin: { label: "Admin", icon: Crown, color: "text-amber-600" },
  office: { label: "Büro", icon: Briefcase, color: "text-blue-600" },
  teacher: { label: "Lehrer", icon: GraduationCap, color: "text-green-600" },
};

export default function SettingsUsers() {
  const { data: users, isLoading } = useSettingsUsers();
  const { user: currentUser } = useAuth();

  if (isLoading) {
    return (
      <SettingsLayout title="Benutzer & Rollen" description="Verwalte Zugriffsrechte für Mitarbeiter">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Benutzer & Rollen" description="Verwalte Zugriffsrechte für Mitarbeiter">
      <div className="space-y-6">
        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Benutzer</CardTitle>
              {/* Invite button would go here - requires Supabase Admin API */}
            </div>
          </CardHeader>
          <CardContent>
            {!users?.length ? (
              <EmptyState
                icon={Users}
                title="Keine Benutzer"
                description="Benutzer werden hier angezeigt, sobald sie sich registriert haben."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benutzer-ID</TableHead>
                    <TableHead>Rollen</TableHead>
                    <TableHead>Verknüpfung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {user.user_id.slice(0, 8)}...
                          </code>
                          {user.user_id === currentUser?.id && (
                            <Badge variant="outline" className="text-xs">Du</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => {
                            const config = roleConfig[role];
                            const Icon = config?.icon || Users;
                            return (
                              <Badge
                                key={role}
                                variant="secondary"
                                className="flex items-center gap-1"
                              >
                                <Icon className={`h-3 w-3 ${config?.color || ""}`} />
                                {config?.label || role}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.instructor_name ? (
                          <span className="text-sm">{user.instructor_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Roles Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rollen & Berechtigungen</CardTitle>
            <CardDescription>Vordefinierte Rollen für verschiedene Zugriffsstufen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium">Admin</h4>
                <p className="text-sm text-muted-foreground">
                  Vollzugriff auf alle Funktionen inkl. Einstellungen, Berichte und Benutzerverwaltung
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium">Büro</h4>
                <p className="text-sm text-muted-foreground">
                  Buchungen, Kunden, Zahlungen und Listen. Kein Zugriff auf Einstellungen oder detaillierte Berichte.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="p-2 bg-green-100 rounded-lg">
                <GraduationCap className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium">Lehrer</h4>
                <p className="text-sm text-muted-foreground">
                  Nur eigener Stundenplan und Teilnehmerlisten im Lehrer-Portal. Kein Zugriff auf Büro-Funktionen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
