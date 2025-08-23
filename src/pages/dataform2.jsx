// src/pages/DataForm2.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCheck } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const DataForm2 = () => {
  const [country, setCountry] = useState("");
  const [allCountries, setAllCountries] = useState([]); // ["Myanmar", "United States", ...]
  const [showSug, setShowSug] = useState(false);
  const [hlIndex, setHlIndex] = useState(-1); // highlighted suggestion index

  const [fieldOptions, setFieldOptions] = useState([]); // [{id,name}]
  const [selected, setSelected] = useState([]);         // selected field IDs (strings)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const boxRef = useRef(null);

  // --- Fetch country list once (REST Countries) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // light payload with only names (and common English names)
        const r = await fetch("https://restcountries.com/v3.1/all?fields=name");
        const data = await r.json();
        if (!alive) return;
        const names = (Array.isArray(data) ? data : [])
          .map((c) => c?.name?.common)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        setAllCountries(names);
      } catch (e) {
        // fallback minimal list if API fails
        setAllCountries([
          "Myanmar",
          "United States",
          "United Kingdom",
          "Australia",
          "Canada",
          "Japan",
          "Malaysia",
          "Singapore",
          "India",
          "Thailand",
        ]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Suggestions filtered by input
  const suggestions = useMemo(() => {
    const q = country.trim().toLowerCase();
    if (!q) return [];
    return allCountries
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 10);
  }, [country, allCountries]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const onClickOutside = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) {
        setShowSug(false);
        setHlIndex(-1);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // --- Fetch fields from backend ---
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErr("");
    fetch(`${API_BASE}/api/fields`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setFieldOptions(items.map((x) => ({ id: String(x.id), name: x.name })));
      })
      .catch((e) => {
        if (!isMounted) return;
        console.error(e);
        setErr("Failed to load fields.");
      })
      .finally(() => isMounted && setLoading(false));
    return () => { isMounted = false; };
  }, []);

  const toggleSelect = (field) => {
    const value = String(field.id);
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // --- Country input handlers (with keyboard nav) ---
  const onCountryChange = (e) => {
    setCountry(e.target.value);
    setShowSug(true);
    setHlIndex(-1);
  };

  const onCountryKeyDown = (e) => {
    if (!showSug || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHlIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHlIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (hlIndex >= 0 && hlIndex < suggestions.length) {
        e.preventDefault();
        setCountry(suggestions[hlIndex]);
        setShowSug(false);
        setHlIndex(-1);
      }
    } else if (e.key === "Escape") {
      setShowSug(false);
      setHlIndex(-1);
    }
  };

  const pickSuggestion = (name) => {
    setCountry(name);
    setShowSug(false);
    setHlIndex(-1);
  };

  const handleDone = async () => {
    try {
      setSaving(true);
      setSaveErr("");

      const me = JSON.parse(localStorage.getItem("authUser") || "{}");
      const email = me.email || localStorage.getItem("auth_email") || "";
      if (!email) throw new Error("Not logged in. Please log in again.");

      const draft = JSON.parse(localStorage.getItem("prefsDraft") || "{}");

      const payload = {
        email,
        gender: draft.gender,
        prefer: draft.prefer,
        level: draft.level,
        min_gpa: draft.min_gpa ?? null,
        country: country.trim(),   // from this page (with autocomplete)
        fieldIds: selected,        // ["1","2",...]
      };

      const res = await fetch(`${API_BASE}/api/users/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to save preferences");
      }

      // Optionally build ranking now
      await fetch(`${API_BASE}/api/match/build?email=${encodeURIComponent(email)}`, {
        method: "POST",
      });

      localStorage.removeItem("prefsDraft");
      window.location.href = "/match-scholar";
    } catch (e) {
      console.error(e);
      setSaveErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#254085] flex items-center justify-center px-4">
      <div className="bg-[#F2F3F7] p-6 rounded-xl shadow-md w-full max-w-xl">
        {/* Country with autocomplete */}
        <div className="mb-10" ref={boxRef}>
          <label className="text-base text-[#254085] font-bold">Your Country</label>
          <input
            type="text"
            value={country}
            onChange={onCountryChange}
            onFocus={() => setShowSug(true)}
            onKeyDown={onCountryKeyDown}
            placeholder="Start typing (e.g., my…)"
            className="w-full mt-1 px-3 py-2 rounded border border-[#254085]"
            autoComplete="off"
          />
          {showSug && suggestions.length > 0 && (
            <div className="relative">
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow">
                {suggestions.map((name, idx) => (
                  <li
                    key={name}
                    onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                    onClick={() => pickSuggestion(name)}
                    className={`px-3 py-2 cursor-pointer ${
                      idx === hlIndex ? "bg-[#254085] text-white" : "hover:bg-gray-100"
                    }`}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mb-7">
          <label className="text-base text-[#254085] font-bold mb-7">Your Fields</label>
        </div>

        {loading && <div className="text-sm text-gray-600 mb-3">Loading…</div>}
        {!loading && err && <div className="text-sm text-red-600 mb-3">{err}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 max-h-[40vh] overflow-y-auto">
          {fieldOptions.map((opt) => {
            const isActive = selected.includes(String(opt.id));
            return (
              <button
                key={opt.id}
                onClick={() => toggleSelect(opt)}
                className={`flex items-center justify-between border rounded-full px-4 py-2 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-purple-100 text-purple-700 border-purple-300"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{opt.name}</span>
                {isActive && <FaCheck className="text-purple-500 text-xs" />}
              </button>
            );
          })}
        </div>

        {saveErr && <div className="text-sm text-red-600 mb-3">{saveErr}</div>}

        <div className="flex justify-between">
          <button className="px-6 py-2 border border-gray-400 rounded-full text-gray-700" disabled={saving}>
            Back
          </button>
          <button
            className="px-6 py-2 bg-[#254085] text-white rounded-full disabled:opacity-60"
            onClick={handleDone}
            disabled={saving}
          >
            {saving ? "Saving…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataForm2;
