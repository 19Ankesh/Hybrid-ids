import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { useAuth } from "../context/AuthContext";
import API from "../utils/api";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

// ── design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:      "#0f172a",
  surface: "#1e293b",
  border:  "#334155",
  text:    "#e2e8f0",
  muted:   "#64748b",
  sub:     "#94a3b8",
  blue:    "#38bdf8",
  indigo:  "#818cf8",
  green:   "#4ade80",
  yellow:  "#fbbf24",
  red:     "#f87171",
  orange:  "#fb923c",
};

const PIE_COLORS = ["#38bdf8","#818cf8","#fb923c","#f87171","#4ade80","#fbbf24","#e879f9","#34d399"];

// ── helpers ────────────────────────────────────────────────────────────────────
const sev = (s) => {
  const m = { High: { bg:"rgba(248,113,113,0.12)", color:"#f87171", border:"rgba(248,113,113,0.3)" },
               Medium:{ bg:"rgba(251,191,36,0.12)",  color:"#fbbf24", border:"rgba(251,191,36,0.3)" },
               Low:   { bg:"rgba(74,222,128,0.12)",   color:"#4ade80", border:"rgba(74,222,128,0.3)" } };
  const st = m[s] || m.Low;
  return <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600,
    background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>{s}</span>;
};

const fmt  = (ts) => ts ? new Date(ts).toLocaleString() : "—";
const fmtT = (ts) => ts ? new Date(ts).toLocaleTimeString() : "—";

const chartOpts = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor:"#1e293b", titleColor:T.blue, bodyColor:T.text, borderColor:T.border, borderWidth:1 },
    ...extra.plugins,
  },
  scales: {
    x: { ticks:{ color:T.muted, font:{size:10} }, grid:{ color:"rgba(255,255,255,0.04)" } },
    y: { ticks:{ color:T.muted, font:{size:10} }, grid:{ color:"rgba(255,255,255,0.04)" } },
    ...extra.scales,
  },
  ...extra,
});

// ── sub-components ─────────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
    <div style={{ width:32, height:32, border:`3px solid ${T.border}`, borderTop:`3px solid ${T.blue}`,
      borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
  </div>;
}

function EmptyState({ icon, msg }) {
  return <div style={{ textAlign:"center", padding:"40px 20px", color:T.muted }}>
    <div style={{ fontSize:36, marginBottom:12 }}>{icon}</div>
    <div style={{ fontSize:13 }}>{msg}</div>
  </div>;
}

function StatCard({ icon, label, value, sub, accent, loading }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
      padding:"16px 18px", borderLeft:`3px solid ${accent}`, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ fontSize:28 }}>{icon}</div>
      <div>
        <div style={{ color:T.muted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px", fontWeight:500 }}>{label}</div>
        {loading
          ? <div style={{ height:28, width:60, background:T.border, borderRadius:6, marginTop:4, animation:"pulse 1.5s infinite" }} />
          : <div style={{ color:accent, fontSize:26, fontWeight:700, lineHeight:1.2 }}>{value ?? "—"}</div>}
        {sub && <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Card({ title, children, height, action }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"16px 18px", marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ color:T.blue, fontWeight:600, fontSize:13 }}>{title}</div>
        {action}
      </div>
      {height ? <div style={{ height }}>{children}</div> : children}
    </div>
  );
}

// ── THREAT LEVEL ──────────────────────────────────────────────────────────────
function ThreatLevel({ stats }) {
  if (!stats) return null;
  const highPct = stats.total_alerts > 0
    ? (stats.severity_counts?.High || 0) / stats.total_alerts
    : 0;
  const level = highPct > 0.3 ? "CRITICAL" : highPct > 0.1 ? "WARNING" : "SAFE";
  const cfg = {
    CRITICAL: { color:"#f87171", bg:"rgba(248,113,113,0.1)", icon:"🔴", border:"rgba(248,113,113,0.3)" },
    WARNING:  { color:"#fbbf24", bg:"rgba(251,191,36,0.1)",  icon:"🟡", border:"rgba(251,191,36,0.3)" },
    SAFE:     { color:"#4ade80", bg:"rgba(74,222,128,0.1)",  icon:"🟢", border:"rgba(74,222,128,0.3)" },
  }[level];
  return (
    <div style={{ background:cfg.bg, border:`1px solid ${cfg.border}`, borderRadius:10,
      padding:"10px 16px", display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
      <span style={{ fontSize:20 }}>{cfg.icon}</span>
      <div>
        <div style={{ color:cfg.color, fontWeight:700, fontSize:13 }}>System Threat Level: {level}</div>
        <div style={{ color:T.muted, fontSize:11 }}>
          {stats.severity_counts?.High || 0} high-severity alerts out of {stats.total_alerts} total
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { user, logout }      = useAuth();
  const navigate              = useNavigate();
  const [tab, setTab]         = useState("overview");
  const [stats, setStats]     = useState(null);
  const [alerts, setAlerts]   = useState([]);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(false);
  const prevCount             = useRef(0);

  // filters
  const [search, setSearch]         = useState("");
  const [sevFilter, setSevFilter]   = useState("All");
  const [dateRange, setDateRange]   = useState("all");

  // detect
  const [featForm, setFeatForm]     = useState({});
  const [detectRes, setDetectRes]   = useState(null);
  const [detectHistory, setDetectHistory] = useState([]);
  const [detecting, setDetecting]   = useState(false);
  const [detectErr, setDetectErr]   = useState("");

  // shap
  const [shapAlertId, setShapAlertId] = useState("");
  const [shapData, setShapData]       = useState(null);
  const [shapLoading, setShapLoading] = useState(false);
  const [shapErr, setShapErr]         = useState("");

  // sim
  const [simLoading, setSimLoading] = useState("");
  const [toast, setToast]           = useState(null);

  const FEATURES = [
    "Destination Port","Flow Duration","Total Fwd Packets","Total Backward Packets",
    "Total Length of Fwd Packets","Total Length of Bwd Packets","Fwd Packet Length Max",
    "Fwd Packet Length Min","Fwd Packet Length Mean","Fwd Packet Length Std",
    "Bwd Packet Length Max","Bwd Packet Length Min","Bwd Packet Length Mean",
    "Flow Bytes/s","Flow Packets/s","Flow IAT Mean","Flow IAT Std",
    "Flow IAT Max","Flow IAT Min","Fwd IAT Total",
  ];

  const DEMO_VALS = {
    "Destination Port":80,"Flow Duration":100000,"Total Fwd Packets":50,
    "Total Backward Packets":30,"Total Length of Fwd Packets":25000,
    "Total Length of Bwd Packets":10000,"Fwd Packet Length Max":1500,
    "Fwd Packet Length Min":40,"Fwd Packet Length Mean":500,"Fwd Packet Length Std":200,
    "Bwd Packet Length Max":800,"Bwd Packet Length Min":0,"Bwd Packet Length Mean":300,
    "Flow Bytes/s":5000,"Flow Packets/s":100,"Flow IAT Mean":10000,
    "Flow IAT Std":5000,"Flow IAT Max":50000,"Flow IAT Min":100,"Fwd IAT Total":90000,
  };

  const showToast = (msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        API.get("/data/stats"),
        API.get("/data/alerts?limit=200"),
      ]);
      setStats(sRes.data);
      const newAlerts = aRes.data;
      if (prevCount.current > 0 && newAlerts.length > prevCount.current) {
        setNewAlert(true);
        setTimeout(() => setNewAlert(false), 3000);
      }
      prevCount.current = newAlerts.length;
      setAlerts(newAlerts);
      if (user?.role === "admin") {
        const lRes = await API.get("/data/logs?limit=50");
        setLogs(lRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // ── filtered alerts ──────────────────────────────────────────────────────────
  const filteredAlerts = alerts.filter(a => {
    if (sevFilter !== "All" && a.severity !== sevFilter) return false;
    if (search && !a.attack_type.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateRange !== "all") {
      const cutoff = new Date();
      if (dateRange === "today") cutoff.setHours(0,0,0,0);
      else if (dateRange === "7d") cutoff.setDate(cutoff.getDate() - 7);
      else if (dateRange === "30d") cutoff.setDate(cutoff.getDate() - 30);
      if (new Date(a.timestamp) < cutoff) return false;
    }
    return true;
  });

  // ── export CSV ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const header = "ID,Timestamp,Attack Type,Anomaly Score,Risk Score,Severity";
    const rows   = filteredAlerts.map(a =>
      `${a.id},"${fmt(a.timestamp)}",${a.attack_type},${a.anomaly_score},${a.risk_score},${a.severity}`
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "ids_alerts.csv"; link.click();
    URL.revokeObjectURL(url);
    showToast("Alerts exported to CSV");
  };

  // ── simulate ─────────────────────────────────────────────────────────────────
  const simulate = async (type) => {
    setSimLoading(type);
    try {
      const ep = type === "dos" ? "/detect/simulate-dos" : "/detect/simulate-anomaly";
      const { data } = await API.post(ep);
      showToast(`${type === "dos" ? "DoS" : "Anomaly"} simulated → ${data.attack_type} (Risk: ${data.risk_score})`);
      fetchAll();
    } catch { showToast("Simulation failed", "error"); }
    finally { setSimLoading(""); }
  };

  // ── detect ───────────────────────────────────────────────────────────────────
  const runDetect = async () => {
    const missing = FEATURES.filter(f => featForm[f] === undefined || featForm[f] === "");
    if (missing.length > 10) { setDetectErr("Please fill in at least 10 features"); return; }
    setDetecting(true); setDetectErr("");
    try {
      const features = {};
      FEATURES.forEach(f => { features[f] = parseFloat(featForm[f]) || 0; });
      const { data } = await API.post("/detect/", { features });
      setDetectRes(data);
      setDetectHistory(h => [data, ...h].slice(0, 10));
      fetchAll();
      showToast(`Detection complete — ${data.attack_type}`);
    } catch (e) {
      setDetectErr(e.response?.data?.detail || "Detection failed");
    } finally { setDetecting(false); }
  };

  // ── SHAP ─────────────────────────────────────────────────────────────────────
  const loadShap = async (id) => {
    if (!id) return;
    setShapLoading(true); setShapErr("");
    try {
      const { data } = await API.get(`/explain/${id}`);
      setShapData(data);
    } catch {
      setShapErr("Could not load SHAP explanation for this alert.");
    } finally { setShapLoading(false); }
  };

  // ── chart data ────────────────────────────────────────────────────────────────
  const anomalyLineData = stats ? {
    labels: stats.anomaly_scores.map((_, i) => i + 1),
    datasets: [
      { label:"Anomaly Score", data: stats.anomaly_scores, borderColor:T.blue,
        backgroundColor:"rgba(56,189,248,0.08)", borderWidth:2, pointRadius:2, tension:0.3, fill:true },
      { label:"Threshold (−0.1)", data: stats.anomaly_scores.map(() => -0.1),
        borderColor:T.red, borderDash:[5,4], borderWidth:1.5, pointRadius:0, fill:false },
    ],
  } : null;

  const attackPieData = stats ? {
    labels: Object.keys(stats.attack_distribution),
    datasets: [{ data: Object.values(stats.attack_distribution),
      backgroundColor: PIE_COLORS, borderColor: T.bg, borderWidth: 2 }],
  } : null;

  const timelineData = stats ? {
    labels: stats.hourly_timeline.map(h => h.hour),
    datasets: [{ label:"Alerts", data: stats.hourly_timeline.map(h => h.count),
      borderColor:T.indigo, backgroundColor:"rgba(129,140,248,0.12)",
      borderWidth:2, tension:0.4, fill:true, pointRadius:3 }],
  } : null;

  const riskBarData = stats ? {
    labels: stats.risk_scores.slice(-20).map((_, i) => `#${i+1}`),
    datasets: [{ label:"Risk Score", data: stats.risk_scores.slice(-20),
      backgroundColor: stats.risk_scores.slice(-20).map(r =>
        r >= 70 ? "rgba(248,113,113,0.75)" : r >= 40 ? "rgba(251,191,36,0.75)" : "rgba(74,222,128,0.7)"
      ), borderRadius:4 }],
  } : null;

  const featImpData = stats ? {
    labels: Object.keys(stats.feature_importance).slice(0,10),
    datasets: [{ label:"Importance", data: Object.values(stats.feature_importance).slice(0,10),
      backgroundColor:"rgba(129,140,248,0.72)", borderRadius:4 }],
  } : null;

  const shapBarData = shapData?.top_features?.length ? {
    labels: shapData.top_features.map(f => f.feature),
    datasets: [{ label:"SHAP Value", data: shapData.top_features.map(f => f.shap),
      backgroundColor: shapData.top_features.map(f => f.shap >= 0
        ? "rgba(248,113,113,0.75)" : "rgba(56,189,248,0.75)"),
      borderRadius:4 }],
  } : null;

  const shapPlainEnglish = () => {
    if (!shapData?.top_features?.length) return "";
    const top = shapData.top_features[0];
    const dir = top.shap >= 0 ? "increased" : "decreased";
    return `"${top.feature}" ${dir} the likelihood of ${shapData.attack_type} classification the most (SHAP: ${top.shap > 0 ? "+" : ""}${top.shap?.toFixed(4)}).`;
  };

  const tabs = [
    { id:"overview",   label:"📊 Overview" },
    { id:"analytics",  label:"📈 Analytics" },
    { id:"alerts",     label:`🚨 Alerts${newAlert ? " 🔴" : ""}` },
    { id:"detect",     label:"🔍 Detect" },
    { id:"shap",       label:"🔬 Explain" },
    ...(user?.role === "admin" ? [{ id:"logs", label:"📋 Logs" }] : []),
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:T.bg }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:16, right:16, zIndex:9999,
          padding:"10px 20px", borderRadius:8, fontWeight:600, fontSize:13,
          color: toast.type==="error" ? "#fff" : "#0f172a",
          background: toast.type==="error" ? "#ef4444" : "#4ade80",
          boxShadow:"0 4px 20px rgba(0,0,0,0.4)", animation:"fadeIn 0.2s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside style={{ width:210, background:T.surface, borderRight:`1px solid ${T.border}`,
        display:"flex", flexDirection:"column", position:"sticky", top:0, height:"100vh", overflowY:"auto", flexShrink:0 }}>
        <div style={{ padding:"20px 16px 16px", borderBottom:`1px solid ${T.border}`, textAlign:"center" }}>
          <div style={{ fontSize:30 }}>🛡️</div>
          <div style={{ color:T.blue, fontWeight:700, fontSize:14, letterSpacing:"-0.3px", marginTop:6 }}>Hybrid IDS</div>
          <div style={{ color:T.muted, fontSize:10, marginTop:2 }}>XGBoost + Isolation Forest</div>
        </div>

        <nav style={{ flex:1, paddingTop:8 }}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:"10px 16px", cursor:"pointer", fontSize:12, fontWeight:500,
                color: tab===t.id ? T.blue : T.sub,
                background: tab===t.id ? "rgba(56,189,248,0.08)" : "transparent",
                borderLeft: `3px solid ${tab===t.id ? T.blue : "transparent"}`,
                transition:"all .15s" }}>
              {t.label}
            </div>
          ))}
        </nav>

        {/* Simulate */}
        <div style={{ padding:12, borderTop:`1px solid ${T.border}` }}>
          <div style={{ color:T.muted, fontSize:10, letterSpacing:"0.5px", marginBottom:8, fontWeight:600 }}>SIMULATE</div>
          <button onClick={() => simulate("dos")} disabled={!!simLoading}
            style={{ width:"100%", padding:"8px 0", background:"transparent", border:`1px solid ${T.blue}`,
              borderRadius:7, color:T.blue, cursor:"pointer", fontSize:11, fontWeight:500, marginBottom:6 }}>
            {simLoading==="dos" ? "⏳ Running…" : "💣 Simulate DoS"}
          </button>
          <button onClick={() => simulate("anomaly")} disabled={!!simLoading}
            style={{ width:"100%", padding:"8px 0", background:"transparent", border:`1px solid ${T.orange}`,
              borderRadius:7, color:T.orange, cursor:"pointer", fontSize:11, fontWeight:500 }}>
            {simLoading==="anomaly" ? "⏳ Running…" : "👾 Simulate Anomaly"}
          </button>
        </div>

        {/* User */}
        <div style={{ padding:12, borderTop:`1px solid ${T.border}` }}>
          <div style={{ color:T.text, fontSize:13, fontWeight:500 }}>👤 {user?.username}</div>
          <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>
            <span style={{ background:"rgba(56,189,248,0.12)", color:T.blue, padding:"1px 8px",
              borderRadius:10, fontSize:10, fontWeight:600 }}>{user?.role?.toUpperCase()}</span>
          </div>
          <button onClick={() => { logout(); navigate("/login"); }}
            style={{ marginTop:10, width:"100%", padding:"7px 0", background:"transparent",
              border:"1px solid rgba(248,113,113,0.4)", borderRadius:7, color:T.red,
              cursor:"pointer", fontSize:11, fontWeight:500 }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, padding:"24px 28px", overflowY:"auto", maxWidth:"calc(100vw - 210px)" }}>

        {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <h2 style={S.pageTitle}>System Overview</h2>
            <ThreatLevel stats={stats} />

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
              <StatCard icon="🚨" label="Total Alerts"   value={stats?.total_alerts?.toLocaleString()}     accent={T.blue}   loading={loading} />
              <StatCard icon="⚠️" label="Anomalies"      value={stats?.total_anomalies?.toLocaleString()}  accent={T.orange} loading={loading} sub="Isolation Forest" />
              <StatCard icon="🔴" label="High Severity"  value={stats?.severity_counts?.High?.toLocaleString()} accent={T.red} loading={loading} />
              <StatCard icon="✅" label="Normal Traffic" value={stats?.attack_distribution?.BENIGN?.toLocaleString()} accent={T.green} loading={loading} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <Card title="📈 Anomaly Score Over Time" height={200}>
                {loading ? <Spinner /> : anomalyLineData
                  ? <Line data={anomalyLineData} options={{ ...chartOpts(), plugins:{ ...chartOpts().plugins, legend:{ display:true, labels:{ color:T.muted, font:{size:10}, boxWidth:10 } } } }} />
                  : <EmptyState icon="📉" msg="No anomaly data yet" />}
              </Card>
              <Card title="🥧 Attack Distribution" height={200}>
                {loading ? <Spinner /> : attackPieData
                  ? <Doughnut data={attackPieData} options={{ responsive:true, maintainAspectRatio:false,
                      plugins:{ legend:{ display:true, position:"right", labels:{ color:T.muted, font:{size:10}, boxWidth:10 } },
                      tooltip:{ backgroundColor:T.surface, titleColor:T.blue, bodyColor:T.text, borderColor:T.border, borderWidth:1 } } }} />
                  : <EmptyState icon="🥧" msg="No attack data yet" />}
              </Card>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <Card title="📉 Alerts Timeline — Last 24h" height={180}>
                {loading ? <Spinner /> : timelineData
                  ? <Line data={timelineData} options={chartOpts()} />
                  : <EmptyState icon="📉" msg="No timeline data yet" />}
              </Card>
              <Card title="🔒 Severity Breakdown" height={180}>
                {loading ? <Spinner /> : stats?.severity_counts
                  ? <Doughnut data={{ labels:["Low","Medium","High"],
                      datasets:[{ data:[stats.severity_counts.Low||0, stats.severity_counts.Medium||0, stats.severity_counts.High||0],
                        backgroundColor:["rgba(74,222,128,0.8)","rgba(251,191,36,0.8)","rgba(248,113,113,0.8)"],
                        borderColor:T.bg, borderWidth:2 }] }}
                      options={{ responsive:true, maintainAspectRatio:false,
                        plugins:{ legend:{ display:true, position:"right", labels:{ color:T.muted, font:{size:10}, boxWidth:10 } },
                        tooltip:{ backgroundColor:T.surface, titleColor:T.blue, bodyColor:T.text, borderColor:T.border, borderWidth:1 } } }} />
                  : <EmptyState icon="🔒" msg="No severity data yet" />}
              </Card>
            </div>

            {/* Latest alerts mini-table */}
            <Card title="🚨 Latest Alerts">
              {loading ? <Spinner /> : alerts.length === 0
                ? <EmptyState icon="🚨" msg="No alerts yet. Run a simulation to generate data." />
                : <table style={S.table}>
                    <thead><tr>{["Time","Attack Type","Anomaly Score","Risk","Severity"].map(h =>
                      <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{alerts.slice(0,8).map(a => (
                      <tr key={a.id} style={S.tr}>
                        <td style={S.td}>{fmtT(a.timestamp)}</td>
                        <td style={{ ...S.td, color: a.attack_type==="BENIGN" ? T.green : T.orange, fontWeight:600 }}>{a.attack_type}</td>
                        <td style={{ ...S.td, color: a.anomaly_score < -0.1 ? T.red : T.blue, fontFamily:"monospace" }}>{a.anomaly_score?.toFixed(4)}</td>
                        <td style={S.td}>{a.risk_score?.toFixed(1)}</td>
                        <td style={S.td}>{sev(a.severity)}</td>
                      </tr>
                    ))}</tbody>
                  </table>}
            </Card>
          </div>
        )}

        {/* ── ANALYTICS ─────────────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <h2 style={S.pageTitle}>Deep Analytics</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <Card title="🔥 Risk Scores — Last 20 Events" height={240}>
                {loading ? <Spinner /> : riskBarData
                  ? <Bar data={riskBarData} options={chartOpts({ scales:{ ...chartOpts().scales, y:{ ...chartOpts().scales.y, max:100 } } })} />
                  : <EmptyState icon="🔥" msg="No risk score data yet" />}
              </Card>
              <Card title="📦 XGBoost Feature Importance" height={240}>
                {loading ? <Spinner /> : featImpData
                  ? <Bar data={featImpData} options={chartOpts({ indexAxis:"y",
                      scales:{ x:{ ticks:{color:T.muted,font:{size:9}}, grid:{color:"rgba(255,255,255,0.04)"} },
                               y:{ ticks:{color:T.muted,font:{size:9}}, grid:{color:"rgba(255,255,255,0.04)"} } } })} />
                  : <EmptyState icon="📦" msg="No feature importance data yet" />}
              </Card>
            </div>
            <Card title="📊 Anomaly Score Distribution — Red bars = anomalies (score < −0.1)" height={200}>
              {loading ? <Spinner /> : stats?.anomaly_scores?.length
                ? <Bar data={{ labels: stats.anomaly_scores.slice(0,50).map((_,i) => i+1),
                    datasets:[{ label:"Score", data: stats.anomaly_scores.slice(0,50),
                      backgroundColor: stats.anomaly_scores.slice(0,50).map(s => s < -0.1
                        ? "rgba(248,113,113,0.75)" : "rgba(56,189,248,0.4)"), borderRadius:2 }] }}
                    options={chartOpts({ plugins:{ ...chartOpts().plugins, legend:{display:false} } })} />
                : <EmptyState icon="📊" msg="No anomaly score data yet" />}
            </Card>
          </div>
        )}

        {/* ── ALERTS ────────────────────────────────────────────────────────── */}
        {tab === "alerts" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h2 style={{ ...S.pageTitle, marginBottom:0 }}>All Alerts</h2>
              <button onClick={exportCSV} style={{ padding:"8px 16px", background:"rgba(74,222,128,0.1)",
                border:`1px solid ${T.green}`, borderRadius:8, color:T.green, cursor:"pointer",
                fontSize:12, fontWeight:500 }}>
                ⬇ Export CSV
              </button>
            </div>

            {/* Filters */}
            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <input placeholder="Search attack type…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...S.filterInput, flex:1, minWidth:180 }} />
              <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={S.filterSelect}>
                <option value="All">All Severities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={S.filterSelect}>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
              <div style={{ color:T.muted, fontSize:12, display:"flex", alignItems:"center" }}>
                {filteredAlerts.length} result{filteredAlerts.length !== 1 ? "s" : ""}
              </div>
            </div>

            <Card title="">
              {loading ? <Spinner /> : filteredAlerts.length === 0
                ? <EmptyState icon="🔍" msg="No alerts match your filters." />
                : <table style={S.table}>
                    <thead><tr>{["ID","Timestamp","Attack Type","Anomaly Score","Risk","Severity","Action"].map(h =>
                      <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{filteredAlerts.map(a => (
                      <tr key={a.id} style={{ ...S.tr, animation: newAlert && a.id === alerts[0]?.id ? "flash 1s ease" : "none" }}>
                        <td style={{ ...S.td, color:T.muted }}>#{a.id}</td>
                        <td style={{ ...S.td, fontSize:11 }}>{fmt(a.timestamp)}</td>
                        <td style={{ ...S.td, color: a.attack_type==="BENIGN" ? T.green : T.orange, fontWeight:600 }}>{a.attack_type}</td>
                        <td style={{ ...S.td, color: a.anomaly_score < -0.1 ? T.red : T.blue, fontFamily:"monospace" }}>{a.anomaly_score?.toFixed(4)}</td>
                        <td style={S.td}>{a.risk_score?.toFixed(1)}</td>
                        <td style={S.td}>{sev(a.severity)}</td>
                        <td style={S.td}>
                          <button onClick={() => { setShapAlertId(String(a.id)); loadShap(a.id); setTab("shap"); }}
                            style={{ background:"rgba(129,140,248,0.1)", border:"1px solid rgba(129,140,248,0.3)",
                              borderRadius:6, color:T.indigo, cursor:"pointer", padding:"4px 10px", fontSize:11, fontWeight:500 }}>
                            Explain
                          </button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>}
            </Card>
          </div>
        )}

        {/* ── DETECT ────────────────────────────────────────────────────────── */}
        {tab === "detect" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <h2 style={S.pageTitle}>Manual Detection</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>

              {/* Input form */}
              <Card title="Input Network Features">
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  {FEATURES.map(f => (
                    <div key={f}>
                      <div style={{ color:T.muted, fontSize:10, marginBottom:3 }}>{f}</div>
                      <input type="number" placeholder={String(DEMO_VALS[f] || 0)}
                        value={featForm[f] ?? ""}
                        onChange={e => setFeatForm(p => ({ ...p, [f]: e.target.value }))}
                        style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`,
                          borderRadius:6, padding:"6px 8px", color:T.text, fontSize:12, outline:"none" }} />
                    </div>
                  ))}
                </div>
                {detectErr && <div style={{ color:T.red, fontSize:12, marginBottom:10 }}>{detectErr}</div>}
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setFeatForm(DEMO_VALS)}
                    style={{ flex:1, padding:"9px 0", background:"transparent", border:`1px solid ${T.border}`,
                      borderRadius:7, color:T.sub, cursor:"pointer", fontSize:12, fontWeight:500 }}>
                    Load Demo Values
                  </button>
                  <button onClick={runDetect} disabled={detecting}
                    style={{ flex:1, padding:"9px 0", background:"linear-gradient(135deg,#0ea5e9,#6366f1)",
                      border:"none", borderRadius:7, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600,
                      opacity: detecting ? 0.7 : 1 }}>
                    {detecting ? "⏳ Detecting…" : "🔍 Run Detection"}
                  </button>
                </div>
              </Card>

              {/* Result */}
              <div>
                {detectRes ? (
                  <Card title="Detection Result">
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {[["Alert ID", `#${detectRes.alert_id}`],
                        ["Attack Type", detectRes.attack_type],
                        ["Anomaly Score", detectRes.anomaly_score?.toFixed(4)],
                        ["Risk Score", `${detectRes.risk_score?.toFixed(1)} / 100`],
                        ["Is Anomaly", detectRes.is_anomaly ? "Yes ⚠️" : "No ✅"],
                      ].map(([k,v]) => (
                        <div key={k} style={{ display:"flex", justifyContent:"space-between",
                          borderBottom:`1px solid ${T.border}`, paddingBottom:8 }}>
                          <span style={{ color:T.muted, fontSize:12 }}>{k}</span>
                          <span style={{ color:T.text, fontWeight:600, fontSize:13 }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ color:T.muted, fontSize:12 }}>Severity</span>
                        {sev(detectRes.severity)}
                      </div>
                      <button onClick={() => { setShapAlertId(String(detectRes.alert_id)); loadShap(detectRes.alert_id); setTab("shap"); }}
                        style={{ marginTop:6, padding:"9px 0", background:"rgba(129,140,248,0.1)",
                          border:`1px solid rgba(129,140,248,0.3)`, borderRadius:7, color:T.indigo,
                          cursor:"pointer", fontSize:12, fontWeight:600 }}>
                        🔬 View SHAP Explanation
                      </button>
                    </div>
                  </Card>
                ) : (
                  <Card title="">
                    <EmptyState icon="🔍" msg={"Fill in features and click\nRun Detection"} />
                  </Card>
                )}

                {/* Detection history */}
                {detectHistory.length > 0 && (
                  <Card title="Detection History">
                    <table style={S.table}>
                      <thead><tr>{["#","Type","Risk","Sev"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>{detectHistory.map((d, i) => (
                        <tr key={i} style={S.tr}>
                          <td style={{ ...S.td, color:T.muted }}>#{d.alert_id}</td>
                          <td style={{ ...S.td, color: d.attack_type==="BENIGN" ? T.green : T.orange, fontWeight:600, fontSize:11 }}>{d.attack_type}</td>
                          <td style={S.td}>{d.risk_score?.toFixed(1)}</td>
                          <td style={S.td}>{sev(d.severity)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </Card>
                )}
              </div>
            </div>

            {/* CSV Upload */}
            <Card title="📤 Bulk CSV Upload">
              <p style={{ color:T.muted, fontSize:12, marginBottom:12 }}>
                Upload a CSV with CICIDS 2017 feature columns for bulk detection.
              </p>
              <input type="file" accept=".csv" style={{ color:T.text, fontSize:13 }}
                onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  const fd = new FormData(); fd.append("file", file);
                  try {
                    const { data } = await API.post("/detect/upload-csv", fd);
                    showToast(`Processed ${data.processed} rows`);
                    fetchAll();
                  } catch { showToast("CSV upload failed", "error"); }
                }} />
            </Card>
          </div>
        )}

        {/* ── SHAP EXPLAIN ──────────────────────────────────────────────────── */}
        {tab === "shap" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <h2 style={S.pageTitle}>SHAP Explainability</h2>

            {/* Alert selector */}
            <Card title="Select Alert to Explain">
              <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
                <div style={{ flex:1 }}>
                  <div style={{ color:T.muted, fontSize:11, marginBottom:5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" }}>Alert ID</div>
                  <select value={shapAlertId} onChange={e => setShapAlertId(e.target.value)}
                    style={{ ...S.filterSelect, width:"100%" }}>
                    <option value="">— Choose an alert —</option>
                    {alerts.slice(0,50).map(a => (
                      <option key={a.id} value={a.id}>
                        #{a.id} — {a.attack_type} — Risk: {a.risk_score?.toFixed(1)} — {fmtT(a.timestamp)}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={() => loadShap(shapAlertId)} disabled={!shapAlertId || shapLoading}
                  style={{ padding:"10px 20px", background:"linear-gradient(135deg,#0ea5e9,#6366f1)",
                    border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600,
                    opacity: !shapAlertId ? 0.5 : 1 }}>
                  {shapLoading ? "⏳ Loading…" : "Explain"}
                </button>
              </div>
              {shapErr && <div style={{ color:T.red, fontSize:12, marginTop:10 }}>{shapErr}</div>}
            </Card>

            {shapLoading && <Spinner />}

            {shapData && !shapLoading && (
              <div>
                {/* Stats */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
                  <StatCard icon="🎯" label="Alert ID"     value={`#${shapData.alert_id}`}   accent={T.blue} />
                  <StatCard icon="⚔️" label="Attack Type"  value={shapData.attack_type}       accent={T.orange} />
                  <StatCard icon="📉" label="Anomaly Score" value={shapData.anomaly_score?.toFixed(4)} accent={T.indigo} />
                  <StatCard icon="🔢" label="Features"     value={Object.keys(shapData.feature_contributions).length} accent={T.green} />
                </div>

                {/* Plain English explanation */}
                <div style={{ background:"rgba(56,189,248,0.08)", border:`1px solid rgba(56,189,248,0.2)`,
                  borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
                  <div style={{ color:T.blue, fontWeight:600, fontSize:12, marginBottom:4 }}>💡 Plain English Explanation</div>
                  <div style={{ color:T.text, fontSize:13 }}>{shapPlainEnglish()}</div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                  <Card title="SHAP Feature Contributions — Red = toward attack, Blue = toward benign" height={280}>
                    {shapBarData
                      ? <Bar data={shapBarData} options={chartOpts({ indexAxis:"y",
                          plugins:{ ...chartOpts().plugins, legend:{display:false} },
                          scales:{ x:{ ticks:{color:T.muted,font:{size:9}}, grid:{color:"rgba(255,255,255,0.04)"},
                            title:{display:true,text:"SHAP Value",color:T.muted,font:{size:10}} },
                            y:{ ticks:{color:T.muted,font:{size:9}}, grid:{color:"rgba(255,255,255,0.04)"} } } })} />
                      : <EmptyState icon="📊" msg="No SHAP data available" />}
                  </Card>

                  {/* Visual bars */}
                  <Card title="Top Feature Impact">
                    {shapData.top_features.slice(0,8).map((f, i) => {
                      const max = Math.max(...shapData.top_features.map(x => Math.abs(x.shap)));
                      const pct = max > 0 ? (Math.abs(f.shap) / max) * 100 : 0;
                      return (
                        <div key={i} style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                            <span style={{ color:T.sub, fontSize:11, maxWidth:"70%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.feature}</span>
                            <span style={{ color: f.shap >= 0 ? T.red : T.blue, fontSize:11, fontFamily:"monospace", fontWeight:600 }}>
                              {f.shap >= 0 ? "+" : ""}{f.shap?.toFixed(4)}
                            </span>
                          </div>
                          <div style={{ height:6, background:T.bg, borderRadius:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${pct}%`,
                              background: f.shap >= 0 ? "rgba(248,113,113,0.8)" : "rgba(56,189,248,0.8)",
                              borderRadius:3, transition:"width .4s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                </div>

                {/* Table */}
                <Card title="Feature Contributions Table">
                  <table style={S.table}>
                    <thead><tr>{["Rank","Feature","SHAP Value","Direction"].map(h =>
                      <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{shapData.top_features.map((f, i) => (
                      <tr key={f.feature} style={S.tr}>
                        <td style={{ ...S.td, color:T.muted }}>#{i+1}</td>
                        <td style={S.td}>{f.feature}</td>
                        <td style={{ ...S.td, color: f.shap >= 0 ? T.red : T.blue, fontFamily:"monospace", fontWeight:600 }}>
                          {f.shap >= 0 ? "+" : ""}{f.shap?.toFixed(5)}
                        </td>
                        <td style={{ ...S.td, color: f.shap >= 0 ? T.red : T.blue, fontSize:12 }}>
                          {f.shap >= 0 ? "▲ Toward Attack" : "▼ Toward Benign"}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
              </div>
            )}

            {!shapData && !shapLoading && (
              <Card title="">
                <EmptyState icon="🔬" msg="Select an alert above and click Explain, or click Explain on any alert in the Alerts tab." />
              </Card>
            )}
          </div>
        )}

        {/* ── LOGS ──────────────────────────────────────────────────────────── */}
        {tab === "logs" && user?.role === "admin" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <h2 style={S.pageTitle}>System Logs</h2>
            <Card title="">
              {loading ? <Spinner /> : logs.length === 0
                ? <EmptyState icon="📋" msg="No logs yet." />
                : <table style={S.table}>
                    <thead><tr>{["ID","Timestamp","User","Action","Detail"].map(h =>
                      <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{logs.map(l => (
                      <tr key={l.id} style={S.tr}>
                        <td style={{ ...S.td, color:T.muted }}>#{l.id}</td>
                        <td style={{ ...S.td, fontSize:11 }}>{fmt(l.timestamp)}</td>
                        <td style={{ ...S.td, color:T.muted }}>{l.user_id || "—"}</td>
                        <td style={{ ...S.td, color:T.blue, fontWeight:600 }}>{l.action}</td>
                        <td style={{ ...S.td, color:T.muted, fontSize:11 }}>{l.detail || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>}
            </Card>
          </div>
        )}

      </main>
    </div>
  );
}

const S = {
  pageTitle: { color:T.blue, fontSize:18, fontWeight:700, letterSpacing:"-0.5px", marginBottom:20 },
  table: { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th: { textAlign:"left", padding:"8px 12px", color:T.muted, borderBottom:`1px solid ${T.border}`,
        fontSize:11, fontWeight:600, letterSpacing:"0.3px", textTransform:"uppercase" },
  td: { padding:"10px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, color:T.text },
  tr: { transition:"background .1s" },
  filterInput: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
    padding:"8px 12px", color:T.text, fontSize:13, outline:"none" },
  filterSelect: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
    padding:"8px 12px", color:T.text, fontSize:13, outline:"none" },
};
