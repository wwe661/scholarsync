import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); 
  const [msg, setMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false); // State to toggle visibility
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false); // State for confirm password visibility

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const section = queryParams.get("section"); 
    
    if (section === "signup") {
      setIsLogin(false);  
    } else {
      setIsLogin(true);  
    }
  }, [location]);

  // Password strength check
  const isStrongPassword = (password) => {
    const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setPasswordError("");
    setEmailError("");
    setLoading(true);

    // Sign up logic
    if (!isLogin) {
      if (!isStrongPassword(password)) {
        setPasswordError("Password must be at least 8 characters long, include a number, and a special character.");
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setPasswordError("Passwords do not match.");
        setLoading(false);
        return;
      }

      try {
        const emailCheckRes = await fetch(`${API_BASE}/check-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const emailCheckData = await emailCheckRes.json();

        if (emailCheckRes.ok && emailCheckData.exists) {
          setEmailError("Email already exists. Please try another one.");
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setMsg(text || "Request failed");
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (data && data.ok === false) {
          setMsg(data.detail || data.msg || "Invalid credentials");
          setLoading(false);
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
        navigate("/"); // Redirect after signup

      } catch (err) {
        setMsg(err.message || "Something went wrong");
        setLoading(false);
      }
    } else {
      // Handle login logic here
      try {
        const res = await fetch(`${API_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setMsg(text || "Request failed");
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (data && data.ok === false) {
          setMsg(data.detail || data.msg || "Invalid credentials");
          setLoading(false);
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
        navigate("/"); 

      } catch (err) {
        setMsg(err.message || "Something went wrong");
        setLoading(false);
      }
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
            {emailError && <p className="text-red-600 text-sm">{emailError}</p>}
            
            <div className="relative">
              <input
                type={passwordVisible ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full p-3 border border-[#ccc] rounded-lg bg-[#f0f4ff]"
              />
              <i
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer ${passwordVisible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash"}`}
                onClick={() => setPasswordVisible(!passwordVisible)}
              ></i>
            </div>

            {!isLogin && (
              <div className="relative">
                <input
                  type={confirmPasswordVisible ? "text" : "password"}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full p-3 border border-[#ccc] rounded-lg bg-[#f0f4ff]"
                />
                <i
                  className={`absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer ${confirmPasswordVisible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash"}`}
                  onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                ></i>
              </div>
            )}

            {passwordError && <p className="text-red-600 text-sm">{passwordError}</p>}

            <button
              type="submit"
              className="w-full p-3 bg-[#003399] text-white rounded-lg hover:bg-[#002080] font-semibold"
              disabled={loading}
            >
              {isLogin ? "LOGIN" : "SIGN UP"}
            </button>
          </form>

          {msg && <p className="text-center text-red-600 mt-3">{msg}</p>}

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
