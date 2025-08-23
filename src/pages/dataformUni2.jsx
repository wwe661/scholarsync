import React, { useEffect, useState } from "react";
import { FaCheck } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const DataFormuni2 = () => {
  const [countryOptions, setCountryOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // load unique countries
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r1 = await fetch(`${API_BASE}/api/universities/countries`);
        if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
        const d = await r1.json();
        if (!alive) return;
        setCountryOptions(Array.isArray(d.items) ? d.items : []);

        // preload draft
        const draft = JSON.parse(localStorage.getItem("prefsDraft") || "{}");
        if (alive && Array.isArray(draft.uniPreferredCountries)) {
          setSelected(draft.uniPreferredCountries.map(String));
        }
      } catch (e) {
        console.error(e);
        if (alive) setErr("Failed to load countries.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggleSelect = (country) => {
    const val = String(country).trim();
    setSelected((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]
    );
  };

  const handleDone = async () => {
    // 1) save draft locally
    const draft = {
      ...JSON.parse(localStorage.getItem("prefsDraft") || "{}"),
      uniPreferredCountries: selected,
      step: "dataform_uni2",
      savedAt: Date.now(),
    };
    localStorage.setItem("prefsDraft", JSON.stringify(draft));

    // 2) get logged-in user email (assumes set at login)
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const email = user?.email;
    if (!email) {
      alert("Please log in first.");
      return;
    }

    // 3) persist prefs to backend
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/api/users/uniprefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          uniPreferredSubjectIds: draft.uniPreferredSubjectIds || [],
          uniPreferredCountries: draft.uniPreferredCountries || [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // 4) build user collection on server
      const b = await fetch(`${API_BASE}/api/matchuni/build?email=${encodeURIComponent(email)}`);
      if (!b.ok) throw new Error(`Build HTTP ${b.status}`);

      // 5) go to results
      navigate("/match-uni");
    } catch (e) {
      console.error(e);
      alert("Failed to save or build. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#254085] flex items-center justify-center px-4">
      <div className="bg-[#F2F3F7] p-6 rounded-xl shadow-md w-full max-w-xl">
        <div className="mb-7">
          <label className="text-base text-[#254085] font-bold mb-2 block">
            Your Prefer Countries
          </label>
          {loading && <div className="text-sm text-gray-600 mt-1">Loading…</div>}
          {!loading && err && <div className="text-sm text-red-600 mt-1">{err}</div>}
          <DraftSubjectsPill />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 max-h-[50vh] overflow-y-auto">
          {countryOptions.map((name) => {
            const label = String(name).trim();
            const isActive = selected.includes(label);
            return (
              <button
                key={label}
                onClick={() => toggleSelect(label)}
                className={`flex items-center justify-between border rounded-full px-4 py-2 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-purple-100 text-purple-700 border-purple-300"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{label}</span>
                {isActive && <FaCheck className="text-purple-500 text-xs" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between">
          <button
            className="px-6 py-2 border border-gray-400 rounded-full text-gray-700"
            onClick={() => window.history.back()}
            disabled={saving}
          >
            Back
          </button>
          <button
            className="px-6 py-2 bg-[#254085] text-white rounded-full disabled:opacity-60"
            onClick={handleDone}
            disabled={saving}
          >
            {saving ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
};

// show drafted subjects while on step 2
function DraftSubjectsPill() {
  const [names, setNames] = useState([]);
  useEffect(() => {
    const d = JSON.parse(localStorage.getItem("prefsDraft") || "{}");
    setNames(Array.isArray(d.uniPreferredSubjects) ? d.uniPreferredSubjects : []);
  }, []);
  if (!names.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {names.map((n) => (
        <span key={n} className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs">
          {n}
        </span>
      ))}
    </div>
  );
}

export default DataFormuni2;
