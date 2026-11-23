import { useLayoutEffect, type DependencyList, type RefObject } from "react";

export function markOverflowEdges(node: HTMLElement, scrolls = true): void {
  const hidden = node.scrollWidth - node.clientWidth;
  node.toggleAttribute("data-overflow-start", scrolls && node.scrollLeft >= 1);
  node.toggleAttribute("data-overflow-end", scrolls && hidden - node.scrollLeft >= 1);
}

export function useOverflowEdges(ref: RefObject<HTMLElement | null>, deps: DependencyList): void {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      markOverflowEdges(node);
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    node.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, deps);
}
