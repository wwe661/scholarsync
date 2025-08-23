// src/pages/CostPredict.jsx
import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

/**
 * Currency list (meta only). Rates are fetched live below.
 * NOTE: Not every free FX API supports every code; we fetch from two sources
 * and gracefully fall back when a code isn't present.
 */
const CURRENCY_META = [
  { code: "USD", name: "US Dollar",            symbol: "$"  },
  { code: "EUR", name: "Euro",                 symbol: "€"  },
  { code: "GBP", name: "British Pound",        symbol: "£"  },
  { code: "JPY", name: "Japanese Yen",         symbol: "¥"  },
  { code: "CNY", name: "Chinese Yuan",         symbol: "¥"  },
  { code: "AUD", name: "Australian Dollar",    symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar",      symbol: "C$" },
  { code: "NZD", name: "New Zealand Dollar",   symbol: "NZ$"},
  { code: "CHF", name: "Swiss Franc",          symbol: "Fr" },
  { code: "SEK", name: "Swedish Krona",        symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone",      symbol: "kr" },
  { code: "DKK", name: "Danish Krone",         symbol: "kr" },
  { code: "SGD", name: "Singapore Dollar",     symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar",     symbol: "HK$"},
  { code: "KRW", name: "Korean Won",           symbol: "₩"  },
  { code: "INR", name: "Indian Rupee",         symbol: "₹"  },
  { code: "THB", name: "Thai Baht",            symbol: "฿"  },
  { code: "MYR", name: "Malaysian Ringgit",    symbol: "RM" },
  { code: "IDR", name: "Indonesian Rupiah",    symbol: "Rp" },
  { code: "MMK", name: "Myanmar Kyat",         symbol: "Ks" },
];

/**
 * Try two free sources (no API key):
 * 1) https://open.er-api.com/v6/latest/USD   (often includes MMK)
 * 2) https://api.frankfurter.app/latest?from=USD  (ECB set; fewer exotic codes)
 *
 * Returns an object like { USD: 1, EUR: 0.92, ... }.
 */
async function fetchUsdRates() {
  // Primary: open.er-api.com
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (r.ok) {
      const j = await r.json();
      if (j && j.result === "success" && j.rates) {
        return { USD: 1, ...j.rates };
      }
    }
  } catch (e) {
    // ignore, fall through
  }

  // Fallback: frankfurter
  try {
    const r2 = await fetch("https://api.frankfurter.app/latest?from=USD");
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2 && j2.rates) {
        return { USD: 1, ...j2.rates };
      }
    }
  } catch (e) {
    // ignore
  }

  // ultimate fallback
  return { USD: 1 };
}

export default function CostPredict() {
  const params = new URLSearchParams(window.location.search);
  const uniName = params.get("university") || params.get("u") || "";

  const [rows, setRows] = useState([]);
  const [program, setProgram] = useState("");
  const [level, setLevel] = useState("");
  const [selected, setSelected] = useState(null);

  const [currency, setCurrency] = useState("USD");
  const [rates, setRates] = useState({ USD: 1 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [fxErr, setFxErr] = useState("");

  // Load cost rows for this university
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(
          `${API_BASE}/api/cost/by-university?name=${encodeURIComponent(uniName)}`
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!alive) return;
        // We expect backend to return { ok, items: [...] }
        const items = Array.isArray(data.items) ? data.items : (data.item ? [data.item] : []);
        if (items.length === 0) {
          setErr("No cost data found for this university.");
          setRows([]);
        } else {
          setRows(items);
        }
      } catch (e) {
        console.error(e);
        if (alive) {
          setErr("Failed to load cost data.");
          setRows([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uniName]);

  // Load live FX rates
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchUsdRates();
        if (!alive) return;
        setRates(data || { USD: 1 });
        setFxErr("");
      } catch (e) {
        console.error(e);
        if (alive) {
          setRates({ USD: 1 });
          setFxErr("Using USD only (FX fetch failed).");
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  // unique programs for this university
  const programs = useMemo(
    () => Array.from(new Set(rows.map(r => r.Program).filter(Boolean))),
    [rows]
  );

  // unique levels for the chosen program
  const levels = useMemo(
    () => Array.from(new Set(rows.filter(r => r.Program === program).map(r => r.Level).filter(Boolean))),
    [rows, program]
  );

  const metaByCode = useMemo(() => {
    const m = {};
    for (const c of CURRENCY_META) m[c.code] = c;
    return m;
  }, []);

  const currentCurrency = metaByCode[currency] || metaByCode.USD;
  const rate = rates[currency] ?? 1;

  const selectRow = () => {
    const found = rows.find(r => r.Program === program && r.Level === level);
    setSelected(found || null);
  };

  const fmt = (n) => {
    if (typeof n !== "number" || Number.isNaN(n)) return "—";
    const v = n * (rate || 1);
    const sym = currentCurrency?.symbol || "";
    return `${sym}${Math.round(v).toLocaleString()}`;
  };

  if (!uniName) return <div className="p-6">Missing university name.</div>;
  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  const headerCity = rows[0]?.City;
  const headerCountry = rows[0]?.Country;

  return (
    <div className="min-h-screen bg-[#F2F3F7] p-6 md:p-10">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold text-[#254085]">{uniName}</h1>
          <div className="text-gray-600">{headerCity}{headerCity && headerCountry ? ", " : ""}{headerCountry}</div>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <select
            className="border p-3 rounded-lg"
            value={program}
            onChange={(e) => { setProgram(e.target.value); setLevel(""); setSelected(null); }}
          >
            <option value="">Select Program</option>
            {programs.map((p, i) => <option key={i} value={p}>{p}</option>)}
          </select>

          <select
            className="border p-3 rounded-lg"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={!program}
          >
            <option value="">Select Level</option>
            {levels.map((l, i) => <option key={i} value={l}>{l}</option>)}
          </select>

            {/* currency chooser */}
          <select
            className="border p-3 rounded-lg"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCY_META.map(c => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={selectRow}
            disabled={!program || !level}
            className="bg-[#254085] text-white rounded-lg font-semibold disabled:opacity-50 px-4"
          >
            Show Cost
          </button>
        </div>

        {!!fxErr && (
          <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3 text-sm">
            {fxErr}
          </div>
        )}

        {/* Results (vertical stack) */}
        {selected && (
          <div className="mt-8 space-y-4">
            <Stat label="Program" value={selected.Program} />
            <Stat label="Level" value={selected.Level} />
            <Stat label="Duration (years)" value={selected.Duration_Years} />
            <Stat label={`Tuition (${currency})`} value={fmt(selected.Tuition_USD)} />
            <Stat label={`Rent (${currency}/mo)`} value={fmt(selected.Rent_USD)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border rounded-lg p-4 flex justify-between">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}
