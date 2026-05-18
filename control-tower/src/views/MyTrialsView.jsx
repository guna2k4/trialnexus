import { useState } from 'react'
import { Calendar, User, MessageSquare } from 'lucide-react'
import { TRIALS } from '../data'

// ── Status config — solid filled badges ───────────────────────
const STATUS_STYLE = {
  healthy:   { badge: 'bg-emerald-500 text-white',                  label: 'HEALTHY'       },
  moderate:  { badge: 'bg-amber-500 text-white',                    label: 'MODERATE RISK' },
  'at-risk': { badge: 'bg-red-500 text-white',                      label: 'AT RISK'       },
}

const PHASE_NUMS = ['I', 'II', 'III', 'IV']

// ── Phase bar: PHASE | I — II — III — IV ─────────────────────
function PhaseBar({ current }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-bold text-slate-500 tracking-widest">PHASE</span>
      <span className="text-slate-600 mx-1">|</span>
      {PHASE_NUMS.map((p, i) => (
        <div key={p} className="flex items-center gap-1">
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${
              p === current
                ? 'bg-white text-[#0B1220]'
                : 'text-slate-600'
            }`}
          >
            {p}
          </span>
          {i < PHASE_NUMS.length - 1 && (
            <span className="text-slate-700 text-[10px]">—</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Metric block ──────────────────────────────────────────────
function Metric({ label, value, danger }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-base font-bold ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

// ── Trial card ────────────────────────────────────────────────
function TrialCard({ trial, onView }) {
  const st = STATUS_STYLE[trial.status] || STATUS_STYLE.moderate

  return (
    <div
      onClick={() => onView(trial)}
      className="bg-[#0f1b2d] border border-[#1e2d42] hover:border-[#2a3f5a] rounded-xl flex flex-col cursor-pointer transition-all hover:shadow-2xl hover:shadow-black/50 overflow-hidden"
    >
      {/* Card header — phase + status */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d42]">
        <PhaseBar current={trial.phase} />
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide ${st.badge}`}>
          {st.label}
        </span>
      </div>

      {/* Card body */}
      <div className="px-4 pt-4 pb-2 flex flex-col gap-4 flex-1">

        {/* Trial name */}
        <div>
          <p className="text-base font-bold text-white leading-snug">{trial.code}</p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{trial.name}</p>
        </div>

        {/* Metrics 2×2 */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-4">
          <Metric label="Cost Per Patient" value={`$${trial.cost_per_patient.toLocaleString()}`} />
          <Metric label="Enrollment Rate"  value={`${trial.enrollment_rate}%`} />
          <Metric label="Retention Rate"   value={`${trial.retention_rate}%`} />
          <Metric label="Dropout Rate"     value={`${trial.dropout_rate}%`} danger={trial.dropout_rate > 20} />
        </div>

        {/* Footer metadata */}
        <div className="border-t border-[#1e2d42] pt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar size={11} className="flex-shrink-0" />
            Last Update Posted {trial.last_updated}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <User size={11} className="flex-shrink-0" />
            {trial.sponsor}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <User size={11} className="flex-shrink-0" />
            {trial.responsible_party}
          </div>
        </div>
      </div>

      {/* View More — centered at bottom */}
      <div className="border-t border-[#1e2d42] px-4 py-3">
        <button
          className="w-full text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors text-center"
          onClick={e => { e.stopPropagation(); onView(trial) }}
        >
          View More
        </button>
      </div>
    </div>
  )
}

// ── Dark select ───────────────────────────────────────────────
function DarkSelect({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-2 bg-[#0f1b2d] border border-[#1e2d42] rounded-lg px-3 py-1.5">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs bg-transparent text-slate-300 outline-none cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#0f1b2d]">{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────
export default function MyTrialsView({ onViewTrial }) {
  const [phaseFilter,  setPhaseFilter]  = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const filtered = TRIALS.filter(t => {
    const phaseOk  = phaseFilter  === 'All' || t.phase  === phaseFilter
    const statusOk = statusFilter === 'All' || t.status === statusFilter
    return phaseOk && statusOk
  })

  return (
    <div className="flex flex-col h-screen bg-[#0B1220] overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-1">TrialNexus</p>
          <h1 className="text-lg font-bold text-white tracking-tight">My Trials</h1>
          <p className="text-xs text-slate-500 mt-1">Your assigned studies and trial health overview.</p>
        </div>

        {/* Filter row — right aligned like screenshot */}
        <div className="flex items-center gap-2">
          <DarkSelect
            label="Phase"
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[
              { value: 'All', label: 'All' },
              ...PHASE_NUMS.map(p => ({ value: p, label: `Phase ${p}` })),
            ]}
          />
          <DarkSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'All',      label: 'All'           },
              { value: 'healthy',  label: 'Healthy'       },
              { value: 'moderate', label: 'Moderate Risk' },
              { value: 'at-risk',  label: 'At Risk'       },
            ]}
          />
          <div className="bg-[#0f1b2d] border border-[#1e2d42] rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-500">Region</span>
          </div>
          <div className="bg-[#0f1b2d] border border-[#1e2d42] rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-500">Sponsor</span>
          </div>
        </div>
      </div>

      {/* ── Trial grid ── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500">No trials match the current filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(trial => (
              <TrialCard
                key={trial.id}
                trial={trial}
                onView={onViewTrial}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Floating Chat with Data ── */}
      <button className="fixed bottom-6 right-6 flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl transition-colors z-40">
        <MessageSquare size={14} />
        Chat with Data
      </button>
    </div>
  )
}
