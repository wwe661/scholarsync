import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const endpoint = isLogin ? "/login" : "/signup";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // Handle non-2xx HTTP
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setMsg(text || "Request failed");
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Handle { ok: false } from backend
      if (data && data.ok === false) {
        setMsg(data.detail || data.msg || "Invalid credentials");
        return;
      }

      // Resolve email + user id (if backend provides)
      const resolvedEmail = (data && (data.email || data.user?.email)) || email;
      const userId = (data && (data.user_id || data.userId || data.user?._id)) || "";

      // Store a canonical user object the Navbar can read
      const user = {
        email: resolvedEmail,
        name: resolvedEmail?.split("@")[0] || "User",
        userId,
      };
      localStorage.setItem("user", JSON.stringify(user));

      // Keep your existing keys too (backward-compat)
      localStorage.setItem("authUser", JSON.stringify({ email: resolvedEmail }));
      localStorage.setItem("auth_email", resolvedEmail);
      localStorage.setItem("userId", userId);

      // Tell listeners (Navbar) that auth changed
      window.dispatchEvent(new Event("auth-changed"));

      // Go to first form
      navigate("/");
    } catch (err) {
      setMsg(err.message || "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-xl font-bold mb-4">{isLogin ? "Login" : "Sign Up"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full border px-3 py-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full border px-3 py-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full bg-[#254085] text-white py-2 rounded hover:bg-[#1f356d]"
          >
            {isLogin ? "Login" : "Sign Up"}
          </button>
        </form>

        {msg && <p className="mt-3 text-sm text-center text-red-600">{msg}</p>}

        <p
          className="mt-4 text-center text-blue-600 cursor-pointer"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
