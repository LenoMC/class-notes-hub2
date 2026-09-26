import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Fournit l'utilisateur courant et déconnecte proprement si la session est
 * orpheline (compte supprimé de la base — ex. après une réinitialisation).
 */
export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.app.me);
  const { signIn, signOut } = useAuthActions();

  useEffect(() => {
    if (!isAuthenticated || user !== null) return;
    // Authentifié côté Convex mais `me` renvoie null : le compte n'existe plus.
    signOut().catch(() => {});
    toast.info("Votre session a expiré. Reconnectez-vous.");
  }, [isAuthenticated, user, signOut]);

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
