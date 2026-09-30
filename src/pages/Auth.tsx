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
import { api } from "@/convex/_generated/api";
import logo from "@/assets/logo.svg";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { useMutation, useAction } from "convex/react";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

type Mode = "signIn" | "signUp" | "verify" | "forgot" | "reset";
type Method = "email" | "phone";

/** Normalise un numéro saisi : 06 12 34 56 78 → +33612345678 */
function normalizePhoneInput(raw: string): string {
  const p = raw.replace(/[\s.\-()]/g, "").trim();
  if (!p) return "";
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return `+${p.slice(2)}`;
  if (p.startsWith("0") && p.length === 10) return `+33${p.slice(1)}`;
  return p;
}

/** Bascule Email / Téléphone réutilisée dans chaque mode. */
function MethodSwitch({
  value,
  onChange,
  disabled,
}: {
  value: Method;
  onChange: (m: Method) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("email")}
        className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
          value === "email"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mail className="h-4 w-4" /> Email
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("phone")}
        className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
          value === "phone"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Phone className="h-4 w-4" /> Téléphone
      </button>
    </div>
  );
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const verifyEmailDeliverable = useAction(api.auth.verifyEmailDeliverable);
  const requestPhonePasswordReset = useAction(api.auth.requestPhonePasswordReset);
  const verifyPhoneResetCode = useMutation(api.auth.verifyPhoneResetCode);
  const completePhonePasswordReset = useAction(api.auth.completePhonePasswordReset);

  const initialRaw = searchParams.get("mode");
  const initialMode: Mode =
    initialRaw === "signup" ? "signUp" : initialRaw === "forgot" ? "forgot" : "signIn";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<Method>("email");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [phoneResetToken, setPhoneResetToken] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Erreur inline sous le champ email du formulaire d'inscription (domaine inexistant)
  const [emailCheckError, setEmailCheckError] = useState<string | null>(null);

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

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError(null);
    setEmailCheckError(null);
    setOtp("");
  };

  // ---- Connexion (email ou téléphone) ----
  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    const password = fd.get("password") as string;
    try {
      let result;
      if (method === "email") {
        const email = ((fd.get("email") as string) || "").trim().toLowerCase();
        result = await signIn("password", { flow: "signIn", email, password });
      } else {
        const phone = normalizePhoneInput((fd.get("phone") as string) || "");
        result = await signIn("password-tel", { flow: "signIn", phone, password });
      }
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

  // ---- Inscription (crée le compte ; email vérifié, téléphone direct) ----
  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setEmailCheckError(null);
    const fd = new FormData(event.currentTarget);
    const firstName = ((fd.get("firstName") as string) || "").trim();
    const lastName = ((fd.get("lastName") as string) || "").trim();
    const password = fd.get("password") as string;
    const confirm = fd.get("confirm") as string;
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      setIsLoading(false);
      return;
    }
    try {
      const name = [firstName, lastName].filter(Boolean).join(" ");
      if (method === "email") {
        const email = ((fd.get("email") as string) || "").trim().toLowerCase();
        // Vérifie que le domaine de l'adresse existe (faute de frappe ?)
        const deliverable = await verifyEmailDeliverable({ email });
        if (!deliverable.ok) {
          // Erreur inline affichée en rouge sous le champ email
          setEmailCheckError(
            deliverable.reason === "domaine"
              ? "Ce domaine email n'existe pas (faute de frappe ?)"
              : deliverable.reason === "syntaxe"
                ? "Adresse email invalide"
                : "Cette email n'existe pas",
          );
          setIsLoading(false);
          return;
        }
        const result = await signIn("password", {
          flow: "signUp",
          email,
          password,
          ...(name ? { name } : {}),
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        });
        if (result?.signingIn) {
          navigate(redirect, { replace: true });
        } else {
          setPendingEmail(email);
          go("verify");
        }
      } else {
        const phone = normalizePhoneInput((fd.get("phone") as string) || "");
        const result = await signIn("password-tel", {
          flow: "signUp",
          phone,
          password,
          ...(name ? { name } : {}),
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        });
        if (result?.signingIn) {
          toast.success("Compte créé. Bienvenue sur ClassHeure.");
          navigate(redirect, { replace: true });
        } else {
          setError("Impossible de créer le compte. Essayez à nouveau.");
        }
      }
    } catch (err) {
      setError(
        mapError(
          err,
          method === "email"
            ? "Impossible de créer le compte. Essayez un autre email."
            : "Impossible de créer le compte. Essayez un autre numéro.",
        ),
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
        toast.success("Email vérifié. Bienvenue sur ClassHeure.");
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

  // ---- Renvoyer un nouveau code (email) ----
  const handleResend = async () => {
    setIsLoading(true);
    setError(null);
    try {
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

  // ---- Mot de passe oublié (email) : demande de code ----
  const handleForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    try {
      if (method === "email") {
        const email = ((fd.get("email") as string) || "").trim().toLowerCase();
        // Vérifie d'abord que l'adresse peut recevoir un email (sinon le code
        // partirait dans le vide).
        const check = await verifyEmailDeliverable({ email });
        if (!check.ok) {
          setError(
            check.reason === "domaine"
              ? "Ce domaine email n'existe pas (faute de frappe ?)"
              : check.reason === "syntaxe"
                ? "Adresse email invalide"
                : "Cette email n'existe pas",
          );
          setIsLoading(false);
          return;
        }
        await signIn("password", { flow: "reset", email });
        setPendingEmail(email);
        go("reset");
        toast.success("Code de réinitialisation envoyé par email.");
      } else {
        const phone = normalizePhoneInput((fd.get("phone") as string) || "");
        await requestPhonePasswordReset({ phone });
        setPendingPhone(phone);
        setOtp("");
        setMethod("phone");
        setMode("reset");
        toast.success("Code de réinitialisation envoyé par SMS.");
      }
    } catch (err) {
      setError(
        mapError(
          err,
          method === "email"
            ? "Impossible d'envoyer le code. Vérifie l'adresse."
            : "Impossible d'envoyer le SMS. Vérifie le numéro.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Mot de passe oublié (téléphone) : vérification du code SMS ----
  const handlePhoneVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const fd = new FormData(event.currentTarget);
    const code = fd.get("code") as string;
    try {
      const { token } = await verifyPhoneResetCode({
        phone: pendingPhone,
        code: code.trim(),
      });
      setPhoneResetToken(token);
      setError(null);
      setMode("reset");
      toast.success("Code validé. Choisissez un nouveau mot de passe.");
    } catch (err) {
      setError(mapError(err, "Code incorrect ou expiré."));
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Mot de passe oublié : nouveau mot de passe (email ou SMS) ----
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
      if (method === "phone") {
        if (!phoneResetToken) {
          setError("Session expirée. Recommencez « Mot de passe oublié ».");
          setIsLoading(false);
          return;
        }
        await completePhonePasswordReset({ token: phoneResetToken, newPassword });
        toast.success("Mot de passe modifié. Connectez-vous avec votre numéro.");
        setPhoneResetToken("");
        go("signIn");
        return;
      }
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
    } catch (err) {
      setError(mapError(err, "Code incorrect ou expiré."));
    } finally {
      setIsLoading(false);
    }
  };

  const goHome = () => navigate("/");

  const isPhoneReset = mode === "reset" && method === "phone";

  return (
    <div className="min-h-screen bg-background bg-grid relative flex flex-col">
      <div className="absolute inset-0 bg-glow pointer-events-none" />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg panel shadow-2xl shadow-primary/10 border-border/80">
          {mode === "signIn" && (
            <>
              <CardHeader className="text-center pb-4">
                <button onClick={goHome} className="flex justify-center cursor-pointer" aria-label="Accueil">
                  <img src={logo} alt="ClassHeure" width={72} height={72} className="rounded-2xl mb-4 mt-2 shadow-lg shadow-primary/20" />
                </button>
                <CardTitle className="text-2xl">Connexion</CardTitle>
                <CardDescription className="mt-1">
                  {method === "email"
                    ? "Accédez à votre espace avec votre email et votre mot de passe"
                    : "Accédez à votre espace avec votre numéro de téléphone et votre mot de passe"}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSignIn}>
                <CardContent className="space-y-5">
                  <MethodSwitch value={method} onChange={switchMethod} disabled={isLoading} />
                  {method === "email" ? (
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="email" name="email" type="email" placeholder="prenom.nom@exemple.fr" className="pl-9" disabled={isLoading} required />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="si-phone">Numéro de téléphone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="si-phone" name="phone" type="tel" inputMode="tel" placeholder="+33612345678 ou 0612345678" className="pl-9" disabled={isLoading} required />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Mot de passe</Label>
                      <button type="button" onClick={() => go("forgot")} className="text-xs text-primary hover:underline">
                        Mot de passe oublié ?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <PasswordInput id="password" name="password" placeholder="••••••••" disabled={isLoading} autoComplete="current-password" />
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
                <CardDescription>
                  {method === "email"
                    ? "Un code de vérification vous sera envoyé par email"
                    : "Aucune vérification : vous vous connecterez avec votre numéro"}
                </CardDescription>
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
                  <MethodSwitch value={method} onChange={switchMethod} disabled={isLoading} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="su-firstname">Prénom</Label>
                      <Input id="su-firstname" name="firstName" type="text" placeholder="Marie" autoComplete="given-name" disabled={isLoading} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-lastname">Nom</Label>
                      <Input id="su-lastname" name="lastName" type="text" placeholder="Dupont" autoComplete="family-name" disabled={isLoading} required />
                    </div>
                  </div>
                  {method === "email" ? (
                    <div className="space-y-2">
                      <Label htmlFor="su-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="su-email"
                          name="email"
                          type="email"
                          placeholder="prenom.nom@exemple.fr"
                          className={`pl-9 ${emailCheckError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          disabled={isLoading}
                          required
                          aria-invalid={!!emailCheckError}
                          onChange={() => setEmailCheckError(null)}
                        />
                      </div>
                      {emailCheckError && (
                        <p className="text-sm text-destructive">{emailCheckError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="su-phone">Numéro de téléphone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="su-phone" name="phone" type="tel" inputMode="tel" placeholder="+33612345678 ou 0612345678" className="pl-9" disabled={isLoading} required />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="su-password">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <PasswordInput id="su-password" name="password" placeholder="8 caractères minimum" disabled={isLoading} required minLength={8} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="su-confirm">Confirmer le mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <PasswordInput id="su-confirm" name="confirm" placeholder="••••••••" disabled={isLoading} required autoComplete="new-password" />
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
                <CardDescription>
                  {method === "email"
                    ? "Indiquez votre email pour recevoir un code de réinitialisation"
                    : "Indiquez votre numéro pour recevoir un code par SMS"}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleForgot}>
                <CardContent className="space-y-4">
                  <MethodSwitch value={method} onChange={switchMethod} disabled={isLoading} />
                  {method === "email" ? (
                    <div className="space-y-2">
                      <Label htmlFor="fp-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="fp-email" name="email" type="email" placeholder="prenom.nom@exemple.fr" className="pl-9" disabled={isLoading} required />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="fp-phone">Numéro de téléphone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="fp-phone" name="phone" type="tel" inputMode="tel" placeholder="+33612345678 ou 0612345678" className="pl-9" disabled={isLoading} required />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Le code part par SMS (textbee). Seuls les comptes créés
                        avec un numéro peuvent le recevoir.
                      </p>
                    </div>
                  )}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : method === "email" ? <Mail className="mr-2 h-4 w-4" /> : <Phone className="mr-2 h-4 w-4" />}
                    Envoyer le code
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => go("signIn")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Retour
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "reset" && !isPhoneReset && (
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
                      <PasswordInput id="rs-password" name="newPassword" placeholder="8 caractères minimum" disabled={isLoading} required minLength={8} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="rs-confirm">Confirmer</Label>
                    <PasswordInput id="rs-confirm" name="confirm" placeholder="••••••••" disabled={isLoading} required autoComplete="new-password" />
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

          {mode === "reset" && isPhoneReset && !phoneResetToken && (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-1">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
                <CardTitle>Code reçu par SMS</CardTitle>
                <CardDescription>
                  Saisissez le code envoyé au {pendingPhone}.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handlePhoneVerify}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rs-phone-code">Code reçu par SMS</Label>
                    <Input id="rs-phone-code" name="code" inputMode="numeric" placeholder="123456" maxLength={6} disabled={isLoading} required autoFocus />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-3 pt-2">
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</> : <>Vérifier <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => go("signIn")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Retour
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          {mode === "reset" && isPhoneReset && phoneResetToken && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl mt-2">Nouveau mot de passe</CardTitle>
                <CardDescription>Choisissez un mot de passe pour le {pendingPhone}.</CardDescription>
              </CardHeader>
              <form onSubmit={handleReset}>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="rp-password">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <PasswordInput id="rp-password" name="newPassword" placeholder="8 caractères minimum" disabled={isLoading} required minLength={8} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="rp-confirm">Confirmer</Label>
                    <PasswordInput id="rp-confirm" name="confirm" placeholder="••••••••" disabled={isLoading} required autoComplete="new-password" />
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
              ClassHeure — cours, devoirs et emploi du temps
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

/** Champ mot de passe avec œil blanc pour afficher / masquer la saisie. */
function PasswordInput(
  props: React.ComponentProps<typeof Input> & { type?: never },
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className="pl-9 pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 cursor-pointer"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
