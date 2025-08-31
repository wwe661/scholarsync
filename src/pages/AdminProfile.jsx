import React, { useEffect, useMemo, useState } from "react";

/* ===================== Config ===================== */
const API = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:8000";

/* ===================== Helpers ===================== */
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    // try JSON first (from a clone so we can still read text if needed)
    let msg = res.statusText || "Request failed";
    try {
      const j = await res.clone().json();
      msg = (j && j.detail) ?? JSON.stringify(j) ?? msg;
    } catch {
      // Fallback to plain text
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  return res.json();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function scorePassword(pw) {
  const s = String(pw || "");
  let score = 0;
  if (s.length >= 8) score++;
  if (/[A-Z]/.test(s)) score++;
  if (/[a-z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  return score; // 0..5
}

/* ===================== Tiny toast system ===================== */
function useToasts() {
  const [toasts, setToasts] = useState([]);

  const push = (type, text) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2500);
  };

  const Toasts = () => (
    <div className="fixed top-5 right-5 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "rounded-xl px-4 py-2 shadow-lg text-sm text-white " +
            (t.type === "success"
              ? "bg-emerald-600"
              : t.type === "error"
              ? "bg-rose-600"
              : "bg-slate-700")
          }
        >
          {t.text}
        </div>
      ))}
    </div>
  );

  return {
    Toasts,
    success: (t) => push("success", t),
    error: (t) => push("error", t),
    info: (t) => push("info", t),
  };
}

/* ===================== UI bits ===================== */
function Label({ children }) {
  return <div className="text-xs font-medium text-slate-500">{children}</div>;
}

function Section({ title, icon, children }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <div className="text-slate-400">{icon}</div>
        <h3 className="text-slate-800 font-semibold">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EyeButton({ onClick, sr = "toggle visibility" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600"
      aria-label={sr}
    >
      👁
    </button>
  );
}
// ---- icons ----
const MailIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    {...props}
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

const LockIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    {...props}
  >
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

// optional: nice badge behind the icon
const IconBadge = ({ children }) => (
  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
    {children}
  </span>
);

/* ===================== Main ===================== */
export default function AdminProfile() {
  const { Toasts, success, error } = useToasts();

  // ---- state
  const [loading, setLoading] = useState(false); // now USED to disable buttons/spinners
  const [profile, setProfile] = useState({ email: "" });

  // email
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState("");
  const emailValid = useMemo(
    () => EMAIL_RE.test((email || "").trim()),
    [email]
  );
  const [savingEmail, setSavingEmail] = useState(false);

  // password
  const [editingPw, setEditingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState(""); // pulled from backend (plain or hash per your backend)
  const [showOldPw, setShowOldPw] = useState(false); // toggle how placeholder looks
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const pwScore = useMemo(() => scorePassword(newPw), [newPw]);
  const pwMatch = newPw && newPw === newPw2;

  // ---- load profile (once)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchJSON(`${API}/admin/profile?include_password=1`);
        if (cancel) return;
        setProfile(data || {});
        setEmail(data?.email || "");
        setCurrentPw(data?.password || "");
      } catch (e) {
        error(e.message || "Failed to load profile");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // we intentionally run this only once

  /* --------------- Email actions --------------- */
  async function saveEmail() {
    if (!emailValid) return;
    try {
      setSavingEmail(true);
      setLoading(true);
      await fetchJSON(`${API}/admin/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setProfile((p) => ({ ...p, email }));
      setEditingEmail(false);
      success("Email updated successfully.");
    } catch (e) {
      error(e.message || "Update failed");
    } finally {
      setSavingEmail(false);
      setLoading(false);
    }
  }

  /* --------------- Password actions --------------- */
  async function savePassword() {
    if (!newPw || !pwMatch || pwScore < 3) return;
    try {
      setSavingPw(true);
      setLoading(true);
      await fetchJSON(`${API}/admin/profile/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: currentPw, new_password: newPw }),
      });
      // clear inputs; refresh current pw (backend will echo plain/hash by your setup)
      setNewPw("");
      setNewPw2("");
      setEditingPw(false);
      success("Password updated successfully.");
      try {
        const data = await fetchJSON(`${API}/admin/profile?include_password=1`);
        setCurrentPw(data?.password || "");
      } catch {
        /* ignore */
      }
    } catch (e) {
      error(e.message || "Update failed");
    } finally {
      setSavingPw(false);
      setLoading(false);
    }
  }

  const disableAll = loading || savingEmail || savingPw;

  /* ===================== Render ===================== */
  return (
    <div className="p-6 lg:p-8">
      <Toasts />

      <h1 className="mb-6 text-2xl font-semibold text-slate-800">
        Admin — Account settings
      </h1>

      {/* Email */}
      <Section
        title="Admin Email"
        icon={
          <IconBadge>
            <MailIcon />
          </IconBadge>
        }
      >
        {!editingEmail ? (
          <div className="flex items-end justify-between gap-4">
            <div className="w-full">
              <Label>Email</Label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800"
                value={profile.email || ""}
                readOnly
              />
            </div>
            <button
              className="rounded-xl border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setEditingEmail(true);
                setEmail(profile.email || "");
              }}
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <input
                className={
                  "mt-1 w-full rounded-xl border px-3 py-2 " +
                  (emailValid
                    ? "border-slate-300 focus:border-slate-400"
                    : "border-rose-300 focus:border-rose-400")
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
                autoFocus
              />
              {!emailValid && (
                <div className="mt-1 text-xs text-rose-600">
                  Please enter a valid email address.
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setEditingEmail(false);
                  setEmail(profile.email || "");
                }}
                disabled={disableAll}
              >
                Cancel
              </button>
              <button
                className={
                  "rounded-xl px-4 py-2 text-white " +
                  (emailValid && !disableAll
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-indigo-300")
                }
                onClick={saveEmail}
                disabled={!emailValid || disableAll}
              >
                {savingEmail ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </Section>

      <div className="h-6" />

      {/* Password */}
      <Section
        title="Admin Password"
        icon={
          <IconBadge>
            <LockIcon />
          </IconBadge>
        }
      >
        {!editingPw ? (
          <div className="flex items-end justify-between gap-4">
            <div className="w-full">
              <Label>Current Password</Label>
              <div className="relative">
                {/* Show masked value, read-only */}
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                  type={showOldPw ? "text" : "password"} // 👈 toggle type
                  value={currentPw}
                  readOnly // still read-only
                />
                <EyeButton onClick={() => setShowOldPw((s) => !s)} />{" "}
                {/* 👁 toggle here too */}
              </div>
            </div>
            <button
              className="rounded-xl border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => setEditingPw(true)}
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current password: read-only, NON-typable, placeholder shows the real pw/hash */}
            <div>
              <Label>Current Password</Label>
              <div className="relative">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800"
                  type={showOldPw ? "text" : "password"} // 👈 toggle type
                  value={currentPw}
                  readOnly // still read-only
                />
                <EyeButton onClick={() => setShowOldPw((s) => !s)} />
              </div>
            </div>

            <div>
              <Label>New Password</Label>
              <div className="relative">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder=""
                  autoComplete="new-password"
                />
              </div>

              {/* Show meter + label only when user types */}
              {newPw.length > 0 && (
                <>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className={
                        "h-1 transition-all " +
                        (pwScore <= 1
                          ? "bg-rose-500 w-1/5"
                          : pwScore === 2
                          ? "bg-orange-500 w-2/5"
                          : pwScore === 3
                          ? "bg-yellow-500 w-3/5"
                          : pwScore === 4
                          ? "bg-lime-500 w-4/5"
                          : "bg-emerald-500 w-full")
                      }
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {
                      ["Very weak", "Weak", "Okay", "Strong", "Very strong"][
                        Math.max(0, pwScore - 1)
                      ]
                    }
                  </div>
                </>
              )}
            </div>

            <div>
              <Label>Confirm New Password</Label>
              <div className="relative">
                <input
                  className={
                    "mt-1 w-full rounded-xl border px-3 py-2 " +
                    (!newPw || pwMatch ? "border-slate-300" : "border-rose-300")
                  }
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                  type="password"
                  placeholder="Re-type new password"
                />
              </div>
              {!pwMatch && newPw2 && (
                <div className="mt-1 text-xs text-rose-600">
                  Passwords do not match.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setEditingPw(false);
                  setNewPw("");
                  setNewPw2("");
                }}
                disabled={disableAll}
              >
                Cancel
              </button>
              <button
                className={
                  "rounded-xl px-4 py-2 text-white " +
                  (newPw && pwMatch && pwScore >= 3 && !disableAll
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-indigo-300")
                }
                onClick={savePassword}
                disabled={!newPw || !pwMatch || pwScore < 3 || disableAll}
              >
                {savingPw ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
