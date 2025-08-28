import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
  PieChart,
  Pie,
} from "recharts";

// ✅ Subject colors shared by all charts
const SUBJECT_COLORS = {
  "Computer Science": "#ef4444",
  "Data Science": "#3b82f6",
  Economics: "#10b981",
  "Artificial Intelligence": "#f59e0b",
  Robotics: "#8b5cf6",
  "Software Engineering": "#06b6d4",
  Business: "#84cc16",
  Medicine: "#9333ea",
  Law: "#eab308",
  Other: "#9ca3af",
};

// Build the URL once. In dev, the Vite proxy will forward /uni-analysis/* to FastAPI.
// If you prefer an absolute URL, set VITE_API_BASE=http://127.0.0.1:8000 in .env and we'll use it.
const API_BASE = (import.meta.env.VITE_API_BASE || "")
  .trim()
  .replace(/\/+$/, "");
const COUNTRIES_API = `${API_BASE}/uni-analysis/countries`;

// add this for the tuition chart
const EXP_TUITION_API = `${API_BASE}/uni-analysis/expensive-tuition`;

export default function UniAnalysis() {
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch(COUNTRIES_API, { signal: ctrl.signal });

        // Helpful: capture non-2xx details to display
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `HTTP ${res.status} ${res.statusText} — ${text.slice(0, 160)}`
          );
        }

        const json = await res.json();

        // Ensure we have an array
        const arr = Array.isArray(json) ? json : [];
        // Clean, sort, top 7
        const clean = arr
          .filter((r) => r && typeof r.count === "number" && r.label)
          .sort((a, b) => b.count - a.count)
          .slice(0, 7);

        setRows(clean);
        setError("");
      } catch (e) {
        if (e.name === "AbortError") return; // unmounted
        console.error("uni-analysis fetch failed:", e);
        setError(
          typeof e?.message === "string"
            ? e.message
            : "Couldn’t load data. Please try again."
        );
        setRows([]); // switch to "empty" (not loading)
      }
    })();

    return () => ctrl.abort();
  }, []);

  const total = useMemo(
    () => (rows?.length ? rows.reduce((s, r) => s + (r.count || 0), 0) : 0),
    [rows]
  );

  const data = useMemo(() => {
    if (!rows?.length) return [];
    return rows.map((r) => ({
      ...r,
      share: total ? Math.round((r.count / total) * 100) : 0,
    }));
  }, [rows, total]);

  const max = useMemo(
    () => (data.length ? Math.max(...data.map((d) => d.count)) : 0),
    [data]
  );

  // Height ≈ 72px per row (+ padding)
  const chartHeight = 60 * Math.max(1, data.length) + 20;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 bg-[#f8fafc]">
      {/* PAGE TITLE */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-black">University Analysis</h1>
      </div>

      {/* ↓ smaller vertical padding */}
      <div className="mx-auto max-w-6xl">
        {/* CARD (smaller radius & shadow to match your scholarship card) */}
        <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          {/* HEADER */}
          <div className="px-6 py-3 text-left">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
              Top 7 Countries by University Count
            </h2>
          </div>

          {/* BODY */}
          <div className="p-4">
            {/* Loading skeleton */}
            {rows === null && (
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-36 h-3 rounded bg-slate-200 animate-pulse" />
                    <div className="flex-1 h-4 rounded bg-slate-200 animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Error / empty */}
            {rows && rows.length === 0 && (
              <div className="text-center py-10">
                <p className="text-sm text-red-500">
                  {error || "No data found."}
                </p>
              </div>
            )}

            {/* Chart */}
            {data.length > 0 && (
              <div style={{ height: chartHeight }}>
                <ResponsiveContainer>
                  <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }} // tighter
                  >
                    <defs>
                      <linearGradient id="barFill" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#93c5fd" />
                        <stop offset="100%" stopColor="#60a5fa" />
                      </linearGradient>
                      <linearGradient
                        id="barActive"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>

                    <CartesianGrid horizontal stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      domain={[0, Math.max(10, Math.ceil(max / 10) * 10)]}
                      tick={{ fill: "#94a3b8", fontSize: 13 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={160}
                      tick={{ fill: "#0f172a", fontSize: 13, fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      cursor={{ fill: "rgba(59,130,246,0.06)" }}
                      labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                      formatter={(value, name, item) => {
                        if (name === "count" && item?.payload) {
                          const { label, share } = item.payload;
                          return [`${value} universities (${share}%)`, label];
                        }
                        return [value, name];
                      }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 13,
                        boxShadow: "0 6px 20px rgba(2,8,23,0.06)",
                      }}
                    />

                    <Bar
                      dataKey="count"
                      radius={[8, 8, 8, 8]}
                      maxBarSize={28} // slightly thicker
                    >
                      {data.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            [
                              "#2563eb", // blue
                              "#06b6d4", // teal
                              "#22c55e", // green
                              "#f59e0b", // amber
                              "#a855f7", // violet
                              "#ec4899", // pink
                              "#0ea5e9", // sky
                              "#ef4444", // red
                              "#9333ea", // purple
                              "#14b8a6", // cyan
                            ][index % 10]
                          } // cycle colors
                        />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        className="fill-slate-700"
                        fontSize={12}
                        fontWeight={600}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* OTHER CARDS */}
        <div className="mt-6">
          <ExpensiveTuitionChart limit={10} />
          <RankVsTuitionScatter maxRank={120} />
          <TopSubjectsDonut limit={10} />
        </div>
      </div>
    </div>
  );
}

// ---- small helpers

function moneyFmt(v) {
  if (v == null || Number.isNaN(+v)) return "-";
  const n = +v;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
}

function ExpensiveTuitionChart({ limit = 10, level, country }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const qs = new URLSearchParams({ limit: String(limit) });
        if (level) qs.set("level", level);
        if (country) qs.set("country", country);
        const res = await fetch(`${EXP_TUITION_API}?${qs.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(Array.isArray(json) ? json : []);
        setError("");
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error(e);
          setRows([]);
          setError("Couldn’t load tuition entries.");
        }
      }
    })();
    return () => ctrl.abort();
  }, [limit, level, country]);

  const data = useMemo(() => {
    if (!rows?.length) return [];
    return rows.map((d, i) => ({
      ...d,
      xLabel: `${d.university} (${d.subject || d.program || "—"})`,
      color: SUBJECT_COLORS[d.subject || d.program] || "#9ca3af",
      idx: i,
    }));
  }, [rows]);

  const subjectOrder = useMemo(() => {
    const seen = new Set();
    const ordered = [];
    for (const d of data) {
      const s = d.subject || d.program || "—";
      if (!seen.has(s)) {
        seen.add(s);
        ordered.push(s);
      }
    }
    return ordered;
  }, [data]);

  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 mt-6">
      <div className="px-6 py-4 text-left">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
          Highest Tuition Entries —{" "}
          <span className="font-normal">University × Subject</span>
        </h2>

        <div className="flex flex-wrap gap-3 mt-3">
          {subjectOrder.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SUBJECT_COLORS[s] || "#9ca3af" }}
              />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 pb-5">
        {rows === null && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-red-500">
              {error || "No tuition entries."}
            </p>
          </div>
        )}

        {data.length > 0 && (
          <div style={{ height: 380 }}>
            <ResponsiveContainer>
              <BarChart
                data={data}
                margin={{ top: 10, right: 50, bottom: 70, left: 50 }}
              >
                <CartesianGrid stroke="#f1f5f9" />
                <XAxis
                  dataKey="xLabel"
                  tick={{ fill: "#0f172a", fontSize: 13, fontWeight: 600 }}
                  interval={0}
                  angle={-40}
                  height={120}
                  textAnchor="end"
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(2,6,23,0.04)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload || {};
                    const uniLine = p.country
                      ? `${p.university} (${p.country})`
                      : p.university;
                    const level = p.level || ""; // "Master" / "Bachelor" / etc.
                    const rank = p.rank != null ? `#${p.rank}` : "N/A";

                    return (
                      <div
                        style={{
                          background: "#fff",
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: "12px 14px",
                          minWidth: 260,
                          boxShadow: "0 10px 26px rgba(2,8,23,0.08)",
                        }}
                      >
                        {/* 1) Subject — Level */}
                        <div
                          style={{
                            color: "#0f172a",
                            fontWeight: 700,
                            fontSize: 15,
                            marginBottom: 4,
                          }}
                        >
                          {p.subject || p.program}{" "}
                          {level && (
                            <span>
                              — <em>{level}</em>
                            </span>
                          )}
                        </div>

                        {/* 2) University (Country) */}
                        <div
                          style={{
                            color: "#475569",
                            fontSize: 13,
                            marginBottom: 8,
                          }}
                        >
                          {uniLine}
                        </div>

                        {/* 3) Rank & Tuition */}
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              background: "#eef2ff",
                              color: "#4338ca",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Rank {rank}
                          </span>
                          <span
                            style={{
                              background: "#f1f5f9",
                              color: "#0f172a",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            Tuition {moneyFmt(p.tuition)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />

                <Bar dataKey="tuition" radius={[8, 8, 0, 0]}>
                  {data.map((d) => (
                    <Cell key={d.idx} fill={d.color} />
                  ))}
                  <LabelList
                    dataKey="tuition"
                    position="top"
                    formatter={(v) => `$${Math.round(v / 100) / 10}k`}
                    className="fill-slate-700"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Rank vs Tuition Scatter ---------- */

// API: /uni-analysis/rank-vs-tuition (the array you showed)
//   [{ rank, tuition, university, country, level }, ...]
const RANK_TUITION_API = `${API_BASE}/uni-analysis/rank-vs-tuition`;

const COLORS = { Bachelor: "#60a5fa", Master: "#34d399" }; // blue / green

const BANDS = [
  { id: "Top 10", min: 1, max: 10 },
  { id: "11–30", min: 11, max: 30 },
  { id: "31–60", min: 31, max: 60 },
  { id: "61–100", min: 61, max: 100 },
  { id: "101+", min: 101, max: Infinity },
];

function bandOfRank(r) {
  for (const b of BANDS) if (r >= b.min && r <= b.max) return b.id;
  return "101+";
}

function moneyK(n) {
  return `$${Math.round(n / 100) / 10}k`;
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 10px 24px rgba(2,6,23,.08)",
        minWidth: 240,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: "#0f172a",
          marginBottom: 2,
          fontSize: 14,
        }}
      >
        {p.university || p._firstUni || "University"}
      </div>
      <div style={{ color: "#475569", fontSize: 13, marginBottom: 8 }}>
        {p.level || p._level} · {p.country || p._country || ""}
      </div>
      <div style={{ fontSize: 13 }}>
        Rank <strong>#{p.rank ?? p._avgRank}</strong> · Tuition{" "}
        <strong>{moneyK(p.tuition ?? p._avgTuition)}</strong>
      </div>
    </div>
  );
}

function RankVsTuitionScatter({ maxRank = 120 }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [showDots, setShowDots] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const qs = new URLSearchParams({ maxRank: String(maxRank) });
        const res = await fetch(`${RANK_TUITION_API}?${qs}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(Array.isArray(json) ? json : []);
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error(e);
          setRows([]);
          setError("Couldn’t load rank vs tuition.");
        }
      }
    })();
    return () => ctrl.abort();
  }, [maxRank]);

  // banded averages + sample rows
  const banded = useMemo(() => {
    const acc = {}; // band -> level -> { sum, n, rows: [] }

    for (const r of rows || []) {
      if (!r?.rank || !r?.tuition) continue;
      const b = bandOfRank(r.rank);
      const lev = r.level || "Unknown";
      acc[b] ??= {};
      acc[b][lev] ??= { sum: 0, n: 0, rows: [] };
      acc[b][lev].sum += r.tuition;
      acc[b][lev].n += 1;
      acc[b][lev].rows.push(r);
    }

    return BANDS.map((b) => {
      const obj = { band: b.id };
      for (const lev of Object.keys(acc[b.id] || {})) {
        const { sum, n, rows } = acc[b.id][lev];
        const avgTuition = sum / Math.max(1, n);
        obj[lev] = avgTuition;

        let sample = rows[0];
        let bestDiff = Math.abs((rows[0]?.tuition ?? 0) - avgTuition);
        for (const rr of rows) {
          const d = Math.abs(rr.tuition - avgTuition);
          if (d < bestDiff) {
            sample = rr;
            bestDiff = d;
          }
        }

        obj[`_${lev}_sampleUni`] = sample?.university;
        obj[`_${lev}_sampleCountry`] = sample?.country;
        obj[`_${lev}_sampleRank`] = sample?.rank;
        obj[`_${lev}_sampleTuition`] = sample?.tuition;
      }
      return obj;
    });
  }, [rows]);

  // Raw dots (optional)
  const dots = useMemo(() => {
    if (!rows?.length) return [];
    return rows.map((r) => ({ ...r, x: r.rank, y: r.tuition }));
  }, [rows]);

  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 mt-6">
      <div className="px-6 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
              How Tuition Changes with University Rank
            </h2>
            <p className="text-sm text-slate-500">
              Each group shows the average tuition of universities in that rank
              band.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={showDots}
              onChange={(e) => setShowDots(e.target.checked)}
            />
            Show raw points
          </label>
        </div>
      </div>

      <div className="px-4 pb-5">
        {rows === null && (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-red-500">{error || "No data."}</p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <>
            {/* Grouped bars (default view) */}
            {!showDots && (
              <div style={{ height: 360 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={banded}
                    margin={{ top: 10, right: 24, bottom: 20, left: 8 }}
                  >
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis
                      dataKey="band"
                      tick={{ fill: "#0f172a", fontSize: 13, fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;

                        return (
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #e2e8f0",
                              borderRadius: 12,
                              padding: "12px 14px",
                              boxShadow: "0 10px 24px rgba(2,6,23,.08)",
                              fontSize: 13,
                            }}
                          >
                            {payload.map((pl) => {
                              const lev = pl.dataKey; // "Bachelor" or "Master"
                              const uni = pl.payload[`_${lev}_sampleUni`];
                              const country =
                                pl.payload[`_${lev}_sampleCountry`];
                              const rank = pl.payload[`_${lev}_sampleRank`];
                              const tuit = pl.payload[`_${lev}_sampleTuition`];

                              return (
                                <div key={lev} style={{ marginBottom: 10 }}>
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      color: "#0f172a",
                                      fontSize: 14,
                                    }}
                                  >
                                    {uni || "Sample university"}
                                  </div>
                                  <div
                                    style={{
                                      color: "#475569",
                                      fontSize: 13,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {lev} · {country || ""}
                                  </div>
                                  <div style={{ fontSize: 13 }}>
                                    Band <strong>{label}</strong> · Rank{" "}
                                    <strong>#{rank ?? "—"}</strong> · Tuition{" "}
                                    <strong>{moneyK(tuit ?? 0)}</strong>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />

                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ paddingBottom: 8 }}
                      payload={[
                        {
                          value: "Bachelor",
                          type: "square",
                          color: COLORS.Bachelor,
                        },
                        {
                          value: "Master",
                          type: "square",
                          color: COLORS.Master,
                        },
                      ]}
                    />
                    <Bar
                      dataKey="Bachelor"
                      fill={COLORS.Bachelor}
                      radius={[8, 8, 0, 0]}
                    >
                      <LabelList
                        dataKey="Bachelor"
                        position="top"
                        formatter={(v) => (v ? moneyK(v) : "")}
                        className="fill-slate-700"
                        fontSize={12}
                      />
                    </Bar>
                    <Bar
                      dataKey="Master"
                      fill={COLORS.Master}
                      radius={[8, 8, 0, 0]}
                    >
                      <LabelList
                        dataKey="Master"
                        position="top"
                        formatter={(v) => (v ? moneyK(v) : "")}
                        className="fill-slate-700"
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Optional scatter (raw points) */}
            {showDots && (
              <div style={{ height: 360 }}>
                <ResponsiveContainer>
                  <ScatterChart
                    margin={{ top: 10, right: 24, bottom: 40, left: 8 }}
                  >
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Rank"
                      reversed
                      tick={{ fill: "#0f172a", fontSize: 13, fontWeight: 600 }}
                      domain={[1, maxRank]}
                      label={{
                        value: "Global Rank (left = better)",
                        position: "bottom",
                        offset: 0,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Tuition"
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                    />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={<Tip />} />
                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ paddingBottom: 8 }}
                    />
                    <Scatter
                      name="Bachelor"
                      data={dots.filter((d) => d.level === "Bachelor")}
                      fill={COLORS.Bachelor}
                    />
                    <Scatter
                      name="Master"
                      data={dots.filter((d) => d.level === "Master")}
                      fill={COLORS.Master}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function TopSubjectsDonut({ limit = 10 }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1); // hover/keyboard focus
  const [pinned, setPinned] = useState(-1); // click to pin
  const [showPct, setShowPct] = useState(true); // % vs count
  const [sortMode, setSortMode] = useState("pct"); // "pct" | "alpha"

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/uni-analysis/top-subjects?n=${limit}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error(e);
        setRows([]);
        setError("Couldn’t load subjects.");
      }
    })();
  }, [limit]);

  const total = useMemo(
    () =>
      Array.isArray(rows) ? rows.reduce((s, r) => s + (r.count || 0), 0) : 0,
    [rows]
  );

  const base = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    return rows.map((r, i) => ({
      ...r,
      color:
        SUBJECT_COLORS[r.subject] ||
        [
          "#3b82f6",
          "#10b981",
          "#f59e0b",
          "#ef4444",
          "#8b5cf6",
          "#06b6d4",
          "#84cc16",
          "#9333ea",
          "#eab308",
          "#9ca3af",
        ][i % 10],
      share: total ? Math.round((r.count / total) * 100) : 0,
      idx: i,
    }));
  }, [rows, total]);

  const data = useMemo(() => {
    const arr = [...base];
    if (sortMode === "pct") arr.sort((a, b) => b.share - a.share);
    else arr.sort((a, b) => a.subject.localeCompare(b.subject));
    return arr;
  }, [base, sortMode]);

  const displayIdx =
    pinned >= 0 ? pinned : active >= 0 ? active : data[0]?.idx ?? -1;
  const display = base.find((d) => d.idx === displayIdx) || base[0];

  // keyboard support on legend
  const onKey = (e, i) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActive(base[(i + 1) % base.length]?.idx ?? -1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(base[(i - 1 + base.length) % base.length]?.idx ?? -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPinned(pinned === i ? -1 : i);
    }
  };

  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
          Top {limit} Subjects — University Presence
        </h2>

        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
            <span className="text-slate-500">Sort</span>
            <button
              className={`px-2 py-0.5 rounded ${
                sortMode === "pct"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700"
              }`}
              onClick={() => setSortMode("pct")}
            >
              by %
            </button>
            <button
              className={`px-2 py-0.5 rounded ${
                sortMode === "alpha"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700"
              }`}
              onClick={() => setSortMode("alpha")}
            >
              A–Z
            </button>
          </div>

          <div className="flex items-center gap-2 border rounded-lg px-2 py-1">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={showPct}
                onChange={(e) => setShowPct(e.target.checked)}
              />
              Show %
            </label>
          </div>

          <span className="text-slate-500">hover for details</span>
        </div>
      </div>

      {/* states */}
      {rows === null && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="mt-4 text-sm text-red-500">{error || "No data."}</p>
      )}

      {data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Donut */}
          <div className="relative" style={{ height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={base} // keep original order so color ↔ legend stays stable
                  dataKey="count"
                  nameKey="subject"
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={2}
                  labelLine={false}
                  onMouseLeave={() => setActive(-1)}
                >
                  {base.map((d) => (
                    <Cell
                      key={d.subject}
                      fill={d.color}
                      stroke="#fff"
                      strokeWidth={display?.idx === d.idx ? 3 : 2}
                      onMouseEnter={() => setActive(d.idx)}
                      onClick={() => setPinned(pinned === d.idx ? -1 : d.idx)}
                      style={{ cursor: "pointer", transition: "all .15s ease" }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* center card */}
            {!!display && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-sm text-slate-500">Top subject</div>
                  <div className="text-xs sm:text-sm font-medium text-slate-900 max-w-[200px] mx-auto">
                    {display.subject}
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-semibold text-slate-700">
                    {showPct
                      ? `${display.share}% of total`
                      : `${display.count.toLocaleString()} universities`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Legend list (interactive) */}
          <div className="grid sm:grid-cols-2 gap-3 content-start">
            {data.map((d, i) => {
              const isActive =
                pinned >= 0 ? pinned === d.idx : active === d.idx;
              return (
                <button
                  key={d.subject}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-slate-300 transition
                    ${
                      isActive
                        ? "ring-2 ring-slate-400 border-slate-400"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  onMouseEnter={() => setActive(d.idx)}
                  onMouseLeave={() => setActive(-1)}
                  onClick={() => setPinned(pinned === d.idx ? -1 : d.idx)}
                  onKeyDown={(e) => onKey(e, i)}
                  aria-pressed={pinned === d.idx}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: d.color }}
                    />
                    <span className="truncate">{d.subject}</span>
                  </span>

                  {/* number + mini progress */}
                  <span className="flex flex-col items-end gap-1 w-24 shrink-0">
                    <span className="text-sm text-slate-700">
                      {showPct ? `${d.share}%` : d.count.toLocaleString()}
                    </span>
                    <span className="h-1 w-full bg-slate-200 rounded overflow-hidden">
                      <span
                        className="h-full block"
                        style={{
                          width: `${d.share}%`,
                          background: d.color,
                          opacity: 0.9,
                        }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-center mt-4 text-sm text-slate-600">
        Total Universities: {total.toLocaleString()}
      </div>
    </section>
  );
}
