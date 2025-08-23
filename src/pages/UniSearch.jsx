import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSearch } from "react-icons/fa";
// at top
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const UniSearch = () => {
  // query & results
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const limit = 3;
  const [total, setTotal] = useState(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total]);

  // rank filter
  const [rankMin, setRankMin] = useState(1);
  const [rankMax, setRankMax] = useState(2000);
  const sliderVal = useMemo(
    () => Math.min(Math.max(rankMin, 1), 2000),
    [rankMin]
  );

  // subjects filter (chips)
  const [subjectIds, setSubjectIds] = useState([]);   // ["1","2",...]
  const [subjectOpts, setSubjectOpts] = useState([]); // [{id,name}]
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsErr, setSubjectsErr] = useState("");

  // ---- suggestions state/refs ----
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const sugTimer = useRef(null);
  const inputRef = useRef(null);

  // load subjects once
  useEffect(() => {
    let alive = true;
    (async () => {
      setSubjectsLoading(true);
      setSubjectsErr("");
      try {
        const r = await fetch(`${API_BASE}/api/unisubjects`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { items = [] } = await r.json();
        const normalized = items
          .map((x) => ({
            id: String(x.id ?? x._id ?? ""),
            name: String(x.subjectname ?? x.subject ?? "").trim(),
          }))
          .filter((s) => s.id && s.name);
        if (alive) setSubjectOpts(normalized);
      } catch (e) {
        console.error(e);
        if (alive) setSubjectsErr("Failed to load subjects.");
      } finally {
        if (alive) setSubjectsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // core fetch
  const fetchData = async (
    pageNum = 1,
    overrides = {}
  ) => {
    setLoading(true);
    setErr("");
    try {
      // use overrides if given (so toggle uses the next filters immediately)
      const qNext = overrides.q ?? q;
      const rankMinNext = overrides.rankMin ?? rankMin;
      const rankMaxNext = overrides.rankMax ?? rankMax;
      const subjectIdsNext = overrides.subjectIds ?? subjectIds;

      const params = new URLSearchParams();
      if (qNext.trim()) params.append("q", qNext.trim());
      params.append("page", String(pageNum));
      params.append("limit", String(limit));
      params.append("rank_min", String(rankMinNext));
      params.append("rank_max", String(rankMaxNext));
      subjectIdsNext.forEach((id) => params.append("subject", id));

      const res = await fetch(`${API_BASE}/api/universities/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setPage(typeof data.page === "number" ? data.page : pageNum);
    } catch (e) {
      console.error(e);
      setItems([]);
      setTotal(0);
      setErr("Couldn’t load universities. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // subject toggle (refetch using the NEXT list)
  const toggleSubject = (id) => {
    setSubjectIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      fetchData(1, { subjectIds: next });
      return next;
    });
  };

  // ---- suggestions: fetcher + handlers ----
  const fetchSuggestions = async (term) => {
    const t = (term || "").trim();
    if (!t) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.append("q", t);
      params.append("page", "1");
      params.append("limit", "5");

      // you can optionally include current filters:
      // params.append("rank_min", String(rankMin));
      // params.append("rank_max", String(rankMax));
      // subjectIds.forEach((id) => params.append("subject", id));

      const res = await fetch(`${API_BASE}/api/universities/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data.items) ? data.items : [];

      // collect strings to suggest
      const bag = new Set();
      list.forEach((u) => {
        const arr = [
          u.name,
          u.country,
          ...(Array.isArray(u.subjects) ? u.subjects : []),
        ];
        arr.forEach((v) => {
          const s = (v || "").toString().trim();
          if (s && s.toLowerCase().includes(t.toLowerCase())) bag.add(s);
        });
      });

      const sorted = Array.from(bag).sort((a, b) => a.length - b.length).slice(0, 8);
      setSuggestions(sorted);
      setShowSug(sorted.length > 0);
    } catch (e) {
      console.error("suggestions failed:", e);
      setSuggestions([]);
      setShowSug(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQ(val);
    if (sugTimer.current) clearTimeout(sugTimer.current);
    sugTimer.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handlePickSuggestion = (s) => {
    setQ(s);
    setShowSug(false);
    setSuggestions([]);
    fetchData(1, { q: s });
    inputRef.current?.blur();
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!inputRef.current) return;
      if (e.target === inputRef.current) return;
      setShowSug(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <div className="bg-[#F2F3F7] shadow-inner p-4 md:p-7 w-full mt-0 relative" id="searchContent">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Search Universities</h1>

      <div className="w-full flex flex-col md:flex-row gap-8 items-start mt-0 align-top">
        {/* Left Section */}
        <div className="w-full md:w-3/4">
          {/* Search Bar + Suggestions */}
          <div className="relative">
            <div className="flex items-center bg-white rounded-xl shadow p-3 mb-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Type preferred country, subject, or university"
                className="flex-grow px-4 py-2 text-sm rounded-l-xl focus:outline-none"
                value={q}
                onChange={handleChange}
                onFocus={() => q.trim() && suggestions.length > 0 && setShowSug(true)}
                onKeyDown={(e) => e.key === "Enter" && (setShowSug(false), fetchData(1))}
              />
              {q && (
                <button
                  onClick={() => {
                    setQ("");
                    setSuggestions([]);
                    setShowSug(false);
                    fetchData(1, { q: "" });
                  }}
                  className="mr-2 text-xs px-2 py-1 border rounded"
                  title="Clear"
                >
                  Clear
                </button>
              )}
              <button
                className="bg-[#254085] text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center gap-2"
                onClick={() => { setShowSug(false); fetchData(1); }}
              >
                <FaSearch /> Search
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSug && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    onClick={() => handlePickSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* “Current query” pill */}
          {q.trim() && (
            <div className="mb-4 flex items-center gap-2">
              <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm">
                Searching for: <span className="font-semibold">{q}</span>
              </span>
              <button
                onClick={() => { setQ(""); fetchData(1, { q: "" }); }}
                className="text-xs text-gray-600 hover:text-red-600"
                title="Clear search"
              >
                ✕
              </button>
            </div>
          )}

          {/* Results */}
          {loading && <div className="text-gray-600 mb-4">Loading…</div>}
          {!loading && err && <div className="text-red-600 mb-4">{err}</div>}
          {!loading && !err && items.length === 0 && (
            <div className="text-gray-600 mb-4">No universities found.</div>
          )}

      {items.map((u, index) => (
  <div
    key={u.id || index}
    className="
      rounded-2xl bg-gradient-to-br from-[#254085] to-[#1b2f60]
      text-white shadow-xl p-6 mb-6
      hover:shadow-2xl hover:scale-[1.01] transition-all
    "
  >
    {/* Header */}
    <div className="flex items-start justify-between mb-5">
      <div className="w-1/5 flex justify-center">
        <img
          src={u.image || "logo.png"}
          alt={u.name || "University"}
          className="w-20 h-20 object-cover rounded bg-white/90"
        />
      </div>

      <div className="w-4/5">
      <div className="flex justify-between items-center mb-2">
  <h3 className="font-semibold text-lg leading-tight">
    {u.name || "University name"}
  </h3>

  <div className="flex gap-2">
    <a
      href={u.url || "#"}
      target="_blank"
      rel="noreferrer"
      className="bg-white text-[#254085] px-4 py-2 text-sm font-semibold rounded-lg shadow hover:bg-gray-100 transition"
    >
      See Detail
    </a>

  
{u.hasCost ? (
<a
  href={`/cost-prediction?university=${encodeURIComponent(u.name)}`}
  className="bg-emerald-500 text-white px-3 py-2 text-sm font-semibold rounded-lg shadow hover:opacity-90 transition"
>
  Cost prediction
</a>


) : (
  <span className="px-3 py-2 text-xs rounded-lg bg-white/20 border border-white/30 text-white/80">
    No cost data
  </span>
)}

  </div>
</div>

        <p className="text-sm text-white/90 mb-3 text-left">
          <span className="font-semibold">{u.name || "This university"}</span>{" "}
          is ranked <span className="font-semibold">#{u.rank ?? "-"}</span> in the world, with{" "}
          <span className="font-semibold">
            {u.students?.toLocaleString?.() ?? u.students ?? "-"} students
          </span>{" "}
          and an <span className="font-semibold">{u.international || "-"}</span> international student rate.
        </p>

        <p className="text-sm text-white/90 text-left">
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
            {u.country || "Country / Provider"}
          </span>
        </p>



        {/* (Optional) tiny badge instead of a link:
        {u.hasCost && <span className="ml-2 text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded">Cost data available</span>}
        */}
      </div>
    </div>
  </div>
))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <button
                disabled={page === 1}
                onClick={() => fetchData(page - 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => fetchData(page + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Right Filter Sidebar */}
        <div className="mt-5 bg-white rounded-xl shadow p-6 w-full md:w-1/4 h-full">
          <div className="bg-[#254085] text-white text-sm font-bold px-3 py-2 mb-4">
            Filter
          </div>

          {/* Rank Range (modern card) */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <img src="rank.png" alt="Rank Icon" className="w-10 h-10" />
              <h3 className="text-lg font-semibold text-[#254085]">Rank Range</h3>
            </div>

            <div className="space-y-3">
              <input
                type="range"
                min="1"
                max="2000"
                step="1"
                className="w-full accent-[#254085]"
                value={sliderVal}
                onChange={(e) => setRankMin(Number(e.target.value))}
                onMouseUp={() => fetchData(1)}
                onTouchEnd={() => fetchData(1)}
              />

              <div className="flex justify-between gap-4">
                <div className="flex flex-col flex-1">
                  <label className="text-xs text-gray-500 mb-1">Min</label>
                  <input
                    type="number"
                    min="1"
                    max="2000"
                    value={rankMin}
                    onChange={(e) => setRankMin(Number(e.target.value))}
                    onBlur={() => {
                      if (rankMin < 1) setRankMin(1);
                      if (rankMin > rankMax) setRankMin(rankMax);
                      fetchData(1);
                    }}
                    className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#254085]"
                  />
                </div>
                <div className="flex flex-col flex-1">
                  <label className="text-xs text-gray-500 mb-1">Max</label>
                  <input
                    type="number"
                    min="1"
                    max="2000"
                    value={rankMax}
                    onChange={(e) => setRankMax(Number(e.target.value))}
                    onBlur={() => {
                      if (rankMax > 2000) setRankMax(2000);
                      if (rankMax < rankMin) setRankMax(rankMin);
                      fetchData(1);
                    }}
                    className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#254085]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Subjects (chips) */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <img src="subject.png" alt="Subject Icon" className="w-10 h-10" />
              <p className="text-base font-semibold text-[#254085]">Subjects</p>
            </div>

            {subjectsLoading && (
              <div className="text-sm text-gray-600 mb-2">Loading subjects…</div>
            )}
            {!subjectsLoading && subjectsErr && (
              <div className="text-sm text-red-600 mb-2">{subjectsErr}</div>
            )}

            <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
              {subjectOpts.map((opt) => {
                const active = subjectIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleSubject(opt.id)}
                    className={`flex items-center justify-between border rounded-full px-3 py-1.5 text-xs transition ${
                      active
                        ? "bg-purple-100 text-purple-700 border-purple-300"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                    title={opt.name}
                  >
                    <span className="truncate">{opt.name}</span>
                    {active && <span className="ml-2 text-purple-600">✓</span>}
                  </button>
                );
              })}
            </div>

            {subjectIds.length > 0 && (
              <button
                onClick={() => {
                  setSubjectIds([]);
                  fetchData(1, { subjectIds: [] });
                }}
                className="mt-3 text-xs underline text-[#254085]"
              >
                Clear subjects
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniSearch;
