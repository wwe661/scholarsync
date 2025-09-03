// src/pages/matchUni.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

function getAuthUser() {
  try { return JSON.parse(localStorage.getItem("authUser") || "{}"); }
  catch { return {}; }
}

const MatchUni = () => {
  const [me, setMe] = useState(getAuthUser());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [costAvail, setCostAvail] = useState({}); // { [uniName]: true }
  const [costLoading, setCostLoading] = useState(false);
  const navigate = useNavigate();

  const limit = 18;
  const minRank = 0;

  // sync with localStorage updates from forms
  useEffect(() => {
    const onStorage = (e) => { if (e.key === "authUser") setMe(getAuthUser()); };
    const onAuthChanged = () => setMe(getAuthUser());
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth-changed", onAuthChanged);
    const t = setTimeout(() => setMe(getAuthUser()), 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, []);

  const prefs = me?.prefs || {};
  const uniPrefsFilled =
    Array.isArray(prefs.uniPreferredSubjectIds) && prefs.uniPreferredSubjectIds.length > 0 &&
    Array.isArray(prefs.uniPreferredCountries) && prefs.uniPreferredCountries.length > 0;

  const readResults = async (email) => {
    const params = new URLSearchParams({
      email,
      min_rank: String(minRank),
      limit: String(limit),
    });
    const res = await fetch(`${API_BASE}/api/matchuni/results?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  };

  useEffect(() => {
    const run = async () => {
      if (!me?.email) {
        setItems([]);
        setErr("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr("");
      try {
        if (uniPrefsFilled) {
          const buildRes = await fetch(
            `${API_BASE}/api/matchuni/build?email=${encodeURIComponent(me.email)}`,
            { method: "POST" }
          );
          if (!buildRes.ok) throw new Error(`Build HTTP ${buildRes.status}`);
          const list = await readResults(me.email);
          setItems(list);
        } else {
          const list = await readResults(me.email);
          setItems(list);
        }
      } catch (e) {
        console.error(e);
        setErr("Failed to load matches.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [me?.email, uniPrefsFilled]);

  // After we have items, check which have cost data
  const uniNames = useMemo(
    () => Array.from(new Set(items.map(i => (i.name || "").trim()).filter(Boolean))),
    [items]
  );

  useEffect(() => {
    let cancelled = false;
    const loadCosts = async () => {
      if (uniNames.length === 0) {
        setCostAvail({});
        return;
      }
      setCostLoading(true);
      try {
        // Fire requests in parallel; small throttle to be nice
        const checks = await Promise.all(
          uniNames.map(async (name) => {
            try {
              const r = await fetch(`${API_BASE}/api/cost/by-university?name=${encodeURIComponent(name)}`);
              if (!r.ok) return [name, false];
              const data = await r.json();
              const has = Array.isArray(data.items) ? data.items.length > 0 : !!data.item;
              return [name, !!has];
            } catch {
              return [name, false];
            }
          })
        );
        if (cancelled) return;
        const map = Object.fromEntries(checks);
        setCostAvail(map);
      } finally {
        if (!cancelled) setCostLoading(false);
      }
    };
    loadCosts();
    return () => { cancelled = true; };
  }, [uniNames]);

  // not logged in
  if (!me?.email) {
    return (
      <div className="min-h-screen bg-[#254085] flex flex-col items-center justify-center text-white p-6">
        <h2 className="text-2xl font-bold mb-3">Login Required</h2>
        <p className="mb-6 text-center max-w-md">
          Please log in and fill your university preferences to see your matches.
        </p>
        <button
          onClick={() => navigate("/authpage")}
          className="bg-white text-[#254085] px-6 py-2 rounded hover:bg-gray-200"
        >
          Go to Login / Sign Up
        </button>
      </div>
    );
  }

  if (!uniPrefsFilled && !loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-[#254085] flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-md p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-[#254085] mb-2">Add your university preferences</h2>
          <p className="text-gray-700 mb-4">
            You need to fill your input data (preferred subjects & countries) first to get matches.
          </p>
          <button
            onClick={() => navigate("/data-form-uni")}
            className="w-full bg-[#254085] text-white py-2 rounded-md font-semibold"
          >
            Go to University Preferences
          </button>
        </div>
      </div>
    );
  }

 return (
  <div className="min-h-screen bg-[#254085] py-10 px-6 md:px-16">
    {loading && <div className="text-white mb-4">Loading…</div>}
    {!loading && err && <div className="text-red-200 mb-4">{err}</div>}
    {!loading && !err && items.length === 0 && uniPrefsFilled && (
      <div className="text-white/90 mb-4">No matches found.</div>
    )}

    {/* Header row */}
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-xl font-bold text-white">Matched Universities</h2>
      <button
        onClick={() => navigate("/data-form-uni")}
        className="bg-white text-[#254085] px-4 py-2 rounded-md font-semibold hover:bg-gray-200"
      >
        Change Your Data
      </button>
    </div>

    {/* University cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((u) => {
        const pct = Math.max(0, Math.min(100, Math.round(u.matchScore || 0)));
        const name = (u.name || "").trim();
        const hasCost = !!costAvail[name];

        return (
          <div
            key={u.id}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-5 hover:shadow-lg transition"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 border-b-2 border-[#254085] pb-1 w-full">
                <img
                  src={u.image || "logo.png"}
                  alt={u.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="text-sm font-semibold text-gray-900">
                  {u.name}
                </div>
              </div>
            </div>

            <div className="text-sm font-semibold text-gray-900 mb-1">
              Rank #{u.rank ?? "-"} • {u.country || "-"}
            </div>
            <div className="text-sm text-gray-700 mb-4">
              {(u.students &&
                `${u.students.toLocaleString?.() ?? u.students} students`) ||
                ""}
              
            </div>

            <div className="w-full h-2 bg-gray-200 rounded-full mb-2">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${pct}%` }}
                title={`Score: ${u.matchScore}`}
              />
            </div>
            <p className="text-xs text-gray-700 font-medium text-right">
              {pct}% Match based on your preferences
            </p>

            <div className="mt-4 flex gap-2">
              <a
  href={u.url || u.Website || "#"}
  target="_blank"
  rel="noreferrer"
  className="flex-1 text-center bg-[#254085] text-white py-2 rounded-md text-sm font-medium hover:opacity-90"
>
  Check Detail
</a>


              {costLoading ? (
                <span className="px-3 py-2 rounded-md text-xs bg-gray-100 text-gray-500">
                  checking…
                </span>
              ) : hasCost ? (
                <button
                  onClick={() =>
                    navigate(`/cost-prediction?university=${encodeURIComponent(name)}`)
                  }
                  className="px-3 py-2 rounded-md text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200"
                >
                  Cost available
                </button>
              ) : (
                <span className="px-3 py-2 rounded-md text-xs bg-gray-100 text-gray-500">
                  No cost data
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

};

export default MatchUni;
