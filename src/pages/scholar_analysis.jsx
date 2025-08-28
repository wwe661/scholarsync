// src/pages/analysis.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
  Sector,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/* ---------------- Config ---------------- */
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const PALETTE = [
  "#2952CC",
  "#16A9BD",
  "#22C55E",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#0EA5E9",
  "#84CC16",
  "#A855F7",
  "#F97316",
];
const C = {
  navy: "#254085",
  slate: "#64748B",
  ink: "#334155",
  indigo: "#5D5FEF",
  green: "#22C55E",
  sky: "#0EA5E9",
  grayGrid: "#EEF2F7",
};

/* ---------------- Small UI helpers ---------------- */
function Card({ title, right, children }) {
  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex items-center justify-between px-6 pt-4 pb-3">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
          {title}
        </h2>
        {right}
      </header>
      <div className="px-6 pb-5">{children}</div>
    </section>
  );
}

const TinyTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-white/95 backdrop-blur rounded-md border border-slate-200 px-3 py-2 shadow">
      {!!label && (
        <div className="text-xs font-semibold text-slate-800 mb-0.5">
          {label}
        </div>
      )}
      <div className="text-xs text-slate-500">
        {p.name || p.dataKey}:{" "}
        <span className="font-semibold text-slate-800">{p.value}</span>
      </div>
    </div>
  );
};

/* ---------------- Data fetching + shaping ---------------- */
function useBackendAnalytics() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // backend data
  const [countries, setCountries] = useState([]); // [{label,count}]
  const [fundByLevel, setFundByLevel] = useState([]); // [{level,Full,Partial}]
  const [deadlines, setDeadlines] = useState([]); // [{year,month,count}]
  const [catCounts, setCatCounts] = useState([]); // [{label,count}]

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [cRes, fblRes, dlRes, catRes] = await Promise.all([
          fetch(`${API_BASE}/analysis/countries`),
          fetch(`${API_BASE}/analysis/funding-by-level`),
          fetch(`${API_BASE}/analysis/deadlines`),
          fetch(`${API_BASE}/analysis/categories`),
        ]);

        if (![cRes, fblRes, dlRes, catRes].every((r) => r.ok)) {
          throw new Error("One or more API calls failed");
        }

        const [c, fbl, dl, cats] = await Promise.all([
          cRes.json(),
          fblRes.json(),
          dlRes.json(),
          catRes.json(),
        ]);

        setCountries(Array.isArray(c) ? c : []);
        setFundByLevel(Array.isArray(fbl) ? fbl : []);
        setDeadlines(Array.isArray(dl) ? dl : []);
        setCatCounts(Array.isArray(cats) ? cats : []);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----- transform to chart shapes ----- */

  // Top 7 countries with pct + color
  const top7Countries = useMemo(() => {
    const total = countries.reduce((s, r) => s + (r.count || 0), 0) || 1;
    return countries
      .slice()
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 7)
      .map((r, i) => ({
        country: r.label?.toUpperCase?.() || r.label || "—",
        count: r.count || 0,
        pct: Math.round(((r.count || 0) / total) * 100),
        color: PALETTE[i % PALETTE.length],
      }));
  }, [countries]);

  // Categories donut
  const categoryDonut = useMemo(
    () =>
      (catCounts || []).map((r) => ({ name: r.label, value: r.count || 0 })),
    [catCounts]
  );
  const categoryTotal = useMemo(
    () => (catCounts || []).reduce((s, r) => s + (r.count || 0), 0),
    [catCounts]
  );

  // One pie for Bachelor / Master / PhD
  const levelPieData = useMemo(() => {
    const totals = { Bachelor: 0, Master: 0, PhD: 0 };
    (fundByLevel || []).forEach((r) => {
      const t = (r.Full || 0) + (r.Partial || 0);
      const lvl = (r.level || "").toLowerCase();
      if (lvl.includes("bachelor")) totals.Bachelor += t;
      if (lvl.includes("master")) totals.Master += t;
      if (lvl.includes("phd")) totals.PhD += t;
    });
    return [
      { name: "Bachelor", value: totals.Bachelor },
      { name: "Master", value: totals.Master },
      { name: "PhD", value: totals.PhD },
    ];
  }, [fundByLevel]);

  // ---- Build 2025 monthly series for deadlines ----
  const deadlines2025 = useMemo(() => {
    // expect each item like { year, month, count }
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // base: 12 entries (0..11)
    const base = months.map((m, i) => ({ label: m, month: i + 1, count: 0 }));

    (deadlines || [])
      .filter((d) => String(d.year) === "2025")
      .forEach((d) => {
        const idx = (Number(d.month) || 0) - 1;
        if (idx >= 0 && idx < 12) base[idx].count += Number(d.count) || 0;
      });

    return base;
  }, [deadlines]);

  // ---- Active vs expired counts for 2025 ----
  const deadlines2025Stats = useMemo(() => {
    const total = deadlines2025.reduce((s, r) => s + (r.count || 0), 0);

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1; // 1..12

    let active = 0; // not expired
    let expired = 0; // already passed

    if (nowYear < 2025) {
      active = total;
    } else if (nowYear > 2025) {
      expired = total;
    } else {
      // year == 2025: months < current are expired
      deadlines2025.forEach((r) => {
        const v = r.count || 0;
        if (r.month < nowMonth) expired += v;
        else active += v;
      });
    }

    return { active, expired, total };
  }, [deadlines2025]);

  return {
    loading,
    err,
    charts: {
      top7Countries,
      categoryDonut,
      categoryTotal,
      levelPieData,
      deadlines2025,
      deadlines2025Stats,
    },
  };
}

/* ---------------- Charts ---------------- */

// --- Countries (Top 7) ---
function TopCountriesBar({ data }) {
  // avg (for reference line label)
  const avg = Math.round(
    (data?.reduce((s, d) => s + (d.pct || 0), 0) || 0) / (data?.length || 1)
  );

  // --- inside TopCountriesBar ---
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload; // { country, count, pct, color }

    return (
      <div className="bg-white/95 backdrop-blur rounded-md border border-slate-200 px-3 py-2 shadow">
        <div className="text-xs font-semibold text-slate-800 mb-0.5">
          {d.country}
        </div>
        <div className="text-xs text-slate-500">
          Scholarships:{" "}
          <span className="font-semibold text-slate-800">
            {Number(d.count ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Percent:{" "}
          <span className="font-semibold text-slate-800">{d.pct}%</span>
        </div>
      </div>
    );
  };

  // y value for avg reference line: align by using max count * (avg% of total/rough visual cue)
  const maxCount = Math.max(...data.map((d) => d.count || 0), 0);
  const yAvg = maxCount * (avg / 100);

  return (
    <Card
      title="Top Scholarship Provider Countries"
      right={
        <span className="text-xs text-slate-400">scholarships • share %</span>
      }
    >
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barCategoryGap={28}
            barGap={6}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={C.grayGrid} />
            <XAxis
              dataKey="country"
              tick={{ fontSize: 12, fill: C.slate }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: C.slate }}
              axisLine={false}
              tickLine={false}
              tickCount={8} // more divisions
            />

            <ReferenceLine
              y={yAvg}
              stroke="#CBD5E1"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
            <Tooltip content={<Tip />} />
            <Bar dataKey="count" radius={[10, 10, 10, 10]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.color}
                  style={{ transition: "filter 180ms ease" }}
                  onMouseEnter={(e) => {
                    if (e && e.target)
                      e.target.style.filter = "brightness(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (e && e.target) e.target.style.filter = "";
                  }}
                />
              ))}
              <LabelList
                dataKey="pct"
                position="top"
                formatter={(v) => `${v}%`}
                style={{ fill: "#334155", fontWeight: 700, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* ---- Fields donut with hover detail chips ---- */
const CAT_FIELDS = {
  "Any Field": ["Any / Open to all"],
  "Business & Management": [
    "Business Mgmt",
    "Finance",
    "Accounting",
    "Marketing",
    "HR",
    "Supply Chain",
    "Entrepreneurship",
    "Economics",
    "Comm & Leadership",
    "Logistics",
    "Taxation",
    "Tourism",
    "Hotel Management",
  ],
  "Arts, Culture & Design": [
    "Arts",
    "Design",
    "Graphic Design",
    "Fashion Design",
    "Architecture",
    "Creative Writing",
    "Journalism",
    "Film",
    "Digital Media",
    "Photography",
    "Music",
    "Heritage",
  ],
  "Health & Life Sciences": [
    "Public Health",
    "Nursing",
    "Medicine",
    "Dentistry",
    "Biomedical Sci",
    "Pharmacy",
    "Biology",
    "Chemistry",
    "Physics",
    "Life/General/Natural/Earth",
    "Environmental Sci",
    "Climate Studies",
  ],
  "Humanities & Social Sciences": [
    "Humanities",
    "History",
    "Literature",
    "Cultural Studies",
    "Sociology",
    "Psychology",
    "Anthropology",
    "Philosophy",
    "Political Sci",
    "IR",
    "Law / Legal Studies",
    "Global Dev",
    "Global Affairs",
    "Dispute Resolution / ADR",
    "Sports",
  ],
  Engineering: [
    "Mechanical",
    "Civil",
    "Electrical",
    "Chemical",
    "Industrial",
    "Aerospace",
    "Energy Sci & Eng",
    "Nuclear Eng",
  ],
  "Technology & Computing": [
    "Nanotechnology",
    "Agricultural Tech",
    "Computer Sci",
    "Data Sci",
    "AI",
    "Information Security",
    "Software Eng",
    "Computing",
    "Automation",
  ],
  "Languages & Communication": [
    "Japanese",
    "English",
    "French",
    "Chinese",
    "Korean",
    "Linguistics",
  ],
};

function CategoryDonutCard({ data = [], total }) {
  const first = data.find((d) => d.name === "Any Field");
  const rest = data
    .filter((d) => d.name !== "Any Field")
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  const sorted = first ? [first, ...rest] : rest;

  const safeTotal =
    typeof total === "number" && !Number.isNaN(total)
      ? total
      : sorted.reduce((s, r) => s + (r.value || 0), 0);

  const [hoverIdx, setHoverIdx] = React.useState(null);

  const CenterLabel = () => {
    if (hoverIdx == null || !sorted[hoverIdx]) {
      return (
        <g>
          <text
            x="50%"
            y="47%"
            textAnchor="middle"
            className="fill-slate-700"
            style={{ fontWeight: 800, fontSize: 22 }}
          >
            {safeTotal}
          </text>
          <text
            x="50%"
            y="60%"
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontWeight: 600, fontSize: 12 }}
          >
            Scholarships
          </text>
        </g>
      );
    }
    const h = sorted[hoverIdx];
    const pct = safeTotal ? Math.round((h.value / safeTotal) * 100) : 0;
    return (
      <g>
        <text
          x="50%"
          y="44%"
          textAnchor="middle"
          className="fill-slate-700"
          style={{ fontWeight: 800, fontSize: 18 }}
        >
          {h.name}
        </text>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          className="fill-slate-500"
          style={{ fontWeight: 700, fontSize: 14 }}
        >
          {h.value} · {pct}%
        </text>
      </g>
    );
  };

  const arcLabel = ({ value, cx, cy, midAngle, innerRadius, outerRadius }) => {
    const pct = safeTotal ? Math.round((value / safeTotal) * 100) : 0;
    if (pct < 6) return null;
    const RAD = Math.PI / 180;
    const r = (innerRadius + outerRadius) / 2;
    const x = cx + r * Math.cos(-midAngle * RAD);
    const y = cy + r * Math.sin(-midAngle * RAD);
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-white"
        style={{ fontWeight: 800, fontSize: 11 }}
      >
        {pct}%
      </text>
    );
  };

  const CustomTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const cat = p?.name;
    const fields = CAT_FIELDS[cat] || [];
    return (
      <div className="bg-white/95 backdrop-blur rounded-md border border-slate-200 px-3 py-2 shadow">
        <div className="text-xs font-semibold text-slate-800 mb-1">{cat}</div>
        <div className="text-[11px] text-slate-500 mb-1">
          Count: <span className="font-semibold text-slate-800">{p.value}</span>
        </div>
        {fields.length > 0 && (
          <div className="max-w-[220px]">
            <div className="text-[11px] text-slate-400 mb-1">Fields:</div>
            <div className="flex flex-wrap gap-1">
              {fields.slice(0, 8).map((f, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600"
                >
                  {f}
                </span>
              ))}
              {fields.length > 8 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  +{fields.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card
      title="Scholarships by Field of Study"
      right={<span className="text-xs text-slate-500">hover for details</span>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
        {/* Chart */}
        <div className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie
                data={sorted}
                dataKey="value"
                nameKey="name"
                innerRadius={78}
                outerRadius={120}
                stroke="white"
                strokeWidth={2}
                labelLine={false}
                label={arcLabel}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {sorted.map((_, i) => (
                  <Cell
                    key={i}
                    fill={PALETTE[i % PALETTE.length]}
                    onMouseEnter={() => setHoverIdx(i)}
                    style={{
                      cursor: "pointer",
                      filter: hoverIdx === i ? "brightness(1.05)" : "none",
                    }}
                  />
                ))}
                <LabelList position="center" content={<CenterLabel />} />
              </Pie>

              {/* ✅ Always show center text (two lines) */}
              <text
                x="50%"
                y="45%"
                textAnchor="middle"
                className="fill-slate-800"
                style={{ fontWeight: 700, fontSize: 16 }}
              >
                Scholarship
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                className="fill-slate-600"
                style={{ fontWeight: 600, fontSize: 14 }}
              >
                Fields
              </text>

              <Tooltip content={<CustomTip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend chips */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sorted.map((d, i) => {
              const pct =
                safeTotal > 0 ? Math.round((d.value / safeTotal) * 100) : 0;
              const isHover = hoverIdx === i;
              return (
                <button
                  key={d.name}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 shadow-sm transition
                    ${
                      isHover
                        ? "border-indigo-200 bg-indigo-50/60"
                        : "border-slate-200 bg-white"
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    <span className="text-xs text-slate-600 truncate">
                      {d.name}
                    </span>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      {d.value}
                    </span>
                    <span className="text-[10px] rounded-full bg-slate-50 px-1.5 py-0.5 text-slate-500 border border-slate-200">
                      {pct}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- One PIE (Bachelor / Master / PhD) with pop-out active slice ---------- */
function FundingLevelPie3D({ data = [] }) {
  const COLORS = ["#5D5FEF", "#0EA5E9", "#22C55E"]; // indigo / sky / green

  const total = (data || []).reduce((s, d) => s + (d.value || 0), 0);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);

  const [activeIndex, setActiveIndex] = React.useState(null);

  const renderActive = ({
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
  }) => (
    <g filter="url(#softShadow)">
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 16}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.28}
      />
    </g>
  );

  return (
    <Card
      title="Funding by Study Level"
      right={
        <span className="text-xs text-slate-500">Bachelor • Master • PhD</span>
      }
    >
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.18" />
          </filter>
        </defs>
      </svg>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
        {/* Pie */}
        <div className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="42%"
                cy="52%"
                innerRadius={0}
                outerRadius={122}
                padAngle={3}
                cornerRadius={8}
                stroke="#fff"
                strokeWidth={2}
                activeIndex={activeIndex ?? -1}
                activeShape={renderActive}
                onMouseEnter={(_, i) => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                isAnimationActive
                animationDuration={650}
                animationEasing="ease-out"
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={COLORS[i % COLORS.length]}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Pie>

              {/* Center text only when hovering */}
              {Number.isInteger(activeIndex) &&
                activeIndex >= 0 &&
                data[activeIndex] && (
                  <>
                    <text
                      x="42%"
                      y="46%"
                      textAnchor="middle"
                      className="fill-slate-800"
                      style={{ fontWeight: 800, fontSize: 18 }}
                    >
                      {data[activeIndex].name}
                    </text>
                    <text
                      x="42%"
                      y="62%"
                      textAnchor="middle"
                      className="fill-slate-600"
                      style={{ fontWeight: 700, fontSize: 14 }}
                    >
                      {data[activeIndex].value ?? 0} ·{" "}
                      {pct(data[activeIndex].value || 0)}%
                    </text>
                  </>
                )}
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend chips */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-2">
            {data.map((d, i) => {
              const isActive = activeIndex === i;
              return (
                <button
                  key={d.name}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(i)}
                  onBlur={() => setActiveIndex(null)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 shadow-sm transition
                    ${
                      isActive
                        ? "border-indigo-200 bg-indigo-50/70 ring-1 ring-indigo-100"
                        : "border-slate-200 bg-white"
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-xs text-slate-600 truncate">
                      {d.name}
                    </span>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      {d.value}
                    </span>
                    <span className="text-[10px] rounded-full bg-slate-50 px-1.5 py-0.5 text-slate-500 border border-slate-200">
                      {pct(d.value)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- Deadlines 2025: expired vs not-expired (two-color area/line) ---------- */
function Deadlines2025Card({ data, stats }) {
  const stroke = "#5D5FEF"; // indigo
  return (
    <Card
      title="2025 Deadline Timeline"
      right={
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            Not expired: <b>{stats.active}</b>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
            Expired: <b>{stats.expired}</b>
          </span>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={data}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="deadlines25" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#E5E7EB" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#64748B", fontSize: 12 }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={{ stroke: "#E5E7EB" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#64748B", fontSize: 12 }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={{ stroke: "#E5E7EB" }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const v = payload[0].value;
              return (
                <div className="bg-white/95 backdrop-blur rounded-md border border-slate-200 px-3 py-2 shadow">
                  <div className="text-xs font-semibold text-slate-800">
                    {label} 2025
                  </div>
                  <div className="text-xs text-slate-500">
                    Deadlines:{" "}
                    <span className="font-semibold text-slate-800">{v}</span>
                  </div>
                </div>
              );
            }}
          />
          {/* Removed the ReferenceLine for average */}
          <Area
            type="monotone"
            dataKey="count"
            stroke={stroke}
            strokeWidth={3}
            fill="url(#deadlines25)"
            dot={{ r: 3 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

/* ---------------- Page ---------------- */
export default function Analysis() {
  const { loading, err, charts } = useBackendAnalytics();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading analysis…
      </div>
    );
  if (err)
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        Failed to load analysis: {err}
      </div>
    );

  const {
    top7Countries,
    levelPieData,
    categoryDonut,
    categoryTotal,
    deadlines2025,
    deadlines2025Stats,
  } = charts;

  return (
    <div className="w-full min-h-screen bg-[#f8fafc]">
      {/* PAGE TITLE */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-black">Scholarship Analysis</h1>
      </div>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <TopCountriesBar data={top7Countries} />
        <FundingLevelPie3D data={levelPieData} />
        <CategoryDonutCard data={categoryDonut} total={categoryTotal} />
        <Deadlines2025Card data={deadlines2025} stats={deadlines2025Stats} />
      </main>
    </div>
  );
}
