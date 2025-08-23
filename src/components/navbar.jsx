import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const AUTH_KEY = "authUser";

const readAuth = () => {
  try {
    const v = localStorage.getItem(AUTH_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};

/** Reusable top-level menu item with a dropdown */
const MenuWithDropdown = ({ label, baseTo, items }) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <li
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocus={openNow}
      onBlur={closeSoon}
    >
      <Link
        to={baseTo}
        className="relative cursor-pointer text-white hover:text-white after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-0 hover:after:w-full after:h-[2px] after:bg-white after:transition-all after:duration-300"
        aria-haspopup="true"
        aria-expanded={open ? "true" : "false"}
      >
        {label}
      </Link>

      {/* Dropdown */}
      <div
        className={`absolute left-0 top-full pt-2 min-w-44 rounded-md shadow-lg bg-white text-[#254085] py-2 z-50 transition-opacity duration-150 ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
      >
        {items.map(({ to, text }, i) => (
          <Link
            key={i}
            to={to}
            className="block px-4 py-2 text-sm hover:bg-[#254085] hover:text-white"
            onClick={() => setOpen(false)}
          >
            {text}
          </Link>
        ))}
      </div>
    </li>
  );
};

const Navbar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readAuth());

  useEffect(() => {
    const refresh = () => setUser(readAuth());

    // listen for custom event from AuthPage
    window.addEventListener("auth-changed", refresh);

    // cross-tab/localStorage changes
    const onStorage = (e) => {
      if (e.key === AUTH_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("auth-changed", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem("auth_email");
    localStorage.removeItem("userId");

    setUser(null); // update UI immediately
    window.dispatchEvent(new Event("auth-changed"));
    navigate("/");
  };

  const initial = (user?.name?.[0] || user?.email?.[0] || "U").toUpperCase();

  const [notification, setNotification] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if(!user) return; // no user, no notifications
    const getnoti = async () => {
    if (user) {
      try{
        const notis = await fetch(`${API_BASE}/api/notification/unread?mail=${user.email}`, {
          method: "GET",
          headers: {"Content-Type": "application/json"}
        });
        
        if (!notis.ok) {
          const text = await notis.text().catch(() => "");
          throw new Error(`HTTP ${notis.status}: ${text || "request failed"}`);
        }

        const notidata = await notis.json().catch(() => ({}));

        if (notidata){
          setNotification(Array.isArray(notidata.notifications)?notidata.notifications : []);
        }
      }catch (err) {
        console.error("Fetch error:", err);
      }
    }};
    getnoti();
  }, [user]);

  const markAsRead = async () => {
    if (!user) return;
    try {
      await fetch(`${API_BASE}/api/notification/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mail: user.email }),
      });
  
      // Instead of clearing completely, mark locally as read
      setNotification((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      );
    } catch (err) {
      console.error("Mark-as-read error:", err);
    }
  };  
  
  
  return (
    <nav className="bg-[#254085] shadow-md px-3 py-3 flex justify-between ml-4 mr-4">
      {/* Branding */}
      <div className="flex items-center gap-2">
        <img src="logo.png" alt="ScholarSync Logo" className="w-10 h-10" />
        <span className="font-semibold text-lg text-white">ScholarSync</span>
      </div>

      {/* Menu */}
      <ul className="hidden md:flex items-center gap-10 text-sm font-medium text-white">
        <li>
          <Link
            to="/"
            className="relative cursor-pointer text-white hover:text-white after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-0 hover:after:w-full after:h-[2px] after:bg-white after:transition-all after:duration-300"
          >
            Home
          </Link>
        </li>

        <MenuWithDropdown
          label="Search"
          baseTo="/search"
          items={[
            { to: "/search", text: "Scholarships" },
            { to: "/search-university", text: "Universities" },
          ]}
        />

        <MenuWithDropdown
          label="Try Matching"
          baseTo="/match-scholar"
          items={[
            { to: "/match-scholar", text: "Scholarships" },
            { to: "/match-uni", text: "Universities" },
          ]}
        />

        <MenuWithDropdown
          label="Analysis"
          baseTo="/analysis"
          items={[
            { to: "/analysis?scope=scholarships", text: "Scholarships" },
            { to: "/analysis?scope=universities", text: "Universities" },
          ]}
        />
      </ul>

      {/* Right-side auth area */}
      {user ? (
        <div className="flex items-center gap-3">
          {notification.length>0 ? (
          <div className="relative">
          <div
            onClick={() => {
              setOpen((prev) => !prev);
              if (!open && notification.length > 0) {
                markAsRead(); // mark when user first opens dropdown
              }
            }}
            className="w-8 h-8 bg-white text-[#254085] rounded-full flex items-center justify-center font-bold cursor-pointer relative"
          >
            {initial}
            {notification.some((n) => !n.read) && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </div>
        
          {open && (
            <div className="absolute right-0 mt-2 w-64 bg-white shadow-lg rounded-lg text-[#254085] z-50">
              {notification.length > 0 ? (
                notification.map((n, i) => (
                  <div key={i} className="px-4 py-2 border-b last:border-0">
                    {n.text}
                  </div>
                ))
              ) : (
                <div className="px-4 py-2">No new notifications</div>
              )}
            </div>
          )}
        </div>        
          )
          :(
          <div className="w-8 h-8 bg-white text-[#254085] rounded-full flex items-center justify-center font-bold">
          {initial}
          </div>)}
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-white text-white hover:bg-white hover:text-[#254085] transition"
          >
            ➜]
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link
            to="/authpage"
            className="px-5 py-2 text-sm font-medium rounded-lg border border-white text-white hover:bg-white hover:text-[#254085] transition"
          >
            Login
          </Link>
          <Link
            to="/authpage"
            className="px-5 py-2 text-sm font-medium rounded-lg bg-white text-[#254085] hover:bg-gray-100 transition"
          >
            Sign Up
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
