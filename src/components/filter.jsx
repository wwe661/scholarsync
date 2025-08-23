import React, { useEffect, useState } from "react";
import { FaCheck } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const Filter = ({ onApply }) => {
  const [mode, setMode] = useState("fields"); // "fields" | "countries"

  // keep selections per mode
  const [selectedFields, setSelectedFields] = useState([]);      // ["14","21",...]
  const [selectedCountries, setSelectedCountries] = useState([]); // ["UK","Japan",...]

  const [fieldOptions, setFieldOptions] = useState([]);    // [{id,name}]
  const [countryOptions, setCountryOptions] = useState([]); // [{id,name}]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Load study fields
  useEffect(() => {
    if (mode !== "fields") return;
    setLoading(true); setErr("");
    fetch(`${API_BASE}/api/fields`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const items = Array.isArray(data.items) ? data.items : [];
        setFieldOptions(items.map(x => ({ id: String(x.id), name: x.name })));
      })
      .catch(e => { console.error("load fields failed:", e); setErr("Failed to load fields."); })
      .finally(() => setLoading(false));
  }, [mode]);

  // Load countries
  useEffect(() => {
    if (mode !== "countries") return;
    setLoading(true); setErr("");
    fetch(`${API_BASE}/api/countries`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const items = Array.isArray(data.items) ? data.items : [];
        setCountryOptions(items.map(c => ({ id: String(c), name: c })));
      })
      .catch(e => { console.error("load countries failed:", e); setErr("Failed to load countries."); })
      .finally(() => setLoading(false));
  }, [mode]);

  const currentOptions = mode === "fields" ? fieldOptions : countryOptions;
  const selected = mode === "fields" ? selectedFields : selectedCountries;

  const toggleSelect = (opt) => {
    const value = String(opt.id);
    if (mode === "fields") {
      setSelectedFields(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    } else {
      setSelectedCountries(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    }
  };

  const handleApply = () => {
    if (!onApply) return;
    onApply({
      fields: selectedFields,         // field IDs
      countries: selectedCountries,   // country names
    });
  };

  // Reset only the current mode’s selection
  const reset = () => {
    if (mode === "fields") setSelectedFields([]);
    else setSelectedCountries([]);
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-xl mx-auto max-h-[80vh]">
      <div className="mb-6">
        <h3 className="bg-[#254085] text-base font-semibold text-white mb-2">Filter</h3>
        <p className="text-sm text-gray-500">
          {mode === "fields" ? "Type of Fields" : "Countries"}
        </p>
      </div>

      {loading && <div className="text-sm text-gray-600 mb-3">Loading…</div>}
      {!loading && err && <div className="text-sm text-red-600 mb-3">{err}</div>}
      {!loading && !err && currentOptions.length === 0 && (
        <div className="text-sm text-gray-600 mb-3">No options found.</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 max-h-[40vh] overflow-y-auto">
        {currentOptions.map((opt) => {
          const value = String(opt.id);
          const isActive = selected.includes(value);
          return (
            <button
              key={value}
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

      <div className="flex justify-between items-center gap-2">
        <button
          onClick={reset}
          className="text-sm text-gray-500 px-4 py-2 rounded-md hover:bg-gray-100 border"
        >
          Reset
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="bg-[#5D5FEF] text-white text-sm font-semibold px-5 py-2 rounded-md shadow hover:bg-[#4a4ee2] transition"
          >
            🔍 Filter
          </button>

          <button
            onClick={() => setMode(mode === "fields" ? "countries" : "fields")}
            className="bg-[#254085] text-white text-sm font-semibold px-5 py-2 rounded-md shadow hover:bg-[#1e3268] transition"
          >
            🌍 {mode === "fields" ? "Filter by Country" : "Back to Fields"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Filter;
