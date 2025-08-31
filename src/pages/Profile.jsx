// src/pages/Profile.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export default function Profile() {
  const navigate = useNavigate();

  // who am I
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = localStorage.getItem("userId") || storedUser.userId || "";

  // state
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [profilePic, setProfilePic] = useState("https://i.pravatar.cc/180");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [isEditing, setIsEditing] = useState(true); // start editable so user can add name

  // avatar controls
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarChoices = [
    "https://i.pravatar.cc/180?u=1",
    "https://i.pravatar.cc/180?u=2",
    "https://i.pravatar.cc/180?u=3",
    "https://i.pravatar.cc/180?u=4",
    "https://i.pravatar.cc/180?u=5",
  ];
  const [customAvatar, setCustomAvatar] = useState("");
  const fileRef = useRef(null);

  // password change controls
  const [currPw, setCurrPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showCurrPw, setShowCurrPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  useEffect(() => {
    if (!userId) {
      navigate("/authpage");
      return;
    }
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const r = await fetch(`${API_BASE}/users/${userId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setProfilePic(data.profilePic || "https://i.pravatar.cc/180");
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setEmail(data.email || "");
      } catch (e) {
        console.error(e);
        setMsg("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, navigate]);

  const saveAll = async () => {
    setMsg("");
    try {
      if (!email.includes("@")) throw new Error("Please enter a valid email.");

      const r = await fetch(`${API_BASE}/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          profilePic,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Update failed");

      // keep localStorage in sync if email changed
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const next = { ...user, email, name: firstName || user.name || "User" };
      localStorage.setItem("user", JSON.stringify(next));
      localStorage.setItem("authUser", JSON.stringify({ email }));
      localStorage.setItem("auth_email", email);
      window.dispatchEvent(new Event("auth-changed"));

      setMsg("Profile saved!");
      setIsEditing(false);
    } catch (e) {
      setMsg(e.message || "Update failed");
    }
  };

 const updateAvatar = async (url) => {
  try {
    const r = await fetch(`${API_BASE}/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profilePic: url }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || "Avatar update failed");

    setProfilePic(url);
    setShowAvatarModal(false);
    setMsg("Profile picture updated!");

    // 🔔 tell the navbar to refresh avatar
    window.dispatchEvent(new Event("profile-updated"));
  } catch (e) {
    setMsg(e.message || "Avatar update failed");
  }
};

  // password change call
  const changePassword = async () => {
    setMsg("");
    try {
      if (!currPw) throw new Error("Please enter your current password.");
      if (!newPw || newPw.length < 6)
        throw new Error("New password must be at least 6 characters.");

      const r = await fetch(`${API_BASE}/users/${userId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currPw, newPassword: newPw }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Password change failed");

      setMsg("Password updated!");
      setCurrPw("");
      setNewPw("");
      setShowCurrPw(false);
      setShowNewPw(false);
    } catch (e) {
      setMsg(e.message || "Password change failed");
    }
  };

  // upload
  const onPickFile = () => fileRef.current?.click();
  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    setUploading(true);

    try {
      const localPreview = URL.createObjectURL(file);
      setProfilePic(localPreview);

      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/upload/avatar`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.detail || "Upload failed");
      }
      await updateAvatar(data.url);
    } catch (err) {
      console.error(err);
      setMsg(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F3F7] flex items-center justify-center">
        <div className="text-[#254085] font-semibold">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F3F7] py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-6 md:p-10">
        <h2 className="text-2xl font-bold text-[#254085] mb-6">My Profile</h2>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <img
            src={profilePic}
            alt="Avatar"
            className="w-36 h-36 rounded-full object-cover border-8 border-[#254085] shadow-md"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={onPickFile}
              className="px-5 py-2 rounded-lg bg-[#254085] text-white font-semibold hover:opacity-90 disabled:opacity-60"
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload from device"}
            </button>
            <button
              onClick={() => setShowAvatarModal(true)}
              className="px-5 py-2 rounded-lg border font-semibold hover:bg-gray-50"
            >
              Presets / URL
            </button>
          </div>

          {/* hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileSelected}
          />
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={!isEditing}
            className={`w-full rounded-lg border px-3 py-3 ${
              isEditing ? "bg-white" : "bg-gray-100"
            }`}
          />
          <input
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={!isEditing}
            className={`w-full rounded-lg border px-3 py-3 ${
              isEditing ? "bg-white" : "bg-gray-100"
            }`}
          />
          <div className="md:col-span-2">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isEditing}
              className={`w-full rounded-lg border px-3 py-3 ${
                isEditing ? "bg-white" : "bg-gray-100"
              }`}
            />
          </div>
        </div>

        {/* Change Password */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[#254085] mb-3">
            Change Password
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type={showCurrPw ? "text" : "password"}
                value={currPw}
                onChange={(e) => setCurrPw(e.target.value)}
                placeholder="Current password"
                className="flex-1 rounded-lg border px-3 py-3"
              />
              <button
                type="button"
                onClick={() => setShowCurrPw((v) => !v)}
                className="px-4 py-2 rounded-lg border"
              >
                {showCurrPw ? "Hide" : "Show"}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type={showNewPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (min 6 chars)"
                className="flex-1 rounded-lg border px-3 py-3"
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                className="px-4 py-2 rounded-lg border"
              >
                {showNewPw ? "Hide" : "Show"}
              </button>
            </div>
            <div>
              <button
                onClick={changePassword}
                className="px-5 py-2 bg-[#254085] text-white rounded-lg"
              >
                Change Password
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Password changes are processed securely on the server via a
              dedicated endpoint.
            </p>
          </div>
        </div>

        {/* Messages */}
        {msg && (
          <div
            className={`mt-4 text-sm ${
              msg.toLowerCase().includes("saved") ||
              msg.toLowerCase().includes("updated")
                ? "text-emerald-600"
                : "text-red-600"
            }`}
          >
            {msg}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-5 py-2 bg-[#254085] text-white rounded-lg"
            >
              Edit Profile
            </button>
          ) : (
            <>
              <button
                onClick={saveAll}
                className="px-5 py-2 bg-[#254085] text-white rounded-lg"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  window.location.reload(); // discard unsaved edits
                }}
                className="px-5 py-2 border rounded-lg"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Avatar Modal (presets + URL) */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#254085]">
                Change Profile Picture
              </h3>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="text-2xl leading-none px-2"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3 mb-4">
              {avatarChoices.map((url) => (
                <button
                  key={url}
                  onClick={() => updateAvatar(url)}
                  className="rounded-full overflow-hidden border-2 border-transparent hover:border-[#254085] transition"
                  title="Use this avatar"
                >
                  <img src={url} alt="avatar" className="w-16 h-16 object-cover" />
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={customAvatar}
                onChange={(e) => setCustomAvatar(e.target.value)}
                placeholder="Paste image URL…"
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <button
                onClick={() => customAvatar && updateAvatar(customAvatar)}
                className="px-4 py-2 bg-[#254085] text-white rounded-lg disabled:opacity-50"
                disabled={!customAvatar}
              >
                Use URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
