"use client";

import { useMemo, useRef, useState } from "react";
import Calendar from "@/components/Calendar";
import Charts from "@/components/Charts";
import DayPanel from "@/components/DayPanel";
import GoldTicker from "@/components/GoldTicker";
import MissionBoard from "@/components/MissionBoard";
import PlanBoard from "@/components/PlanBoard";
import SettingsModal from "@/components/SettingsModal";
import SignOutButton from "@/components/SignOutButton";
import StatsBar from "@/components/StatsBar";
import Tabs, { TabKey } from "@/components/Tabs";
import ThemeToggle from "@/components/ThemeToggle";
import TradeModal from "@/components/TradeModal";
import Wordmark from "@/components/Wordmark";
import { DUR, EASE, gsap, rise, useGsap, useIsoLayoutEffect } from "@/lib/anim";
import { computeStats, floatingGoldPnl, isSetupStale } from "@/lib/calc";
import { Setup, Trade } from "@/lib/types";
import { useGoldPrice } from "@/lib/useGoldPrice";
import { useJournal } from "@/lib/useJournal";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Home() {
  const {
    ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade,
    setups, addSetup, updateSetup, deleteSetup, takeSetup,
    missions, setMissions,
  } = useJournal();

  const now = new Date();
  const [tab, setTab] = useState<TabKey>("record");
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
  const tradesByDate = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const t of trades) {
      const list = m.get(t.date);
      if (list) list.push(t);
      else m.set(t.date, [t]);
    }
    return m;
  }, [trades]);
  const balance = settings.baseWallet + stats.realized;

  const liveSetups = useMemo(
    () => setups.filter(s => s.status === "WATCHING" && !isSetupStale(s)).length,
    [setups],
  );

  // Masthead entrance — runs once, independent of which section is showing.
  const scope = useGsap<HTMLElement>((_self, el) => {
    rise(el.querySelectorAll("[data-anim='head']"), { stagger: 0.07 });
    rise(el.querySelectorAll("[data-anim='tools']"), { delay: 0.12, stagger: 0.05, y: 10 });
  }, [ready]);

  // Section swap — the panel area cross-fades whenever the tab changes.
  const panes = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const el = panes.current;
    if (!el) return;
    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE, clearProps: "transform" },
    );
    return () => { tween.kill(); };
  }, [tab]);

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

  /**
   * Promote a plan into a real position. Taking a setup means entering it now,
   * so it is always recorded against today — not whatever day happens to be
   * selected in the calendar — and the view jumps there so you see it land.
   */
  const onTakeSetup = (s: Setup) => {
    const date = todayIso();
    takeSetup(s, date);
    setSelectedDate(date);
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setTab("record");
  };

  if (!ready) return null; // avoid hydration flash before localStorage loads

  return (
    <main ref={scope} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
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
          <div data-anim="tools">
            <ThemeToggle />
          </div>
          <div data-anim="tools">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div data-anim="tools" className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "record", label: "Record" },
            { key: "analytics", label: "Analytics" },
            { key: "plan", label: "Plan", badge: liveSetups },
          ]}
        />
        {tab === "record" && (
          <button
            onClick={() => { setEditing(undefined); setShowTradeModal(true); }}
            className="btn-solid"
          >
            + New trade
          </button>
        )}
      </div>

      <div ref={panes}>
        {tab === "record" && (
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
        )}

        {tab === "analytics" && (
          <div className="space-y-4 sm:space-y-5">
            <StatsBar
              stats={stats}
              baseWallet={settings.baseWallet}
              currency={settings.currency}
              onOpenSettings={() => setShowSettings(true)}
            />
            <Charts trades={trades} baseWallet={settings.baseWallet} currency={settings.currency} />
          </div>
        )}

        {tab === "plan" && (
          <div className="space-y-4 sm:space-y-5">
            <MissionBoard
              date={selectedDate}
              today={todayIso()}
              tradesByDate={tradesByDate}
              missions={missions}
              balance={balance}
              onSaveMissions={setMissions}
            />
            <PlanBoard
              setups={setups}
              currency={settings.currency}
              takeDate={todayIso()}
              onAdd={addSetup}
              onUpdate={updateSetup}
              onDelete={deleteSetup}
              onTake={onTakeSetup}
            />
          </div>
        )}
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
