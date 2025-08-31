import React, { useEffect, useRef, useState } from "react";
import { FaSearch } from "react-icons/fa";
import Filter from "../components/filter";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const Search = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  // filters
  const [levels, setLevels] = useState([]);
  const [funds, setFunds] = useState([]);
  const [countries, setCountries] = useState([]);
  const [fieldCodes, setFieldCodes] = useState([]);

  const limit = 3;

  // ---- suggestions state ----
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const sugTimer = useRef(null);
  const inputRef = useRef(null);

  // helper: reuse everywhere
  const closeFilterModal = () => {
    const modal = document.getElementById("filterModal");
    if (modal) {
      modal.classList.add("hidden");
      modal.removeAttribute("open");
    }
  };

  // ---------- NEW: deadline helpers ----------
  const MONTHS = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const parseDeadline = (s) => {
    // Prefer ISO date (backend "deadline" field)
    if (s?.deadline) {
      const d = new Date(s.deadline);
      return isNaN(d.getTime()) ? null : d;
    }
    // Fallback: "dd/Mon/yy" from "deadlineDate"
    const txt = (s?.deadlineDate || "").trim();
    if (!txt || txt.toLowerCase() === "no fix") return null;
    const m = txt.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2})$/);
    if (!m) return null;
    const [, ddStr, monStr, yyStr] = m;
    const dd = parseInt(ddStr, 10);
    const mon = MONTHS[monStr];
    const yy = parseInt(yyStr, 10);
    if (Number.isNaN(dd) || mon == null || Number.isNaN(yy)) return null;
    // assume 20xx for two-digit years
    const fullYear = yy + 2000;
    const d = new Date(fullYear, mon, dd);
    return isNaN(d.getTime()) ? null : d;
  };

  const isDeadlinePast = (s) => {
    const d = parseDeadline(s);
    if (!d) return false;
    // compare to start of today (so "today" isn't considered past)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d < todayStart;
  };
  // ---------- /helpers ----------

  // fetch results (supports overrides so sidebar can call it)
  const fetchData = async (pageNum = 1, overrides = {}) => {
    setLoading(true);
    setError("");

    const nextQ = overrides.q ?? q;
    const nextLevels = overrides.levels ?? levels;
    const nextFunds = overrides.funds ?? funds;
    const nextCountries = overrides.countries ?? countries;
    const nextFields = overrides.fieldCodes ?? fieldCodes;

    try {
      const params = new URLSearchParams();
      if (nextQ?.trim()) params.append("q", nextQ.trim());
      nextLevels.forEach((v) => params.append("level", v));
      nextFunds.forEach((v) => params.append("fund", v));
      nextCountries.forEach((v) => params.append("country", v));
      nextFields.forEach((v) => params.append("fields", v));
      params.append("page", String(pageNum));
      params.append("limit", String(limit));
      params.append("sort", "deadline_asc");

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000);

      const url = `${API_BASE}/api/scholarships?${params.toString()}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text || "request failed"}`);
      }

      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setPage(typeof data.page === "number" ? data.page : pageNum);
    } catch (e) {
      console.error("Fetch error:", e);
      setItems([]);
      setTotal(0);
      setError("Couldn’t load results. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---- suggestion fetcher (no backend change needed) ----
  const fetchSuggestions = async (term) => {
    if (!term || !term.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.append("q", term.trim());
      params.append("limit", "5");
      params.append("page", "1");
      params.append("sort", "deadline_asc");

      const res = await fetch(`${API_BASE}/api/scholarships?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      const bag = new Set();
      items.forEach((it) => {
        [it.scholarship_name, it.provider, it.country, it.type, it.level].forEach((v) => {
          const s = (v || "").toString().trim();
          if (s && s.toLowerCase().includes(term.trim().toLowerCase())) {
            bag.add(s);
          }
        });
      });

      const list = Array.from(bag).sort((a, b) => a.length - b.length).slice(0, 8);
      setSuggestions(list);
      setShowSug(true);
    } catch (e) {
      console.error("suggestions failed:", e);
      setSuggestions([]);
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

  const onApplyFilter = (payload) => {
    const next = {
      levels: payload.levels || [],
      funds: payload.funds || [],
      countries: payload.countries || [],
      fieldCodes: payload.fields || [],
      q,
    };
    setLevels(next.levels);
    setFunds(next.funds);
    setCountries(next.countries);
    setFieldCodes(next.fieldCodes);
    fetchData(1, next);
  };

  useEffect(() => {
    fetchData(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / limit);

  function truncateText(text, maxLength) {
    if (!text) return "";
    const str = String(text);
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  }

  return (
    <div className="bg-[#F2F3F7] shadow-inner p-4 md:p-7 w-full mt-0 relative" id="searchContent">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Search Scholarships</h1>

      <div className="w-full flex flex-col md:flex-row gap-8 items-start mt-0 align-top">
        {/* Left Section */}
        <div className="w-full md:w-3/4">
          {/* Search Bar + Suggestions */}
          <div className="relative">
            <div className="flex items-center bg-white rounded-xl shadow p-3 mb-2">
              <input
                ref={inputRef}
                type="text"
                value={q}
                onChange={handleChange}
                onFocus={() => q && suggestions.length > 0 && setShowSug(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setShowSug(false);
                    fetchData(1, { q });
                  }
                }}
                placeholder="Type university, provider, country, or funding type"
                className="flex-grow px-4 py-2 text-sm rounded-l-xl focus:outline-none"
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
                onClick={() => {
                  setShowSug(false);
                  fetchData(1, { q });
                }}
                className="bg-[#254085] text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center gap-2"
              >
                <FaSearch /> Search
              </button>
            </div>

            {/* Suggestion dropdown */}
            {showSug && suggestions.length > 0 && (
              <div className="absolute z-20 top-[100%] left-0 right-0 bg-white border rounded-lg shadow max-h-56 overflow-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    onClick={() => handlePickSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results */}
          {loading && <div className="text-gray-600 mb-4">Loading…</div>}
          {!loading && error && <div className="text-red-600 mb-4">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="text-gray-600 mb-4">No scholarships found.</div>
          )}

          {items.map((s, index) => {
            const past = isDeadlinePast(s);
            return (
              <div
                key={s.id || index}
                className="bg-[#254085] text-white rounded-xl shadow-md p-5 mb-4 hover:shadow-lg transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-2">
                    <img
                      src="logo.png"
                      alt="Scholarship Logo"
                      className="w-12 h-12 rounded-full border border-white shadow"
                    />
                    <div>
                      <h3 className="font-semibold text-white">
                        {s.scholarship_name || "Scholarship"}
                      </h3>
                      <div className="flex gap-3 mt-1 text-sm">
                        <p className="flex items-center gap-1 text-gray-200">
                          💲 <span>Amount: {s.amount || "-"}</span>
                        </p>
                        <p className="flex items-center gap-1 text-gray-200">
                          📅 <span>Deadline: </span>
                          <span
                            className={past ? "text-red-400 font-semibold" : ""}
                            title={s.deadline || s.deadlineDate || ""}
                          >
                            {s.deadlineDate || "Not specified"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <a
                    href={s.link || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white text-[#254085] text-sm font-semibold px-4 py-2 rounded-md shadow hover:bg-gray-100 transition"
                  >
                    See Detail
                  </a>
                </div>

                <div className="flex gap-2 text-xs">
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                    {s.country || "Country"} / {s.provider || "Provider"}
                  </span>
                  <span className="bg-pink-100 text-pink-700 px-2 py-1 rounded-lg">
                    {s.level || "Degree"}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {total > 0 && Math.ceil(total / limit) > 1 && (
            <div className="flex items-center gap-2 mt-4">
              <button
                disabled={page === 1}
                onClick={() => fetchData(page - 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <button
                disabled={page * limit >= total}
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

          {/* Degree */}
          <div className="mb-4 gap-3">
            <div className="flex mb-5 ">
              <img src="degree.png" alt="Degree Icon" className="w-20 h-12 mt-8" />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-base font-semibold text-[#254085]">Degree</p>
                </div>

                {[
                  { label: "Bachelor", value: "Bachelor" },
                  { label: "Master", value: "Master" },
                  { label: "PhD", value: "PhD" },
                  { label: "Diploma", value: "Diploma" },
                ].map((opt, i) => (
                  <div key={i} className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-[#5D5FEF]"
                      checked={levels.includes(opt.value)}
                      onChange={(e) => {
                        const nextLevels = e.target.checked
                          ? [...levels, opt.value]
                          : levels.filter((x) => x !== opt.value);
                        setLevels(nextLevels);
                        fetchData(1, { levels: nextLevels });
                      }}
                    />
                    <label className="text-sm text-gray-700">{opt.label}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Fund You prefer */}
            <div className="flex">
              <img src="dollar.png" alt="Degree Icon" className="w-15 h-15 mt-8" />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-base font-semibold text-[#254085] mb-2">
                    Fund You prefer
                  </p>
                </div>

                {[
                  { label: "Fully Funded", value: "Full" },
                  { label: "Partially Funded", value: "Partial" },
                ].map((opt, i) => (
                  <div key={i} className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-[#5D5FEF]"
                      checked={funds.includes(opt.value)}
                      onChange={(e) => {
                        const nextFunds = e.target.checked
                          ? [...funds, opt.value]
                          : funds.filter((x) => x !== opt.value);
                        setFunds(nextFunds);
                        fetchData(1, { funds: nextFunds });
                      }}
                    />
                    <label className="text-sm text-gray-700">{opt.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Buttons + Modal */}
          <div className="flex flex-col gap-4 mt-6">
            <button
              onClick={() => {
                const modal = document.getElementById("filterModal");
                modal.classList.remove("hidden");
                modal.setAttribute("open", true);
              }}
              className="px-4 py-2 bg-[#254085] text-white rounded-md shadow text-sm font-semibold hover:bg-white hover:text-[#254085] border border-[#254085] transition"
            >
              Study Field & Country
            </button>
          </div>

          <dialog id="filterModal" className="z-50 hidden p-0 m-0 bg-transparent">
            <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative p-6 w-full max-w-xl mx-auto pointer-events-auto bg-white rounded-xl shadow-lg">
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closeFilterModal}
                  className="absolute right-3 top-3 h-8 w-8 grid place-items-center rounded-full
                   text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                >
                  ✕
                </button>

                <form onSubmit={(e) => e.preventDefault()}>
                  <Filter
                    onApply={(payload) => {
                      const next = {
                        levels,
                        funds,
                        countries: payload?.countries ?? countries,
                        fieldCodes: payload?.fields ?? fieldCodes,
                        q,
                      };
                      setCountries(next.countries);
                      setFieldCodes(next.fieldCodes);
                      fetchData(1, next);
                      closeFilterModal();
                    }}
                  />
                </form>
              </div>
            </div>
          </dialog>
        </div>
      </div>
    </div>
  );
};

export default Search;
