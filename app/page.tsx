"use client";

import { useMemo, useState } from "react";
import Calendar from "@/components/Calendar";
import Charts from "@/components/Charts";
import DayPanel from "@/components/DayPanel";
import GoldTicker from "@/components/GoldTicker";
import SettingsModal from "@/components/SettingsModal";
import SignOutButton from "@/components/SignOutButton";
import StatsBar from "@/components/StatsBar";
import SyncButton from "@/components/SyncButton";
import TradeModal from "@/components/TradeModal";
import { computeStats, floatingGoldPnl } from "@/lib/calc";
import { Trade } from "@/lib/types";
import { useGoldPrice } from "@/lib/useGoldPrice";
import { useJournal } from "@/lib/useJournal";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Home() {
  const { ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade, sync, syncImported } = useJournal();

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
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Pine<span className="text-leaf">Ledger</span>
          </h1>
          <p className="mt-1 text-sm text-sage">Trade journal · calendar · equity tracking</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <GoldTicker gold={gold} floating={goldFloating} currency={settings.currency} />
          <SyncButton sync={sync} onSync={syncImported} />
          <button
            onClick={() => { setEditing(undefined); setShowTradeModal(true); }}
            className="rounded-xl bg-leaf px-5 py-2.5 font-display text-sm font-semibold text-ink shadow-glow transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            + New trade
          </button>
          <SignOutButton />
        </div>
      </header>

      <div className="space-y-4 sm:space-y-5">
        <StatsBar stats={stats} baseWallet={settings.baseWallet} currency={settings.currency} onOpenSettings={() => setShowSettings(true)} />

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.6fr_1fr]">
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
