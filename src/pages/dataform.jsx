import React, { useState } from "react";

const DataForm = () => {
  const [gender, setGender] = useState("Female");
  const [spayed, setAmount] = useState("Full");       // your "Prefer Scholar"
  const [weight, setLevel] = useState("Diploma");     // your "Level"
  const [gpa, setGpa] = useState("");                 // NEW: GPA input

  const handleNext = () => {
    const me = JSON.parse(localStorage.getItem("authUser") || "{}");
    const email = me.email || localStorage.getItem("auth_email") || "";
    if (!email) {
      alert("Not logged in. Please log in again.");
      return;
    }

    const prev = JSON.parse(localStorage.getItem("prefsDraft") || "{}");
    const draft = {
      ...prev,
      email,
      gender,
      prefer: spayed,
      level: weight,
      min_gpa: gpa ? parseFloat(gpa) : null, 
      step: "dataform",
      savedAt: Date.now(),
    };
    localStorage.setItem("prefsDraft", JSON.stringify(draft));
    window.location.href = "/next-page";
  };

  return (
    <div className="min-h-screen bg-[#254085] flex items-center justify-center px-4">
      <div className="bg-[#F2F3F7] p-6 rounded-xl shadow-md w-full max-w-xl mt-7 mb-6">
        
        {/* Gender */}
        <div className="mb-4">
          <label className="text-base text-[#254085] font-bold block mb-2">Gender</label>
          <div className="flex gap-2">
            {["Female", "Male"].map((val) => (
              <button
                key={val}
                onClick={() => setGender(val)}
                className={`px-4 py-2 rounded border w-full ${
                  gender === val ? "bg-[#254085] text-white" : "bg-white text-gray-700"
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Prefer Scholar */}
        <div className="mb-4">
          <label className="text-base text-[#254085] font-bold block mb-2">Prefer Scholar</label>
          <div className="flex gap-2">
            {["Full", "Partial"].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(val)}
                className={`px-4 py-2 rounded border w-full ${
                  spayed === val ? "bg-[#254085] text-white" : "bg-white text-gray-700"
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Level */}
        <div className="mb-6">
          <label className="text-base text-[#254085] font-bold block mb-2">Level</label>
          <div className="grid grid-cols-4 gap-2">
            {["Bachelor", "Master", "PostDoctoral", "Diploma"].map((val) => (
              <button
                key={val}
                onClick={() => setLevel(val)}
                className={`px-2 py-2 rounded border text-xs ${
                  weight === val ? "bg-[#254085] text-white" : "bg-white text-gray-700"
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* GPA */}
        <div className="mb-6">
          <label className="text-base text-[#254085] font-bold block mb-2">GPA</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="4"
            placeholder="Enter GPA (e.g., 3.50)"
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            className="w-full px-4 py-2 rounded border bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#254085]"
          />
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          <button className="px-6 py-2 border border-gray-400 rounded-full text-gray-700">
            Back
          </button>
          <button
            className="px-6 py-2 bg-[#254085] text-white rounded-full"
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataForm;
