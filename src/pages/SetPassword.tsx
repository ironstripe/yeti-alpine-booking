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

  // Check for recovery tokens in URL and wait for auth to complete
  useEffect(() => {
    // If already verified or user exists, skip
    if (verificationComplete.current || user) {
      setIsVerifying(false);
      return;
    }

    // Check if URL has recovery tokens (indicates we came from email link)
    const hash = window.location.hash;
    const hasRecoveryTokens = hash.includes('access_token') || hash.includes('type=recovery');
    
    console.log("SetPassword: Checking for recovery tokens", { hash: hash.substring(0, 50), hasRecoveryTokens, user: !!user });
    
    if (!hasRecoveryTokens && !user) {
      // No tokens in URL and no user - link was likely already used or expired
      console.log("SetPassword: No recovery tokens and no user, marking as expired");
      setIsVerifying(false);
      verificationComplete.current = true;
      return;
    }

    // Listen for auth state changes (recovery link will set session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("SetPassword: Auth event received", { event, hasSession: !!session });
      
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        // Successfully authenticated via recovery link
        console.log("SetPassword: Recovery/SignIn event - showing password form");
        setIsVerifying(false);
        setError(null);
        verificationComplete.current = true;
      }
      
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // Session established
        setIsVerifying(false);
        verificationComplete.current = true;
      }
    });

    // Timeout fallback - if no auth event after 5 seconds, assume link is invalid
    const timeout = setTimeout(() => {
      if (!verificationComplete.current) {
        console.log("SetPassword: Timeout reached, checking final state", { user: !!user });
        setIsVerifying(false);
        verificationComplete.current = true;
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
