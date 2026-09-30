import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { subjectStyle } from "@/lib/subjects";
import logo from "@/assets/logo.svg";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

const FEATURES = [
  {
    icon: FolderOpen,
    title: "Un dépôt par classe",
    text: "Fiches de cours, polycopiés, annales : chaque document est rattaché au bon créneau du planning.",
  },
  {
    icon: FileCheck2,
    title: "Devoirs traçables",
    text: "Chaque devoir porte sa consigne, son format et sa date. Plus de capture d'écran perdue dans un groupe de discussion.",
  },
  {
    icon: CalendarDays,
    title: "Planning fiable",
    text: "L'emploi du temps fait autorité. Un cours annulé est signalé comme tel, avec le motif.",
  },
  {
    icon: ShieldCheck,
    title: "Rôles clairs",
    text: "Les administrateurs globaux structurent le site et nomment les responsables de classe. Ceux-ci publient les contenus.",
  },
];

export default function Landing() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const classes = useQuery(api.app.listClasses) ?? [];
  const classCount = classes.length;

  const goToApp = () => navigate("/dashboard");

  // Redirection automatique : si une session est déjà ouverte, la page
  // d'accueil publique mène directement au tableau de bord — pas besoin
  // de cliquer sur « Accéder à mon espace ».
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);
  // Le CTA principal mène directement au formulaire d'inscription.
  const goToSignUp = () => navigate("/auth?mode=signup&returnTo=%2Fdashboard");
  const goToSignIn = () => navigate("/auth?returnTo=%2Fdashboard");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-background bg-grid relative overflow-x-hidden"
    >
      <div className="absolute inset-0 bg-glow pointer-events-none h-[560px]" />

      {/* Header */}
      <header className="relative z-10 mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
        <img src={logo} alt="Classheure" className="size-9 shrink-0 rounded-lg" />
        <span className="hidden sm:inline text-lg font-semibold tracking-tight">
          Classheure
        </span>
        <span className="hidden sm:inline text-xs font-mono text-muted-foreground border border-border/70 rounded px-1.5 py-0.5">
          v1
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isLoading ? null : isAuthenticated ? (
            <Button variant="outline" onClick={goToApp}>
              Accéder à mon espace
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={goToSignIn}>
                Se connecter
              </Button>
              <Button size="sm" onClick={goToSignUp}>
                Créer un compte
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-20 pb-24">
        <Badge variant="secondary" className="glow-ring-soft mb-6 gap-1.5 px-3 py-1.5 text-xs font-mono">
          <Terminal className="size-3.5 text-primary" />
          cours · devoirs · emploi du temps
        </Badge>
        <h1 className="max-w-3xl text-balance text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
          La documentation de votre classe,{" "}
          <span className="text-gradient-bolt">au même endroit</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          Classheure rassemble l'emploi du temps, les fiches de cours et les devoirs
          de votre classe dans une interface sobre et fiable — semaines A et B
          comprises. Créez votre compte, sélectionnez votre classe, et retrouvez
          chaque ressource à sa place.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button size="lg" className="glow-ring" onClick={goToSignUp}>
            Créer un compte
          </Button>
          <Button size="lg" variant="outline" onClick={goToSignIn}>
            Se connecter
          </Button>
        </div>
        <p className="mt-4 text-xs font-mono text-muted-foreground">
          inscription par email · vérification par code · réinitialisation de mot de passe
        </p>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <Card className="panel h-full border-border/70">
                <CardContent className="pt-6">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Fonctionnement */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-24">
        <Card className="panel border-border/70 overflow-hidden">
          <div className="grid min-w-0 lg:grid-cols-2 gap-8 p-5 sm:p-8 lg:p-10 items-center">
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Trois étapes, rien de plus
              </h2>
              <ol className="mt-6 space-y-4">
                {[
                  ["Créez votre compte", "Email et mot de passe, puis un code de vérification envoyé dans votre boîte."],
                  ["Renseignez votre classe", "Un court questionnaire associe votre profil à votre classe et à votre option."],
                  ["Accédez aux ressources", "Votre planning s'affiche ; chaque cours ouvre la liste de ses documents."],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary font-mono text-xs">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-border/70 bg-secondary/30 p-5">
              {/* Aperçu réel : créneau d'emploi du temps */}
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Emploi du temps — lundi · semaine A
              </p>                <div className="rounded-xl border border-border/60 bg-background/60 p-4">                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="shrink-0 text-center">
                      <p className="font-mono text-sm font-bold text-primary">08:00</p>
                      <p className="text-[10px] text-muted-foreground">09:00</p>
                    </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                        style={subjectStyle("Mathématiques")}
                      >
                        Mathématiques
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        Salle B204
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Mme Dupont · Lundi 08:00–09:00
                    </p>
                  </div>
                </div>
              </div>

              {/* Aperçu réel : fiche de cours rattachée */}
              <p className="mb-3 mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Devoirs du créneau
              </p>                  <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
                    <FileText className="size-5 text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">DM n°3 — chapitre 4</p>
                    <p className="text-xs text-muted-foreground">
                      PDF · publié par Mme Dupont
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
                    devoir
                  </Badge>
                  <Button size="sm" variant="outline" className="shrink-0 gap-1 text-xs pointer-events-none">
                    <Download className="size-3.5" /> Fichier
                  </Button>
                </div>
                <p className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  Devoir publié — visible par toute la classe
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* CTA final */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-28 text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Prêt à rejoindre votre classe ?
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {classCount > 0
            ? `${classCount} classe${classCount > 1 ? "s" : ""} déjà configurée${classCount > 1 ? "s" : ""} par les administrateurs.`
            : "Les administrateurs configurent les classes ; les responsables publient les contenus."}
        </p>
        <Button size="lg" className="mt-6 glow-ring" onClick={goToSignUp}>
          Créer un compte
        </Button>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Classheure — gestion de cours et de devoirs pour les classes
      </footer>
    </motion.div>
  );
}
