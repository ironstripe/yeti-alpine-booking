import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LoginStatus = "loading" | "success" | "error";

export default function TestInstructorLogin() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<LoginStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [instructorName, setInstructorName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Kein Token angegeben");
      return;
    }

    const performLogin = async () => {
      try {
        // Call the edge function to validate token and get session
        const { data, error: fnError } = await supabase.functions.invoke(
          "test-instructor-login",
          { body: { token } }
        );

        if (fnError) {
          console.error("Edge function error:", fnError);
          setStatus("error");
          setError("Login fehlgeschlagen. Bitte versuche es erneut.");
          return;
        }

        if (data?.error) {
          setStatus("error");
          setError(data.error);
          return;
        }

        if (!data?.access_token || !data?.refresh_token) {
          setStatus("error");
          setError("Ungültige Antwort vom Server");
          return;
        }

        // Set the session using the tokens from the edge function
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });

        if (sessionError) {
          console.error("Session error:", sessionError);
          setStatus("error");
          setError("Session konnte nicht erstellt werden");
          return;
        }

        // Wait for auth state to fully propagate before navigating
        await new Promise<void>((resolve) => {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (session) {
                subscription.unsubscribe();
                resolve();
              }
            }
          );
          // Fallback timeout in case event doesn't fire
          setTimeout(() => {
            subscription.unsubscribe();
            resolve();
          }, 2000);
        });

        // Store role AFTER session is confirmed
        localStorage.setItem("yety_active_role", "teacher");

        // Now safe to show success and navigate
        setInstructorName(data.instructor?.name || "Instruktor");
        setStatus("success");

        // Brief delay to show success message, then redirect
        setTimeout(() => {
          navigate("/instructor", { replace: true });
        }, 1000);

      } catch (err) {
        console.error("Login error:", err);
        setStatus("error");
        setError("Ein unerwarteter Fehler ist aufgetreten");
      }
    };

    performLogin();
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center">
                <h2 className="text-lg font-semibold">Test-Login wird durchgeführt...</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Du wirst automatisch eingeloggt
                </p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <h2 className="text-lg font-semibold">Willkommen, {instructorName}!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Du wirst zum Instruktor-Portal weitergeleitet...
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <h2 className="text-lg font-semibold">Login fehlgeschlagen</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {error || "Ein Fehler ist aufgetreten"}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate("/login")}
                className="mt-4"
              >
                Zur Login-Seite
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
