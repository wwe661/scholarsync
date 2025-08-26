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

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setMsg(text || "Request failed");
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (data && data.ok === false) {
        setMsg(data.detail || data.msg || "Invalid credentials");
        return;
      }

      const resolvedEmail = (data && (data.email || data.user?.email)) || email;
      const userId = (data && (data.user_id || data.userId || data.user?._id)) || "";

      const user = {
        email: resolvedEmail,
        name: resolvedEmail?.split("@")[0] || "User",
        userId,
      };
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("authUser", JSON.stringify({ email: resolvedEmail }));
      localStorage.setItem("auth_email", resolvedEmail);
      localStorage.setItem("userId", userId);

      window.dispatchEvent(new Event("auth-changed"));

      navigate("/"); // navigate to home page or any other route
    } catch (err) {
      setMsg(err.message || "Something went wrong");
    }
  };

  return (
    <div className="flex min-h-screen justify-center items-center bg-[#254085]">
      <div className="flex max-w-4xl bg-white rounded-3xl shadow-lg">
        <div className="flex-1 p-8">
          <h1 className="text-3xl font-semibold text-[#003087] mb-6">{isLogin ? "Login Now" : "Sign Up Now"}</h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <input
              type="email"
              placeholder="Email or Username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 border border-[#ccc] rounded-lg bg-[#f0f4ff]"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 border border-[#ccc] rounded-lg bg-[#f0f4ff]"
            />
            <button
              type="submit"
              className="w-full p-3 bg-[#003399] text-white rounded-lg hover:bg-[#002080] font-semibold"
            >
              {isLogin ? "LOGIN" : "SIGN UP"}
            </button>
          </form>

          {msg && <p className="text-center text-red-600 mt-3">{msg}</p>}

          <div className="text-center mt-6">
            <p className="text-sm text-gray-500">Or login with</p>
            <div className="flex justify-center gap-3 mt-4">
              <button className="px-6 py-2 bg-[#1877F2] text-white rounded-lg">Facebook</button>
              <button className="px-6 py-2 bg-[#4285F4] text-white rounded-lg">Google</button>
            </div>
          </div>

          <p className="text-center text-sm text-blue-600 mt-6 cursor-pointer">
            {isLogin ? "Not a member?" : "Already have an account?"}{" "}
            <span
              className="font-semibold cursor-pointer text-orange-500"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Sign Up Now" : "Login Now"}
            </span>
          </p>
        </div>

        <div className="hidden lg:block flex-1 bg-white p-8 text-center">
          <img src="/login.jpg" alt="Login Graphic" className="max-w-[450px] mx-auto mb-3" />
          <h2 className="text-3xl font-semibold text-[#003087]">Scholar Sync</h2>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
