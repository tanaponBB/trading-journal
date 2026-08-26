"use client";

import { useMemo } from "react";
import { hashSeed } from "@/lib/missions";

interface Props {
  /** Same seed always draws the same seal — a day's stamp never changes. */
  seed: string;
  size?: number;
  className?: string;
}

/**
 * Decorative stamp standing in for the reference card's QR block. Deliberately
 * drawn with rounded modules and no finder squares so it reads as a generated
 * seal — it is not a scannable code and should not pretend to be one.
 */
export default function MissionSeal({ seed, size = 13, className = "" }: Props) {
  const cells = useMemo(() => {
    let h = hashSeed(seed);
    const out: boolean[] = [];
    for (let i = 0; i < size * size; i++) {
      h = (Math.imul(h, 0x01000193) ^ (h >>> 5)) >>> 0;
      out.push(((h >>> 9) & 1) === 1);
    }
    return out;
  }, [seed, size]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label="Daily pass seal"
      shapeRendering="geometricPrecision"
    >
      {cells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={i % size + 0.1}
            y={Math.floor(i / size) + 0.1}
            width={0.8}
            height={0.8}
            rx={0.22}
            fill="currentColor"
          />
        ) : null,
      )}
    </svg>
  );
}
