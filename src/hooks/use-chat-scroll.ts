import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scroll automatique « collé en bas » pour les fils de discussion.
 *
 * - Au nouvel arrivage (déps changés), on descend automatiquement SEULEMENT
 *   si l'utilisateur était déjà en bas (sinon il est en train de lire) ;
 * - Suit aussi les changements de hauteur différés (images qui chargent) :
 *   passer un compteur dans les deps et l'incrémenter au `onLoad` ;
 * - Expose `atBottom` pour afficher un bouton « revenir en bas ».
 */
export function useChatScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // L'utilisateur est-il (presque) en bas ?
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      atBottomRef.current = near;
      setAtBottom(near);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Nouveau contenu : on descend si l'utilisateur était en bas. Au premier
  // chargement (historique), on descend aussi.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.dataset.initialized !== "1";
    if (first || atBottomRef.current) {
      el.dataset.initialized = "1";
      // requestAnimationFrame : attend que les images/DOM aient posé leurs
      // hauteurs avant de mesurer scrollHeight.
      requestAnimationFrame(() => scrollToBottom());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, atBottom, scrollToBottom };
}
