"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GOLD_API_URL = "https://api.gold-api.com/price/XAU/USD";
const POLL_MS = 30_000;

export interface GoldPriceState {
  price: number | null;
  updatedAt: string | null; // ISO timestamp from the API
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/** Live XAU/USD spot price from gold-api.com, refreshed every 30s. */
export function useGoldPrice(): GoldPriceState {
  const [price, setPrice] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const alive = useRef(true);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(GOLD_API_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!alive.current) return;
      if (typeof data.price === "number") {
        setPrice(data.price);
        setUpdatedAt(data.updatedAt ?? null);
        setError(false);
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    fetchPrice();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchPrice();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchPrice();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPrice]);

  return { price, updatedAt, loading, error, refresh: fetchPrice };
}
