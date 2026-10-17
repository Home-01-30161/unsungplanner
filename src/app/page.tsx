'use client';

import { useEffect, useState } from 'react';
import { Compass, Loader2, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { DESTINATIONS, BUDGET_STYLES, DISPLAY_CURRENCIES, type Budget } from '@/lib/types';

const STEPS = [
  { node: 'find_logistics', label: 'Flights, hotels & routes' },
  { node: 'find_research', label: 'Web research' },
  { node: 'find_weather', label: 'Weather & Thai calendar' },
  { node: 'calc_budget', label: 'Budget calculation' },
  { node: 'write_itinerary', label: 'Writing itinerary' }
];

type Result = { budget: Budget | null; itinerary: string; warnings: string[]; gaps: string[] };

const field =
  'w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500';

export default function Home() {
  const [originId, setOriginId] = useState('bangkok');
  const [destinationId, setDestinationId] = useState('chiang-mai');
  const [startDate, setStartDate] = useState('');
  const [minDate, setMinDate] = useState('');
  const [nights, setNights] = useState('4');
  const [style, setStyle] = useState('Mid-range');
  const [mode, setMode] = useState('fly');
  const [currency, setCurrency] = useState('THB');

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Default to 30 days from now, computed on the client so it is never a stale hardcoded date.
  useEffect(() => {
    const today = new Date();
    setMinDate(today.toISOString().slice(0, 10));
    setStartDate(new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10));
  }, []);

  function applyEvent(evt: { type: string; node?: string; data?: Record<string, unknown>; message?: string }) {
    if (evt.type === 'error') { setError(evt.message ?? 'Unknown error'); return; }
    if (evt.type !== 'step' || !evt.node) return;
    setDone((d) => [...d, evt.node!]);
    const data = evt.data ?? {};
    setResult((prev) => {
      const r: Result = prev ?? { budget: null, itinerary: '', warnings: [], gaps: [] };
      return {
        budget: (data.budget as Budget | undefined) ?? r.budget,
        itinerary: (data.itinerary as string | undefined) ?? r.itinerary,
        warnings: (data.calendarWarnings as string[] | undefined) ?? r.warnings,
        gaps: [...r.gaps, ...((data.gaps as string[] | undefined) ?? [])]
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null); setDone([]);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originId, destinationId, startDate, nights: Number(nights), style, mode, displayCurrency: currency })
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (; ;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the planner.');
    } finally {
      setLoading(false);
    }
  }

  const fmt = (thb: number, b: Budget) =>
    b.displayCurrency !== 'THB' && b.fxRate
      ? `${Math.round(thb * b.fxRate).toLocaleString()} ${b.displayCurrency} (${thb.toLocaleString()} THB)`
      : `${thb.toLocaleString()} THB`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="h-8 w-8 text-emerald-400" />
            <h1 className="text-3xl font-extrabold tracking-tight">Unsung Planner Thailand</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Live flight and hotel prices, Thai holiday and alcohol-ban checks, and a budget calculated by code, not guessed by an AI.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-slate-300">From
            <select className={field + ' mt-1'} value={originId} onChange={(e) => setOriginId(e.target.value)}>
              {Object.entries(DESTINATIONS).map(([id, d]) => <option key={id} value={id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">To
            <select className={field + ' mt-1'} value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
              {Object.entries(DESTINATIONS).map(([id, d]) => <option key={id} value={id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">Start date
            <input type="date" className={field + ' mt-1'} value={startDate} min={minDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className="text-xs font-semibold text-slate-300">Nights (1–14)
            <input type="number" min={1} max={14} className={field + ' mt-1'} value={nights} onChange={(e) => setNights(e.target.value)} required />
          </label>
          <label className="text-xs font-semibold text-slate-300">Budget level
            <select className={field + ' mt-1'} value={style} onChange={(e) => setStyle(e.target.value)}>
              {BUDGET_STYLES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">Getting there
            <select className={field + ' mt-1'} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="fly">Fly</option>
              <option value="drive">Drive (rental car)</option>
              <option value="train">Train (Bangkok ↔ Chiang Mai only)</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">Show amounts in
            <select className={field + ' mt-1'} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {DISPLAY_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={loading || !startDate}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition">
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Planning…</> : 'Plan my trip'}
            </button>
          </div>
        </form>

        {(loading || done.length > 0) && (
          <ul className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid gap-2 text-sm">
            {STEPS.map((s) => (
              <li key={s.node} className="flex items-center gap-2">
                {done.includes(s.node) ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-600" />}
                <span className={done.includes(s.node) ? 'text-slate-200' : 'text-slate-500'}>{s.label}</span>
              </li>
            ))}
          </ul>
        )}

        {error && <div role="alert" className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-sm">{error}</div>}

        {result?.warnings.map((w) => (
          <div key={w} className="p-4 bg-amber-950/60 border border-amber-800/80 rounded-xl flex gap-3 text-amber-200 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" /> <p>{w}</p>
          </div>
        ))}

        {result?.budget && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold">Budget (1 traveller)</h2>
              <span className="text-2xl font-black text-emerald-400">
                {fmt(result.budget.totalKnownTHB, result.budget)}{!result.budget.complete && <span className="text-sm text-amber-300"> + missing items</span>}
              </span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {result.budget.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-800 align-top">
                    <td className="py-2 pr-3">
                      <div>{l.label}</div>
                      {l.note && <div className="text-xs text-slate-500">{l.note}</div>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">{l.amountTHB == null ? <span className="text-amber-300">no data</span> : fmt(l.amountTHB, result.budget!)}</td>
                    <td className="py-2 pl-3 text-xs text-slate-500">{l.source === 'live' ? 'live price' : l.source === 'research' ? 'web, unverified' : 'estimate'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.gaps.length > 0 && <ul className="text-xs text-amber-300 list-disc pl-5">{result.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
          </section>
        )}

        {result?.itinerary && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Itinerary</h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{result.itinerary}</div>
          </section>
        )}
      </div>
    </main>
  );
}