"use client";

import { useCallback, useEffect, useRef } from "react";
import { DUR, EASE_IN, gsap, modalIn, reduced, useIsoLayoutEffect } from "@/lib/anim";

interface Props {
  label: string;
  onClose: () => void;
  /** Extra classes for the card — mainly max-width. */
  cardClassName?: string;
  /** Receives the animated close so Cancel/Save buttons exit the same way. */
  children: (close: () => void) => React.ReactNode;
}

/**
 * Shared modal shell: backdrop fade + card lift on open, the reverse on close,
 * plus Escape / backdrop-click dismissal. Both journal dialogs sit on this.
 */
export default function Modal({ label, onClose, cardClassName = "max-w-lg", children }: Props) {
  const backdrop = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useIsoLayoutEffect(() => {
    if (!backdrop.current || !card.current || reduced()) return;
    const tl = modalIn(backdrop.current, card.current);
    return () => { tl.kill(); };
  }, []);

  /** Plays the exit before unmounting so the dialog doesn't just vanish. */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    if (reduced() || !backdrop.current || !card.current) return onClose();

    gsap.timeline({ onComplete: onClose })
      .to(card.current, { autoAlpha: 0, y: 10, scale: 0.99, duration: DUR.fast, ease: EASE_IN })
      .to(backdrop.current, { autoAlpha: 0, duration: 0.18, ease: EASE_IN }, "-=0.14");
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      ref={backdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/85 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={card}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-panel border border-line bg-panel p-6 shadow-pop ${cardClassName}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children(close)}
      </div>
    </div>
  );
}
