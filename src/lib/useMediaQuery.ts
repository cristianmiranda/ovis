import { useEffect, useState } from "react";

/**
 * The phone layout's one switch, written out the same in every stylesheet's @media: a window up to
 * 768px wide, or a touch screen at most 500px tall (a phone on its side). WIDE_QUERY is its exact
 * opposite, so a short window worked by a mouse keeps the desktop layout.
 */
const SHORT_TOUCH = "(pointer: coarse) and (max-height: 500px)";
export const PHONE_QUERY = `(max-width: 768px), ${SHORT_TOUCH}`;
export const WIDE_QUERY = "(min-width: 769px) and (not (pointer: coarse)), (min-width: 769px) and (min-height: 501px)";

export const phoneQueryAnd = (condition: string): string => `(max-width: 768px) and ${condition}, ${SHORT_TOUCH} and ${condition}`;
export const wideQueryAnd = (condition: string): string => WIDE_QUERY.split(", ").map((part) => `${part} and ${condition}`).join(", ");

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const onChange = (): void => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
