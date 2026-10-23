'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Loader2, AlertTriangle, CheckCircle2, Circle, ExternalLink, ChevronDown, ChevronUp, MapPin, X } from 'lucide-react';
import { BUDGET_STYLES, DISPLAY_CURRENCIES, type Budget, type ResearchSource } from '@/lib/types';

// Set NEXT_PUBLIC_TURNSTILE_SITE_KEY to enable the captcha. When unset the app
// behaves exactly as before, and the API also skips verification.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/** Only absolute http(s) URLs may be rendered as links (research data is untrusted). */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function TurnstileWidget({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return;
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener('load', render);
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = '1';
      script.addEventListener('load', render);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existing?.removeEventListener('load', render);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [onToken, resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={container} className="md:col-span-2 flex justify-center" />;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CityCandidate = {
  name: string;
  admin1: string | null;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  timezone: string;
  population: number | null;
  label: string;
};

type PinnedCity = {
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  timezone: string;
};

// ─── CityPicker ───────────────────────────────────────────────────────────────

/**
 * A city + country pair input that fetches candidates from /api/cities and
 * shows a disambiguation dropdown when there are multiple matches.
 * Once the user selects a candidate, it's "pinned" and shown as a badge.
 */
function CityPicker({
  idPrefix,
  cityLabel,
  cityPlaceholder,
  countryPlaceholder,
  city,
  country,
  pin,
  onCityChange,
  onCountryChange,
  onPin,
  onClearPin,
}: {
  idPrefix: string;
  cityLabel: string;
  cityPlaceholder: string;
  countryPlaceholder: string;
  city: string;
  country: string;
  pin: PinnedCity | null;
  onCityChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onPin: (c: PinnedCity) => void;
  onClearPin: () => void;
}) {
  const [candidates, setCandidates] = useState<CityCandidate[]>([]);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const field =
    'w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500';

  // Fetch candidates whenever city or country changes (debounced 500ms)
  const fetchCandidates = useCallback((c: string, ctry: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (c.trim().length < 2) { setCandidates([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const r = await fetch(`/api/cities?city=${encodeURIComponent(c)}&country=${encodeURIComponent(ctry)}`);
        const data: CityCandidate[] = await r.json();
        setCandidates(data);
        // Auto-open if more than 1 result OR the top result doesn't exactly match the typed city
        if (data.length > 0) setOpen(true);
      } catch { /* ignore */ } finally { setFetching(false); }
    }, 500);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleSelect(c: CityCandidate) {
    onPin({ name: c.name, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone });
    onCityChange(c.name);
    onCountryChange(c.country);
    setOpen(false);
    setCandidates([]);
  }

  function handleCityInput(v: string) {
    onCityChange(v);
    onClearPin();
    fetchCandidates(v, country);
  }

  function handleCountryInput(v: string) {
    onCountryChange(v);
    onClearPin();
    fetchCandidates(city, v);
  }

  return (
    <div ref={wrapperRef} className="contents">
      {/* City field */}
      <div className="space-y-1 relative">
        <span className="text-xs font-semibold text-slate-300">{cityLabel} — city</span>
        {pin ? (
          /* Pinned badge */
          <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-700/60 rounded-lg px-3 py-2.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium text-emerald-300 truncate">{pin.name}</span>
            <button type="button" onClick={onClearPin} className="ml-auto text-slate-500 hover:text-slate-300 transition">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <input
            id={`${idPrefix}-city`}
            className={field + (fetching ? ' pr-8' : '')}
            placeholder={cityPlaceholder}
            value={city}
            onChange={(e) => handleCityInput(e.target.value)}
            onFocus={() => { if (candidates.length > 0) setOpen(true); }}
            autoComplete="off"
            required
          />
        )}

        {/* Dropdown */}
        {open && candidates.length > 0 && !pin && (
          <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            {candidates.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-800 transition flex items-start gap-3"
                >
                  <MapPin className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-slate-100">{c.label}</div>
                    {c.population != null && (
                      <div className="text-xs text-slate-500">
                        pop. {c.population.toLocaleString()}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Country field */}
      <div className="space-y-1">
        <span className="text-xs font-semibold text-slate-300">{cityLabel} — country</span>
        <input
          id={`${idPrefix}-country`}
          className={field}
          placeholder={countryPlaceholder}
          value={country}
          onChange={(e) => handleCountryInput(e.target.value)}
          autoComplete="off"
          required
        />
      </div>
    </div>
  );
}

// ─── Itinerary renderer ───────────────────────────────────────────────────────

function ItineraryRenderer({ text, sources }: { text: string; sources: ResearchSource[] }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-4 text-sm">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (/^Day\s+\d+/i.test(trimmed)) {
          return <h3 key={i} className="text-emerald-400 font-bold text-base mt-6 first:mt-0">{trimmed}</h3>;
        }
        if (/^(Morning|Afternoon|Evening)$/i.test(trimmed)) {
          return <p key={i} className="text-slate-400 font-semibold text-xs uppercase tracking-widest mt-3">{trimmed}</p>;
        }
        if (trimmed.startsWith('-')) {
          return (
            <div key={i} className="flex gap-2 text-slate-300 leading-snug">
              <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
              <span>{renderWithCitations(trimmed.slice(1).trim(), sources)}</span>
            </div>
          );
        }
        return <p key={i} className="text-slate-400 text-xs">{trimmed}</p>;
      })}
    </div>
  );
}

function renderWithCitations(text: string, sources: ResearchSource[]) {
  return text.split(/(\[\d+\])/).map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const src = sources[Number(match[1]) - 1];
      const href = src ? safeHref(src.url) : undefined;
      if (src && href) {
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" title={src.title}
            className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 text-xs font-semibold align-super leading-none transition">
            [{match[1]}]
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { node: 'geocode_cities',  label: 'Locating cities' },
  { node: 'find_logistics',  label: 'Flights, hotels & routes' },
  { node: 'find_research',   label: 'Web research' },
  { node: 'find_weather',    label: 'Weather & holidays' },
  { node: 'calc_budget',     label: 'Budget calculation' },
  { node: 'write_itinerary', label: 'Writing itinerary' },
];

type Result = {
  budget: Budget | null;
  itinerary: string;
  warnings: string[];
  gaps: string[];
  sources: ResearchSource[];
};

export default function Home() {
  const [originCity,    setOriginCity]    = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [originPin,     setOriginPin]     = useState<PinnedCity | null>(null);
  const [destCity,      setDestCity]      = useState('');
  const [destCountry,   setDestCountry]   = useState('');
  const [destPin,       setDestPin]       = useState<PinnedCity | null>(null);
  const [startDate,  setStartDate]  = useState('');
  const [minDate,    setMinDate]    = useState('');
  const [nights,     setNights]     = useState('4');
  const [travelers,  setTravelers]  = useState('1');
  const [style,      setStyle]      = useState('Mid-range');
  const [mode,       setMode]       = useState('fly');
  const [currency,   setCurrency]   = useState('USD');
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState<string[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<Result | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

  useEffect(() => {
    const today = new Date();
    // Computed on the client only: a server-side clock (or a different timezone)
    // would hydrate a different date and trigger a mismatch warning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        gaps:      [...r.gaps,    ...((data.gaps            as string[]         | undefined) ?? [])],
        sources:   [...r.sources, ...((data.researchSources as ResearchSource[] | undefined) ?? [])],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Please complete the human verification below and try again.');
      return;
    }
    setLoading(true); setError(null); setResult(null); setDone([]); setSourcesOpen(false);
    try {
      const body: Record<string, unknown> = {
        originCity, originCountry, destCity, destCountry,
        startDate, nights: Number(nights), travelers: Number(travelers), style, mode, displayCurrency: currency,
      };
      if (originPin) body.originPin = originPin;
      if (destPin)   body.destPin   = destPin;
      if (TURNSTILE_SITE_KEY) body.turnstileToken = turnstileToken;

      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Request failed (${res.status})`);
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
      // Turnstile tokens are single-use: get a fresh one for the next attempt.
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken('');
        setTurnstileReset((n) => n + 1);
      }
    }
  }

  const fmt = (usd: number, b: Budget) =>
    b.displayCurrency !== 'USD' && b.fxRate
      ? `${Math.round(usd * b.fxRate).toLocaleString()} ${b.displayCurrency} ($${usd.toLocaleString()} USD)`
      : `$${usd.toLocaleString()} USD`;

  const canSubmit = !loading && !!startDate && !!originCity && !!originCountry && !!destCity && !!destCountry;

  const fieldCls = 'w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500';

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

          {/* Origin CityPicker */}
          <CityPicker
            idPrefix="origin"
            cityLabel="From"
            cityPlaceholder="e.g. Bangkok"
            countryPlaceholder="e.g. Thailand"
            city={originCity}
            country={originCountry}
            pin={originPin}
            onCityChange={setOriginCity}
            onCountryChange={setOriginCountry}
            onPin={setOriginPin}
            onClearPin={() => setOriginPin(null)}
          />

          {/* Destination CityPicker */}
          <CityPicker
            idPrefix="dest"
            cityLabel="To"
            cityPlaceholder="e.g. Tokyo"
            countryPlaceholder="e.g. Japan"
            city={destCity}
            country={destCountry}
            pin={destPin}
            onCityChange={setDestCity}
            onCountryChange={setDestCountry}
            onPin={setDestPin}
            onClearPin={() => setDestPin(null)}
          />

          {/* Dates & Travelers */}
          <label className="text-xs font-semibold text-slate-300">Start date
            <input id="start-date" type="date" className={fieldCls + ' mt-1'} value={startDate} min={minDate}
              onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-300">Nights (1–14)
              <input id="nights" type="number" min={1} max={14} className={fieldCls + ' mt-1'} value={nights}
                onChange={(e) => setNights(e.target.value)} required />
            </label>
            <label className="text-xs font-semibold text-slate-300">Travelers
              <select id="travelers" className={fieldCls + ' mt-1'} value={travelers} onChange={(e) => setTravelers(e.target.value)}>
                <option value="1">1 adult</option>
                <option value="2">2 adults</option>
                <option value="3">3 adults</option>
                <option value="4">4 adults</option>
                <option value="5">5 adults</option>
                <option value="6">6 adults</option>
              </select>
            </label>
          </div>

          {/* Options */}
          <label className="text-xs font-semibold text-slate-300">Budget level
            <select id="budget-style" className={fieldCls + ' mt-1'} value={style} onChange={(e) => setStyle(e.target.value)}>
              {BUDGET_STYLES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">Getting there
            <select id="transport-mode" className={fieldCls + ' mt-1'} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="fly">Fly</option>
              <option value="drive">Drive (rental car)</option>
              <option value="train">Train</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300 md:col-span-2">Show amounts in
            <select id="display-currency" className={fieldCls + ' mt-1'} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {DISPLAY_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          <TurnstileWidget onToken={handleTurnstileToken} resetKey={turnstileReset} />

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
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" /><p>{w}</p>
          </div>
        ))}

        {/* Budget table */}
        {result?.budget && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold">
                Budget ({result.budget.travelers ?? travelers} traveller{Number(result.budget.travelers ?? travelers) > 1 ? 's' : ''})
              </h2>
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
                        ? (() => {
                            const href = l.url ? safeHref(l.url) : undefined;
                            return href ? (
                              <a href={href} target="_blank" rel="noopener noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 underline decoration-dotted underline-offset-2 transition-colors">
                                live price ↗
                              </a>
                            ) : (
                              <span>live price</span>
                            );
                          })()
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
                {result.sources.map((src, i) => {
                  const href = safeHref(src.url);
                  return (
                    <li key={i} className="py-3 space-y-1">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                          className="flex items-start gap-1.5 text-emerald-400 hover:text-emerald-300 text-sm font-medium leading-snug transition">
                          <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {src.title}
                        </a>
                      ) : (
                        <span className="flex items-start gap-1.5 text-slate-300 text-sm font-medium leading-snug">
                          <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {src.title}
                        </span>
                      )}
                      <p className="text-xs text-slate-500 line-clamp-2">{src.snippet}</p>
                      <p className="text-xs text-slate-600 truncate">{src.url}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}