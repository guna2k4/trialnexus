import { useState, useEffect, useRef } from 'react'
import {
  FlaskConical, Users, Building2, TrendingDown,
  MessageSquare, Send, X, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

const STATE_NAMES = {
  Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR',
  California:'CA', Colorado:'CO', Connecticut:'CT', Delaware:'DE',
  Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID',
  Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS',
  Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD',
  Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS',
  Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV',
  'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY',
  'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK',
  Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC',
  'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT',
  Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV',
  Wisconsin:'WI', Wyoming:'WY', 'District of Columbia':'DC',
}

function stateColor(abbr, lookup) {
  const s = lookup[abbr]
  if (!s) return '#e2e8f0'
  if (s.avg_enrollment_pct >= 80) return '#22c55e'
  if (s.avg_enrollment_pct >= 60) return '#f59e0b'
  return '#ef4444'
}

// ── KPI Card ────────────────────────────────────────────────
function KPICard({ title, value, Icon, accent, sub }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  )
}

// ── US Map ───────────────────────────────────────────────────
function USMap({ lookup }) {
  const [tip, setTip] = useState(null)

  return (
    <div className="relative">
      <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: 270 }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const abbr  = STATE_NAMES[geo.properties.name]
              const color = stateColor(abbr, lookup)
              const s     = lookup[abbr]
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: 'none' },
                    hover:   { outline: 'none', opacity: 0.75, cursor: 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={() => setTip({ name: geo.properties.name, abbr, s })}
                  onMouseLeave={() => setTip(null)}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-1 text-xs text-slate-500">
        {[
          { color: 'bg-green-500', label: '≥ 80% Good' },
          { color: 'bg-amber-400', label: '60–80% At Risk' },
          { color: 'bg-red-500',   label: '< 60% Critical' },
          { color: 'bg-slate-200', label: 'No Data' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {tip && (
        <div className="absolute top-2 left-2 bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl pointer-events-none min-w-[140px]">
          <p className="font-semibold mb-1">{tip.name} {tip.abbr ? `(${tip.abbr})` : ''}</p>
          {tip.s
            ? <>
                <p>Enrollment: <span className="font-semibold">{tip.s.avg_enrollment_pct}%</span></p>
                <p>Sites: {tip.s.total_sites} · High Risk: {tip.s.high_risk}</p>
              </>
            : <p className="text-slate-400">No trial data</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Area Chart ───────────────────────────────────────────────
function TrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={265}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="gEnroll" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gDropout" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }}
          itemStyle={{ color: '#e2e8f0' }}
          cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
        <Area type="monotone" dataKey="enrollment" name="Enrollment"
          stroke="#6366f1" strokeWidth={2} fill="url(#gEnroll)" dot={false} />
        <Area type="monotone" dataKey="dropout" name="Dropout"
          stroke="#ef4444" strokeWidth={2} fill="url(#gDropout)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Chat Window ──────────────────────────────────────────────
function ChatWindow({ kpis }) {
  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([{
    role: 'ai',
    text: 'Hello! Ask me anything about your trial dashboard — enrollment gaps, dropout trends, or at-risk sites.',
  }])
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])
    setLoading(true)
    try {
      const res  = await fetch(`${API}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_message: text, dashboard_context: kpis }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'ai', text: data.answer || 'No response.' }])
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Server unreachable — is the API running on port 8000?' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare size={15} /> Chat with Dashboard
            </span>
            <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-col gap-2 p-3 overflow-y-auto max-h-72">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-100 text-slate-800 rounded-bl-none'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-400 px-3 py-2 rounded-xl rounded-bl-none text-xs">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-slate-100 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask a question…"
              className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 transition-colors"
            />
            <button
              onClick={send}
              disabled={loading}
              className="w-8 h-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center justify-center text-white transition-colors flex-shrink-0"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch(`${API}/api/dashboard-data`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d  => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading dashboard…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6 text-center max-w-sm">
        <p className="text-red-500 font-semibold text-sm mb-1">Could not load dashboard</p>
        <p className="text-slate-400 text-xs">{error}</p>
        <p className="text-slate-400 text-xs mt-2">Make sure <code className="bg-slate-100 px-1 rounded">python api.py</code> is running.</p>
      </div>
    </div>
  )

  const { kpis, state_enrollment, monthly_trends } = data

  // Build abbr → stats lookup for the map
  const stateLookup = {}
  ;(state_enrollment || []).forEach(s => { stateLookup[s.state] = s })

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Clinical Trial Control Tower</h1>
            <p className="text-xs text-slate-400">Real-time enrollment & site intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Live
        </div>
      </header>

      <main className="px-8 py-6 max-w-screen-xl mx-auto flex flex-col gap-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            title="Total Active Trials"
            value={kpis.active_trials}
            Icon={FlaskConical}
            accent="bg-indigo-50 text-indigo-600"
            sub="Across all sites"
          />
          <KPICard
            title="Avg Enrollment Rate"
            value={`${kpis.avg_enrollment_rate}%`}
            Icon={Users}
            accent="bg-green-50 text-green-600"
            sub="of target reached"
          />
          <KPICard
            title="Site Activation Rate"
            value={`${kpis.site_activation_rate}%`}
            Icon={Building2}
            accent="bg-blue-50 text-blue-600"
            sub="sites above 50% enrolled"
          />
          <KPICard
            title="Avg Dropout Rate"
            value={`${kpis.avg_dropout_rate}%`}
            Icon={TrendingDown}
            accent="bg-red-50 text-red-600"
            sub="patient attrition"
          />
        </div>

        {/* ── Map + Chart ── */}
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Enrollment by State</h2>
            <USMap lookup={stateLookup} />
          </div>

          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">12-Month Patient Enrollment & Retention</h2>
            <TrendChart data={monthly_trends} />
          </div>
        </div>

      </main>

      {/* ── Floating Chat ── */}
      <ChatWindow kpis={kpis} />
    </div>
  )
}
