import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

function getAuthUser() {
  try { return JSON.parse(localStorage.getItem("authUser") || "{}"); }
  catch { return {}; }
}

const MatchScholar = () => {
  const [me, setMe] = useState(getAuthUser());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const minRank = 60;
  const limit = 12;
  const page = 1;

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
  const scholarPrefsFilled =
    Array.isArray(prefs.fieldIds) && prefs.fieldIds.length > 0 &&
    typeof prefs.country === "string" && prefs.country.trim() !== "" &&
    typeof prefs.level === "string" && prefs.level.trim() !== "" &&
    typeof prefs.prefer === "string" && prefs.prefer.trim() !== "";

  const readResults = async (email) => {
    const params = new URLSearchParams({
      email,
      min_rank: String(minRank),
      page: String(page),
      limit: String(limit),
    });
    const res = await fetch(`${API_BASE}/api/match?${params.toString()}`);
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
        if (scholarPrefsFilled) {
          const buildRes = await fetch(
            `${API_BASE}/api/match/build?email=${encodeURIComponent(me.email)}`,
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
        setErr("Couldn’t load matched scholarships.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [me?.email, scholarPrefsFilled]);

  if (!me?.email) {
    return (
      <div className="min-h-screen bg-[#254085] flex flex-col items-center justify-center text-white p-6">
        <h2 className="text-2xl font-bold mb-3">Login Required</h2>
        <p className="mb-6 text-center max-w-md">
          Please log in and fill your profile to see your matched scholarships.
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

  if (!scholarPrefsFilled && !loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-[#254085] flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-md p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-[#254085] mb-2">Almost there!</h2>
          <p className="text-gray-700 mb-4">
            You need to fill your scholarship preferences first to get matches.
          </p>
          <button
            onClick={() => navigate("/data-form")}
            className="w-full bg-[#254085] text-white py-2 rounded-md font-semibold"
          >
            Go to Scholarship Preferences
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#254085] py-10 px-6 md:px-16">
      {loading && <div className="text-white mb-4">Loading…</div>}
      {!loading && err && <div className="text-red-200 mb-4">{err}</div>}
      {!loading && !err && items.length === 0 && scholarPrefsFilled && (
        <div className="text-white/90 mb-4">No matches found.</div>
      )}

      {/* Header row */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Matched Scholarships</h2>
        <button
          onClick={() => navigate("/data-form")}
          className="bg-white text-[#254085] px-4 py-2 rounded-md font-semibold hover:bg-gray-200"
        >
          Change Your Data
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((s, i) => {
          const provider = s.provider || "—";
          const title = s.scholarship_name || "Scholarship";
          const tags = [
            s.type?.toLowerCase?.().includes("full")
              ? "Fully"
              : s.type?.toLowerCase?.().includes("partial")
              ? "Partially"
              : (s.type || "—"),
            s.level || "—",
          ].filter(Boolean);
          const deadline = s.deadline || "Not specified";
          const pct = Math.max(0, Math.min(100, Number(s.rank) || 0));

          return (
            <div
              key={s.id || i}
              className="bg-white rounded-xl shadow-md border border-gray-100 p-5 hover:shadow-lg transition"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 border-b-2 border-[#254085] pb-1 w-full">
                  <img src="logo.png" alt="logo" className="w-8 h-8 rounded-full" />
                  <div className="text-sm font-semibold text-gray-900 ">{provider}</div>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-800 mb-3">{title}</h3>

              <div className="flex flex-wrap gap-2 mb-4">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-[#254085] text-white px-2 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="text-sm font-semibold mb-4 text-emerald-700">
                Deadline : {deadline}
                <div className="w-full h-2 bg-gray-200 rounded-full mb-2 mt-5">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-700 font-medium text-right">
                  {pct}% Match based on your preferences
                </p>
              </div>

              <a
                href={s.link || "#"}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-block text-center bg-[#254085] text-white py-2 rounded-md text-sm font-medium hover:opacity-90"
              >
                Check Detail
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MatchScholar;
