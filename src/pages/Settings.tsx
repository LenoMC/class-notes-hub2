import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { optionRuleError } from "@/lib/subjects";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Save,
  Shield,
  Trash2,
  UserCog,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const OPTIONS = [
  "LCE",
  "Latin",
  "Allemand",
  "Espagnol",
  "Sécurité Civile",
] as const;

export default function Settings() {
  const { user, isLoading, signOut } = useAuth();
  const updateProfile = useMutation(api.app.updateProfile);
  const updateEmail = useMutation(api.app.updateMyEmail);
  const deleteMyAccount = useMutation(api.app.deleteMyAccount);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [classId, setClassId] = useState<string>("");
  const [options, setOptions] = useState<string[]>([]);
  const [group, setGroup] = useState<"G1" | "G2" | null>(null);
  const [phone, setPhone] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const classes = (
    useQuery(api.app.listClasses) ?? []
  ) as Array<{ _id: Id<"classes">; name: string }>;

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setClassId(user.classId ?? "");
    setOptions(user.options ?? []);
    setGroup((user as { group?: "G1" | "G2" | null }).group ?? null);
    setPhone((user as { phone?: string | null }).phone ?? "");
    setDiscordId((user as { discordId?: string | null }).discordId ?? "");
  }, [user]);

  if (isLoading) {
    return (
      <AppShell isAdmin={user?.isAdmin}>
        <div className="space-y-4 max-w-2xl mx-auto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }
  if (!user) return null;

  const ruleError = optionRuleError(options);
  const dirty =
    name !== (user.name ?? "") ||
    classId !== (user.classId ?? "") ||
    JSON.stringify(options) !== JSON.stringify(user.options ?? []) ||
    group !== ((user as { group?: "G1" | "G2" | null }).group ?? null) ||
    phone !== ((user as { phone?: string | null }).phone ?? "") ||
    discordId !== ((user as { discordId?: string | null }).discordId ?? "");

  const toggleOption = (opt: string) => {
    setOptions((prev) => {
      if (prev.includes(opt)) return prev.filter((o) => o !== opt);
      if (prev.length >= 4) return prev;
      // Interdiction Allemand + Espagnol : l'une remplace l'autre
      if (opt === "Allemand" && prev.includes("Espagnol")) {
        return prev.filter((o) => o !== "Espagnol").concat("Allemand");
      }
      if (opt === "Espagnol" && prev.includes("Allemand")) {
        return prev.filter((o) => o !== "Allemand").concat("Espagnol");
      }
      return [...prev, opt];
    });
  };

  const handleSave = async () => {
    if (ruleError) {
      toast.error(ruleError);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        classId: (classId || null) as Id<"classes"> | null,
        options,
        group,
        phone: phone.trim() || null,
        discordId: discordId.trim() || null,
      });
      toast.success("Vos informations ont été mises à jour.");
    } catch (err) {
      toast.error(
        err instanceof Error && !err.message.startsWith("{")
          ? err.message
          : "Mise à jour impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell isAdmin={user.isAdmin}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>
          <p className="text-sm text-muted-foreground">
            Consultez et modifiez vos informations personnelles.
          </p>
        </div>

        {/* Identité & classe */}
        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserRound className="size-5 text-primary" /> Mes informations
            </CardTitle>
            <CardDescription>
              Votre nom, votre classe et vos options déterminent votre emploi du
              temps et vos ressources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="st-name">Nom</Label>
              <Input
                id="st-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marie Dupont"
              />
            </div>

            {/* Email modifiable */}
            <div className="space-y-1.5">
              <Label>Adresse email (identifiant de connexion)</Label>
              {emailEditing ? (
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nouvel.email@exemple.fr"
                    className="flex-1"
                  />
                  <Button
                    onClick={async () => {
                      setSavingEmail(true);
                      try {
                        await updateEmail({ email: newEmail });
                        toast.success(
                          "Email mis à jour. Connectez-vous désormais avec cette adresse.",
                        );
                        setEmailEditing(false);
                      } catch (err) {
                        toast.error(
                          err instanceof Error && !err.message.startsWith("{")
                            ? err.message
                            : "Modification impossible.",
                        );
                      } finally {
                        setSavingEmail(false);
                      }
                    }}
                    disabled={savingEmail || !newEmail.includes("@")}
                  >
                    {savingEmail ? "…" : "Enregistrer"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEmailEditing(false);
                      setNewEmail("");
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="size-4 shrink-0" />
                  <span className="truncate">{user.email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs shrink-0"
                    onClick={() => {
                      setNewEmail(user.email ?? "");
                      setEmailEditing(true);
                    }}
                  >
                    <Pencil className="size-3 mr-1" /> Modifier
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="st-class">Ma classe</Label>
              <select
                id="st-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
              >
                <option value="">— Aucune —</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Mes options</Label>
              <p className="text-xs text-muted-foreground">
                Au moins une langue : <strong>Allemand</strong> ou{" "}
                <strong>Espagnol</strong> (pas les deux). LCE, Latin et Sécurité
                Civile se cumulent — 4 options maximum.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                      options.includes(opt)
                        ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                        : "border-border bg-secondary/40 hover:border-primary/50",
                    )}
                  >
                    {options.includes(opt) && <CheckCircle2 className="size-3.5" />}
                    {opt}
                  </button>
                ))}
              </div>
              {ruleError && <p className="text-xs text-destructive">{ruleError}</p>}
            </div>

            {/* Notifications admins : téléphone + Discord */}
            {user.isAdmin && (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Phone className="size-4 text-primary" /> Numéro de téléphone
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Format international, ex. +33612345678. Vous recevrez un SMS
                    à chaque nouvelle demande d'accès (gratuit via textbee).
                  </p>
                </div>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+33612345678"
                  className="bg-secondary"
                />
                <div>
                  <Label className="flex items-center gap-1.5">
                    <MessageCircle className="size-4 text-primary" /> Identifiant Discord
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Votre ID Discord (Paramètres → Avancés → Mode développeur,
                    puis « Copier l'identifiant » sur votre profil). Le bot vous
                    enverra un MP à chaque nouvelle demande — il doit partager un
                    serveur avec vous.
                  </p>
                </div>
                <Input
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="123456789012345678"
                  className="bg-secondary font-mono"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Mon groupe</Label>
              <p className="text-xs text-muted-foreground">
                Uniquement si votre classe fonctionne par groupes. Sinon,
                laissez sur « Aucun ».
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    [null, "Aucun"],
                    ["G1", "Groupe 1"],
                    ["G2", "Groupe 2"],
                  ] as const
                ).map(([g, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setGroup(g)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                      group === g
                        ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                        : "border-border bg-secondary/40 hover:border-primary/50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !dirty || !!ruleError}
              className="gap-1.5"
            >
              <Save className="size-4" />
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </Button>
          </CardContent>
        </Card>

        {/* Rôles (lecture seule) */}
        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="size-5 text-primary" /> Mes rôles
            </CardTitle>
            <CardDescription>
              Les responsabilités sont attribuées par les administrateurs globaux.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <UserRound className="size-3.5 text-primary" /> Élève
              {user.className ? ` — ${user.className}` : ""}
            </Badge>
            {user.isClassAdmin && (
              <Badge variant="secondary" className="gap-1.5">
                <UserCog className="size-3.5 text-primary" />
                Responsable{user.adminOfClassName ? ` — ${user.adminOfClassName}` : " de classe"}
              </Badge>
            )}
            {user.isAdmin && (
              <Badge variant="secondary" className="gap-1.5">
                <Shield className="size-3.5 text-primary" /> Administrateur global
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Mot de passe */}
        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Mot de passe
            </CardTitle>
            <CardDescription>
              Pour le modifier, demandez un code de réinitialisation envoyé par
              email, puis déconnectez-vous après le changement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="gap-1.5">
              <Link to="/auth?mode=forgot">
                <KeyRound className="size-4" /> Changer mon mot de passe
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Zone de compte : déconnexion / suppression définitive */}
        <Card className="panel border-destructive/40">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> Gestion du compte
            </CardTitle>
            <CardDescription>
              Déconnectez cet appareil, ou supprimez définitivement votre compte
              (sessions fermées, preuve d'accès effacée). Vos fiches et messages
              déjà publiés dans la classe restent visibles.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" /> Se déconnecter
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-1.5">
                  <Trash2 className="size-4" /> Supprimer définitivement mon compte
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Supprimer définitivement votre compte ?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible : votre compte, vos sessions
                    et votre capture de preuve seront effacés. Vous ne pourrez
                    plus accéder à ClassHeure avec cet email sans recréer un
                    compte (et repasser par l'approbation d'accès).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={async (e) => {
                      e.preventDefault(); // laisse le dialog ouvert pendant la mutation
                      try {
                        await deleteMyAccount({});
                        toast.success("Votre compte a été supprimé.");
                        await signOut();
                        navigate("/");
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Suppression impossible.",
                        );
                      }
                    }}
                  >
                    Oui, supprimer mon compte
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
