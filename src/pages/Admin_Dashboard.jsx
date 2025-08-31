// src/pages/Admin_Dashboard.jsx
import React, { useEffect, useState } from "react";
import {
  Users as UsersIcon,
  GraduationCap as GraduationCapIcon,
  Building2 as Building2Icon,
  CalendarDays,
  Clock,
  Trophy,
  X,
  ExternalLink,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Admin_Dashboard() {
  // ---- counters -------------------------------------------------------------
  const [counts, setCounts] = useState({
    users: 0,
    scholars: 0,
    universities: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ---- list panels ----------------------------------------------------------
  const [recentUsers, setRecentUsers] = useState([]);
  const [closingSoon, setClosingSoon] = useState([]);
  const [topUniversities, setTopUniversities] = useState([]);

  // ---- modals ---------------------------------------------------------------
  const [openScholar, setOpenScholar] = useState(null); // object or null
  const [openUni, setOpenUni] = useState(null); // object or null

  // Single effect to fetch everything once
  useEffect(() => {
    let cancelled = false;

    const okJson = (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };

    const toArray = (x) =>
      Array.isArray(x?.items) ? x.items : Array.isArray(x) ? x : [];
    const getCount = (x) =>
      Array.isArray(x?.items)
        ? x.items.length
        : typeof x?.total === "number"
        ? x.total
        : Array.isArray(x)
        ? x.length
        : 0;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [u, s, uni] = await Promise.all([
          fetch(`${API_BASE}/admin/users`).then(okJson),
          fetch(`${API_BASE}/admin/scholarships`).then(okJson),
          fetch(`${API_BASE}/admin/universities`).then(okJson),
        ]);
        if (cancelled) return;

        // counters
        setCounts({
          users: getCount(u),
          scholars: getCount(s),
          universities: getCount(uni),
        });

        // lists
        const usersArr = toArray(u);
        const schArr = toArray(s);
        const uniArr = toArray(uni);

        setRecentUsers(
          [...usersArr]
            .sort(
              (a, b) =>
                new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
            )
            .slice(0, 5)
        );

        const now = Date.now();
        setClosingSoon(
          [...schArr]
            .filter((x) => x?.deadline && !Number.isNaN(new Date(x.deadline)))
            .filter((x) => new Date(x.deadline).getTime() >= now)
            .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
            .slice(0, 5)
        );

        setTopUniversities(
          [...uniArr]
            .sort((a, b) => (a?.Rank ?? 1e9) - (b?.Rank ?? 1e9))
            .slice(0, 5)
        );
      } catch (e) {
        if (!cancelled) setErr("Failed to load dashboard data.");
        console.warn(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // API_BASE is static; empty deps keeps lint calm

  // ---- tiny utils -----------------------------------------------------------
  const fmtDate = (d) => {
    const dt = new Date(d);
    return Number.isNaN(+dt) ? "—" : dt.toLocaleDateString();
  };
  const daysLeft = (d) => {
    const t = new Date(d).getTime() - Date.now();
    if (Number.isNaN(t)) return "—";
    const days = Math.ceil(t / 86400000);
    return days <= 0 ? "Today" : `${days}d`;
  };

  // ---- local helpers/components (kept INSIDE this component) ---------------
  function CountUp({ value, duration = 800 }) {
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
      let raf;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setN(Math.round(eased * (Number(value) || 0)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, [value, duration]);
    return <>{n.toLocaleString()}</>;
  }

  const StatCard = ({
    label,
    value,
    Icon: IconComp,
    accent = "text-blue-600",
    chipBg = "bg-blue-50",
  }) => (
    <div className="relative rounded-2xl bg-white ring-1 ring-black/5 shadow-sm hover:shadow-md transition-shadow">
      <div className="absolute left-4 top-4">
        <div
          className={`h-9 w-9 rounded-full grid place-items-center ${chipBg} ring-1 ring-black/5`}
        >
          {IconComp ? (
            <IconComp className={`h-4 w-4 ${accent}`} aria-hidden="true" />
          ) : null}
        </div>
      </div>
      <div className="p-6 pl-16">
        <div className="text-gray-500 text-sm">{label}</div>
        <div
          className={`mt-1 text-3xl md:text-[34px] font-bold tabular-nums tracking-tight ${accent}`}
        >
          <CountUp value={value} />
        </div>
      </div>
    </div>
  );

  // Generic modal with dim background (no page jump)
  function Modal({
    open,
    title,
    onClose,
    children,
    widthClass = "w-[min(900px,90vw)]",
  }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50">
        {/* dimmed backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        {/* dialog */}
        <div className="absolute inset-0 overflow-y-auto">
          <div className="min-h-full flex items-start md:items-center justify-center p-4 md:p-6">
            <div
              className={`rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 ${widthClass}`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-semibold text-lg">{title}</h3>
                <button
                  onClick={onClose}
                  className="grid place-items-center h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-500"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-5">{children}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // label/value row for detail views
  const Row = ({ label, value, extra }) => (
    <div className="grid grid-cols-12 gap-4 py-3 border-b last:border-0">
      <div className="col-span-12 md:col-span-3 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="col-span-12 md:col-span-9 text-sm text-gray-900">
        <div className="flex items-center gap-2">
          <span className="truncate">{value ?? "—"}</span>
          {extra}
        </div>
      </div>
    </div>
  );

  const ScholarshipDetails = ({ s }) => {
    if (!s) return null;
    return (
      <div className="text-left">
        <Row
          label="Name"
          value={s.scholarship_name || s.name || "Scholarship"}
        />
        <Row
          label="Provider"
          value={s.provider || s.organization || s.funding_organization || "—"}
        />
        <Row label="Country" value={s.country || s.Country || "—"} />
        <Row
          label="Level"
          value={s.level || s.study_level || s.Degree || "—"}
        />
        <Row
          label="Deadline"
          value={`${fmtDate(s.deadline)} (${daysLeft(s.deadline)})`}
          extra={<Clock className="h-3.5 w-3.5 text-gray-500 shrink-0" />}
        />
        {/* No Amount row (removed as requested) */}
        {(s.url || s.link || s.website) && (
          <div className="pt-4">
            <a
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white text-sm px-3 py-2 hover:bg-indigo-700"
              href={s.url || s.link || s.website}
              target="_blank"
              rel="noreferrer"
            >
              Open scholarship page <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    );
  };

  const UniversityDetails = ({ u }) => {
    if (!u) return null;
    return (
      <div className="text-left">
        <Row label="Name" value={u.UniversityName || u.name || "University"} />
        <Row label="Country" value={u.Country || u.country || "—"} />
        <Row label="Rank" value={u.Rank ?? "—"} />
      </div>
    );
  };

  // ---- loading / error ------------------------------------------------------
  if (loading) {
    return (
      <div className="p-6">
        <div className="h-28 rounded-2xl bg-gray-100 animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }
  if (err)
    return <div className="p-6 text-red-600 bg-red-50 rounded">{err}</div>;

  // ---- UI -------------------------------------------------------------------
  return (
    <div className="space-y-6 p-6">
      {/* HERO */}
      <section
        className="relative mt-4 overflow-visible rounded-[28px] ring-1 ring-black/5
                   bg-gradient-to-br from-[#F4F1FF] via-[#EEE9FF] to-[#E9E5FF] mb-5"
      >
        <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-indigo-300/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-28 -bottom-28 h-72 w-72 rounded-full bg-fuchsia-300/25 blur-3xl" />
        <div className="relative px-8 py-4 md:px-12 md:py-6">
          <div className="max-w-none md:pr-[22rem]">
            <h1 className="text-[40px] md:text-[40px] leading-[1.05] font-extrabold text-[#0F172A] tracking-tight">
              Welcome Admin !!!
            </h1>
            <p className="mt-3 md:mt-4 text-[15px] md:text-[16px] text-[#334155]">
              Manage users, scholarships, and universities at a glance.
            </p>
          </div>
          <img
            src="/admin.png"
            alt="Admin illustration"
            draggable="false"
            className="pointer-events-none select-none absolute right-6 -top-20 md:-top-24 h-[280px] md:h-[360px] object-contain drop-shadow-2xl z-10"
          />
        </div>
      </section>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 md:mt-15">
        <StatCard
          label="Users"
          value={counts.users}
          Icon={UsersIcon}
          accent="text-blue-600"
          chipBg="bg-blue-50"
        />
        <StatCard
          label="Scholarships"
          value={counts.scholars}
          Icon={GraduationCapIcon}
          accent="text-amber-600"
          chipBg="bg-amber-50"
        />
        <StatCard
          label="Universities"
          value={counts.universities}
          Icon={Building2Icon}
          accent="text-green-600"
          chipBg="bg-green-50"
        />
      </div>

      {/* LIST PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Users (ID removed) */}
        <div className="rounded-2xl bg-white ring-1 ring-black/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <UsersIcon className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold">Recent Users</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentUsers.length === 0 && (
              <li className="py-3 text-sm text-gray-500">No users yet.</li>
            )}
            {recentUsers.map((u) => (
              <li key={u._id || u.id} className="py-3">
                <div className="text-sm font-medium truncate text-left">
                  {u.email || "user"}
                </div>
                <div className="text-xs text-gray-500 text-left">
                  Joined {fmtDate(u.created_at)}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Closing Soon Scholarships */}
        <div className="rounded-2xl bg-white ring-1 ring-black/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold">Closing Soon Scholarships</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {closingSoon.length === 0 && (
              <li className="py-3 text-sm text-gray-500">
                No upcoming deadlines.
              </li>
            )}
            {closingSoon.map((s) => (
              <li
                key={s._id || s.id}
                className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2"
                onClick={() => setOpenScholar(s)}
                title="View details"
              >
                <div className="min-w-0 text-left">
                  <div className="text-sm font-medium truncate">
                    {s.scholarship_name || s.name || "Scholarship"}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {s.provider || s.country || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                    {fmtDate(s.deadline)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-gray-50 ring-1 ring-gray-100 text-gray-700">
                    <Clock className="h-3.5 w-3.5" />
                    {daysLeft(s.deadline)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Top Ranked Universities */}
        <div className="rounded-2xl bg-white ring-1 ring-black/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">Top Ranked Universities</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {topUniversities.length === 0 && (
              <li className="py-3 text-sm text-gray-500">
                No universities found.
              </li>
            )}
            {topUniversities.map((un) => (
              <li
                key={un._id || un.id}
                className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2"
                onClick={() => setOpenUni(un)}
                title="View details"
              >
                <div className="min-w-0 text-left">
                  <div className="text-sm font-medium truncate">
                    {un.UniversityName || un.name || "University"}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {un.Country || "—"}
                  </div>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  Rank {un.Rank ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* MODALS */}
      <Modal
        open={!!openScholar}
        title="Scholarship Details"
        onClose={() => setOpenScholar(null)}
        widthClass="w-[min(920px,92vw)]"
      >
        <ScholarshipDetails s={openScholar} />
      </Modal>

      <Modal
        open={!!openUni}
        title="University Details"
        onClose={() => setOpenUni(null)}
        widthClass="w-[min(720px,92vw)]"
      >
        <UniversityDetails u={openUni} />
      </Modal>
    </div>
  );
}
