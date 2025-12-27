import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

const authSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "E-Mail ist erforderlich")
    .email("Ungültige E-Mail-Adresse")
    .max(255, "E-Mail darf maximal 255 Zeichen haben"),
  password: z
    .string()
    .min(6, "Passwort muss mindestens 6 Zeichen haben")
    .max(128, "Passwort darf maximal 128 Zeichen haben"),
});

const Login = () => {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate inputs
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password);

        if (error) {
          if (error.message.includes("User already registered")) {
            setError("Ein Benutzer mit dieser E-Mail existiert bereits");
          } else if (error.message.includes("Password should be")) {
            setError("Passwort muss mindestens 6 Zeichen haben");
          } else {
            setError("Registrierung fehlgeschlagen. Bitte versuche es erneut.");
          }
          return;
        }

        toast.success("Registrierung erfolgreich!", {
          description: "Du bist jetzt angemeldet.",
        });
        navigate("/", { replace: true });
      } else {
        const { error } = await signIn(email, password);

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            setError("E-Mail oder Passwort ist falsch");
          } else if (error.message.includes("Email not confirmed")) {
            setError("E-Mail wurde noch nicht bestätigt");
          } else {
            setError("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
          }
          return;
        }

        navigate("/", { replace: true });
      }
    } catch (err) {
      setError("Ein unerwarteter Fehler ist aufgetreten");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast.info("Funktion kommt bald", {
      description: "Passwort zurücksetzen wird in Kürze verfügbar sein.",
    });
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[400px] shadow-lg">
        <CardHeader className="text-center pb-2">
          {/* Logo */}
          <div className="mb-4">
            <span className="font-display font-bold text-4xl text-primary">
              YETY
            </span>
          </div>
          <h1 className="text-xl font-display font-semibold text-foreground">
            {isSignUp ? "Konto erstellen" : "Willkommen bei YETY"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp
              ? "Registriere dich, um loszulegen"
              : "Melde dich an, um fortzufahren"}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.ch"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                autoFocus
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Registrieren..." : "Anmelden..."}
                </>
              ) : isSignUp ? (
                "Registrieren"
              ) : (
                "Anmelden"
              )}
            </Button>

            {/* Toggle Login/Register */}
            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-primary hover:underline transition-colors"
              >
                {isSignUp
                  ? "Bereits ein Konto? Anmelden"
                  : "Noch kein Konto? Registrieren"}
              </button>

              {!isSignUp && (
                <div>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Passwort vergessen?
                  </button>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="fixed bottom-4 text-center text-xs text-muted-foreground">
        <p>Schneesportschule Malbun AG © 2025</p>
      </div>
    </div>
  );
};

export default Login;
