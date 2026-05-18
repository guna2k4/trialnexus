import { useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { PieChart, Pie, Cell } from 'recharts'
import { STATE_DATA, PORTFOLIO_KPIS } from '../data'
import { MessageSquare } from 'lucide-react'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

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

// Exact colours from the screenshot
const STATUS_COLOR = {
  healthy:  '#10B981',
  moderate: '#F59E0B',
  'at-risk':'#EF4444',
}

function getColor(abbr) {
  const s = STATE_DATA[abbr]
  return s ? (STATUS_COLOR[s.status] || '#1F2937') : '#1F2937'
}

// ── Right panel KPI row ───────────────────────────────────────
function KPIRow({ label, value, trend, up }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1F2937] last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-bold text-white">{value}</span>
        <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '▲' : '▼'} {trend}%
        </span>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────
export default function PortfolioView({ onGoToTrials }) {
  const [tip, setTip] = useState(null)

  const donutData = [
    { name: 'Healthy',  value: PORTFOLIO_KPIS.healthy_pct,  color: '#10B981' },
    { name: 'Moderate', value: PORTFOLIO_KPIS.moderate_pct, color: '#F59E0B' },
    { name: 'At Risk',  value: PORTFOLIO_KPIS.at_risk_pct,  color: '#EF4444' },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0B1220]">

      {/* ── Header — on dark bg, no white bar ── */}
      <div className="px-6 pt-5 pb-3 flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-1">TrialNexus</p>
          <h1 className="text-lg font-bold text-white tracking-tight">
            Portfolio Health Overview
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            A unified view of clinical trial performance across every program, region, and phase.
          </p>
        </div>
        <button
          onClick={onGoToTrials}
          className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-white px-4 py-2 rounded-lg transition-colors flex-shrink-0 mt-1"
        >
          My Trials →
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: US Map ── */}
        <div className="flex-1 relative overflow-hidden">
          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: '100%', height: '100%' }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const abbr  = NAME_TO_ABBR[geo.properties.name]
                  const color = getColor(abbr)
                  const s     = STATE_DATA[abbr]
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={color}
                      stroke="#0B1220"
                      strokeWidth={1.5}
                      style={{
                        default: { outline: 'none' },
                        hover:   { outline: 'none', opacity: 0.82, cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={(e) =>
                        setTip({ x: e.clientX, y: e.clientY, s, name: geo.properties.name })
                      }
                      onMouseLeave={() => setTip(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ComposableMap>

          {/* ── Legend ── */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2.5">
            {[
              { color: '#10B981', label: 'Healthy',  sub: '> 75% enrolled'   },
              { color: '#F59E0B', label: 'Moderate', sub: '55–75% enrolled'  },
              { color: '#EF4444', label: 'At Risk',  sub: '< 55% enrolled'   },
            ].map(({ color, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="text-xs font-semibold text-white">{label}</span>
                <span className="text-xs text-slate-400">{sub}</span>
              </div>
            ))}
          </div>

          {/* ── Hover tooltip ── */}
          {tip && tip.s && (
            <div
              className="fixed z-50 pointer-events-none min-w-[210px] rounded-xl"
              style={{
                top: tip.y + 14,
                left: tip.x + 14,
                background: '#1E293B',
                border: '1px solid #334155',
                padding: '14px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">{tip.name}</span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: STATUS_COLOR[tip.s.status] + '25',
                    color: STATUS_COLOR[tip.s.status],
                  }}
                >
                  {tip.s.status}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                {[
                  ['Active Trials',   tip.s.active_trials],
                  ['Enrollment Rate', tip.s.enrollment_rate + '%'],
                  ['Dropout Rate',    tip.s.dropout_rate + '%'],
                  ['Site Activation', tip.s.site_activation + '%'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-8">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-bold text-white">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Stats panel ── */}
        <div className="w-[300px] bg-[#111827] border-l border-[#1F2937] flex flex-col overflow-y-auto flex-shrink-0">

          {/* Donut chart section */}
          <div className="p-5 border-b border-[#1F2937]">
            <p className="text-xs font-semibold text-slate-400 mb-4 tracking-wide uppercase">
              Trial Health Overview
            </p>

            {/* Donut */}
            <div className="relative flex justify-center">
              <PieChart width={190} height={190}>
                <Pie
                  data={donutData}
                  cx={95} cy={95}
                  innerRadius={62} outerRadius={86}
                  dataKey="value"
                  startAngle={90} endAngle={-270}
                  strokeWidth={0}
                >
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
              {/* Centre label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-white">{PORTFOLIO_KPIS.total_trials}</span>
                <span className="text-xs text-emerald-400 font-semibold mt-0.5">▲ 4%</span>
              </div>
            </div>

            <p className="text-center text-xs text-slate-500 mt-2">
              total active trials across U.S. sites
            </p>

            {/* Donut legend */}
            <div className="flex justify-center gap-3 mt-4 flex-wrap">
              {donutData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: d.color }}
                  />
                  <span className="text-xs text-slate-400">{d.name}</span>
                  <span className="text-xs font-bold text-white">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* KPI rows */}
          <div className="px-5 py-1 border-b border-[#1F2937]">
            <KPIRow label="Enrollment Rate" value={`${PORTFOLIO_KPIS.enrollment_rate}%`} trend={2} up={true}  />
            <KPIRow label="Site Activation" value={`${PORTFOLIO_KPIS.site_activation}%`} trend={1} up={false} />
            <KPIRow label="Drop Out Rate"   value={`${PORTFOLIO_KPIS.dropout_rate}%`}    trend={1} up={false} />
          </div>

          {/* Trials by phase */}
          <div className="p-5">
            <p className="text-xs font-semibold text-slate-400 mb-3 tracking-wide uppercase">
              Trials By Phase
            </p>
            <div>
              {PORTFOLIO_KPIS.trials_by_phase.map(row => (
                <div
                  key={row.phase}
                  className="flex items-center justify-between py-2.5 border-b border-[#1F2937] last:border-0"
                >
                  <span className="text-xs text-slate-400">{row.phase}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${row.alert ? 'text-red-400' : 'text-white'}`}>
                      {row.count}
                    </span>
                    <span className={`text-xs font-semibold ${row.up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.up ? '▲' : '▼'} {row.trend}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating Chat with Data button ── */}
      <button className="fixed bottom-6 right-6 flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl transition-colors z-40">
        <MessageSquare size={14} />
        Chat with Data
      </button>
    </div>
  )
}
