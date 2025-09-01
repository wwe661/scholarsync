// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  User,
  Users,
  GraduationCap,
  Building2,
  Book,
  Notebook,
  DollarSign,
  PieChart,
  LogOut,
  Trash2,
  X,
  Loader2,
  Edit2,
} from "lucide-react";
import AdminProfile from "./AdminProfile";
import Admin_Dashboard from "./Admin_Dashboard";

// Backend API
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const ENDPOINTS = {
  dashboard: "/admin/dashboard", // ✅ replaced analysis
  users: "/admin/users",
  scholarships: "/admin/scholarships",
  universities: "/admin/universities",
  fields: "/admin/fields",
  unisubjects: "/admin/unisubjects",
  cost: "/admin/cost",
  admin: "/admin/profile",
};
// ...
// (keep your state and effects above)

// Fetch wrapper
async function fetchJSON(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Donut chart component
/*function DonutChart({ parts = [], size = 140, thick = 20 }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0);
  let acc = 0;
  const stops = parts.map((p) => {
    const pct = total ? (p.value / total) * 100 : 0;
    const from = acc;
    acc += pct;
    return `${p.color} ${from}% ${acc}%`;
  });
  const style = {
    width: size,
    height: size,
    borderRadius: "9999px",
    backgroundImage: `conic-gradient(${stops.join(", ")})`,
    position: "relative",
  };
  return (
    <div style={style}>
      <div
        style={{
          inset: thick,
          position: "absolute",
          borderRadius: "9999px",
          background: "white",
        }}
      />
    </div>
  );
}
*/
export default function Admin() {
  const [selectedPage, setSelectedPage] = useState("dashboard");
  const [items, setItems] = useState([]);
  //const [profile, setProfile] = useState(null);
  //const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "" });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showLogout, setShowLogout] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  //const [activeTab, setActiveTab] = useState("users");
  const showSearch = !["dashboard", "admin"].includes(selectedPage); // ← hide on these pages
  // Field & Subject selector states
  const [showFieldSelector, setShowFieldSelector] = useState(false);
  const [allFields, setAllFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);

  const [showSubjectSelector, setShowSubjectSelector] = useState(false);
  const [allSubjects, setAllSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);

  const [draftSubjects, setDraftSubjects] = useState([]);
  const [draftFields, setDraftFields] = useState([]);

  const ROWS_PER_PAGE = 20;
  // Reset selections when modal is closed
  const resetSelections = () => {
    setSelectedFields([]);
    setSelectedSubjects([]);
    setDraftFields([]);
    setDraftSubjects([]);
  };

  // Fetch data for selected page
  // Load data for "analysis" and "admin" tabs
  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoading(true);
      setErrorMessage("");

      try {
        let endpoint = "";
        switch (selectedPage) {
          case "users":
            endpoint = "users";
            break;
          case "scholarships":
            endpoint = "scholarships";
            break;
          case "universities":
            endpoint = "universities";
            break;
          case "fields":
            endpoint = "fields";
            break;
          case "unisubjects":
            endpoint = "unisubjects";
            break;
          case "cost":
            endpoint = "cost";
            break;
          default:
            endpoint = "";
            break; // dashboard/admin etc.
        }
        if (!endpoint) {
          setItems([]);
          setLoading(false);
          return;
        }

        const data = await fetchJSON(`/admin/${endpoint}`);
        if (!cancelled) {
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data.items)
            ? data.items
            : [];
          setItems(list);
          setCurrentPage(1);
        }
      } catch (err) {
        if (!cancelled)
          setErrorMessage("Failed to connect to MongoDB. Try again.");
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Only load when the selected tab is a list page
    if (
      [
        "users",
        "scholarships",
        "universities",
        "fields",
        "unisubjects",
        "cost",
      ].includes(selectedPage)
    ) {
      loadList();
    } else {
      setItems([]); // keep table empty on non-list pages
    }

    return () => {
      cancelled = true;
    };
  }, [selectedPage]);

  // Load fields when field modal opens
  useEffect(() => {
    if (showFieldSelector) {
      fetchJSON("/admin/fields")
        .then((data) => {
          console.log("Fields data:", data);
          if (Array.isArray(data.items)) setAllFields(data.items);
          else setAllFields([]);
        })
        .catch((err) => console.error("Error loading fields", err));
    }
  }, [showFieldSelector]);

  // Load subjects when subject modal opens
  useEffect(() => {
    if (showSubjectSelector) {
      fetchJSON("/admin/unisubjects")
        .then((data) => {
          console.log("Subjects data:", data);
          if (Array.isArray(data.items)) setAllSubjects(data.items);
          else setAllSubjects([]);
        })
        .catch((err) => console.error("Error loading subjects", err));
    }
  }, [showSubjectSelector]);

  // Filter items for search
  // Filtering for Users
  const filteredUsers = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (row) =>
        (row.email || "").toLowerCase().includes(q) ||
        (row.created_at || "").toLowerCase().includes(q) ||
        (row.updatedAt || row.updated_at || "").toLowerCase().includes(q) // <-- added updated_at
    );
  }, [items, query]);

  // Filtering for Universities
  const filteredUniversities = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (row) =>
        (row.UniversityName || "").toLowerCase().includes(q) ||
        (row.Rank ? row.Rank.toString() : "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // Filtering for Scholars
  const filteredScholars = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((row) =>
      (row.scholarship_name || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // Filtering for Fields
  const filteredFields = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (row) => (row.name || "").toLowerCase().includes(q) // "name" is real key
    );
  }, [items, query]);

  // Filtering for UniSubjects
  const filteredUnisubjects = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (row) => (row.subject || "").toLowerCase().includes(q) // "subject" is real key
    );
  }, [items, query]);

  // Filtering for Cost
  const filteredCost = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (row) =>
        (row.University || "").toLowerCase().includes(q) ||
        (row.Tuition_USD ? row.Tuition_USD.toString() : "")
          .toLowerCase()
          .includes(q) ||
        (row.Rent_USD ? row.Rent_USD.toString() : "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const activeFiltered = useMemo(() => {
    switch (selectedPage) {
      case "users":
        return filteredUsers;
      case "universities":
        return filteredUniversities;
      case "scholarships":
        return filteredScholars;
      case "fields":
        return filteredFields;
      case "unisubjects":
        return filteredUnisubjects;
      case "cost":
        return filteredCost;
      default:
        return items;
    }
  }, [
    selectedPage,
    filteredUsers,
    filteredUniversities,
    filteredScholars,
    filteredFields,
    filteredUnisubjects,
    filteredCost,
    items,
  ]);

  // Pagination logic
  const totalPages = Math.ceil(activeFiltered.length / ROWS_PER_PAGE);
  const paginatedItems = activeFiltered.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  // Delete item
  // Delete item (fixed)
  // Delete item (fixed with logging)
  async function deleteItem(id) {
    if (!id) {
      console.error("deleteItem called with invalid ID:", id);
      setErrorMessage("Invalid ID. Cannot delete item.");
      return;
    }

    try {
      let endpoint = "";
      switch (selectedPage) {
        case "users":
          endpoint = "users";
          break;
        case "scholarships":
          endpoint = "scholarships";
          break;
        case "universities":
          endpoint = "universities";
          break;
        case "fields":
          endpoint = "fields";
          break;
        case "unisubjects":
          endpoint = "unisubjects";
          break;
        case "cost":
          endpoint = "cost";
          break;
        default:
          throw new Error("Invalid page for deletion");
      }

      const url = `${API_BASE}/admin/${endpoint}/${id}`;
      console.log("Deleting item:", selectedPage, "ID:", id, "URL:", url);

      const res = await fetch(url, { method: "DELETE" });

      if (!res.ok) {
        const text = await res.text();
        console.error("Server returned error:", res.status, text);
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      console.log("Delete success:", result);

      setItems((prev) => prev.filter((i) => (i._id || i.id) !== id));
      setDeleteId(null);
      setErrorMessage(""); // Clear previous error
    } catch (err) {
      console.error("Delete error:", err);
      setErrorMessage("Failed to delete item. Check console for details.");
    }
  }

  // Open edit modal
  function openEdit(item) {
    // Directly use the item from your table (no extra GET request)
    setEditForm(item);
    setShowEditModal(true);
  }

  // Submit edit
  // Rename submitEdit -> handleSave
  const handleSave = async () => {
    console.log("Starting handleSave...");
    console.log("Selected page:", selectedPage);
    console.log("Edit form data:", editForm);

    try {
      let endpoint = selectedPage;
      if (selectedPage === "scholarships") endpoint = "scholarships";

      const url = `${API_BASE}/admin/${endpoint}/${editForm._id}`;
      console.log("PUT request URL:", url);

      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      console.log("Raw response:", response);

      if (!response.ok) {
        const text = await response.text();
        console.error("Server returned error:", text);
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("Update successful:", result);

      // Update local state
      setItems((prev) =>
        prev.map((item) =>
          item._id === editForm._id ? { ...item, ...editForm } : item
        )
      );

      setShowEditModal(false);
    } catch (err) {
      console.error("handleSave error:", err);
      alert(
        "Failed to connect to MongoDB. Try again. Check console for details."
      );
    }
  };

  // Right panel content
  const rightPanelContent = () => {
    if (loading)
      return (
        <div className="p-6">
          <Loader2 className="animate-spin w-6 h-6 text-gray-400" />
        </div>
      );
    if (errorMessage)
      return (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
          {errorMessage}
        </div>
      );

    if (selectedPage === "admin") {
      return <AdminProfile embedded />; // use the compact/embedded variant
    }

    if (selectedPage === "dashboard") {
      return <Admin_Dashboard />; // ✅ render the component
    }

    if (!activeFiltered || activeFiltered.length === 0)
      return <div className="p-6 text-gray-500">No data available</div>;

    let cols = [];
    if (selectedPage === "scholarships") cols = ["scholarship_name"];
    else if (selectedPage === "universities") cols = ["UniversityName", "Rank"];
    else if (selectedPage === "fields") cols = ["name"];
    else if (selectedPage === "unisubjects") cols = ["subject"];
    else if (selectedPage === "cost")
      cols = ["University", "Tuition_USD", "Rent_USD"];
    else if (activeFiltered.length > 0)
      cols = Object.keys(activeFiltered[0]).filter(
        (k) => !["_id", "id", "password", "__v"].includes(k)
      );

    return (
      <div className="overflow-x-auto p-4">
        <table className="min-w-full table-auto bg-white rounded-xl shadow overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left px-4 py-2">
                  {c}
                </th>
              ))}
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedItems.map((item) => {
              const showEdit = selectedPage !== "users";
              const showExpand = selectedPage === "users";

              return (
                <tr
                  key={item._id || item.id}
                  className="border-b last:border-0"
                >
                  {cols.map((c) => (
                    <td
                      key={c}
                      className="px-4 py-2 text-left whitespace-nowrap"
                    >
                      {item[c]}
                    </td>
                  ))}

                  {/* One and only Actions cell */}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {showEdit && (
                        <button
                          onClick={() => openEdit(item)}
                          className="text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteId(item._id || item.id)}
                        className="text-red-600 px-2 py-1 rounded border border-red-200 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {showExpand && (
                        <button
                          onClick={() => {
                            setSelectedUser(item);
                            setIsDetailsOpen(true);
                          }}
                          className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                          Expand
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {/* Pagination */}
        <div className="flex justify-between items-center mt-3 gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
          >
            Prev
          </button>

          <div className="flex items-center gap-2">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                let val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  val = Math.max(1, Math.min(val, totalPages));
                  setCurrentPage(val);
                }
              }}
              className="w-12 text-center border rounded px-1 py-0.5"
            />
            <span>of {totalPages}</span>
          </div>

          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // Submit new Scholar or University
  async function submitAdd() {
    try {
      let endpoint = selectedPage;
      if (
        ![
          "scholarships",
          "universities",
          "fields",
          "unisubjects",
          "cost",
        ].includes(endpoint)
      ) {
        setShowAddModal(false);
        return;
      }

      const url = `${API_BASE}/admin/${endpoint}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const newItem = await res.json();
      setItems((prev) => [...prev, newItem]);
      setShowAddModal(false);
      setAddForm({});
      resetSelections(); // Reset selections after successful submission
    } catch (err) {
      console.error("submitAdd error:", err);
      alert("Failed to add. Check console for details.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F3F7] flex flex-col">
      {/* Top Nav */}
      <header className="bg-[#254085] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 font-bold text-lg">
          <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded" />
          ScholarSync
        </div>

        <div className="flex items-center gap-2">
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-80 w-4 h-4" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="pl-9 pr-3 py-2 rounded-full text-white-900 text-sm w-48
                     border border-gray-300 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {(selectedPage === "scholarships" ||
            selectedPage === "universities" ||
            selectedPage === "fields" ||
            selectedPage === "unisubjects" ||
            selectedPage === "cost") && (
            <button
              onClick={() => {
                // (your same add-form setup code)
                if (selectedPage === "scholarships")
                  setAddForm({
                    scholarship_name: "",
                    provider: "",
                    country: "",
                  });
                if (selectedPage === "universities")
                  setAddForm({ UniversityName: "", Rank: "" });
                if (selectedPage === "fields") setAddForm({ name: "" });
                if (selectedPage === "unisubjects") setAddForm({ subject: "" });
                if (selectedPage === "cost")
                  setAddForm({
                    Country: "",
                    City: "",
                    University: "",
                    Program: "",
                    Level: "",
                    Tuition_USD: "",
                    Rent_USD: "",
                  });
                setShowAddModal(true);
              }}
              className="bg-white text-[#254085] px-3 py-2 rounded-full flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex w-full min-h-screen bg-[#F2F3F7]">
        {/* Sidebar */}
        <aside
          className="
    w-64 bg-white rounded-xl shadow p-6
    sticky top-0 self-start
    max-h-screen overflow-y-auto
    flex flex-col justify-between
  "
        >
          <div className="space-y-4">
            <div className="font-bold text-2xl mb-4">Admin Panel</div>
            {[
              { name: "dashboard", icon: PieChart },
              { name: "users", icon: Users },
              { name: "scholarships", icon: GraduationCap },
              { name: "universities", icon: Building2 },
              { name: "fields", icon: Book }, // NEW
              { name: "unisubjects", icon: Notebook }, // NEW
              { name: "cost", icon: DollarSign }, // NEW
              { name: "admin", icon: User },
            ].map((sectionItem) => (
              <button
                key={sectionItem.name}
                onClick={() => {
                  setSelectedPage(sectionItem.name);
                  setQuery(""); // <--- Clear search query when changing tab
                }}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-gray-50 ${
                  selectedPage === sectionItem.name ? "bg-gray-100" : ""
                }`}
              >
                <sectionItem.icon className="w-6 h-6" />
                <span className="text-lg">
                  {sectionItem.name === "admin"
                    ? "Profile"
                    : sectionItem.name.charAt(0).toUpperCase() +
                      sectionItem.name.slice(1)}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={() => setShowLogout(true)}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 text-lg"
            >
              <LogOut className="w-6 h-6" /> Logout
            </button>
          </div>
        </aside>

        {/* Right panel */}
        <main className="flex-1 overflow-x-auto">{rightPanelContent()}</main>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-4xl mx-4 md:mx-auto overflow-y-auto max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Add to {selectedPage}</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetSelections(); // Reset selections when closing modal
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault(); // prevent page reload
                submitAdd(); // call your submit logic
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {/* Scholarship Form */}
              {selectedPage === "scholarships" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Scholarship Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#254085]"
                      value={addForm.scholarship_name || ""}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          scholarship_name: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Provider *
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#254085]"
                      value={addForm.provider || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, provider: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Country *
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#254085]"
                      value={addForm.country || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, country: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Fields *
                    </label>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraftFields(selectedFields);
                        setShowFieldSelector(true);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-left bg-gray-50"
                    >
                      {selectedFields.length > 0
                        ? selectedFields.join(", ")
                        : "Select Fields"}
                    </button>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Level *
                    </label>
                    <select
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      value={addForm.level || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, level: e.target.value })
                      }
                    >
                      <option value="">Select Level</option>
                      <option>Bachelor</option>
                      <option>Master</option>
                      <option>PhD</option>
                      <option>Postdoctoral</option>
                      <option>Diploma</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Minimum GPA *
                    </label>
                    {addForm.min_gpa === "other" ? (
                      <input
                        type="text"
                        placeholder="Enter GPA"
                        required
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        value={addForm.min_gpa_text || ""}
                        onChange={(e) =>
                          setAddForm({
                            ...addForm,
                            min_gpa_text: e.target.value,
                          })
                        }
                      />
                    ) : (
                      <select
                        required
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        value={addForm.min_gpa || "Not Specified"}
                        onChange={(e) =>
                          setAddForm({ ...addForm, min_gpa: e.target.value })
                        }
                      >
                        <option value="Not Specified">Not Specified</option>
                        <option value="other">Other</option>
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Deadline *
                    </label>
                    <input
                      type="date"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#254085]"
                      value={addForm.deadline || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, deadline: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Amount (Optional)
                    </label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      value={addForm.amount || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, amount: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Type *
                    </label>
                    <select
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      value={addForm.type || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, type: e.target.value })
                      }
                    >
                      <option value="">Select Type</option>
                      <option>Partial</option>
                      <option>Full</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Eligibility *
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      value={addForm.eligibility || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, eligibility: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Eligible Gender *
                    </label>
                    <select
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      value={addForm.eligibility_gender || ""}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          eligibility_gender: e.target.value,
                        })
                      }
                    >
                      <option value="">Select Gender</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>All</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Eligible Country *
                    </label>
                    {addForm.eligibility_country === "other" ? (
                      <input
                        type="text"
                        placeholder="Enter country"
                        required
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        value={addForm.eligibility_country_text || ""}
                        onChange={(e) =>
                          setAddForm({
                            ...addForm,
                            eligibility_country_text: e.target.value,
                          })
                        }
                      />
                    ) : (
                      <select
                        required
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        value={addForm.eligibility_country || "International"}
                        onChange={(e) =>
                          setAddForm({
                            ...addForm,
                            eligibility_country: e.target.value,
                          })
                        }
                      >
                        <option value="International">International</option>
                        <option value="other">Other</option>
                      </select>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">
                      Link *
                    </label>
                    <input
                      type="url"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#254085]"
                      value={addForm.link || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, link: e.target.value })
                      }
                    />
                  </div>
                </>
              )}

              {/* Universities Form */}
              {/* Universities Form */}
              {selectedPage === "universities" && (
                <>
                  {[
                    "University Name",
                    "Rank",
                    "Country",
                    "Number of Students",
                    "International Students",
                    "Overall Score",
                    "Teaching Score",
                    "Research Score",
                    "Image URL",
                    "Description",
                    "International Outlook Score",
                    "Website",
                  ].map((field, idx) => (
                    <div key={idx}>
                      <label className="text-sm font-medium text-gray-700">
                        {field}
                      </label>
                      {field === "Description" ? (
                        <textarea
                          required
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#254085]"
                          value={addForm.Description || ""}
                          onChange={(e) =>
                            setAddForm({
                              ...addForm,
                              Description: e.target.value,
                            })
                          }
                        />
                      ) : (
                        <input
                          type="text"
                          required
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#254085]"
                          value={addForm[field.replace(/\s/g, "")] || ""}
                          onChange={(e) =>
                            setAddForm({
                              ...addForm,
                              [field.replace(/\s/g, "")]: e.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  ))}

                  {/* Subjects Selector */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Subjects *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftSubjects(selectedSubjects);
                        setShowSubjectSelector(true);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-left bg-gray-50"
                    >
                      {selectedSubjects.length > 0
                        ? selectedSubjects.join(", ")
                        : "Select Subjects"}
                    </button>
                  </div>
                </>
              )}

              {/* Add Form for new entry */}
              {selectedPage === "fields" && (
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Field Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.name || ""}
                    onChange={(e) =>
                      setAddForm({ ...addForm, name: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              )}

              {selectedPage === "unisubjects" && (
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.subject || ""}
                    onChange={(e) =>
                      setAddForm({ ...addForm, subject: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              )}

              {selectedPage === "cost" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Country *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.Country || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, Country: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.City || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, City: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      University *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.University || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, University: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Program *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.Program || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, Program: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Level *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.Level || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, Level: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Duration (Years) *
                    </label>
                    <input
                      type="number"
                      required
                      value={addForm.Duration_Years || ""}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          Duration_Years: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Tuition (USD) *
                    </label>
                    <input
                      type="number"
                      required
                      value={addForm.Tuition_USD || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, Tuition_USD: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Rent_USD *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={addForm.Rent_USD || ""}
                      onChange={(e) =>
                        setAddForm({ ...addForm, Rent_USD: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </div>
                </>
              )}

              {/* Buttons */}
              <div className="md:col-span-2 flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#254085] text-white"
                >
                  Add
                </button>
              </div>
            </form>
            {/* Field Selector Modal */}
            {showFieldSelector && (
              <div className="fixed inset-0 flex items-center justify-center z-50">
                <div
                  className="bg-white p-6 rounded-lg shadow-lg w-[900px] max-h-[80vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-lg">Select Fields</h3>
                    <button
                      onClick={() => {
                        setDraftFields(selectedFields);
                        setShowFieldSelector(false);
                      }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Fields list in 3-column grid */}
                  <div className="grid grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                    {allFields?.length > 0 ? (
                      allFields.map((field) => {
                        //const checked = draftFields.includes(field.id);

                        return (
                          <label
                            key={field.id || field.name}
                            className="flex items-center gap-2 whitespace-normal break-words"
                          >
                            <input
                              type="checkbox"
                              checked={draftFields.includes(field.id)}
                              onChange={(e) => {
                                const checkedNow = e.target.checked;
                                const anyField = allFields.find(
                                  (f) => f.name === "Any"
                                );

                                setDraftFields((prev) => {
                                  if (field.name === "Any") {
                                    // Selecting/unselecting Any
                                    return checkedNow ? [field.id] : [];
                                  }

                                  // If Any is already selected, allow toggling other fields visually
                                  if (anyField && prev.includes(anyField.id)) {
                                    if (checkedNow) {
                                      // show as checked visually, but keep Any as the only saved
                                      return [...prev, field.id];
                                    } else {
                                      return prev.filter((f) => f !== field.id);
                                    }
                                  }

                                  // Normal case
                                  if (checkedNow) {
                                    return [...prev, field.id];
                                  } else {
                                    return prev.filter((f) => f !== field.id);
                                  }
                                });
                              }}
                            />

                            <span>{field.name}</span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="text-gray-500 text-sm">
                        No fields available
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftFields(selectedFields);
                        setShowFieldSelector(false);
                      }}
                      className="px-3 py-1 rounded bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        let finalSelection = draftFields;
                        const anyField = allFields.find(
                          (f) => f.name === "Any"
                        );

                        if (anyField && draftFields.includes(anyField.id)) {
                          finalSelection = [anyField.id]; // force only Any
                        }

                        setSelectedFields(finalSelection);
                        setAddForm((prev) => ({
                          ...prev,
                          fields: finalSelection,
                        }));
                        setShowFieldSelector(false);
                      }}
                      className="px-3 py-1 rounded bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Subject Selector Modal */}
            {showSubjectSelector && (
              <div className="fixed inset-0 flex items-center justify-center z-50">
                <div
                  className="bg-white p-6 rounded-lg shadow-lg w-[900px] max-h-[80vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-lg">Select Subjects</h3>
                    <button
                      onClick={() => {
                        setDraftSubjects(selectedSubjects);
                        setShowSubjectSelector(false);
                      }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Subjects list in 3-column grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {allSubjects.map((subj) => {
                      const name = subj.subject || subj.name;
                      const checked = draftSubjects.includes(subj.id);
                      return (
                        <label
                          key={subj._id || subj.id || name}
                          className="flex items-center gap-2 whitespace-normal break-words"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const checkedNow = e.target.checked;
                              setDraftSubjects((prev) => {
                                if (checkedNow) {
                                  return prev.includes(subj.id)
                                    ? prev
                                    : [...prev, subj.id]; // ✅ save ID
                                } else {
                                  return prev.filter((s) => s !== subj.id); // ✅ remove by ID
                                }
                              });
                            }}
                          />
                          <span>{subj.subject || subj.name}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftSubjects(selectedSubjects);
                        setShowSubjectSelector(false);
                      }}
                      className="px-3 py-1 rounded bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubjects(draftSubjects);
                        setAddForm((prev) => ({
                          ...prev,
                          subjects: draftSubjects,
                        }));
                        setShowSubjectSelector(false);
                      }}
                      className="px-3 py-1 rounded bg-blue-500 text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Edit {selectedPage}</h3>
              <button onClick={() => setShowEditModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(editForm).map((key) => {
                if (["_id", "id", "__v", "password"].includes(key)) return null;

                return (
                  <div key={key} className="flex flex-col">
                    <label className="text-sm text-gray-600">
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </label>
                    <input
                      className="mt-1 w-full rounded-xl border px-3 py-2"
                      value={editForm[key] || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-[#254085] text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UserDetailModal */}
      {isDetailsOpen &&
        selectedUser &&
        (() => {
          // Compute dates
          const createdAt = selectedUser.created_at
            ? new Date(
                selectedUser.created_at.replace(/"/g, "")
              ).toLocaleString()
            : "N/A";

          const updatedAt = selectedUser.updatedAt
            ? new Date(
                selectedUser.updatedAt.replace(/"/g, "")
              ).toLocaleString()
            : "N/A";

          console.log("Selected user:", selectedUser);

          return (
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
                <h2 className="text-xl font-semibold mb-4">User Details</h2>
                <div className="space-y-2">
                  <p>
                    <span className="font-semibold">ID:</span>{" "}
                    {selectedUser._id}
                  </p>
                  <p>
                    <span className="font-semibold">Email:</span>{" "}
                    {selectedUser.email}
                  </p>
                  <p>
                    <span className="font-semibold">Password:</span>{" "}
                    {selectedUser.password}
                  </p>
                  <p>
                    <span className="font-semibold">Created At:</span>{" "}
                    {createdAt}
                  </p>
                  <p>
                    <span className="font-semibold">Updated At:</span>{" "}
                    {updatedAt}
                  </p>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setIsDetailsOpen(false)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Confirm Delete */}
      {deleteId && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-3">Delete item?</h3>
            <p className="text-gray-600 mb-6">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteItem(deleteId)}
                className="px-4 py-2 bg-red-600 text-white rounded-xl"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Logout */}
      {showLogout && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-3">Confirm Logout?</h3>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogout(false)}
                className="px-4 py-2 bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                // keeps browser history (Back goes to previous page)
                onClick={() => {
                  setShowLogout(false);
                  // clear any auth if you store it
                  localStorage.removeItem("token");
                  localStorage.removeItem("user");
                  window.location.href = "/authpage";
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
