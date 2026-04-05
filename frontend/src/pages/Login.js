import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import API from "../utils/api";

export default function Login() {
  const [form, setForm]       = useState({ username: "", password: "" });
  const [errors, setErrors]   = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [remember, setRemember] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const validate = () => {
    const e = {};
    if (!form.username.trim())       e.username = "Username is required";
    if (!form.password)              e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Password must be at least 6 characters";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setLoading(true); setApiError(""); setErrors({});
    try {
      const { data } = await API.post("/auth/login", form);
      login(data.access_token, data.username, data.role, remember);
      navigate("/dashboard");
    } catch (err) {
      setApiError(err.response?.data?.detail || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: "" }));
    setApiError("");
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logoWrap}>
          <div style={S.logoIcon}>🛡️</div>
          <h1 style={S.title}>Hybrid IDS</h1>
          <p style={S.subtitle}>Intrusion Detection System</p>
        </div>

        {apiError && <div style={S.apiError}>{apiError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Username */}
          <div style={S.field}>
            <label style={S.label}>Username</label>
            <input
              style={{ ...S.input, ...(errors.username ? S.inputErr : {}) }}
              placeholder="Enter your username"
              value={form.username}
              onChange={e => set("username", e.target.value)}
              autoComplete="username"
            />
            {errors.username && <span style={S.errMsg}>{errors.username}</span>}
          </div>

          {/* Password */}
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <div style={S.pwWrap}>
              <input
                style={{ ...S.input, ...S.pwInput, ...(errors.password ? S.inputErr : {}) }}
                type={showPw ? "text" : "password"}
                placeholder="Enter your password"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" style={S.eyeBtn} onClick={() => setShowPw(v => !v)}>
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.password && <span style={S.errMsg}>{errors.password}</span>}
          </div>

          {/* Remember me */}
          <div style={S.rememberRow}>
            <label style={S.checkLabel}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ marginRight: 6 }} />
              Remember me
            </label>
          </div>

          <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p style={S.switchText}>
          Don't have an account? <Link to="/register" style={S.switchLink}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    padding: "20px",
  },
  card: {
    background: "#1e293b", border: "1px solid #334155",
    borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 400,
    boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
    animation: "fadeIn 0.3s ease",
  },
  logoWrap: { textAlign: "center", marginBottom: 32 },
  logoIcon: { fontSize: 44, marginBottom: 8 },
  title: { color: "#38bdf8", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 4 },
  apiError: {
    background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8,
    padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 20,
  },
  field: { marginBottom: 18 },
  label: { display: "block", color: "#94a3b8", fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase" },
  input: {
    width: "100%", background: "#0f172a", border: "1px solid #334155",
    borderRadius: 8, padding: "11px 14px", color: "#e2e8f0", fontSize: 14,
    outline: "none", transition: "border-color .2s",
  },
  inputErr: { borderColor: "#ef4444" },
  pwWrap: { position: "relative" },
  pwInput: { paddingRight: 44 },
  eyeBtn: {
    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0,
  },
  errMsg: { color: "#ef4444", fontSize: 11, marginTop: 4, display: "block" },
  rememberRow: { display: "flex", alignItems: "center", marginBottom: 20 },
  checkLabel: { display: "flex", alignItems: "center", color: "#94a3b8", fontSize: 13, cursor: "pointer" },
  btn: {
    width: "100%", padding: "12px 0", background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
    border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 15,
    cursor: "pointer", transition: "opacity .2s", letterSpacing: "0.3px",
  },
  switchText: { textAlign: "center", color: "#64748b", fontSize: 13, marginTop: 24 },
  switchLink: { color: "#38bdf8", textDecoration: "none", fontWeight: 500 },
};
