'use client';

import { useEffect, useState } from 'react';
import { Compass, Loader2, AlertTriangle, CheckCircle2, Circle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { BUDGET_STYLES, DISPLAY_CURRENCIES, type Budget, type ResearchSource } from '@/lib/types';

/** Renders a structured bullet-point itinerary with clickable [N] citation links. */
function ItineraryRenderer({ text, sources }: { text: string; sources: ResearchSource[] }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-4 text-sm">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Day heading: "Day 1 — ..."
        if (/^Day\s+\d+/i.test(trimmed)) {
          return (
            <h3 key={i} className="text-emerald-400 font-bold text-base mt-6 first:mt-0">
              {trimmed}
            </h3>
          );
        }
        // Sub-heading: Morning / Afternoon / Evening
        if (/^(Morning|Afternoon|Evening)$/i.test(trimmed)) {
          return (
            <p key={i} className="text-slate-400 font-semibold text-xs uppercase tracking-widest mt-3">
              {trimmed}
            </p>
          );
        }
        // Bullet line: starts with "-"
        if (trimmed.startsWith('-')) {
          const content = trimmed.slice(1).trim();
          return (
            <div key={i} className="flex gap-2 text-slate-300 leading-snug">
              <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
              <span>{renderWithCitations(content, sources)}</span>
            </div>
          );
        }
        // Fallback: plain text
        return <p key={i} className="text-slate-400 text-xs">{trimmed}</p>;
      })}
    </div>
  );
}

/** Splits a text string on [N] tokens and returns a mix of text and link nodes. */
function renderWithCitations(text: string, sources: ResearchSource[]) {
  const parts = text.split(/(\[\d+\])/);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = Number(match[1]) - 1;
      const src = sources[idx];
      if (src) {
        return (
          <a
            key={i}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            title={src.title}
            className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 text-xs font-semibold align-super leading-none transition"
          >
            [{match[1]}]
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

const STEPS = [
  { node: 'geocode_cities',  label: 'Locating cities' },
  { node: 'find_logistics',  label: 'Flights, hotels & routes' },
  { node: 'find_research',   label: 'Web research' },
  { node: 'find_weather',    label: 'Weather & holidays' },
  { node: 'calc_budget',     label: 'Budget calculation' },
  { node: 'write_itinerary', label: 'Writing itinerary' }
];

type Result = {
  budget: Budget | null;
  itinerary: string;
  warnings: string[];
  gaps: string[];
  sources: ResearchSource[];
};

const field =
  'w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500';

export default function Home() {
  const [originCity,    setOriginCity]    = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [destCity,      setDestCity]      = useState('');
  const [destCountry,   setDestCountry]   = useState('');
  const [startDate, setStartDate] = useState('');
  const [minDate,   setMinDate]   = useState('');
  const [nights,    setNights]    = useState('4');
  const [style,     setStyle]     = useState('Mid-range');
  const [mode,      setMode]      = useState('fly');
  const [currency,  setCurrency]  = useState('USD');
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState<string[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<Result | null>(null);

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
      const r: Result = prev ?? { budget: null, itinerary: '', warnings: [], gaps: [], sources: [] };
      return {
        budget:    (data.budget    as Budget | undefined) ?? r.budget,
        itinerary: (data.itinerary as string | undefined) ?? r.itinerary,
        warnings:  (data.calendarWarnings as string[] | undefined) ?? r.warnings,
        gaps:      [...r.gaps,    ...((data.gaps            as string[]        | undefined) ?? [])],
        sources:   [...r.sources, ...((data.researchSources as ResearchSource[] | undefined) ?? [])],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null); setDone([]); setSourcesOpen(false);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originCity, originCountry, destCity, destCountry,
          startDate, nights: Number(nights), style, mode, displayCurrency: currency
        })
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
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

  const fmt = (usd: number, b: Budget) =>
    b.displayCurrency !== 'USD' && b.fxRate
      ? `${Math.round(usd * b.fxRate).toLocaleString()} ${b.displayCurrency} ($${usd.toLocaleString()} USD)`
      : `$${usd.toLocaleString()} USD`;

  const canSubmit = !loading && !!startDate && !!originCity && !!originCountry && !!destCity && !!destCountry;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="h-8 w-8 text-emerald-400" />
            <h1 className="text-3xl font-extrabold tracking-tight">Unsung Planner</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Live flight and hotel prices, public holiday checks, and a budget calculated by code — for any city in the world.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Origin */}
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-300">From — city</span>
            <input id="origin-city" className={field} placeholder="e.g. Bangkok" value={originCity}
              onChange={(e) => setOriginCity(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-300">From — country</span>
            <input id="origin-country" className={field} placeholder="e.g. Thailand" value={originCountry}
              onChange={(e) => setOriginCountry(e.target.value)} required />
          </div>

          {/* Destination */}
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-300">To — city</span>
            <input id="dest-city" className={field} placeholder="e.g. Tokyo" value={destCity}
              onChange={(e) => setDestCity(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-300">To — country</span>
            <input id="dest-country" className={field} placeholder="e.g. Japan" value={destCountry}
              onChange={(e) => setDestCountry(e.target.value)} required />
          </div>

          {/* Dates */}
          <label className="text-xs font-semibold text-slate-300">Start date
            <input id="start-date" type="date" className={field + ' mt-1'} value={startDate} min={minDate}
              onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className="text-xs font-semibold text-slate-300">Nights (1–14)
            <input id="nights" type="number" min={1} max={14} className={field + ' mt-1'} value={nights}
              onChange={(e) => setNights(e.target.value)} required />
          </label>

          {/* Options */}
          <label className="text-xs font-semibold text-slate-300">Budget level
            <select id="budget-style" className={field + ' mt-1'} value={style} onChange={(e) => setStyle(e.target.value)}>
              {BUDGET_STYLES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">Getting there
            <select id="transport-mode" className={field + ' mt-1'} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="fly">Fly</option>
              <option value="drive">Drive (rental car)</option>
              <option value="train">Train</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300 md:col-span-2">Show amounts in
            <select id="display-currency" className={field + ' mt-1'} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {DISPLAY_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          <div className="md:col-span-2">
            <button id="submit-btn" type="submit" disabled={!canSubmit}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition">
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" />Planning…</> : 'Plan my trip'}
            </button>
          </div>
        </form>

        {/* Progress steps */}
        {(loading || done.length > 0) && (
          <ul className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid gap-2 text-sm">
            {STEPS.map((s) => (
              <li key={s.node} className="flex items-center gap-2">
                {done.includes(s.node)
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <Circle className="h-4 w-4 text-slate-600" />}
                <span className={done.includes(s.node) ? 'text-slate-200' : 'text-slate-500'}>{s.label}</span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div role="alert" className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-sm">{error}</div>
        )}

        {result?.warnings.map((w) => (
          <div key={w} className="p-4 bg-amber-950/60 border border-amber-800/80 rounded-xl flex gap-3 text-amber-200 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" /> <p>{w}</p>
          </div>
        ))}

        {/* Budget table */}
        {result?.budget && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold">Budget (1 traveller)</h2>
              <span className="text-2xl font-black text-emerald-400">
                {fmt(result.budget.totalKnownUSD, result.budget)}
                {!result.budget.complete && <span className="text-sm text-amber-300"> + missing items</span>}
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
                    <td className="py-2 text-right whitespace-nowrap">
                      {l.amountUSD == null
                        ? <span className="text-amber-300">no data</span>
                        : fmt(l.amountUSD, result.budget!)}
                    </td>
                    <td className="py-2 pl-3 text-xs text-slate-500">
                      {l.source === 'live'
                        ? l.url
                          ? <a href={l.url} target="_blank" rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 underline decoration-dotted underline-offset-2 transition-colors">
                              live price ↗
                            </a>
                          : <span>live price</span>
                        : l.source === 'research' ? 'web, unverified' : 'estimate'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.gaps.length > 0 && (
              <ul className="text-xs text-amber-300 list-disc pl-5">
                {result.gaps.map((g) => <li key={g}>{g}</li>)}
              </ul>
            )}
          </section>
        )}

        {/* Itinerary */}
        {result?.itinerary && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Itinerary</h2>
            <ItineraryRenderer text={result.itinerary} sources={result.sources} />
          </section>
        )}

        {/* Research citations */}
        {result?.sources && result.sources.length > 0 && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 text-sm font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 transition"
              onClick={() => setSourcesOpen((o) => !o)}
            >
              <span>Sources &amp; price references ({result.sources.length})</span>
              {sourcesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {sourcesOpen && (
              <ul className="divide-y divide-slate-800 px-4 pb-4">
                {result.sources.map((src, i) => (
                  <li key={i} className="py-3 space-y-1">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-emerald-400 hover:text-emerald-300 text-sm font-medium leading-snug transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {src.title}
                    </a>
                    <p className="text-xs text-slate-500 line-clamp-2">{src.snippet}</p>
                    <p className="text-xs text-slate-600 truncate">{src.url}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}