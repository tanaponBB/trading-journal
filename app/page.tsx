"use client";

import { useMemo, useState } from "react";
import Calendar from "@/components/Calendar";
import Charts from "@/components/Charts";
import DayPanel from "@/components/DayPanel";
import GoldTicker from "@/components/GoldTicker";
import SettingsModal from "@/components/SettingsModal";
import SignOutButton from "@/components/SignOutButton";
import StatsBar from "@/components/StatsBar";
import ThemeToggle from "@/components/ThemeToggle";
import TradeModal from "@/components/TradeModal";
import Wordmark from "@/components/Wordmark";
import { DUR, rise, useGsap } from "@/lib/anim";
import { computeStats, floatingGoldPnl } from "@/lib/calc";
import { Trade } from "@/lib/types";
import { useGoldPrice } from "@/lib/useGoldPrice";
import { useJournal } from "@/lib/useJournal";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Home() {
  const { ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade } = useJournal();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editing, setEditing] = useState<Trade | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);

  const gold = useGoldPrice();

  const stats = useMemo(() => computeStats(trades), [trades]);
  const dayTrades = useMemo(
    () => trades.filter(t => t.date === selectedDate),
    [trades, selectedDate],
  );
  const goldFloating = useMemo(
    () => (gold.price != null ? floatingGoldPnl(trades, gold.price) : null),
    [trades, gold.price],
  );

  // Page entrance: the masthead leads, the rule draws itself, the panels follow.
  const scope = useGsap<HTMLElement>((_self, el) => {
    rise(el.querySelectorAll("[data-anim='head']"), { stagger: 0.07 });
    rise(el.querySelectorAll("[data-anim='tools']"), { delay: 0.12, stagger: 0.05, y: 10 });
    rise(el.querySelectorAll("[data-anim='panel']"), { delay: 0.2, stagger: 0.08, y: 22, duration: DUR.slow });
  }, [ready]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(todayIso());
  };

  if (!ready) return null; // avoid hydration flash before localStorage loads

  return (
    <main ref={scope} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 data-anim="head" className="text-2xl sm:text-3xl">
            <Wordmark />
          </h1>
          <p data-anim="head" className="mt-1.5 text-sm text-ash">
            Trade journal · calendar · equity tracking
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div data-anim="tools">
            <GoldTicker gold={gold} floating={goldFloating} currency={settings.currency} />
          </div>
          <button
            data-anim="tools"
            onClick={() => { setEditing(undefined); setShowTradeModal(true); }}
            className="btn-solid"
          >
            + New trade
          </button>
          <div data-anim="tools">
            <ThemeToggle />
          </div>
          <div data-anim="tools">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="space-y-4 sm:space-y-5">
        <div data-anim="panel">
          <StatsBar
            stats={stats}
            baseWallet={settings.baseWallet}
            currency={settings.currency}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div data-anim="panel">
            <Calendar
              year={year}
              month={month}
              trades={trades}
              currency={settings.currency}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              onToday={goToday}
            />
          </div>
          <div data-anim="panel">
            <DayPanel
              date={selectedDate}
              trades={dayTrades}
              currency={settings.currency}
              goldPrice={gold.price}
              onAdd={() => { setEditing(undefined); setShowTradeModal(true); }}
              onEdit={t => { setEditing(t); setShowTradeModal(true); }}
              onDelete={deleteTrade}
            />
          </div>
        </div>

        <Charts trades={trades} baseWallet={settings.baseWallet} currency={settings.currency} />
      </div>

      {showTradeModal && (
        <TradeModal
          date={editing?.date ?? selectedDate}
          currency={settings.currency}
          initial={editing}
          onSave={t => (editing ? updateTrade(editing.id, t) : addTrade(t))}
          onClose={() => setShowTradeModal(false)}
        />
      )}
      {showSettings && (
        <SettingsModal settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}
