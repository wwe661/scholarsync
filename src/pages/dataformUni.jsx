import React, { useEffect, useState } from "react";
import { FaCheck } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const DataFormuni = () => {
  const [subjectOptions, setSubjectOptions] = useState([]); // [{id, name}]
  const [selected, setSelected] = useState([]);             // ["1","2",...]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(`${API_BASE}/api/unisubjects`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const normalized = items
          .map((x) => ({
            id: String(x.id ?? x._id ?? ""),
            name: String(x.subjectname ?? x.subject ?? "").trim(),
          }))
          .filter((s) => s.id && s.name);
        if (!alive) return;
        setSubjectOptions(normalized);

        // restore draft
        const draft = JSON.parse(localStorage.getItem("prefsDraft") || "{}");
        if (alive && Array.isArray(draft.uniPreferredSubjectIds)) {
          setSelected(draft.uniPreferredSubjectIds.map(String));
        }
      } catch (e) {
        console.error(e);
        if (alive) setErr("Failed to load subjects.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggleSelect = (subject) => {
    const val = String(subject.id);
    setSelected((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]
    );
  };

  const handleNext = () => {
    const chosen = subjectOptions.filter(s => selected.includes(s.id));
    const draft = {
      ...JSON.parse(localStorage.getItem("prefsDraft") || "{}"),
      uniPreferredSubjects: chosen.map(s => s.name), // for display
      uniPreferredSubjectIds: selected,              // for backend
      step: "dataform_uni_subjects",
      savedAt: Date.now(),
    };
    localStorage.setItem("prefsDraft", JSON.stringify(draft));
    navigate("/data-form-uni2");
  };

  return (
    <div className="min-h-screen bg-[#254085] flex items-center justify-center px-4">
      <div className="bg-[#F2F3F7] p-6 rounded-xl shadow-md w-full max-w-xl">
        <div className="mb-7">
          <label className="text-base text-[#254085] font-bold mb-7 block">
            Your Prefer Subjects
          </label>
          {loading && <div className="text-sm text-gray-600">Loading…</div>}
          {!loading && err && <div className="text-sm text-red-600">{err}</div>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 max-h-[50vh] overflow-y-auto">
          {subjectOptions.map((opt) => {
            const isActive = selected.includes(opt.id);
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

        <div className="flex justify-between">
          <button className="px-6 py-2 border border-gray-400 rounded-full text-gray-700" onClick={() => window.history.back()}>
            Back
          </button>
          <button className="px-6 py-2 bg-[#254085] text-white rounded-full" onClick={handleNext}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataFormuni;
