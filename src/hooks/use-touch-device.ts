import * as React from "react";

/**
 * Shared media-query helper. Returns whether the query currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * True on coarse-pointer devices (phones/tablets) where native scrolling
 * must own touch gestures instead of drag interactions.
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/**
 * Single source of truth for the phone-first scheduler layout.
 * Viewport width decides the workflow; pointer capability only gates
 * drag/resize interactions.
 */
export function useIsMobileScheduler(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
