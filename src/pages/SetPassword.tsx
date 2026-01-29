import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Lock, AlertCircle, CheckCircle } from "lucide-react";

export default function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const verificationComplete = useRef(false);

  const nextPath = searchParams.get("next") || "/instructor";

  // Explicitly establish session from URL hash tokens
  useEffect(() => {
    const establishSession = async () => {
      // If already verified or user exists, skip
      if (verificationComplete.current || user) {
        setIsVerifying(false);
        return;
      }

      // Parse tokens from URL hash
      const hash = window.location.hash.substring(1); // Remove #
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      console.log("SetPassword: Checking URL hash", { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken, 
        type 
      });

      if (!accessToken || !refreshToken) {
        // No tokens in URL - link was likely already used or expired
        console.log("SetPassword: No tokens in URL, marking as expired");
        setIsVerifying(false);
        verificationComplete.current = true;
        return;
      }

      // Explicitly establish session from tokens
      try {
        console.log("SetPassword: Establishing session from URL tokens");
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error("SetPassword: Failed to establish session", sessionError);
          setIsVerifying(false);
          verificationComplete.current = true;
          return;
        }

        if (data.session) {
          console.log("SetPassword: Session established successfully");
          // Clear the hash from URL for cleanliness
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch (err) {
        console.error("SetPassword: Error establishing session", err);
      }

      setIsVerifying(false);
      verificationComplete.current = true;
    };

    establishSession();
  }, [user]);

  const validatePassword = () => {
    if (password.length < 6) {
      return "Passwort muss mindestens 6 Zeichen haben";
    }
    if (password !== confirmPassword) {
      return "Passwörter stimmen nicht überein";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validatePassword();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setIsSuccess(true);
      toast.success("Passwort erfolgreich gesetzt!");
      
      // Navigate after a short delay
      setTimeout(() => {
        navigate(nextPath, { replace: true });
      }, 1500);
    } catch (err) {
      console.error("Password update error:", err);
      const message = err instanceof Error ? err.message : "Fehler beim Setzen des Passworts";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth or verifying recovery tokens
  if (authLoading || isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Link wird überprüft...</p>
        </div>
      </div>
    );
  }

  // Show invalid link message if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Link ungültig oder abgelaufen</CardTitle>
            <CardDescription>
              Der Einladungslink ist nicht mehr gültig. Bitte fordere eine neue Einladung an.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => navigate("/login", { replace: true })}
            >
              Zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Passwort gesetzt!</CardTitle>
            <CardDescription>
              Du wirst jetzt zum Lehrer-Portal weitergeleitet...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show password form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Passwort setzen</CardTitle>
          <CardDescription>
            Willkommen! Bitte setze ein Passwort für dein Konto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Neues Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                required
                minLength={6}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
                required
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || password.length < 6}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gespeichert...
                </>
              ) : (
                "Passwort speichern"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
