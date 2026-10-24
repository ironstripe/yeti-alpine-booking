import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from "react";

/** Keep the row shell (and search target) mounted, not its expensive slot tree. */
export function VisibleInstructorBlock({ id, index, estimatedHeight, scrollContainerRef, instructorRefs, pinned, children }: {
  id: string;
  index: number;
  estimatedHeight: number;
  scrollContainerRef?: MutableRefObject<HTMLDivElement | null>;
  instructorRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  pinned: boolean;
  children: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(index < 8);
  const [focused, setFocused] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(estimatedHeight);
  useEffect(() => { setMeasuredHeight(estimatedHeight); }, [estimatedHeight]);
  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    instructorRefs.current.set(id, element);
    const observer = new IntersectionObserver(([entry]) => {
      // Portalled booking/absence dialogs belong to the row: do not dismiss them on scroll.
      if (!entry.isIntersecting && document.querySelector('[role="dialog"]')) return;
      setVisible(entry.isIntersecting);
    }, { root: scrollContainerRef?.current ?? null, rootMargin: "400px 0px" });
    observer.observe(element);
    return () => { observer.disconnect(); instructorRefs.current.delete(id); };
  }, [id, instructorRefs, scrollContainerRef]);
  const mounted = visible || pinned || focused;
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) setMeasuredHeight(height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted, estimatedHeight]);
  return (
    <div ref={shell} data-teacher-block={id} style={{ minHeight: mounted ? undefined : measuredHeight }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {mounted && <div ref={content}>{children}</div>}
    </div>
  );
}