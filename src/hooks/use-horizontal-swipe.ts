import { useRef, useCallback, useLayoutEffect, type RefObject } from "react";

type UseHorizontalSwipeOptions = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  threshold?: number;
};

/**
 * Pointer + touch swipe for carousels. Uses passive:false touchmove so horizontal
 * swipes are not eaten by the browser (iOS back/scroll).
 */
export function useHorizontalSwipe(
  containerRef: RefObject<HTMLElement | null>,
  {
    onSwipeLeft,
    onSwipeRight,
    onInteractionStart,
    onInteractionEnd,
    threshold = 40,
  }: UseHorizontalSwipeOptions
) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const finish = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      startRef.current = null;
      onInteractionEnd?.();
      if (!start) return;
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      if (Math.abs(dx) < threshold) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (dx > 0) onSwipeRight();
      else onSwipeLeft();
    },
    [onSwipeLeft, onSwipeRight, onInteractionEnd, threshold]
  );

  const cancel = useCallback(() => {
    startRef.current = null;
    onInteractionEnd?.();
  }, [onInteractionEnd]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      onInteractionStart?.();
      startRef.current = { x: e.clientX, y: e.clientY };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [onInteractionStart]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      finish(e.clientX, e.clientY);
    },
    [finish]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (e.touches.length !== 1) return;
      onInteractionStart?.();
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
    },
    [onInteractionStart]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const t = e.changedTouches[0];
      if (t) finish(t.clientX, t.clientY);
      else cancel();
    },
    [finish, cancel]
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (!startRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  });

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (e.buttons === 0 && startRef.current) cancel();
    },
    onTouchStart,
    onTouchEnd,
    onTouchCancel: cancel,
  };
}
