import { ArrowLeft, UserPlus, MessageSquare } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'

// ── TrialNexus brand mark (matches sidebar logo) ────────────────
function TrialNexusMark() {
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <div className="w-8 h-8 rounded-lg bg-[#0D1B2E] border border-cyan-900/40 flex items-center justify-center shadow-md shadow-cyan-900/20">
        <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
          <defs>
            <filter id="bn-glow-td" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <path d="M18 1 L19.4 6.5 L25 4.5 L20.5 8.5 L23 13 L18 10.5 L13 13 L15.5 8.5 L11 4.5 L16.6 6.5 Z"
            fill="white" filter="url(#bn-glow-td)" opacity="0.96"/>
          <rect x="6"    y="11.5" width="2.5" height="13"   rx="1.25" fill="white" opacity="0.52"/>
          <rect x="10.5" y="10"   width="2.5" height="14.5" rx="1.25" fill="white" opacity="0.70"/>
          <rect x="15.5" y="9.5"  width="5"   height="15"   rx="2.5"  fill="white" opacity="0.90"/>
          <rect x="23"   y="10"   width="2.5" height="14.5" rx="1.25" fill="white" opacity="0.70"/>
          <rect x="27.5" y="11.5" width="2.5" height="13"   rx="1.25" fill="white" opacity="0.52"/>
          <path d="M6 24 C7 28.5 11 32 15.5 33 C17 33.4 17.5 31 18 30.5 C18.5 31 19 33.4 20.5 33 C25 32 29 28.5 30 24"
            stroke="white" strokeWidth="1.7" fill="none" strokeLinecap="round" opacity="0.80"/>
          <path d="M10 24.5 C10.5 27.5 13.5 31 17 31.5 C17.5 31.5 18 30 18 30 C18 30 18.5 31.5 19 31.5 C22.5 31 25.5 27.5 26 24.5"
            stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.56"/>
          <path d="M12.5 25.5 C14.5 28.5 21.5 28.5 23.5 25.5"
            stroke="white" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.64"/>
        </svg>
      </div>
      <div>
        <p className="text-sm font-bold text-[#F8FAFC] leading-tight">TrialNexus</p>
        <p className="text-xs text-[#94A3B8] leading-tight">Clinical Trial Platform</p>
      </div>
    </div>
  )
}

// ── Status config ─────────────────────────────────────────────
const STATUS_STYLE = {
  healthy:   { bg: 'bg-emerald-900/40 border border-emerald-700/40', text: 'text-emerald-300', label: 'HEALTHY'       },
  moderate:  { bg: 'bg-amber-900/40 border border-amber-700/40',     text: 'text-amber-300',   label: 'MODERATE RISK' },
  'at-risk': { bg: 'bg-red-900/40 border border-red-700/40',         text: 'text-red-400',     label: 'HIGH RISK'     },
}

// ── KPI card ──────────────────────────────────────────────────
function KPICard({ label, value, delta, up }) {
  return (
    <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
      <p className="text-xs text-[#94A3B8] mb-2 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-[#F8FAFC]">{value}</p>
      {delta != null && (
        <p className={`text-xs mt-1.5 font-semibold flex items-center gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '▲' : '▼'} {Math.abs(delta)}% vs last quarter
        </p>
      )}
    </div>
  )
}

// ── Mini area chart ───────────────────────────────────────────
function MiniAreaChart({ data, k1, k2, c1, c2, id }) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
        <defs>
          <linearGradient id={`g1-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={c1} stopOpacity={0.35}/>
            <stop offset="95%" stopColor={c1} stopOpacity={0.02}/>
          </linearGradient>
          <linearGradient id={`g2-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={c2} stopOpacity={0.35}/>
            <stop offset="95%" stopColor={c2} stopOpacity={0.02}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#4B5563' }} tickLine={false} axisLine={false}/>
        <YAxis tick={{ fontSize: 9, fill: '#4B5563' }} tickLine={false} axisLine={false}/>
        <Tooltip
          contentStyle={{ fontSize: 11, background: '#0f1b2d', border: '1px solid #1F2937', borderRadius: 8, color: '#F8FAFC' }}
          itemStyle={{ color: '#94A3B8' }}
        />
        <Area type="monotone" dataKey={k1} stroke={c1} strokeWidth={1.8} fill={`url(#g1-${id})`} dot={false}/>
        <Area type="monotone" dataKey={k2} stroke={c2} strokeWidth={1.8} fill={`url(#g2-${id})`} dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Score bar ─────────────────────────────────────────────────
function ScoreBar({ score }) {
  const color = score >= 75 ? '#10B981' : score >= 55 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }}/>
      </div>
      <span className="text-xs font-bold w-6 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

// ── Legend dot ────────────────────────────────────────────────
function Dot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
      <span className="w-2.5 h-1.5 rounded-full inline-block" style={{ background: color }}/>
      {label}
    </span>
  )
}

// ── Main view ─────────────────────────────────────────────────
export default function TrialDetailView({ trial, onBack, onRecruitPatient }) {
  const st = STATUS_STYLE[trial.status] || STATUS_STYLE.moderate

  const scoreColor = trial.site_health_score >= 75
    ? '#10B981' : trial.site_health_score >= 55
    ? '#F59E0B' : '#EF4444'

  const scoreLabelColor = trial.site_health_score >= 75
    ? 'text-emerald-400' : trial.site_health_score >= 55
    ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex flex-col h-screen bg-[#0B1220] overflow-hidden">

      {/* ── Brand + action topbar ── */}
      <div className="bg-[#0D1117] border-b border-[#1F2937] px-5 py-2.5 flex items-center justify-between flex-shrink-0">
        <TrialNexusMark />
        <button className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-900/40 border border-cyan-700/40 text-cyan-300 px-3 py-1.5 rounded-lg hover:bg-cyan-800/40 transition-colors">
          <MessageSquare size={12}/> Chat with Data
        </button>
      </div>

      {/* ── Trial header ── */}
      <div className="bg-[#0f1b2d] border-b border-[#1e2d42] px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-[#94A3B8] hover:text-cyan-400 transition-colors">
            <ArrowLeft size={16}/>
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-sm font-bold text-[#F8FAFC] leading-tight">
                {trial.code} — {trial.name.length > 60 ? trial.name.slice(0, 60) + '...' : trial.name}
              </h1>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${st.bg} ${st.text}`}>
                Phase {trial.phase} | {st.label} (Score {trial.site_health_score})
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Composite site health score combines enrollment, retention, data quality, and protocol metrics.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onBack}
            className="text-xs border border-[#1F2937] text-[#94A3B8] px-3 py-1.5 rounded-lg hover:border-cyan-700/50 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft size={11}/> Return to Portfolio
          </button>
          <button
            onClick={onRecruitPatient}
            className="text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-500 transition-colors flex items-center gap-1.5"
          >
            <UserPlus size={12}/> Recruit Patient
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

        {/* Row 1 — 4 KPI cards */}
        <div className="grid grid-cols-4 gap-3">
          <KPICard label="Enrollment Rate"      value={`${trial.enrollment_rate}%`}  delta={2}  up={false}/>
          <KPICard label="Site Activation Rate" value={`${trial.site_activation}%`}  delta={3}  up={false}/>
          <KPICard label="Dropout Rate"         value={`${trial.dropout_rate}%`}      delta={1}  up={false}/>
          <KPICard label="Screen Failure Rate"  value={`${trial.screen_failure}%`}    delta={10} up={false}/>
        </div>

        {/* Row 2 — 3 section cards */}
        <div className="grid grid-cols-3 gap-3">

          {/* Patient Enrollment & Retention */}
          <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wide">Patient Enrollment &amp; Retention</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Enrollment pacing</span>
                <span className="font-medium text-[#F8FAFC] text-right max-w-[55%]">{trial.enrollment_pacing}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Retention rate</span>
                <span className="font-medium text-[#F8FAFC]">
                  {trial.retention_rate}% <span className="text-[#94A3B8]">(target 90%)</span>
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-[#94A3B8] flex-shrink-0">Dropout reasons</span>
                <span className="font-medium text-[#F8FAFC] text-right max-w-[60%]">{trial.dropout_reasons.join(', ')}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8] mb-1.5">12 month enrollment trend</p>
              <MiniAreaChart
                data={trial.monthly_enrollment}
                k1="enrollment" k2="dropout"
                c1="#06B6D4" c2="#EF4444"
                id={`enroll-${trial.id}`}
              />
              <div className="flex gap-4 mt-1.5">
                <Dot color="#06B6D4" label="Enrollment"/>
                <Dot color="#EF4444" label="Dropout"/>
              </div>
            </div>
          </div>

          {/* Patient Safety & Experience */}
          <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wide">Patient Safety &amp; Experience</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">AE reports</span>
                <span className="font-medium text-[#F8FAFC]">
                  {trial.ae_reports}
                  {trial.severe_ae > 0 && (
                    <span className="ml-2 text-red-400 font-bold">{trial.severe_ae} severe</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Patient Satisfaction Index</span>
                <span className="font-medium text-[#F8FAFC]">{trial.patient_satisfaction}/100</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-[#94A3B8] flex-shrink-0">Survey Feedback</span>
                <span className={`font-medium text-right max-w-[55%] ${
                  trial.patient_satisfaction >= 80 ? 'text-emerald-400'
                  : trial.patient_satisfaction >= 70 ? 'text-amber-400'
                  : 'text-red-400'
                }`}>
                  {trial.patient_satisfaction >= 80
                    ? 'Above benchmark'
                    : trial.patient_satisfaction >= 70
                    ? 'Meets benchmark'
                    : 'Communication timeliness below benchmark'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8] mb-2">Screen failures (last 12 months)</p>
              <div className="flex items-end gap-1 h-12">
                {[3,5,4,7,6,8,5,9,6,7,8,trial.severe_ae+2].map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${(v / 10) * 100}%`,
                      background: i === 11 ? '#EF4444' : '#1F2937',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Timeline & Budget */}
          <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wide">Timeline &amp; Budget Management</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Site activation time</span>
                <span className="font-medium text-[#F8FAFC]">{trial.site_activation_time} days (avg)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Budget Adherence</span>
                <span className={`font-bold ${trial.budget_adherence < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {trial.budget_adherence > 0 ? '+' : ''}{trial.budget_adherence}%
                  {trial.budget_adherence < 0 && (
                    <span className="font-normal text-[#94A3B8] ml-1">(over plan)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Cost Per Patient</span>
                <span className="font-medium text-[#F8FAFC]">
                  ${(trial.cost_per_patient / 1000).toFixed(1)}K
                  <span className={`ml-1 ${trial.cost_change > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    ({trial.cost_change > 0 ? '+' : ''}${trial.cost_change} vs last quarter)
                  </span>
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8] mb-1.5">12 month Budget Adherence Trend</p>
              <MiniAreaChart
                data={trial.monthly_budget}
                k1="budget" k2="adherence"
                c1="#64748b" c2="#06B6D4"
                id={`budget-${trial.id}`}
              />
              <div className="flex gap-4 mt-1.5">
                <Dot color="#64748b" label="Budget"/>
                <Dot color="#06B6D4" label="Adherence"/>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3 — Site Health Index table */}
        <div className="bg-[#111827] rounded-xl border border-[#1F2937] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#1F2937] flex items-center gap-3">
            <span className="text-xs font-bold text-[#94A3B8] uppercase tracking-wide">Site Health Index</span>
            <span className="text-xl font-bold" style={{ color: scoreColor }}>
              {trial.site_health_score}/100
            </span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${st.bg} ${st.text}`}>
              {st.label}
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1F2937]">
                <th className="text-left px-5 py-2.5 text-[#94A3B8] font-semibold uppercase tracking-wide">Factor</th>
                <th className="text-left px-5 py-2.5 text-[#94A3B8] font-semibold uppercase tracking-wide">Weight</th>
                <th className="text-left px-5 py-2.5 text-[#94A3B8] font-semibold uppercase tracking-wide w-48">Score</th>
              </tr>
            </thead>
            <tbody>
              {trial.health_factors.map((row, i) => (
                <tr key={i} className="border-t border-[#1F2937]/50 hover:bg-[#0f1b2d]/50 transition-colors">
                  <td className="px-5 py-3 text-[#F8FAFC] font-medium">{row.factor}</td>
                  <td className="px-5 py-3 text-[#94A3B8]">{row.weight}%</td>
                  <td className="px-5 py-3 w-48">
                    <ScoreBar score={row.score}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
