import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import logo from "@/assets/logo.svg";
import {
  BookOpen,
  CalendarDays,
  Download,
  FileCheck2,
  LogOut,
  ShieldCheck,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Emploi du temps cliquable",
    text: "Chaque case de cours s'ouvre sur les documents partagés par les admins de ta classe.",
  },
  {
    icon: FileCheck2,
    title: "Cours et devoirs au même endroit",
    text: "Fiches de cours, exercices, devoirs à rendre : tout est rattaché au bon créneau.",
  },
  {
    icon: Download,
    title: "Téléchargement immédiat",
    text: "Un clic et le fichier est à toi. Plus besoin de fouiller un groupe de discussion.",
  },
  {
    icon: ShieldCheck,
    title: "Admins globaux & par classe",
    text: "Les admin globaux paramètrent le site ; les admins de classe publient les cours.",
  },
];

export default function Landing() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const classes = useQuery(api.app.listClasses) ?? [];
  const classCount = classes.length;

  const goToApp = () => navigate("/dashboard");
  const goToAuth = () => navigate("/auth?returnTo=%2Fdashboard");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-background bg-grid relative"
    >
      <div className="absolute inset-0 bg-glow pointer-events-none h-[560px]" />

      {/* Header */}
      <header className="relative z-10 mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
        <img src={logo} alt="Foudre" className="size-9 rounded-lg" />
        <span className="text-lg font-bold tracking-tight">Foudre</span>
        <div className="ml-auto flex items-center gap-2">
          {isLoading ? null : isAuthenticated ? (
            <>
              <Button variant="ghost" onClick={goToApp}>
                Mon espace
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut();
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={goToAuth}>
                Se connecter
              </Button>
              <Button className="gap-1.5" onClick={goToAuth}>
                <Zap className="size-4" />
                Rejoindre
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-20 text-center">
        <Badge variant="secondary" className="glow-ring-soft mb-6 gap-1.5 px-3 py-1.5 text-xs">
          <Zap className="size-3.5 text-primary" />
          Le hub des cours et devoirs de ta classe
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          Tes cours tombent du ciel,{" "}
          <span className="text-gradient-bolt animate-bolt-flicker">comme la foudre</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          Foudre centralise l'emploi du temps, les fiches de cours et les devoirs de ta
          classe. Inscris-toi, vérifie ton email, choisis ta classe — et tout apparaît.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" className="gap-2 glow-ring" onClick={goToAuth}>
            <Zap className="size-4" />
            Créer mon compte
          </Button>
          <Button size="lg" variant="outline" onClick={goToAuth}>
            J'ai déjà un compte
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Connexion par mot de passe · vérification email · mot de passe oublié
        </p>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20">
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
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary glow-ring-soft">
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

      {/* How it works */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20">
        <Card className="panel border-border/70 overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-8 p-8 lg:p-10 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Trois éclairs et c'est prêt
              </h2>
              <ol className="mt-6 space-y-4">
                {[
                  ["Inscris-toi", "Email + mot de passe, puis un code de vérification dans ta boîte."],
                  ["Questionnaire", "Sélectionne ta classe et ton option : LCE, Latin, Allemand ou Espagnol."],
                  ["Profite", "Ton emploi du temps s'affiche, les devoirs sont à un clic de téléchargement."],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-muted-foreground">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="panel rounded-xl p-6 glow-ring-soft">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-primary" /> Aperçu EDT
                </span>
                <span>Lundi</span>
              </div>
              <div className="space-y-2.5">
                {[
                  ["08:00", "Mathématiques", "Mme Bernard", "2 devoirs"],
                  ["09:00", "Histoire-géo", "M. Martin", "1 cours"],
                  ["10:30", "Espagnol", "Sra. López", ""],
                ].map(([time, subject, teacher, badge]) => (
                  <div
                    key={time}
                    className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2.5"
                  >
                    <span className="font-mono text-xs text-primary">{time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{teacher}</p>
                    </div>
                    {badge && (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <FileCheck2 className="size-3.5" />
                        {badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Upload className="size-3.5" /> Déposé par les admins de classe
                <BookOpen className="ml-2 size-3.5" /> Téléchargeable par tous
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Classes + CTA */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-24 text-center">
        {classCount > 0 && (
          <p className="mb-6 text-sm text-muted-foreground">
            <Users className="inline size-4 text-primary mr-1" />
            {classCount} classe{classCount > 1 ? "s" : ""} déjà configurée{classCount > 1 ? "s" : ""} par les admins
          </p>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Prêt à ne plus jamais rater un devoir ?
        </h2>
        <Button size="lg" className="mt-6 gap-2 glow-ring" onClick={goToAuth}>
          <Zap className="size-4" />
          Commencer maintenant
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          Un problème ? Contacte les délégués de ta classe.
        </p>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        ⚡ Foudre — cours & devoirs, inspiré de podcast.freebuff.com
      </footer>
    </motion.div>
  );
}
