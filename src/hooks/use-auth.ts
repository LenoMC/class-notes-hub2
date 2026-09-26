import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Fournit l'utilisateur courant et déconnecte proprement si la session est
 * orpheline (compte supprimé de la base — ex. après une réinitialisation).
 *
 * Un délai de grâce (4 s) évite les faux positifs juste après une connexion :
 * pendant un court instant Convex considère la session authentifiée alors que
 * la requête `me` renvoie encore l'ancien résultat null.
 */
export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.app.me);
  const { signIn, signOut } = useAuthActions();
  const signingOut = useRef(false);

  // Grâce : on ne considère "orphelin" que si (authentifié + pas d'utilisateur)
  // persiste au-delà du délai, ou si la session a déjà été authentifiée une
  // première fois avant (démarrage normal, pas une connexion en cours).
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || user !== null) {
      setGraceOver(false);
      return;
    }
    const t = setTimeout(() => setGraceOver(true), 4000);
    return () => clearTimeout(t);
  }, [isAuthLoading, isAuthenticated, user]);

  useEffect(() => {
    if (!graceOver || signingOut.current) return;
    signingOut.current = true;
    signOut()
      .catch(() => {})
      .finally(() => {
        signingOut.current = false;
      });
    toast.info("Votre session a expiré. Reconnectez-vous.");
  }, [graceOver, signOut]);

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
