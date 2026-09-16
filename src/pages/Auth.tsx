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
  ShieldCheck,
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

  const initialRaw = searchParams.get("mode");
  const initialMode: Mode =
    initialRaw === "signup" ? "signUp" : initialRaw === "forgot" ? "forgot" : "signIn";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirection automatique seulement hors flux « mot de passe oublié » :
  // un utilisateur connecté peut venir ici changer son mot de passe.
  useEffect(() => {
    if (!authLoading && isAuthenticated && mode !== "forgot" && mode !== "reset") {
      navigate(redirect, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirect, mode]);

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
        toast.success("Connexion réussie.");
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
        toast.success("Email vérifié. Bienvenue sur CoursFlow.");
        navigate(redirect, { replace: true });
      } else {
        setError(
          "Code invalide : il a peut-être déjà été utilisé ou une nouvelle demande a annulé celui-ci. Cliquez sur « Renvoyer un code » pour en recevoir un nouveau.",
        );
      }
    } catch {
      setError(
        "Code invalide : il a peut-être déjà été utilisé ou a expiré. Cliquez sur « Renvoyer un code » pour en recevoir un nouveau.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Renvoyer un nouveau code ----
  const handleResend = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // flow "reset" : génère et envoie un nouveau code sans toucher au mot de
      // passe (et sans l'étape de connexion qui suivrait un "signUp" réussi).
      await signIn("password", { flow: "reset", email: pendingEmail });
      setOtp("");
      toast.success(
        "Un nouveau code a été envoyé. Saisissez uniquement le plus récent.",
      );
    } catch {
      toast.error("Impossible de renvoyer le code. Réessayez dans un instant.");
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
      toast.success("Code de réinitialisation envoyé par email.");
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
        toast.success("Mot de passe modifié.");
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
        <Card className="w-full max-w-lg panel shadow-2xl shadow-primary/10 border-border/80">
          {mode === "signIn" && (
            <>
              <CardHeader className="text-center pb-4">
                <button onClick={goHome} className="flex justify-center cursor-pointer" aria-label="Accueil">
                  <img src={logo} alt="CoursFlow" width={72} height={72} className="rounded-2xl mb-4 mt-2 shadow-lg shadow-primary/20" />
                </button>
                <CardTitle className="text-2xl">Connexion</CardTitle>
                <CardDescription className="mt-1">Accédez à votre espace avec votre email et votre mot de passe</CardDescription>
              </CardHeader>
              <form onSubmit={handleSignIn}>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="email" name="email" type="email" placeholder="prenom.nom@exemple.fr" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  <div className="space-y-2.5">
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
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    Se connecter
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button type="button" onClick={() => go("signUp")} className="text-primary hover:underline font-medium">
                      Créer un compte
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
                <CardDescription>Un code de vérification vous sera envoyé par email</CardDescription>
              </CardHeader>
              <div className="mx-6 mb-1 flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                <ShieldCheck className="size-4 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Les informations saisies dans ce formulaire sont hébergées de
                  manière sécurisée et maintenues confidentielles, conformément au
                  Règlement Général sur la Protection des Données (RGPD). Elles ne
                  sont jamais partagées avec des tiers.
                </p>
              </div>
              <form onSubmit={handleSignUp}>
                <CardContent className="space-y-5">
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
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="su-confirm">Confirmer le mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="su-confirm" name="confirm" type="password" placeholder="••••••••" className="pl-9" disabled={isLoading} required />
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
                <CardTitle>Vérifiez votre boîte mail</CardTitle>
                <CardDescription>
                  Un code à 6 chiffres a été envoyé à {pendingEmail}. Saisissez le
                  code le plus récent reçu.
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
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading || otp.length !== 6}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</> : <>Vérifier <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full mt-1" disabled={isLoading} onClick={handleResend}>
                    Vous n'avez rien reçu ? Renvoyer un code
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => go("signIn")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Retour à la connexion
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "forgot" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl mt-2">Mot de passe oublié</CardTitle>
                <CardDescription>Indiquez votre email pour recevoir un code de réinitialisation</CardDescription>
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
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
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
                <CardDescription>Code envoyé à {pendingEmail}. Consultez votre boîte mail.</CardDescription>
              </CardHeader>
              <form onSubmit={handleReset}>
                <CardContent className="space-y-5">
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
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="rs-confirm">Confirmer</Label>
                    <Input id="rs-confirm" name="confirm" type="password" placeholder="••••••••" disabled={isLoading} required />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
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
              CoursFlow — cours, devoirs et emploi du temps
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
