import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import API from "../utils/api";

export default function Register() {
  const [form, setForm]       = useState({ username: "", email: "", password: "", confirmPw: "", role: "analyst" });
  const [errors, setErrors]   = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const validate = () => {
    const e = {};
    if (!form.username.trim())          e.username = "Username is required";
    else if (form.username.length < 3)  e.username = "Username must be at least 3 characters";
    if (!form.email.trim())             e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
    if (!form.password)                 e.password = "Password is required";
    else if (form.password.length < 6)  e.password = "Password must be at least 6 characters";
    if (!form.confirmPw)                e.confirmPw = "Please confirm your password";
    else if (form.password !== form.confirmPw) e.confirmPw = "Passwords do not match";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setLoading(true); setApiError(""); setErrors({});
    try {
      const { data } = await API.post("/auth/register", {
        username: form.username, email: form.email,
        password: form.password, role: form.role,
      });
      login(data.access_token, data.username, data.role, true);
      navigate("/dashboard");
    } catch (err) {
      setApiError(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: "" }));
    setApiError("");
  };

  const pwStrength = () => {
    const p = form.password;
    if (!p) return null;
    if (p.length < 6) return { label: "Weak", color: "#ef4444", width: "30%" };
    if (p.length < 10) return { label: "Fair", color: "#f97316", width: "60%" };
    return { label: "Strong", color: "#22c55e", width: "100%" };
  };
  const strength = pwStrength();

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoWrap}>
          <div style={S.logoIcon}>🛡️</div>
          <h1 style={S.title}>Create Account</h1>
          <p style={S.subtitle}>Join Hybrid IDS Platform</p>
        </div>

        {apiError && <div style={S.apiError}>{apiError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Username */}
          <div style={S.field}>
            <label style={S.label}>Username</label>
            <input style={{ ...S.input, ...(errors.username ? S.inputErr : {}) }}
              placeholder="Choose a username" value={form.username}
              onChange={e => set("username", e.target.value)} autoComplete="username" />
            {errors.username && <span style={S.errMsg}>{errors.username}</span>}
          </div>

          {/* Email */}
          <div style={S.field}>
            <label style={S.label}>Email</label>
            <input style={{ ...S.input, ...(errors.email ? S.inputErr : {}) }}
              type="email" placeholder="your@email.com" value={form.email}
              onChange={e => set("email", e.target.value)} autoComplete="email" />
            {errors.email && <span style={S.errMsg}>{errors.email}</span>}
          </div>

          {/* Role */}
          <div style={S.field}>
            <label style={S.label}>Role</label>
            <select style={S.select} value={form.role} onChange={e => set("role", e.target.value)}>
              <option value="analyst">Analyst — View & Detect</option>
              <option value="admin">Admin — Full Access</option>
            </select>
          </div>

          {/* Password */}
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <div style={S.pwWrap}>
              <input style={{ ...S.input, ...S.pwInput, ...(errors.password ? S.inputErr : {}) }}
                type={showPw ? "text" : "password"} placeholder="Min 6 characters"
                value={form.password} onChange={e => set("password", e.target.value)} autoComplete="new-password" />
              <button type="button" style={S.eyeBtn} onClick={() => setShowPw(v => !v)}>
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
            {strength && (
              <div style={{ marginTop: 6 }}>
                <div style={{ height: 3, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: strength.width, background: strength.color, transition: "width .3s" }} />
                </div>
                <span style={{ fontSize: 11, color: strength.color }}>{strength.label} password</span>
              </div>
            )}
            {errors.password && <span style={S.errMsg}>{errors.password}</span>}
          </div>

          {/* Confirm Password */}
          <div style={S.field}>
            <label style={S.label}>Confirm Password</label>
            <div style={S.pwWrap}>
              <input style={{ ...S.input, ...S.pwInput, ...(errors.confirmPw ? S.inputErr : {}) }}
                type={showCpw ? "text" : "password"} placeholder="Re-enter password"
                value={form.confirmPw} onChange={e => set("confirmPw", e.target.value)} autoComplete="new-password" />
              <button type="button" style={S.eyeBtn} onClick={() => setShowCpw(v => !v)}>
                {showCpw ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.confirmPw && <span style={S.errMsg}>{errors.confirmPw}</span>}
          </div>

          <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p style={S.switchText}>
          Already have an account? <Link to="/login" style={S.switchLink}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "20px",
  },
  card: {
    background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
    padding: "40px 36px", width: "100%", maxWidth: 420,
    boxShadow: "0 25px 50px rgba(0,0,0,0.4)", animation: "fadeIn 0.3s ease",
  },
  logoWrap: { textAlign: "center", marginBottom: 28 },
  logoIcon: { fontSize: 40, marginBottom: 8 },
  title: { color: "#38bdf8", fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 4 },
  apiError: {
    background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8,
    padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: { display: "block", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" },
  input: {
    width: "100%", background: "#0f172a", border: "1px solid #334155",
    borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14,
    outline: "none", transition: "border-color .2s",
  },
  select: {
    width: "100%", background: "#0f172a", border: "1px solid #334155",
    borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none",
  },
  inputErr: { borderColor: "#ef4444" },
  pwWrap: { position: "relative" },
  pwInput: { paddingRight: 44 },
  eyeBtn: {
    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0,
  },
  errMsg: { color: "#ef4444", fontSize: 11, marginTop: 4, display: "block" },
  btn: {
    width: "100%", padding: "12px 0", background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
    border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 15,
    cursor: "pointer", transition: "opacity .2s", marginTop: 4,
  },
  switchText: { textAlign: "center", color: "#64748b", fontSize: 13, marginTop: 20 },
  switchLink: { color: "#38bdf8", textDecoration: "none", fontWeight: 500 },
};
