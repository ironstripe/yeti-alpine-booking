import { useState } from "react";
import { Loader2, Users, Crown, Briefcase, GraduationCap, MoreHorizontal, KeyRound, Check, Clock, Mail, UserPlus } from "lucide-react";
import { NewUserDialog } from "@/components/settings/NewUserDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSettingsUsers, useResetUserPassword, useAddUserRole, useRemoveUserRole, UserWithRole } from "@/hooks/useSettingsUsers";
import { AppRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useInviteInstructor } from "@/hooks/useInviteInstructor";

const roleConfig = {
  admin: { label: "Admin", icon: Crown, color: "text-amber-600" },
  office: { label: "Büro", icon: Briefcase, color: "text-blue-600" },
  teacher: { label: "Lehrer", icon: GraduationCap, color: "text-green-600" },
};

export default function SettingsUsers() {
  const { data: users, isLoading } = useSettingsUsers();
  const { user: currentUser } = useAuth();
  const resetPassword = useResetUserPassword();
  const inviteInstructor = useInviteInstructor();
  const addRole = useAddUserRole();
  const removeRole = useRemoveUserRole();
  
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);

  const handleResetPassword = (user: UserWithRole) => {
    setSelectedUser(user);
    setResetDialogOpen(true);
  };

  const confirmResetPassword = async () => {
    if (selectedUser?.email) {
      await resetPassword.mutateAsync(selectedUser.email);
    }
  };

  const handleInvite = async (user: UserWithRole) => {
    if (user.instructor_id) {
      await inviteInstructor.mutateAsync(user.instructor_id);
    }
  };

  const handleToggleRole = async (user: UserWithRole, role: AppRole) => {
    if (!user.user_id) return;
    
    const hasRole = user.roles.includes(role);
    if (hasRole) {
      await removeRole.mutateAsync({ userId: user.user_id, role });
    } else {
      await addRole.mutateAsync({ userId: user.user_id, role });
    }
  };

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
              <Button size="sm" onClick={() => setNewUserDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Neuer Benutzer
              </Button>
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
                    <TableHead>Benutzer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rollen</TableHead>
                    <TableHead>Verknüpfter Lehrer</TableHead>
                    <TableHead className="w-[80px]">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{user.instructor_name || user.email || "Keine E-Mail"}</span>
                            {user.user_id === currentUser?.id && (
                              <Badge variant="outline" className="text-xs">Du</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.invitation_status === 'invited' ? (
                          <Badge variant="secondary" className="text-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Eingeladen
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            Nicht eingeladen
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Keine Rollen</span>
                          ) : (
                            user.roles.map((role) => {
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
                            })
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.instructor_name ? (
                          <span className="text-sm">{user.instructor_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.invitation_status === 'not_invited' && user.instructor_id && (
                              <DropdownMenuItem 
                                onClick={() => handleInvite(user)}
                                disabled={inviteInstructor.isPending}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                Einladen
                              </DropdownMenuItem>
                            )}
                            {user.invitation_status === 'invited' && (
                              <DropdownMenuItem 
                                onClick={() => handleResetPassword(user)}
                                disabled={!user.email}
                              >
                                <KeyRound className="h-4 w-4 mr-2" />
                                Passwort zurücksetzen
                              </DropdownMenuItem>
                            )}
                            {/* Role management - only for invited users */}
                            {user.user_id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                  Rollen verwalten
                                </DropdownMenuLabel>
                                {(['admin', 'office', 'teacher'] as const).map((role) => {
                                  const config = roleConfig[role];
                                  const Icon = config.icon;
                                  const hasRole = user.roles.includes(role);
                                  
                                  return (
                                    <DropdownMenuItem
                                      key={role}
                                      onClick={() => handleToggleRole(user, role)}
                                      disabled={addRole.isPending || removeRole.isPending}
                                    >
                                      <Icon className={`h-4 w-4 mr-2 ${config.color}`} />
                                      {config.label}
                                      {hasRole && <Check className="h-4 w-4 ml-auto" />}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      {/* New User Dialog */}
      <NewUserDialog open={newUserDialogOpen} onOpenChange={setNewUserDialogOpen} />

      {/* Password Reset Confirmation Dialog */}
      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Passwort zurücksetzen"
        description={
          <span>
            Eine E-Mail zum Zurücksetzen des Passworts wird an <strong>{selectedUser?.email}</strong> gesendet. Der Benutzer erhält einen Link, um ein neues Passwort zu wählen.
          </span>
        }
        confirmLabel="E-Mail senden"
        variant="warning"
        onConfirm={confirmResetPassword}
        isLoading={resetPassword.isPending}
      />
    </SettingsLayout>
  );
}
