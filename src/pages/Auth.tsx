import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Zap,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

type Mode = "signIn" | "signUp" | "verify" | "forgot" | "reset";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [mode, setMode] = useState<Mode>("signIn");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const mapError = (err: unknown, fallback: string) =>
    err instanceof Error && err.message && !err.message.startsWith("{")
      ? err.message
      : fallback;

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setOtp("");
  };

  // ---- Connexion par mot de passe ----
  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    try {
      const result = await signIn("password", {
        flow: "signIn",
        email,
        password,
      });
      if (result?.signingIn) {
        toast.success("Connexion réussie ⚡");
        navigate(redirect, { replace: true });
      } else {
        setError("Identifiants incorrects.");
      }
    } catch (err) {
      setError(mapError(err, "Identifiants incorrects."));
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Inscription (crée le compte, envoie le code) ----
  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    const name = (fd.get("name") as string) || "";
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const confirm = fd.get("confirm") as string;
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      setIsLoading(false);
      return;
    }
    try {
      const result = await signIn("password", {
        flow: "signUp",
        email,
        password,
        ...(name ? { name } : {}),
      });
      if (result?.signingIn) {
        navigate(redirect, { replace: true });
      } else {
        setPendingEmail(email);
        go("verify");
      }
    } catch (err) {
      setError(
        mapError(err, "Impossible de créer le compte. Essayez un autre email."),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Vérification du code email ----
  const handleVerify = async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn("password", {
        flow: "email-verification",
        email: pendingEmail,
        code,
      });
      if (result?.signingIn) {
        toast.success("Email vérifié, bienvenue sur Foudre ⚡");
        navigate(redirect, { replace: true });
      } else {
        setError("Code incorrect ou expiré.");
      }
    } catch {
      setError("Code incorrect ou expiré.");
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Mot de passe oublié : demande de code ----
  const handleForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    const email = fd.get("email") as string;
    try {
      await signIn("password", { flow: "reset", email });
      setPendingEmail(email);
      go("reset");
      toast.success("Code envoyé par email.");
    } catch (err) {
      setError(
        mapError(err, "Impossible d'envoyer le code. Vérifie l'adresse."),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Mot de passe oublié : nouveau mot de passe ----
  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    const code = fd.get("code") as string;
    const newPassword = fd.get("newPassword") as string;
    const confirm = fd.get("confirm") as string;
    if (newPassword !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      setIsLoading(false);
      return;
    }
    try {
      const result = await signIn("password", {
        flow: "reset-verification",
        email: pendingEmail,
        code,
        newPassword,
      });
      if (result?.signingIn) {
        toast.success("Mot de passe modifié ⚡");
        navigate(redirect, { replace: true });
      } else {
        setError("Code incorrect ou expiré.");
      }
    } catch {
      setError("Code incorrect ou expiré.");
    } finally {
      setIsLoading(false);
    }
  };

  const goHome = () => navigate("/");

  return (
    <div className="min-h-screen bg-background bg-grid relative flex flex-col">
      <div className="absolute inset-0 bg-glow pointer-events-none" />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md panel shadow-2xl border-border/80">
          {mode === "signIn" && (
            <>
              <CardHeader className="text-center">
                <button onClick={goHome} className="flex justify-center cursor-pointer" aria-label="Accueil">
                  <img src={logo} alt="Foudre" width={64} height={64} className="rounded-xl mb-3 mt-2" />
                </button>
                <CardTitle className="text-xl">Bon retour !</CardTitle>
                <CardDescription>Connecte-toi avec ton email et ton mot de passe</CardDescription>
              </CardHeader>
              <form onSubmit={handleSignIn}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="email" name="email" type="email" placeholder="prenom.nom@exemple.fr" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Mot de passe</Label>
                      <button type="button" onClick={() => go("forgot")} className="text-xs text-primary hover:underline">
                        Mot de passe oublié ?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="password" name="password" type="password" placeholder="••••••••" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Se connecter
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button type="button" onClick={() => go("signUp")} className="text-primary hover:underline font-medium">
                      S'inscrire
                    </button>
                  </p>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "signUp" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl mt-2">Créer un compte</CardTitle>
                <CardDescription>Un code de vérification sera envoyé par email</CardDescription>
              </CardHeader>
              <form onSubmit={handleSignUp}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Prénom & nom</Label>
                    <Input id="su-name" name="name" type="text" placeholder="Marie Dupont" disabled={isLoading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="su-email" name="email" type="email" placeholder="prenom.nom@exemple.fr" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-password">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="su-password" name="password" type="password" placeholder="8 caractères minimum" className="pl-9" disabled={isLoading} required minLength={8} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-confirm">Confirmer le mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="su-confirm" name="confirm" type="password" placeholder="••••••••" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Créer mon compte
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Déjà inscrit ?{" "}
                    <button type="button" onClick={() => go("signIn")} className="text-primary hover:underline font-medium">
                      Se connecter
                    </button>
                  </p>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "verify" && (
            <>
              <CardHeader className="text-center mt-2">
                <div className="flex justify-center mb-1">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
                <CardTitle>Vérifie ta boîte mail</CardTitle>
                <CardDescription>
                  Un code à 6 chiffres a été envoyé à {pendingEmail}
                </CardDescription>
              </CardHeader>
              <form onSubmit={(e) => { e.preventDefault(); handleVerify(otp); }}>
                <CardContent className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP value={otp} onChange={setOtp} maxLength={6} disabled={isLoading}>
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error && <p className="text-sm text-destructive text-center">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</> : <>Vérifier <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => go("signIn")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Retour
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "forgot" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl mt-2">Mot de passe oublié</CardTitle>
                <CardDescription>Entre ton email pour recevoir un code de réinitialisation</CardDescription>
              </CardHeader>
              <form onSubmit={handleForgot}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fp-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="fp-email" name="email" type="email" placeholder="prenom.nom@exemple.fr" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    Envoyer le code
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => go("signIn")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Retour
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "reset" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl mt-2">Nouveau mot de passe</CardTitle>
                <CardDescription>Code envoyé à {pendingEmail}. Vérifie ta boîte mail.</CardDescription>
              </CardHeader>
              <form onSubmit={handleReset}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rs-code">Code reçu par email</Label>
                    <Input id="rs-code" name="code" inputMode="numeric" placeholder="123456" disabled={isLoading} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-password">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="rs-password" name="newPassword" type="password" placeholder="8 caractères minimum" className="pl-9" disabled={isLoading} required minLength={8} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-confirm">Confirmer</Label>
                    <Input id="rs-confirm" name="confirm" type="password" placeholder="••••••••" disabled={isLoading} required />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement…</> : "Changer le mot de passe"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => go("signIn")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Retour
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          <div className="py-4 px-6 text-xs text-center text-muted-foreground border-t border-border/60">
            <Link to="/" className="hover:text-primary transition-colors">
              ⚡ Foudre — les cours et devoirs de ta classe
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
