import { useState, useRef, useEffect } from 'react'
import CommercialChatPanel from '../components/CommercialChatPanel'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import {
  PieChart, Pie, Cell,
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  COMMERCIAL_STATE_SCORES,
  STATE_TO_REGION,
  COMMERCIAL_REGIONS,
  COMMERCIAL_KPIS,
  COMMERCIAL_MONTHLY,
  COMMERCIAL_TOPICS,
  COMMERCIAL_SENTIMENT,
} from '../data'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'
const API = '/api'

const NAME_TO_ABBR = {
  Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA',
  Colorado:'CO', Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA',
  Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS',
  Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD', Massachusetts:'MA',
  Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO', Montana:'MT',
  Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ',
  'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND',
  Ohio:'OH', Oklahoma:'OK', Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI',
  'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN', Texas:'TX',
  Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV',
  Wisconsin:'WI', Wyoming:'WY', 'District of Columbia':'DC',
}

const ABBR_TO_NAME = Object.fromEntries(Object.entries(NAME_TO_ABBR).map(([k,v]) => [v,k]))

const ROLES = [
  { id: 'Researcher',      label: 'Researcher',      desc: 'Deep data-driven analysis' },
  { id: 'Brand Team',      label: 'Brand Team',       desc: 'Market positioning & strategy' },
  { id: 'Field Team',      label: 'Field Team',       desc: 'HCP talking points' },
  { id: 'Medical Affairs', label: 'Medical Affairs',  desc: 'KOL themes & evidence gaps' },
]

function scoreToColor(score, selected) {
  if (selected) return '#22d3ee'
  if (!score) return '#0f2744'
  if (score >= 85) return '#06b6d4'
  if (score >= 75) return '#0ea5e9'
  if (score >= 65) return '#1d6fa4'
  if (score >= 55) return '#164e72'
  return '#0f2744'
}

const TOOLTIP_STYLE = {
  fontSize: 11,
  background: '#0D1B2E',
  border: '1px solid #1E3A5F',
  borderRadius: 10,
  color: '#e2e8f0',
}

function KPICard({ label, value, sub, trend, up, accent }) {
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-2 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#0D1B2E 60%,#0a2240)', borderColor: '#1E3A5F' }}
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${accent}, transparent 70%)` }}
      />
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-4xl font-extrabold" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-xs text-slate-500 leading-snug">{sub}</p>}
      {trend != null && (
        <span className={`inline-flex items-center gap-1 text-xs font-bold mt-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '▲' : '▼'} {Math.abs(trend)}% vs last quarter
        </span>
      )}
    </div>
  )
}

function RegionTooltip({ tip }) {
  const r = tip.region
  if (!r) return null
  return (
    <div
      className="fixed z-50 rounded-2xl shadow-2xl border pointer-events-none min-w-[240px] p-4"
      style={{ top: tip.y + 14, left: tip.x + 14, background: '#0D1B2E', borderColor: '#1E3A5F' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white">{tip.regionName}</span>
        <div className="text-right">
          <span className="text-lg font-bold text-cyan-400">{r.score}</span>
          <span className={`ml-1.5 text-xs font-semibold ${r.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {r.trend >= 0 ? '▲' : '▼'} {Math.abs(r.trend)}% QoQ
          </span>
        </div>
      </div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Field</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div className="flex justify-between"><span className="text-slate-500">Prescriber Loyalty</span><span className="font-semibold text-slate-200">{r.field.prescriber_loyalty}%</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Coverage</span><span className="font-semibold text-slate-200">{r.field.coverage}%</span></div>
      </div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Marketing</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between"><span className="text-slate-500">Diag. Alignment</span><span className="font-semibold text-slate-200">{r.marketing.diagnostic_alignment}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-semibold text-slate-200">{r.marketing.email}%</span></div>
        <div className="flex justify-between"><span className="text-slate-500">CME</span><span className="font-semibold text-slate-200">{r.marketing.cme}%</span></div>
        <div className="flex justify-between"><span className="text-slate-500">In-Person</span><span className="font-semibold text-slate-200">{r.marketing.in_person}%</span></div>
      </div>
    </div>
  )
}

function TopicTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl border" style={{ background: '#0D1B2E', borderColor: '#1E3A5F', color: '#e2e8f0' }}>
      <p className="font-semibold mb-1 text-white">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}%</p>)}
    </div>
  )
}

function OverviewPanel({ kpis }) {
  const donut = [
    { name: 'Strong',   value: kpis.strong_pct,   color: '#22d3ee' },
    { name: 'Moderate', value: kpis.moderate_pct,  color: '#0ea5e9' },
    { name: 'At Risk',  value: kpis.at_risk_pct,   color: '#1E3A5F' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center">
        <div className="relative flex justify-center">
          <PieChart width={160} height={160}>
            <Pie data={donut} cx={80} cy={80} innerRadius={52} outerRadius={70}
              dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
              {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-extrabold text-white">{kpis.total_score}</span>
            <span className="text-xs text-cyan-400 font-bold">▲ {kpis.score_trend} QoQ</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 text-center mt-1">Commercial Health</p>
        <div className="flex flex-col gap-1.5 mt-3 w-full">
          {donut.map(d => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-slate-400">{d.name}</span>
              </div>
              <span className="font-bold text-white">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t pt-4 flex flex-col gap-3" style={{ borderColor: '#1E3A5F' }}>
        {[
          { label: 'Coverage Efficiency', value: `${kpis.coverage_efficiency}%`,  trend: kpis.coverage_trend,              up: true  },
          { label: 'Prescription Lift',   value: `${kpis.prescription_lift}%`,    trend: kpis.prescription_trend,          up: true  },
          { label: 'Switch Prevention',   value: `${kpis.switch_prevention}%`,    trend: Math.abs(kpis.switch_trend),      up: false },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{row.label}</span>
            <div className="text-right">
              <span className="text-sm font-bold text-white">{row.value}</span>
              <span className={`ml-1.5 text-xs font-bold ${row.up ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.up ? '▲' : '▼'} {row.trend}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FieldPanel({ kpis }) {
  const bars = [
    { label: 'HCP Coverage',         value: kpis.hcp_coverage,         color: '#22d3ee' },
    { label: 'Prescriber Loyalty',   value: kpis.prescriber_loyalty,   color: '#6366f1' },
    { label: 'Diagnostic Alignment', value: kpis.diagnostic_alignment, color: '#0ea5e9' },
    { label: 'Switch Prevention',    value: kpis.switch_prevention,    color: '#14b8a6' },
  ]
  return (
    <div className="flex flex-col gap-4">
      {bars.map(b => (
        <div key={b.label}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">{b.label}</span>
            <span className="font-bold text-white">{b.value}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1E3A5F' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${b.value}%`, background: b.color, boxShadow: `0 0 8px ${b.color}88` }} />
          </div>
        </div>
      ))}
      <div className="border-t pt-3 space-y-2.5" style={{ borderColor: '#1E3A5F' }}>
        {[
          { label: 'Access Barriers',           val: `${kpis.access_barriers} Low`,                       color: 'text-amber-400'  },
          { label: 'Competing Brand Influence',  val: `${kpis.competing_brand_influence} Medium`,          color: 'text-orange-400' },
          { label: 'Field Feedback Issues',      val: `${kpis.field_feedback_issues} Reported`,            color: 'text-red-400'    },
          { label: 'Brand Perception Index',     val: `${kpis.brand_perception_index}/100`,                color: 'text-cyan-400'   },
        ].map(r => (
          <div key={r.label} className="flex justify-between text-xs">
            <span className="text-slate-500">{r.label}</span>
            <span className={`font-bold ${r.color}`}>{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MarketingPanel({ kpis }) {
  const channels = [
    { label: 'Email',     pct: 34, color: '#22d3ee' },
    { label: 'CME',       pct: 31, color: '#6366f1' },
    { label: 'In-Person', pct: 24, color: '#0ea5e9' },
    { label: 'Digital',   pct: 11, color: '#14b8a6' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Channel Mix</p>
        <div className="flex h-3 rounded-full overflow-hidden gap-px">
          {channels.map(c => (
            <div key={c.label} style={{ width: `${c.pct}%`, background: c.color }} title={`${c.label} ${c.pct}%`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-2.5">
          {channels.map(c => (
            <div key={c.label} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
              <span className="text-slate-400">{c.label} <span className="font-bold text-white">{c.pct}%</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t pt-3 space-y-3" style={{ borderColor: '#1E3A5F' }}>
        {[
          { label: 'Diagnostic Alignment', value: `${kpis.diagnostic_alignment}%`, trend: `▲ ${kpis.diagnostic_trend}%`,      up: true  },
          { label: 'Prescription Lift',    value: `${kpis.prescription_lift}%`,    trend: `▲ ${kpis.prescription_trend}%`,     up: true  },
          { label: 'Switch Prevention',    value: `${kpis.switch_prevention}%`,    trend: `▼ ${Math.abs(kpis.switch_trend)}%`, up: false },
        ].map(r => (
          <div key={r.label} className="flex justify-between items-center">
            <span className="text-xs text-slate-500">{r.label}</span>
            <div>
              <span className="text-sm font-bold text-white">{r.value}</span>
              <span className={`ml-1.5 text-xs font-bold ${r.up ? 'text-emerald-400' : 'text-red-400'}`}>{r.trend}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl p-3" style={{ background: '#0a2240', border: '1px solid #1E3A5F' }}>
        <p className="text-xs font-bold text-cyan-400 mb-1">Top Performing Campaign</p>
        <p className="text-xs text-slate-400">Ribociclib CME series — 2.4× ROI vs national avg</p>
      </div>
    </div>
  )
}

function sentimentStyle(sentiment) {
  if (sentiment === 'Positive') return { bg: '#052e16', color: '#34d399', label: 'Positive' }
  if (sentiment === 'Negative') return { bg: '#2d0a0a', color: '#f87171', label: 'Negative' }
  return { bg: '#1E3A5F', color: '#94a3b8', label: 'Neutral' }
}

function TwitterCard({ source }) {
  const sent = sentimentStyle(source.sentiment)
  const handle = source.author || source.channel || ''

  return (
    <div className="w-full rounded-xl p-3 flex flex-col gap-2"
         style={{ background: '#060D1A', border: '1px solid #1a3a5c' }}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
               style={{ background: '#1a3a5c', color: '#1DA1F2' }}>𝕏</div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{handle}</p>
            <p className="text-[10px] text-slate-600">via X / Twitter</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {source.state && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{ background: '#0a2240', color: '#22d3ee' }}>{source.state}</span>
          )}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: sent.bg, color: sent.color, border: `1px solid ${sent.color}55` }}>
            {sent.label}
          </span>
        </div>
      </div>
      {/* Tweet text */}
      <p className="text-xs text-slate-200 leading-relaxed">
        {source.title || source.signal_id || ''}
      </p>
    </div>
  )
}

function NewsCard({ source }) {
  const sent = sentimentStyle(source.sentiment)
  const platform = source.source_type || source.source || 'News'
  const href = source.url
    ? source.url.startsWith('http') ? source.url : `https://${source.url}`
    : '#'

  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="flex flex-row w-full rounded-xl overflow-hidden group transition-all"
       style={{ background: '#060D1A', border: '1px solid #1E3A5F' }}
       onMouseEnter={e => e.currentTarget.style.borderColor = '#22d3ee55'}
       onMouseLeave={e => e.currentTarget.style.borderColor = '#1E3A5F'}>

      <div className="relative flex-shrink-0 flex items-center justify-center overflow-hidden"
           style={{ width: 120, minHeight: 90, background: '#0a1628' }}>
        <div className="flex flex-col items-center justify-center gap-1" style={{ minHeight: 90 }}>
          <span className="text-2xl">📰</span>
          <span className="text-[9px] font-bold uppercase tracking-wider"
                style={{ color: '#64748b' }}>{platform}</span>
        </div>
        <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: sent.bg, color: sent.color, border: `1px solid ${sent.color}55` }}>
          {sent.label}
        </span>
      </div>

      <div className="flex flex-col justify-center gap-1.5 px-3 py-2.5 flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2 group-hover:text-cyan-400 transition-colors">
          {source.title || source.signal_id || 'Source'}
        </p>
        {(source.author || source.channel) && (
          <p className="text-[10px] text-slate-500 truncate">{source.author || source.channel}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: '#1E3A5F', color: '#94a3b8' }}>{platform}</span>
          {source.state && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{ background: '#0a2240', color: '#22d3ee' }}>{source.state}</span>
          )}
        </div>
        {source.url && (
          <p className="text-[10px] text-slate-600 truncate mt-0.5">
            {source.url.replace(/^https?:\/\//, '').slice(0, 42)}
          </p>
        )}
      </div>
    </a>
  )
}

function WebSourceCard({ source }) {
  const href = source.url
    ? source.url.startsWith('http') ? source.url : `https://${source.url}`
    : '#'
  const domain = source.source || (source.url ? source.url.replace(/^https?:\/\//, '').split('/')[0] : 'Web')

  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="flex flex-col gap-1.5 w-full rounded-xl p-3 group transition-all"
       style={{ background: '#060D1A', border: '1px solid #1E3A5F' }}
       onMouseEnter={e => e.currentTarget.style.borderColor = '#22d3ee55'}
       onMouseLeave={e => e.currentTarget.style.borderColor = '#1E3A5F'}>
      <p className="text-xs font-semibold text-white leading-snug line-clamp-2 group-hover:text-cyan-400 transition-colors">
        {source.title || 'Article'}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: '#0a2240', color: '#22d3ee' }}>🌐 {domain}</span>
        {source.score != null && (
          <span className="text-[10px] text-slate-600">relevance {Math.round(source.score * 100)}%</span>
        )}
      </div>
      {source.snippet && (
        <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{source.snippet}</p>
      )}
    </a>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5
        ${isUser ? 'bg-cyan-500 text-white' : 'bg-[#1E3A5F] text-slate-300'}`}>
        {isUser ? 'You' : 'AI'}
      </div>

      <div className={`flex flex-col gap-2 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Agent status pill — shown while streaming */}
        {!isUser && msg.streaming && msg.agentStatus && (
          <div className="flex items-center gap-2 text-[10px] font-semibold text-cyan-400 px-3 py-1.5 rounded-full"
               style={{ background: '#0a2240', border: '1px solid #1E3A5F' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {msg.agentStatus}
          </div>
        )}

        {/* Message bubble */}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-cyan-500 text-white rounded-tr-sm'
            : 'text-slate-200 rounded-tl-sm'}`}
          style={isUser ? {} : { background: '#0D1B2E', border: '1px solid #1E3A5F' }}>
          {msg.content || (msg.streaming && !msg.agentStatus && (
            <span className="flex gap-1 items-center h-4">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          ))}
        </div>

        {/* Tavily web sources — shown after streaming finishes */}
        {!isUser && !msg.streaming && msg.sources?.length > 0 && (
          <div className="flex flex-col gap-2 w-full">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Live Web Sources · {msg.sources.length} results
            </p>
            <div className="flex flex-col gap-2">
              {msg.sources.map((s, i) => <WebSourceCard key={i} source={s} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ReportRenderer({ text, loading }) {
  const lines = text.split('\n')
  return (
    <div className="flex flex-col gap-1" style={{ fontFamily: 'inherit' }}>
      {lines.map((line, i) => {
        if (line.startsWith('# '))
          return <h1 key={i} className="text-xl font-extrabold text-white mt-2 mb-3">{line.slice(2)}</h1>
        if (line.startsWith('## '))
          return (
            <h2 key={i} className="text-sm font-bold text-cyan-400 uppercase tracking-widest mt-5 mb-2 pb-1.5 border-b"
                style={{ borderColor: '#1E3A5F' }}>{line.slice(3)}</h2>
          )
        if (line.startsWith('### '))
          return <h3 key={i} className="text-sm font-bold text-slate-200 mt-3 mb-1">{line.slice(4)}</h3>
        if (line.startsWith('• ') || line.startsWith('- '))
          return (
            <div key={i} className="flex gap-2 text-sm text-slate-300 leading-relaxed pl-2">
              <span className="text-cyan-400 flex-shrink-0 mt-0.5">▸</span>
              <span>{line.slice(2)}</span>
            </div>
          )
        if (line.match(/^\d+\./))
          return (
            <div key={i} className="flex gap-2 text-sm text-slate-300 leading-relaxed pl-2">
              <span className="text-cyan-400 font-bold flex-shrink-0">{line.match(/^\d+/)[0]}.</span>
              <span>{line.replace(/^\d+\./, '').trim()}</span>
            </div>
          )
        if (line.startsWith('**') && line.endsWith('**'))
          return <p key={i} className="text-sm font-bold text-white mt-2">{line.slice(2, -2)}</p>
        if (line.trim() === '')
          return <div key={i} className="h-1" />
        return <p key={i} className="text-sm text-slate-300 leading-relaxed">{line}</p>
      })}
      {loading && <span className="inline-block w-1.5 h-4 bg-cyan-400 ml-1 animate-pulse rounded-sm" />}
    </div>
  )
}

export default function CommercialView() {
  const [activeTab,     setActiveTab]     = useState('Overview')
  const [tip,           setTip]           = useState(null)
  const [chatOpen,      setChatOpen]      = useState(false)

  // Map selection
  const [selectedState, setSelectedState] = useState('')

  // Chat
  const [chatRole,   setChatRole]   = useState('Researcher')
  const [cityInput,  setCityInput]  = useState('')
  const [chatInput,  setChatInput]  = useState('')
  const [messages,   setMessages]   = useState([])
  const [streaming,  setStreaming]  = useState(false)

  const chatEndRef   = useRef(null)
  const readerRef    = useRef(null)
  const chatPanelRef = useRef(null)
  const reportRef    = useRef(null)

  const [report,        setReport]        = useState('')
  const [reportLoading, setReportLoading] = useState(false)


  const tabs = ['Overview', 'Field', 'Marketing']

  const topicData = COMMERCIAL_TOPICS.map(t => ({
    topic:    t.topic.length > 20 ? t.topic.slice(0, 20) + '…' : t.topic,
    Positive: Math.round((t.positive / t.total) * 100),
    Neutral:  Math.round((t.neutral  / t.total) * 100),
    Negative: Math.round((t.negative / t.total) * 100),
  }))

  const kpiCards = [
    { label: 'Coverage Efficiency',  value: `${COMMERCIAL_KPIS.coverage_efficiency}%`,  sub: 'Field deployment effectiveness',       trend: COMMERCIAL_KPIS.coverage_trend,              up: true,  accent: '#22d3ee' },
    { label: 'Prescription Lift',    value: `${COMMERCIAL_KPIS.prescription_lift}%`,    sub: 'Avg. script increase per HCP',          trend: COMMERCIAL_KPIS.prescription_trend,          up: true,  accent: '#6366f1' },
    { label: 'Switch Prevention',    value: `${COMMERCIAL_KPIS.switch_prevention}%`,    sub: 'Prescribers retained vs competitors',   trend: Math.abs(COMMERCIAL_KPIS.switch_trend),      up: false, accent: '#f43f5e' },
    { label: 'Diagnostic Alignment', value: `${COMMERCIAL_KPIS.diagnostic_alignment}%`, sub: 'Regional fit with brand indications',  trend: COMMERCIAL_KPIS.diagnostic_trend,            up: true,  accent: '#10b981' },
  ]

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-generate report once the synthesizer finishes streaming
  useEffect(() => {
    if (streaming) return
    const last = messages.filter(m => m.role === 'assistant').at(-1)
    if (!last || last.streaming || reportLoading || report) return
    if ((last.sources?.length > 0) || (last.internalSources?.length > 0)) {
      generateReport()
    }
  }, [streaming])

  async function sendMessage() {
    const q = chatInput.trim()
    if (!q || streaming) return

    setChatInput('')

    if (readerRef.current) {
      try { readerRef.current.cancel() } catch (_) {}
      readerRef.current = null
    }

    setMessages(prev => [
      ...prev,
      { role: 'user',      content: q,  sources: [], agentStatus: null, streaming: false },
      { role: 'assistant', content: '', sources: [], agentStatus: 'Routing to agents…', streaming: true },
    ])
    setStreaming(true)

    const params = new URLSearchParams({
      question: q,
      state:    selectedState,
      role:     chatRole,
    })

    // Collect sources from both agents
    let collectedSources  = []   // Tavily web results
    let collectedInternal = []   // Elasticsearch internal signals

    try {
      const res = await fetch(`${API}/commercial/intelligence/stream?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let data
          try { data = JSON.parse(line.slice(6)) } catch (_) { continue }

          // Agent progress status update
          if (data.agent && data.status && data.message && !data.token) {
            const statusLabel =
              data.agent === 'orchestrator' ? '🔀 ' + data.message :
              data.agent === 'internal'     ? '🗄️ ' + data.message :
              data.agent === 'web_scout'    ? '🌐 ' + data.message :
              data.agent === 'synthesizer'  ? '✍️ ' + data.message :
              data.message
            setMessages(prev => {
              const copy = [...prev]
              const last = { ...copy[copy.length - 1] }
              last.agentStatus = statusLabel
              copy[copy.length - 1] = last
              return copy
            })
            // Capture internal signals when internal agent finishes
            if (data.agent === 'internal' && data.status === 'done' && data.sources) {
              collectedInternal = data.sources
            }
            // Capture Tavily web sources when web_scout finishes
            if (data.agent === 'web_scout' && data.status === 'done' && data.sources) {
              collectedSources = data.sources
            }
          }

          // Synthesizer streaming token
          if (data.token) {
            setMessages(prev => {
              const copy = [...prev]
              const last = { ...copy[copy.length - 1] }
              last.content += data.token
              last.agentStatus = '✍️ Generating analysis…'
              copy[copy.length - 1] = last
              return copy
            })
          }

          // Done
          if (data.done) {
            setMessages(prev => {
              const copy = [...prev]
              const last = { ...copy[copy.length - 1] }
              last.streaming       = false
              last.agentStatus     = null
              last.sources         = collectedSources
              last.internalSources = collectedInternal
              copy[copy.length - 1] = last
              return copy
            })
            setStreaming(false)
          }

          if (data.error) {
            setMessages(prev => {
              const copy = [...prev]
              const last = { ...copy[copy.length - 1] }
              last.content     = `Error: ${data.error}`
              last.streaming   = false
              last.agentStatus = null
              copy[copy.length - 1] = last
              return copy
            })
            setStreaming(false)
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev]
        const last = { ...copy[copy.length - 1] }
        last.content  = 'Could not reach backend. Is the API server running?'
        last.streaming = false
        copy[copy.length - 1] = last
        return copy
      })
      setStreaming(false)
    }
  }

  async function generateReport() {
    const last = messages.filter(m => m.role === 'assistant').at(-1)
    if (!last || reportLoading) return
    setReport('')
    setReportLoading(true)
    setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    try {
      const res = await fetch(`${API}/commercial/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:         messages.filter(m => m.role === 'user').at(-1)?.content || '',
          state:            selectedState,
          role:             chatRole,
          internal_sources: last.internalSources || [],
          web_sources:      last.sources         || [],
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status} — check backend logs`)
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let d; try { d = JSON.parse(line.slice(6)) } catch { continue }
          if (d.token) setReport(prev => prev + d.token)
          if (d.done)  setReportLoading(false)
          if (d.error) { setReport(`Error: ${d.error}`); setReportLoading(false) }
        }
      }
    } catch (e) {
      setReport(`Failed to generate report: ${e.message}`)
    } finally {
      setReportLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function scrollToChat() {
    chatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#060D1A' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 border-b" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
        <div>
          <h1 className="text-base font-bold text-white">
            Commercial <span className="text-cyan-400">Insights Portal</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Dordaviprone (Modeyso) commercial intelligence — market signals, sentiment &amp; regional analysis.</p>
        </div>
        <button
          onClick={() => setChatOpen(o => !o)}
          className="flex items-center gap-2 text-xs font-semibold bg-cyan-500 text-white px-4 py-2 rounded-xl hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-900/40">
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0m.75 0H8.25m4.125 0a.375.375 0 11-.75 0m.75 0H12m4.125 0a.375.375 0 11-.75 0m.75 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/>
          </svg>
          Chat with Data
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* Map + Right panel */}
        <div className="flex" style={{ height: '50vh', minHeight: 300 }}>

          {/* Map */}
          <div className="flex-1 relative overflow-hidden p-3" style={{ background: '#060D1A' }}>
            {selectedState && (
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold"
                   style={{ background: '#0D1B2E', border: '1px solid #22d3ee', color: '#22d3ee' }}>
                <span>{ABBR_TO_NAME[selectedState] || selectedState}</span>
                <button onClick={() => setSelectedState('')}
                        className="text-slate-500 hover:text-white transition-colors leading-none">
                  ×
                </button>
              </div>
            )}

            <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: '100%' }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const abbr  = NAME_TO_ABBR[geo.properties.name]
                    const score = COMMERCIAL_STATE_SCORES[abbr]
                    const isSel = selectedState === abbr
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={scoreToColor(score, isSel)}
                        stroke={isSel ? '#22d3ee' : '#0a1628'}
                        strokeWidth={isSel ? 1.5 : 0.8}
                        style={{
                          default: { outline: 'none' },
                          hover:   { outline: 'none', opacity: 0.75, cursor: 'pointer' },
                          pressed: { outline: 'none' },
                        }}
                        onClick={() => setSelectedState(prev => prev === abbr ? '' : abbr)}
                        onMouseEnter={e => {
                          const regionName = STATE_TO_REGION[abbr]
                          const region     = regionName ? COMMERCIAL_REGIONS[regionName] : null
                          setTip({ x: e.clientX, y: e.clientY, regionName, region })
                        }}
                        onMouseLeave={() => setTip(null)}
                      />
                    )
                  })
                }
              </Geographies>
            </ComposableMap>

            {/* Legend */}
            <div className="absolute bottom-5 left-5 rounded-xl border px-3 py-2.5 flex flex-col gap-1.5" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Commercial Strength</p>
              {[
                { color: '#06b6d4', label: 'Very Strong', sub: '≥85' },
                { color: '#0ea5e9', label: 'Strong',      sub: '75–84' },
                { color: '#1d6fa4', label: 'Moderate',    sub: '55–74' },
                { color: '#0f2744', label: 'Developing',  sub: '<55'   },
              ].map(i => (
                <div key={i.label} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: i.color }} />
                  <span className="text-xs text-slate-300 font-medium">{i.label}</span>
                  <span className="text-xs text-slate-500">{i.sub}</span>
                </div>
              ))}
              <p className="text-[10px] text-slate-600 mt-1">Click state to select market</p>
            </div>

            {tip && tip.region && <RegionTooltip tip={tip} />}
          </div>

          {/* Right panel */}
          <div className="w-72 flex flex-col flex-shrink-0 border-l overflow-hidden" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
            <div className="flex border-b flex-shrink-0" style={{ borderColor: '#1E3A5F' }}>
              {tabs.map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 text-xs font-bold py-3 transition-colors border-b-2 ${
                    activeTab === t
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {activeTab === 'Overview'  && <OverviewPanel  kpis={COMMERCIAL_KPIS} />}
              {activeTab === 'Field'     && <FieldPanel     kpis={COMMERCIAL_KPIS} />}
              {activeTab === 'Marketing' && <MarketingPanel kpis={COMMERCIAL_KPIS} />}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="px-5 pt-5 grid grid-cols-4 gap-4">
          {kpiCards.map(k => <KPICard key={k.label} {...k} />)}
        </div>

        {/* Charts row 1 */}
        <div className="px-5 pt-4 grid grid-cols-2 gap-4">

          {/* Market Engagement */}
          <div className="rounded-2xl border p-5" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
            <h3 className="text-sm font-bold text-white mb-1">Market Engagement &amp; Reach</h3>
            <div className="flex gap-6 mb-4 flex-wrap">
              {[
                { label: 'HCP Coverage',             value: `${COMMERCIAL_KPIS.hcp_coverage}%`,                   trend: `+${COMMERCIAL_KPIS.hcp_trend}%`,    up: true  },
                { label: 'Prescriber Loyalty',        value: `${COMMERCIAL_KPIS.prescriber_loyalty}%`,             trend: `+${COMMERCIAL_KPIS.loyalty_trend}%`, up: true  },
                { label: 'Access Barriers',           value: `${COMMERCIAL_KPIS.access_barriers} Low`,             trend: null },
                { label: 'Competing Brand Influence', value: `${COMMERCIAL_KPIS.competing_brand_influence} Medium`,trend: null },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</p>
                  <p className="text-sm font-extrabold text-white">{m.value}</p>
                  {m.trend && <p className={`text-xs font-bold ${m.up ? 'text-emerald-400' : 'text-red-400'}`}>{m.trend}</p>}
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={COMMERCIAL_MONTHLY} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gc1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="gc2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#cbd5e1' }} />
                <Area type="monotone" dataKey="contacts" stroke="#22d3ee" strokeWidth={2} fill="url(#gc1)" dot={false} />
                <Area type="monotone" dataKey="scripts"  stroke="#6366f1" strokeWidth={2} fill="url(#gc2)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-3 h-1 bg-cyan-400 rounded inline-block" />Contacts</span>
              <span className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-400 rounded inline-block" />Scripts</span>
            </div>
          </div>

          {/* HCP Experience */}
          <div className="rounded-2xl border p-5" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
            <h3 className="text-sm font-bold text-white mb-1">HCP Experience &amp; Brand Perception</h3>
            <p className="text-xs text-slate-500 mb-2">Insights powered by:</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['HCP conversations', 'KOL articles and videos', 'CRM dataset', 'News'].map(s => (
                <span key={s} className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: '#0a2240', color: '#22d3ee', border: '1px solid #1E3A5F' }}>• {s}</span>
              ))}
            </div>
            <div className="flex gap-6 mb-3">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Field Feedback Issues</p>
                <p className="text-sm font-extrabold text-red-400">{COMMERCIAL_KPIS.field_feedback_issues} Reported</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Brand Perception Index</p>
                <p className="text-sm font-extrabold text-cyan-400">{COMMERCIAL_KPIS.brand_perception_index}/100</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={COMMERCIAL_MONTHLY} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gf1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="gf2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#cbd5e1' }} />
                <Area type="monotone" dataKey="feedback"   stroke="#f43f5e" strokeWidth={2} fill="url(#gf1)" dot={false} />
                <Area type="monotone" dataKey="perception" stroke="#22d3ee" strokeWidth={2} fill="url(#gf2)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-3 h-1 bg-red-400 rounded inline-block" />Field Feedback Issues</span>
              <span className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-3 h-1 bg-cyan-400 rounded inline-block" />Brand Perception Index</span>
            </div>
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="px-5 pt-4 grid grid-cols-2 gap-4">

          {/* Topic Distribution */}
          <div className="rounded-2xl border p-5" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Topic Distribution</h3>
              <div className="flex gap-3">
                {[{ label: 'Positive', color: '#4ade80' }, { label: 'Neutral', color: '#60a5fa' }, { label: 'Negative', color: '#f87171' }].map(l => (
                  <span key={l.label} className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />{l.label}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topicData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barSize={10}>
                <XAxis type="number" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <YAxis type="category" dataKey="topic" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} width={115} />
                <Tooltip content={<TopicTooltip />} />
                <Bar dataKey="Positive" stackId="a" fill="#4ade80" />
                <Bar dataKey="Neutral"  stackId="a" fill="#60a5fa" />
                <Bar dataKey="Negative" stackId="a" fill="#f87171" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sentiment Over Time */}
          <div className="rounded-2xl border p-5" style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Sentiment Over Time</h3>
              <div className="flex gap-3">
                {[{ label: 'Positive', color: '#4ade80' }, { label: 'Neutral', color: '#94a3b8' }, { label: 'Negative', color: '#f87171' }].map(l => (
                  <span key={l.label} className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.label}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={COMMERCIAL_SENTIMENT} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#cbd5e1' }} formatter={v => `${v}%`} />
                <Line type="monotone" dataKey="pos" name="Positive" stroke="#4ade80" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="neu" name="Neutral"  stroke="#94a3b8" strokeWidth={2}   dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="neg" name="Negative" stroke="#f87171" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Positive (Dec)', val: `${COMMERCIAL_SENTIMENT[11].pos}%`, bg: '#052e16', color: 'text-emerald-400' },
                { label: 'Neutral (Dec)',  val: `${COMMERCIAL_SENTIMENT[11].neu}%`, bg: '#1E3A5F', color: 'text-slate-300'   },
                { label: 'Negative (Dec)', val: `${COMMERCIAL_SENTIMENT[11].neg}%`, bg: '#2d0a0a', color: 'text-red-400'     },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: s.bg }}>
                  <p className={`text-lg font-extrabold ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Commercial Intelligence Chat — Voice Centered ─── */}
        <div ref={chatPanelRef} className="px-5 pt-6 pb-8">
          <div className="rounded-2xl border overflow-hidden flex flex-col"
               style={{ background: '#0D1B2E', borderColor: '#1E3A5F' }}>

            {/* Header: title + state badge */}
            <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
                 style={{ borderColor: '#1E3A5F', background: '#060D1A' }}>
              <div>
                <h2 className="text-sm font-bold text-white">Commercial Intelligence Chat</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ask about dordaviprone / Modeyso market signals, approvals, KOL sentiment
                  {selectedState ? ` · ${ABBR_TO_NAME[selectedState] || selectedState}` : ' · all states'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {selectedState ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ background: '#22d3ee22', color: '#22d3ee', border: '1px solid #22d3ee44' }}>
                    {selectedState}
                    <button onClick={() => setSelectedState('')} className="text-cyan-600 hover:text-white">×</button>
                  </span>
                ) : (
                  <span className="text-xs text-slate-600 italic">Click map to filter by state</span>
                )}
                <input
                  type="text"
                  placeholder="City (optional)…"
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-full outline-none text-slate-300 placeholder-slate-600 w-36"
                  style={{ background: '#0D1B2E', border: '1px solid #1E3A5F' }}
                />
              </div>
            </div>

            {/* Role chips */}
            <div className="flex gap-2 px-5 py-3 border-b flex-shrink-0"
                 style={{ borderColor: '#1E3A5F' }}>
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setChatRole(r.id)} title={r.desc}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    chatRole === r.id ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  style={chatRole !== r.id ? { background: '#0D1B2E', border: '1px solid #1E3A5F' } : {}}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* ── Voice-first center area ── */}
            <div className="flex flex-col items-center px-6 py-8 gap-6" style={{ minHeight: 420 }}>

              {/* Last question bubble */}
              {messages.length > 0 && messages.filter(m => m.role === 'user').length > 0 && (
                <div className="w-full max-w-xl">
                  <div className="flex justify-end">
                    <div className="max-w-sm rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white"
                         style={{ background: '#22d3ee', boxShadow: '0 4px 20px #22d3ee33' }}>
                      {messages.filter(m => m.role === 'user').at(-1)?.content}
                    </div>
                  </div>
                </div>
              )}

              {/* Streaming answer */}
              {messages.length > 0 && messages.filter(m => m.role === 'assistant').length > 0 && (() => {
                const last = messages.filter(m => m.role === 'assistant').at(-1)
                return (
                  <div className="w-full max-w-2xl flex flex-col gap-3">
                    {last.agentStatus && (
                      <div className="flex items-center gap-2 text-xs text-cyan-400 px-3 py-1.5 rounded-full self-start"
                           style={{ background: '#0a2240', border: '1px solid #1E3A5F' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        {last.agentStatus}
                      </div>
                    )}
                    {last.content && (
                      <div className="rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-slate-200 leading-relaxed"
                           style={{ background: '#060D1A', border: '1px solid #1E3A5F' }}>
                        {last.content}
                        {last.streaming && <span className="inline-block w-1.5 h-4 bg-cyan-400 ml-1 animate-pulse rounded-sm" />}
                      </div>
                    )}

                    {!last.streaming && (last.internalSources?.length > 0 || last.sources?.length > 0) && (
                      <div className="flex flex-col gap-4 w-full">

                        {/* Internal signals (Twitter / News) */}
                        {last.internalSources?.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              Internal Signals · {last.internalSources.length} results
                            </p>
                            <div className="flex flex-col gap-2">
                              {last.internalSources.map((s, i) =>
                                (s.source_type === 'Twitter' || s.source_type === 'Social')
                                  ? <TwitterCard key={i} source={s} />
                                  : <NewsCard    key={i} source={s} />
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tavily web sources */}
                        {last.sources?.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              Live Web Sources · {last.sources.length} results
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {last.sources.slice(0, 4).map((s, i) => <WebSourceCard key={i} source={s} />)}
                            </div>
                          </div>
                        )}

                        {/* Report auto-generates — show spinner while loading */}
                        {reportLoading && (
                          <div className="self-start flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl"
                            style={{ background: 'linear-gradient(135deg,#0a2240,#0d2d4d)', border: '1px solid #22d3ee88', color: '#22d3ee' }}>
                            <span className="animate-spin">⟳</span> Generating report…
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Empty state suggestion chips */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <p className="text-sm font-semibold text-slate-400">Start a conversation</p>
                  <p className="text-xs text-slate-600 text-center max-w-sm leading-relaxed">
                    Select a role above, optionally click a state on the map, then type your question below.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      'What are the latest 30-day market signals for Modeyso in brain cancer?',
                      'How is dordaviprone sentiment trending after FDA approval?',
                      'Analyze competitor context for diffuse midline glioma treatment.',
                    ].map(q => (
                      <button key={q} onClick={() => setChatInput(q)}
                        className="text-xs px-3 py-1.5 rounded-full text-slate-400 hover:text-cyan-400 transition-colors"
                        style={{ background: '#060D1A', border: '1px solid #1E3A5F' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Text input row */}
            <div className="flex gap-3 px-5 py-4 border-t flex-shrink-0"
                 style={{ borderColor: '#1E3A5F', background: '#060D1A' }}>
              <textarea rows={1} value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown} disabled={streaming}
                placeholder={`Ask as ${chatRole}${selectedState ? ` · ${selectedState}` : ''}…`}
                className="flex-1 resize-none rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-all disabled:opacity-50"
                style={{ background: '#0D1B2E', border: '1px solid #1E3A5F', lineHeight: 1.5 }}
              />
              <button onClick={sendMessage} disabled={!chatInput.trim() || streaming}
                className="flex items-center justify-center w-12 h-12 rounded-xl transition-all flex-shrink-0 self-end disabled:opacity-40"
                style={{ background: streaming ? '#1E3A5F' : '#22d3ee', color: '#fff' }}>
                {streaming
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
                }
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

    {/* ── Full Report Panel ── */}
    {(report || reportLoading) && (
      <div ref={reportRef} className="px-5 pb-10" style={{ background: '#060D1A' }}>
        <div className="rounded-2xl border overflow-hidden" style={{ background: '#0D1B2E', borderColor: '#22d3ee44' }}>

          {/* Report header */}
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1E3A5F', background: '#060D1A' }}>
            <div className="flex items-center gap-3">
              <span className="text-lg">📊</span>
              <div>
                <h2 className="text-sm font-bold text-white">Commercial Intelligence Report</h2>
                <p className="text-xs text-slate-500 mt-0.5">Dordaviprone (Modeyso) · {selectedState ? selectedState : 'National'} · {chatRole}</p>
              </div>
            </div>
            {!reportLoading && (
              <button
                onClick={() => { setReport(''); setReportLoading(false) }}
                className="text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg"
                style={{ background: '#1E3A5F' }}>
                Close
              </button>
            )}
          </div>

          {/* Report body */}
          <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: '80vh' }}>
            {reportLoading && !report && (
              <div className="flex items-center gap-3 text-cyan-400 text-sm">
                <span className="animate-spin text-lg">⟳</span>
                Qwen2.5-72B (Featherless) is generating your report…
              </div>
            )}
            {report && <ReportRenderer text={report} loading={reportLoading} />}
          </div>
        </div>
      </div>
    )}

    {/* ── Multi-Agent Chat Panel (slides in from right) ── */}
    {chatOpen && <CommercialChatPanel onClose={() => setChatOpen(false)} />}

</>
  )
}
