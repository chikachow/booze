import { useCallback, useEffect, useRef } from "react";

export function useReturnFocus(
  isOpen: boolean,
  fallbackSelector: string,
): (trigger?: HTMLElement | null) => void {
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      const trigger = triggerRef.current;
      if (trigger !== null && trigger.isConnected) {
        trigger.focus();
      } else {
        document.querySelector<HTMLElement>(fallbackSelector)?.focus();
      }
      triggerRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [fallbackSelector, isOpen]);

  return useCallback((trigger = focusedHTMLElement()) => {
    triggerRef.current = trigger;
  }, []);
}

function focusedHTMLElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
