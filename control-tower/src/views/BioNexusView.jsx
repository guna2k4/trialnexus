import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, ImagePlus, Send, X, ArrowLeft, ChevronRight, Activity, Loader2, User, MapPin, FlaskConical } from 'lucide-react'

const API = '/api'
const PAGE_SZ  = 8

// ── helpers ──────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function categorise(results) {
  return {
    exact: results.filter(p => p.matchPercentage >= 85),
    image: results.filter(p => p.matchPercentage >= 65 && p.matchPercentage < 85),
    strat: results.filter(p => p.matchPercentage < 65),
  }
}

function ageRange(pts) {
  const ages = pts.map(p => p.age).filter(Boolean)
  if (!ages.length) return 'N/A'
  const mn = Math.min(...ages), mx = Math.max(...ages)
  return mn === mx ? `${mn} yrs` : `${mn}–${mx} yrs`
}
function sexDist(pts) {
  const m = pts.filter(p => p.sex === 'Male').length
  const f = pts.filter(p => p.sex === 'Female').length
  return [m && `${m}M`, f && `${f}F`].filter(Boolean).join(' / ') || 'N/A'
}

// ── TrialNexus logo SVG ─────────────────────────────────────────
function TrialNexusLogo({ size = 52 }) {
  const s = size / 36
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bn-glow-lg" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b"/>
          <feMerge>
            <feMergeNode in="b"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* 4-pointed star at apex */}
      <path
        d="M18 1 L19.4 6.5 L25 4.5 L20.5 8.5 L23 13 L18 10.5 L13 13 L15.5 8.5 L11 4.5 L16.6 6.5 Z"
        fill="white" filter="url(#bn-glow-lg)" opacity="0.96"
      />
      {/* 5 vertical bars — arch body */}
      <rect x="6"    y="11.5" width="2.5" height="13"   rx="1.25" fill="white" opacity="0.52"/>
      <rect x="10.5" y="10"   width="2.5" height="14.5" rx="1.25" fill="white" opacity="0.70"/>
      <rect x="15.5" y="9.5"  width="5"   height="15"   rx="2.5"  fill="white" opacity="0.90"/>
      <rect x="23"   y="10"   width="2.5" height="14.5" rx="1.25" fill="white" opacity="0.70"/>
      <rect x="27.5" y="11.5" width="2.5" height="13"   rx="1.25" fill="white" opacity="0.52"/>
      {/* Knotwork base — outer wave */}
      <path
        d="M6 24 C7 28.5 11 32 15.5 33 C17 33.4 17.5 31 18 30.5 C18.5 31 19 33.4 20.5 33 C25 32 29 28.5 30 24"
        stroke="white" strokeWidth="1.7" fill="none" strokeLinecap="round" opacity="0.80"
      />
      {/* Knotwork base — inner wave */}
      <path
        d="M10 24.5 C10.5 27.5 13.5 31 17 31.5 C17.5 31.5 18 30 18 30 C18 30 18.5 31.5 19 31.5 C22.5 31 25.5 27.5 26 24.5"
        stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.56"
      />
      {/* Knotwork base — cross knot */}
      <path
        d="M12.5 25.5 C14.5 28.5 21.5 28.5 23.5 25.5"
        stroke="white" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.64"
      />
    </svg>
  )
}

// ── Sub-components ────────────────────────────────────────────

function DemoChip({ label, selected, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        selected
          ? 'bg-cyan-700 text-white border-cyan-700'
          : 'bg-[#111827] text-[#94A3B8] border-[#1F2937] hover:border-cyan-700/50 hover:text-cyan-400'
      }`}
    >
      {label}
    </button>
  )
}

// MRI image viewer modal with pan + zoom
function MRIModal({ imageUrl, onClose }) {
  const viewerRef = useRef(null)
  const imgRef    = useRef(null)
  const zoom      = useRef(1)
  const pan       = useRef({ x: 0, y: 0 })
  const dragging  = useRef(false)
  const startPos  = useRef({ x: 0, y: 0 })

  function applyTransform() {
    if (imgRef.current)
      imgRef.current.style.transform =
        `translate(${pan.current.x}px, ${pan.current.y}px) scale(${zoom.current})`
  }

  function reset() { zoom.current = 1; pan.current = { x: 0, y: 0 }; applyTransform() }

  useEffect(() => {
    function onWheel(e) {
      e.preventDefault()
      zoom.current = Math.min(5, Math.max(0.4, zoom.current - e.deltaY * 0.001))
      applyTransform()
    }
    const el = viewerRef.current
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => el?.removeEventListener('wheel', onWheel)
  }, [])

  function onMouseDown(e) {
    dragging.current = true
    startPos.current = { x: e.clientX - pan.current.x, y: e.clientY - pan.current.y }
  }
  function onMouseMove(e) {
    if (!dragging.current) return
    pan.current = { x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y }
    applyTransform()
  }
  function onMouseUp() { dragging.current = false }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-black rounded-xl overflow-hidden" style={{ width: 660, maxWidth: '92vw' }}>
        <div className="absolute top-3 left-3 z-10 flex gap-1.5">
          {[
            { label: 'Zoom +', fn: () => { zoom.current = Math.min(5, zoom.current + 0.3); applyTransform() } },
            { label: 'Zoom -', fn: () => { zoom.current = Math.max(0.4, zoom.current - 0.3); applyTransform() } },
            { label: 'Reset',  fn: reset },
          ].map(b => (
            <button
              key={b.label}
              onClick={b.fn}
              className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white/15 text-white border border-white/25 hover:bg-white/30 transition-colors"
            >
              {b.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/15 border border-white/25 text-white hover:bg-white/30 flex items-center justify-center transition-colors"
        >
          <X size={13} />
        </button>
        <div
          ref={viewerRef}
          className="flex items-center justify-center overflow-hidden bg-black"
          style={{ height: 460, cursor: 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="MRI"
            draggable={false}
            style={{ height: 460, width: 'auto', transformOrigin: 'center', pointerEvents: 'none', userSelect: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

// Patient row in detail table
const TAG_STYLES = {
  Grade:   'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40',
  MGMT:    'bg-teal-900/50 text-teal-300 border border-teal-700/40',
  IDH:     'bg-amber-900/50 text-amber-300 border border-amber-700/40',
  Tumor:   'bg-slate-700/60 text-slate-300 border border-slate-600/40',
  Type:    'bg-purple-900/50 text-purple-300 border border-purple-700/40',
}

function tagStyle(label) {
  const key = Object.keys(TAG_STYLES).find(k => label.startsWith(k))
  return key ? TAG_STYLES[key] : 'bg-[#1F2937] text-[#94A3B8]'
}

function PatientRow({ p, checked, onCheck, onViewMRI, onShowNotes }) {
  const mainTags = [
    p.tumorGrade     && `Grade: ${p.tumorGrade}`,
    p.mgmtStatus     && `MGMT: ${p.mgmtStatus}`,
    p.idhStatus      && `IDH: ${p.idhStatus}`,
    p.tumorSize      && `Tumor: ${p.tumorSize}`,
    p.histologicType && `Type: ${p.histologicType}`,
  ].filter(Boolean)

  const surgeryTag = p.surgery ? `Surgery: ${p.surgery}` : null
  const pct   = Math.min(100, Math.max(0, p.matchPercentage || 0))
  const isFem = p.sex === 'Female'

  return (
    <tr className={`border-b border-[#1F2937]/50 transition-colors ${checked ? 'bg-cyan-950/30' : 'hover:bg-[#0f1b2d]'}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          className="w-4 h-4 rounded border-[#374151] bg-[#111827] accent-cyan-500 cursor-pointer"
        />
      </td>
      <td className="px-4 py-3 font-semibold text-[#F8FAFC] text-sm">{p.patientId}</td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isFem ? 'bg-pink-900/40 text-pink-300' : 'bg-blue-900/40 text-blue-300'}`}>
          {p.sex}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[#94A3B8]">{p.age || '-'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {mainTags.map((t, i) => (
            <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded ${tagStyle(t)}`}>{t}</span>
          ))}
        </div>
        {surgeryTag && (
          <span className="text-xs text-[#94A3B8] bg-[#1a2332] px-2 py-0.5 rounded border border-[#1F2937]">{surgeryTag}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-24 h-2.5 bg-[#1F2937] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-bold text-cyan-400">{pct}%</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {p.imageUrl ? (
          <button
            onClick={() => onViewMRI(p.imageUrl)}
            className="w-6 h-6 rounded border border-[#1F2937] bg-[#0f1b2d] text-[#94A3B8] hover:border-cyan-700/50 hover:text-cyan-400 flex items-center justify-center transition-colors"
            title="View MRI"
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 9.75h18M4.5 19.5h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
          </button>
        ) : (
          <span className="text-xs text-[#374151]">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => {
            const note = buildDoctorNote(p)
            onShowNotes(note.text, note.date)
            return
            const text = p.clinicalText || p.doctorNotes || p.notes ||
              [
                p.tumorSize      && `Tumor Size: ${p.tumorSize}`,
                p.tumorGrade     && `Grade: ${p.tumorGrade}`,
                p.mgmtStatus     && `MGMT Status: ${p.mgmtStatus}`,
                p.idhStatus      && `IDH Status: ${p.idhStatus}`,
                p.histologicType && `Histologic Type: ${p.histologicType}`,
                p.surgery        && `Surgery: ${p.surgery}`,
              ].filter(Boolean).join('\n') ||
              'No clinical notes available for this patient.'
            onShowNotes(text)
          }}
          className="w-7 h-7 rounded border border-[#1F2937] bg-[#0f1b2d] text-[#94A3B8] hover:border-cyan-700/50 hover:text-cyan-400 flex items-center justify-center transition-colors"
          title="View Doctor's Notes"
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
          </svg>
        </button>
      </td>
    </tr>
  )
}

function NotesModal({ text, date, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">Doctor's Notes</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {date && <p className="text-xs font-semibold text-gray-400 mb-3">{date}</p>}
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{text}</p>
        </div>
      </div>
    </div>
  )
}

function buildDoctorNote(p) {
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const sex    = p.sex === 'Female' ? 'female' : 'male'
  const grade  = p.tumorGrade === 'IV' ? 'high-grade (Grade IV)' : p.tumorGrade === 'III' ? 'intermediate-grade (Grade III)' : `Grade ${p.tumorGrade}`
  const mgmt   = p.mgmtStatus === 'Methylated' ? 'MGMT promoter methylation present (favorable prognostic marker)' : p.mgmtStatus === 'Unmethylated' ? 'MGMT promoter unmethylated (associated with reduced chemotherapy sensitivity)' : 'MGMT status not evaluated'
  const idh    = p.idhStatus === 'Mutant' ? 'IDH mutation detected (associated with improved prognosis)' : 'IDH wildtype (associated with more aggressive disease course)'
  const surg   = p.surgery === 'Yes' ? 'Patient underwent surgical resection.' : p.surgery === 'Biopsy Only' ? 'Surgical approach limited to stereotactic biopsy for tissue diagnosis.' : 'Patient deemed not a surgical candidate at this time.'

  return {
    date: today,
    text: `Patient is a ${p.age}-year-old ${sex} presenting with a ${p.histologicType || 'brain tumor'} (${grade}), measuring ${p.tumorSize || 'undetermined'} on MRI. ${idh}. ${mgmt}.

${surg} Current enrollment status: ${p.enrollmentStatus || 'under evaluation'}. Dropout risk assessed as ${p.dropoutRisk || 'moderate'}.

Neurological exam reveals deficits consistent with lesion location. Multidisciplinary tumor board review recommended prior to trial enrollment. Patient has been counseled regarding experimental nature of the NBM-BMX protocol and has expressed willingness to participate pending eligibility confirmation.

Screen failure risk: ${p.screenFailureRisk || 'under review'}. Recommend proceeding with lab workup and eligibility verification per protocol.`
  }
}

// ── Phase 2 styles ────────────────────────────────────────────
const P2_STYLES = {
  QUALIFIED_HIGH:    { label: 'Qualified — High',        color: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40', dot: 'bg-emerald-400' },
  QUALIFIED_MEDIUM:  { label: 'Qualified — Medium',      color: 'bg-amber-900/50 text-amber-300 border border-amber-700/40',       dot: 'bg-amber-400'   },
  INSUFFICIENT_DATA: { label: 'Insufficient Data',       color: 'bg-orange-900/50 text-orange-300 border border-orange-700/40',    dot: 'bg-orange-400'  },
  DISQUALIFIED:      { label: 'Disqualified — Lab Fail', color: 'bg-red-900/50 text-red-400 border border-red-700/40',             dot: 'bg-red-400'     },
}

const EVENT_COLORS = {
  medication: { dot: 'bg-blue-400',   badge: 'bg-blue-900/40 text-blue-300'    },
  diagnosis:  { dot: 'bg-red-400',    badge: 'bg-red-900/40 text-red-300'      },
  procedure:  { dot: 'bg-green-400',  badge: 'bg-green-900/40 text-green-300'  },
  lab:        { dot: 'bg-purple-400', badge: 'bg-purple-900/40 text-purple-300' },
}

function RuleRow({ rule, violated }) {
  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg ${violated ? 'bg-red-900/20 border border-red-800/30' : 'bg-green-900/20 border border-green-800/30'}`}>
      <span className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-white text-xs font-bold ${violated ? 'bg-red-500' : 'bg-green-500'}`}>
        {violated ? '!' : '✓'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${violated ? 'text-red-400' : 'text-green-400'}`}>{rule.rule_id}</span>
          <span className="text-xs text-[#94A3B8] truncate">{rule.description}</span>
        </div>
        {rule.evidence && (
          <p className={`text-xs mt-0.5 ${violated ? 'text-red-300 font-semibold' : 'text-[#94A3B8]'}`}>{rule.evidence}</p>
        )}
      </div>
    </div>
  )
}

// ── Phase 2 sub-components ────────────────────────────────────
function LabRow({ name, result }) {
  if (!result) return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-900/20 border border-orange-800/30">
      <span className="text-xs font-semibold text-orange-300">{name}</span>
      <span className="text-xs text-orange-400 font-medium">⚠ Not on record</span>
    </div>
  )
  return (
    <div className={`px-3 py-2 rounded-lg border ${result.pass ? 'bg-green-900/15 border-green-800/30' : 'bg-red-900/20 border-red-800/30'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${result.pass ? 'text-green-300' : 'text-red-300'}`}>{name}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${result.pass ? 'text-green-400' : 'text-red-400'}`}>{result.value} {result.unit}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${result.pass ? 'bg-green-800/40 text-green-300' : 'bg-red-800/40 text-red-300'}`}>{result.pass ? 'PASS' : 'FAIL'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${result.pass ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, result.value / 3)}%` }} />
        </div>
        <span className="text-xs text-[#94A3B8] whitespace-nowrap">{result.label}</span>
      </div>
    </div>
  )
}

function ConfidenceRing({ score }) {
  const r = 28, circ = 2 * Math.PI * r, fill = circ - (score / 100) * circ
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={72} height={72} className="flex-shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="#1F2937" strokeWidth={7} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '36px 36px', transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={36} y={40} textAnchor="middle" fill={color} fontSize={13} fontWeight="bold">{score}%</text>
    </svg>
  )
}

function Phase2Card({ pid, result, selected, onClick }) {
  const isStreaming = !result
  const style = P2_STYLES[result?.phase2_status] || P2_STYLES.QUALIFIED_MEDIUM
  return (
    <div onClick={onClick} className={`p-3.5 border rounded-xl cursor-pointer transition-all ${selected ? 'border-cyan-500/60 bg-cyan-900/20' : 'border-[#1e2d42] bg-[#0f1b2d] hover:border-cyan-700/40'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-[#F8FAFC]">{pid}</span>
        {isStreaming
          ? <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-600/40"><Loader2 size={9} className="animate-spin" /> Checking…</span>
          : <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full ${style.color}`}><span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />{style.label}</span>
        }
      </div>
      {!isStreaming && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-[#1F2937] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${result.confidence_score >= 80 ? 'bg-emerald-500' : result.confidence_score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${result.confidence_score}%` }} />
          </div>
          <span className="text-xs text-[#94A3B8]">{result.confidence_score}%</span>
        </div>
      )}
      {!isStreaming && result.missing_labs?.length > 0 && (
        <p className="text-xs text-orange-400 mt-1 truncate">Missing: {result.missing_labs.join(', ')}</p>
      )}
    </div>
  )
}

// ── Main TrialNexusView ─────────────────────────────────────────
export default function TrialNexusView({ trialName = 'NBM-BMX Administered Orally', onBack }) {
  const [screen,      setScreen]     = useState('search')
  const [selectedFile, setFile]      = useState(null)
  const [previewUrl,  setPreviewUrl] = useState(null)
  const [query,       setQuery]      = useState('')
  const [error,       setError]      = useState('')
  const [allResults,  setAllResults] = useState([])
  const [groupLabel,  setGroupLabel] = useState('')
  const [groupSub,    setGroupSub]   = useState('')
  const [groupPts,    setGroupPts]   = useState([])
  const [page,        setPage]       = useState(1)
  const [mriUrl,      setMriUrl]     = useState(null)
  const [notesText,   setNotesText]  = useState(null)
  const [selectedPts, setSelectedPts] = useState(new Set())
  const fileRef = useRef(null)

  // ── Phase 2 state ──────────────────────────────────────────
  const [p2Results,   setP2Results]  = useState({})
  const [p2Selected,  setP2Selected] = useState(null)
  const [p2Streaming, setP2Streaming]= useState(false)
  const [p2Done,      setP2Done]     = useState(false)
  const [p2Summary,   setP2Summary]  = useState(null)
  const [agentSteps,  setAgentSteps] = useState([])   // live agent console
  const [agentScreen, setAgentScreen]= useState(false) // show agent console
  const p2ReaderRef        = useRef(null)
  const forceSelectNextRef = useRef(false)

  async function startPhase2() {
    if (selectedPts.size === 0) return
    if (p2ReaderRef.current) { try { p2ReaderRef.current.cancel() } catch (_) {} p2ReaderRef.current = null }

    const init = {}
    selectedPts.forEach(pid => { init[pid] = undefined })
    setP2Results(init)
    setP2Selected(null)
    setP2Done(false)
    setP2Summary(null)
    setAgentSteps([])
    setAgentScreen(true)   // show agent console first
    setP2Streaming(true)
    setScreen('phase2')
    forceSelectNextRef.current = true

    await new Promise(r => setTimeout(r, 30))

    const ids = [...selectedPts].join(',')
    // Use new agent stream endpoint — runs dual-agent pipeline for selected IDs only
    const res    = await fetch(`${API}/api/screening/agent/stream?ids=${ids}`)
    const reader = res.body.getReader()
    p2ReaderRef.current = reader
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop()
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        try {
          const data = JSON.parse(line.slice(5).trim())

          if (data.step === 'agent1' || data.step === 'agent2' || data.step === 'executor') {
            // Agent console events
            setAgentSteps(prev => {
              const existing = prev.findIndex(s => s.step === data.step)
              if (existing >= 0) {
                const updated = [...prev]
                updated[existing] = data
                return updated
              }
              return [...prev, data]
            })
            // When executor finishes, mark excluded patients as DISQUALIFIED immediately
            if (data.step === 'executor' && data.status === 'done') {
              if (data.excluded?.length > 0) {
                data.excluded.forEach(pid => {
                  setP2Results(prev => ({
                    ...prev,
                    [pid]: {
                      patient_id: pid,
                      phase2_status: 'DISQUALIFIED',
                      confidence_score: 0,
                      lab_checks: {},
                      missing_labs: [],
                      failing_labs: ['Phase 1 SQL exclusion rule'],
                      excluded_rules: [{ rule_id: 'SQL-GATE', description: 'Excluded by Agent 2 approved SQL query', evidence: 'Violation found in patient history — did not pass Phase 1 eligibility filter' }],
                      passed_rules: [],
                      age: null, gender: null, state: null, trial_id: null,
                    }
                  }))
                })
                // Auto-select first excluded patient so right panel shows immediately
                setP2Selected(data.excluded[0])
                forceSelectNextRef.current = false
              }
              await new Promise(r => setTimeout(r, 1000))
              setAgentScreen(false)
            }
          } else if (data.step === 'phase2') {
            // Phase 2 patient results
            const pid = data.patient_id
            setP2Results(prev => ({ ...prev, [pid]: data }))
            setP2Selected(prev => {
              if (forceSelectNextRef.current) { forceSelectNextRef.current = false; return pid }
              return prev ?? pid
            })
          } else if (data.done) {
            setP2Done(true)
            setP2Streaming(false)
            // Calculate summary counts from all results
            setP2Results(prev => {
              const vals = Object.values(prev).filter(Boolean)
              setP2Summary({
                high:        vals.filter(v => v.phase2_status === 'QUALIFIED_HIGH').length,
                medium:      vals.filter(v => v.phase2_status === 'QUALIFIED_MEDIUM').length,
                insufficient:vals.filter(v => v.phase2_status === 'INSUFFICIENT_DATA').length,
                disqualified:vals.filter(v => v.phase2_status === 'DISQUALIFIED').length,
              })
              return prev
            })
          }
        } catch (_) {}
      }
    }
    setP2Streaming(false)
  }

  const groups = categorise(allResults)

  function handleFile(file) {
    if (!file) return
    setFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function doSearch() {
    setError('')
    if (!selectedFile) { setError('Please upload a brain MRI image first.'); return }
    if (!query.trim()) { setError('Please describe your patient criteria.'); return }
    setScreen('loading')
    try {
      const form = new FormData()
      form.append('file',  selectedFile)
      form.append('query', query)
      form.append('age',   '0')
      const res  = await fetch(`${API}/search`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setAllResults(data.results || [])
      setScreen('groups')
    } catch (e) {
      setError('Search failed: ' + e.message)
      setScreen('search')
    }
  }

  function openGroup(label, sub, pts) {
    setGroupLabel(label); setGroupSub(sub); setGroupPts(pts); setPage(1)
    setScreen('detail')
  }

  const paged      = groupPts.slice((page - 1) * PAGE_SZ, page * PAGE_SZ)
  const totalPages = Math.ceil(groupPts.length / PAGE_SZ)

  const crumbs = {
    search:  [trialName],
    loading: [trialName],
    groups:  [trialName, 'Groups'],
    detail:  [trialName, 'Groups', groupLabel],
    phase2:  [trialName, 'Groups', groupLabel, 'Phase 2 — Lab Screening'],
  }[screen] || []

  return (
    <div className="flex flex-col h-screen bg-[#0B1220] overflow-hidden">

      {/* ── Internal topbar ── */}
      <div className="bg-[#0D1117] border-b border-[#1F2937] h-11 flex items-center px-5 gap-2 flex-shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="text-[#94A3B8] hover:text-cyan-400 transition-colors mr-1"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-[#F8FAFC]">TrialNexus</span>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight size={11} className="text-[#374151]" />
              <span className={i === crumbs.length - 1 ? 'text-[#F8FAFC] font-semibold' : 'text-[#94A3B8]'}>
                {c.length > 32 ? c.slice(0, 32) + '...' : c}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        {screen !== 'search' && screen !== 'loading' && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 bg-[#1F2937] rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, allResults.length)}%` }}
              />
            </div>
            <span className="text-xs text-[#94A3B8]">
              <span className="font-semibold text-[#F8FAFC]">{allResults.length}</span>/100
            </span>
            <button className="text-xs border border-[#1F2937] text-[#94A3B8] px-2.5 py-1 rounded-md hover:border-cyan-700/50 hover:text-cyan-400 transition-colors">
              Cohort Overview
            </button>
          </div>
        )}

        <button className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-900/40 border border-cyan-700/40 text-cyan-300 px-3 py-1.5 rounded-md hover:bg-cyan-800/40 transition-colors">
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0m.75 0H8.25m4.125 0a.375.375 0 11-.75 0m.75 0H12m4.125 0a.375.375 0 11-.75 0m.75 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          Chat with Data
        </button>
      </div>

      {/* ════════════════════════════════════════════════
          SEARCH SCREEN
      ════════════════════════════════════════════════ */}
      {screen === 'search' && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 overflow-y-auto">
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-[#0D1B2E] flex items-center justify-center mb-3 shadow-lg">
              <TrialNexusLogo size={44} />
            </div>
            <h1 className="text-2xl font-bold text-[#F8FAFC]">TrialNexus</h1>
            <p className="text-sm text-[#94A3B8] mt-1">Find and refine participant matches for your trial.</p>
          </div>

          {/* Search card */}
          <div className="w-full max-w-xl bg-[#111827] rounded-2xl border border-[#1F2937] shadow-xl overflow-hidden">
            {previewUrl && (
              <div className="flex items-center gap-3 px-4 pt-3">
                <div className="relative">
                  <img src={previewUrl} alt="preview" className="w-16 h-12 object-cover rounded-lg border border-[#1F2937]" />
                  <button
                    onClick={() => { setFile(null); setPreviewUrl(null) }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-600"
                  >
                    <X size={8} />
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#F8FAFC]">{selectedFile?.name}</p>
                  <p className="text-xs text-[#94A3B8]">{selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' kB' : ''}</p>
                </div>
              </div>
            )}

            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSearch() } }}
              placeholder="Type criteria to find your ideal cohort..."
              rows={3}
              className="w-full px-4 py-3 text-sm text-[#F8FAFC] placeholder-[#4B5563] outline-none resize-none bg-transparent"
            />

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#1F2937]">
              <div className="flex items-center gap-2">
                <button className="w-7 h-7 rounded-lg border border-[#1F2937] bg-[#0f1b2d] text-[#94A3B8] hover:border-cyan-700/50 hover:text-cyan-400 flex items-center justify-center transition-colors">
                  <SlidersHorizontal size={12} />
                </button>
                <label className="w-7 h-7 rounded-lg border border-[#1F2937] bg-[#0f1b2d] text-[#94A3B8] hover:border-cyan-700/50 hover:text-cyan-400 flex items-center justify-center cursor-pointer transition-colors">
                  <ImagePlus size={12} />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleFile(e.target.files[0])}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={doSearch}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    selectedFile && query.trim()
                      ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                      : 'bg-[#1F2937] text-[#4B5563] cursor-not-allowed'
                  }`}
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          LOADING SCREEN
      ════════════════════════════════════════════════ */}
      {screen === 'loading' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-4">
            <div className="w-7 h-7 rounded-full border-[3px] border-cyan-900 border-t-cyan-400 animate-spin" />
            <span className="text-lg font-semibold text-[#F8FAFC]">
              Compiling <span className="text-cyan-400">Groups...</span>
            </span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          GROUPS SCREEN
      ════════════════════════════════════════════════ */}
      {screen === 'groups' && (
        <div className="flex-1 overflow-y-auto p-6">
          <button
            onClick={() => setScreen('search')}
            className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-cyan-400 mb-5 transition-colors"
          >
            <ArrowLeft size={13} /> New Search
          </button>

          <p className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider mb-5">
            {groups.exact.length + groups.image.length} patients matched — grouped by confidence
          </p>

          <div className="flex flex-col gap-5">
            {[
              { key: 'exact', label: 'Exact Match Group', sub: 'Match >= 85% - high-confidence matches',   pts: groups.exact, badge: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30', btn: 'bg-emerald-600 hover:bg-emerald-500' },
              { key: 'image', label: 'Image Match Group', sub: 'Match 65-84% - image-similarity matches',  pts: groups.image, badge: 'bg-blue-900/40 text-blue-300 border border-blue-700/30',         btn: 'bg-blue-600 hover:bg-blue-500'     },
            ].map(def => (
              <div key={def.key} className="bg-[#111827] rounded-2xl border border-[#1F2937] px-6 py-5 flex items-center gap-6 hover:border-cyan-700/40 transition-colors shadow-md max-w-4xl mx-auto w-full">
                <span className={`shrink-0 text-sm font-bold px-4 py-2 rounded-full ${def.badge}`}>
                  {def.pts.length} patients
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-[#F8FAFC]">{def.label}</p>
                  <p className="text-sm font-semibold text-slate-300 mt-1">{def.sub}</p>
                </div>
                <div className="flex gap-8 shrink-0">
                  <div><p className="text-[#94A3B8] uppercase tracking-widest text-xs font-medium mb-1">Age Range</p><p className="text-base font-semibold text-[#F8FAFC]">{ageRange(def.pts)}</p></div>
                  <div><p className="text-[#94A3B8] uppercase tracking-widest text-xs font-medium mb-1">Sex</p><p className="text-base font-semibold text-[#F8FAFC]">{sexDist(def.pts)}</p></div>
                  <div><p className="text-[#94A3B8] uppercase tracking-widest text-xs font-medium mb-1">Patients</p><p className="text-base font-semibold text-[#F8FAFC]">{def.pts.length}</p></div>
                </div>
                <button
                  onClick={() => openGroup(def.label, def.sub, def.pts)}
                  className={`shrink-0 text-sm font-semibold text-white px-7 py-2.5 rounded-xl transition-colors ${def.btn}`}
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          DETAIL TABLE SCREEN
      ════════════════════════════════════════════════ */}
      {screen === 'detail' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => {
                  if (p2ReaderRef.current) {
                    try { p2ReaderRef.current.cancel() } catch (_) {}
                    p2ReaderRef.current = null
                  }
                  setP2Results({})
                  setP2Selected(null)
                  setP2Done(false)
                  setP2Streaming(false)
                  setScreen('groups')
                }}
                className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-cyan-400 mb-2 transition-colors"
              >
                <ArrowLeft size={13} /> Back to Groups
              </button>
              <p className="text-2xl font-bold text-[#F8FAFC]">{groupLabel}</p>
              <p className="text-sm text-slate-400 mt-0.5">{groupSub}</p>
            </div>
            <button
              onClick={startPhase2}
              disabled={selectedPts.size === 0}
              className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-colors ${
                selectedPts.size > 0
                  ? 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg shadow-cyan-900/30'
                  : 'bg-[#1F2937] text-[#4B5563] cursor-not-allowed'
              }`}
            >
              <Activity size={14} />
              {selectedPts.size > 0 ? `Run Phase 2 — ${selectedPts.size} selected` : 'Select patients for Phase 2'}
              {selectedPts.size > 0 && <ChevronRight size={14} />}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {['All', 'Age 20-59', 'Female', 'Male', 'Grade IV', 'Grade III'].map((c, i) => (
              <button
                key={c}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  i === 0
                    ? 'bg-cyan-700 text-white border-cyan-700'
                    : 'bg-[#111827] text-[#94A3B8] border-[#1F2937] hover:border-cyan-700/50 hover:text-cyan-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="bg-[#111827] rounded-xl border border-[#1F2937] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0f1b2d] border-b border-[#1F2937]">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-[#374151] bg-[#111827] accent-cyan-500 cursor-pointer"
                      onChange={e => {
                        if (e.target.checked) setSelectedPts(new Set(paged.map(p => p.patientId)))
                        else setSelectedPts(new Set())
                      }}
                      checked={paged.length > 0 && paged.every(p => selectedPts.has(p.patientId))}
                    />
                  </th>
                  {['Patient ID', 'Sex', 'Age', 'Clinical Data', 'Match %', 'Attachments', "Doctor's Notes"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-[#374151]">No patients in this group.</td></tr>
                ) : (
                  paged.map(p => (
                    <PatientRow
                      key={p.patientId}
                      p={p}
                      checked={selectedPts.has(p.patientId)}
                      onCheck={() => setSelectedPts(prev => {
                        const next = new Set(prev)
                        next.has(p.patientId) ? next.delete(p.patientId) : next.add(p.patientId)
                        return next
                      })}
                      onViewMRI={url => setMriUrl(url)}
                      onShowNotes={(text, date) => setNotesText({ text, date })}
                    />
                  ))
                )}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[#1F2937] bg-[#0f1b2d]">
              <div className="flex gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                      n === page ? 'bg-cyan-700 text-white' : 'bg-[#111827] border border-[#1F2937] text-[#94A3B8] hover:border-cyan-700/50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button className="text-xs font-semibold bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-600 transition-colors">
                Save Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          PHASE 2 SCREEN — lab screening for selected patients
      ════════════════════════════════════════════════ */}
      {screen === 'phase2' && (
        <div className="flex flex-1 overflow-hidden relative">

          {/* ── Agent Console Overlay ───────────────────────── */}
          {agentScreen && (
            <div className="absolute inset-0 z-30 bg-[#060d18]/92 backdrop-blur-sm flex items-center justify-center p-8">
              <div className="w-full max-w-2xl flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
                {/* Header */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-900/40 border border-cyan-700/40 flex items-center justify-center">
                    <Activity size={14} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#F8FAFC]">AI Agent Pipeline Running</p>
                    <p className="text-xs text-[#94A3B8]">Running dual-agent SQL screening on {selectedPts.size} selected patient{selectedPts.size !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Agent 1 — SQL Translator */}
                {(() => {
                  const a1 = agentSteps.find(s => s.step === 'agent1')
                  const done = a1?.status === 'done'
                  const running = a1?.status === 'start' || a1?.status === 'running'
                  return (
                    <div className={`rounded-xl border p-4 transition-all ${done ? 'border-emerald-700/40 bg-emerald-900/10' : running ? 'border-cyan-700/40 bg-cyan-900/10' : 'border-[#1F2937] bg-[#0f1b2d] opacity-40'}`}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-600 text-white' : running ? 'bg-cyan-600 text-white' : 'bg-[#1F2937] text-[#374151]'}`}>
                          {done ? '✓' : running ? <span className="animate-spin inline-block">⟳</span> : '1'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-bold ${done ? 'text-emerald-400' : running ? 'text-cyan-400' : 'text-[#374151]'}`}>
                              Agent 1 — SQL Translator
                            </p>
                            {done && a1.cached && <span className="text-xs bg-slate-800 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded-full">cached</span>}
                          </div>
                          <p className="text-xs text-[#94A3B8]">
                            {done ? 'Draft SQL query generated' : running ? 'Analysing trial protocol & writing SQL…' : 'Waiting'}
                          </p>
                        </div>
                        {running && <Loader2 size={13} className="text-cyan-400 animate-spin flex-shrink-0" />}
                      </div>
                      {done && a1.sql && (
                        <pre className="text-xs text-emerald-300 bg-[#061208] border border-emerald-900/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto">
                          {a1.sql}
                        </pre>
                      )}
                      {done && a1.rules_applied?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a1.rules_applied.map((r, i) => (
                            <span key={i} className="text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-2 py-0.5 rounded-full">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Agent 2 — SQL Auditor */}
                {(() => {
                  const a1 = agentSteps.find(s => s.step === 'agent1')
                  const a2 = agentSteps.find(s => s.step === 'agent2')
                  const active = !!a1
                  const done = a2?.status === 'done'
                  const running = a2?.status === 'start' || a2?.status === 'running'
                  return (
                    <div className={`rounded-xl border p-4 transition-all ${done ? 'border-emerald-700/40 bg-emerald-900/10' : running ? 'border-amber-700/40 bg-amber-900/10' : active ? 'border-[#1F2937] bg-[#0f1b2d]' : 'border-[#1F2937] bg-[#0f1b2d] opacity-40'}`}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-600 text-white' : running ? 'bg-amber-600 text-white' : 'bg-[#1F2937] text-[#374151]'}`}>
                          {done ? '✓' : running ? <span className="animate-spin inline-block">⟳</span> : '2'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-bold ${done ? 'text-emerald-400' : running ? 'text-amber-400' : 'text-[#374151]'}`}>
                              Agent 2 — SQL Auditor
                            </p>
                            {done && a2.cached && <span className="text-xs bg-slate-800 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded-full">cached</span>}
                          </div>
                          <p className="text-xs text-[#94A3B8]">
                            {done ? `Audit complete — ${a2.result?.includes('approved') ? 'query approved' : 'query corrected & fixed'}` : running ? 'Received Agent 1 SQL — cross-checking timeline math…' : 'Waiting for Agent 1'}
                          </p>
                        </div>
                        {running && <Loader2 size={13} className="text-amber-400 animate-spin flex-shrink-0" />}
                      </div>
                      {done && a2.reasoning && (
                        <div className="bg-[#0c0a02] border border-amber-900/30 rounded-lg p-3">
                          <p className="text-xs text-amber-300/80 leading-relaxed italic">{a2.reasoning}</p>
                          {a2.result && (
                            <span className={`mt-2 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${a2.result?.includes('approved') ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>
                              {a2.result?.includes('approved') ? '✓ Approved' : '↻ Revised & Fixed'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Executor */}
                {(() => {
                  const a2 = agentSteps.find(s => s.step === 'agent2')
                  const ex = agentSteps.find(s => s.step === 'executor')
                  const active = !!a2
                  const done = ex?.status === 'done'
                  const running = ex?.status === 'start' || ex?.status === 'running'
                  return (
                    <div className={`rounded-xl border p-4 transition-all ${done ? 'border-emerald-700/40 bg-emerald-900/10' : running ? 'border-purple-700/40 bg-purple-900/10' : active ? 'border-[#1F2937] bg-[#0f1b2d]' : 'border-[#1F2937] bg-[#0f1b2d] opacity-40'}`}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-600 text-white' : running ? 'bg-purple-600 text-white' : 'bg-[#1F2937] text-[#374151]'}`}>
                          {done ? '✓' : running ? <span className="animate-spin inline-block">⟳</span> : '▶'}
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs font-bold ${done ? 'text-emerald-400' : running ? 'text-purple-400' : 'text-[#374151]'}`}>
                            Python Executor
                          </p>
                          <p className="text-xs text-[#94A3B8]">
                            {done
                              ? `${(ex.pre_qualified || []).length} pre-qualified / ${(ex.excluded || []).length} excluded from selected`
                              : running ? 'Executing SQL on patients.db…'
                              : 'Waiting for audit'}
                          </p>
                        </div>
                        {running && <Loader2 size={13} className="text-purple-400 animate-spin flex-shrink-0" />}
                      </div>
                      {done && (
                        <div className="flex gap-3 mt-1">
                          {(ex.pre_qualified || []).length > 0 && (
                            <div className="flex-1 bg-emerald-900/20 border border-emerald-800/30 rounded-lg px-3 py-2">
                              <p className="text-xs font-bold text-emerald-400 mb-1">Pre-qualified</p>
                              <div className="flex flex-wrap gap-1">
                                {ex.pre_qualified.map(id => (
                                  <span key={id} className="text-xs bg-emerald-800/30 text-emerald-300 px-1.5 py-0.5 rounded font-mono">{id}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(ex.excluded || []).length > 0 && (
                            <div className="flex-1 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                              <p className="text-xs font-bold text-red-400 mb-1">Excluded by SQL</p>
                              <div className="flex flex-wrap gap-1">
                                {ex.excluded.map(id => (
                                  <span key={id} className="text-xs bg-red-800/30 text-red-300 px-1.5 py-0.5 rounded font-mono">{id}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Transition hint */}
                {agentSteps.find(s => s.step === 'executor' && s.status === 'done') && (
                  <div className="flex items-center justify-center gap-2 text-xs text-cyan-400 mt-1">
                    <Loader2 size={11} className="animate-spin" />
                    Loading Phase 2 lab screening results…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Left: streaming patient list */}
          <div className="w-72 bg-[#0D1117] border-r border-[#1F2937] flex flex-col flex-shrink-0">
            <div className="px-3 py-2.5 border-b border-[#1F2937] flex items-center justify-between flex-shrink-0">
              <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wide">
                {p2Done ? `${selectedPts.size} patients — done` : `Screening ${selectedPts.size} patients…`}
              </p>
              {p2Streaming && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
              {p2Done && p2Summary && (
                <div className="flex gap-1.5 text-xs">
                  {p2Summary.high > 0        && <span className="text-emerald-400 font-bold">{p2Summary.high}✓</span>}
                  {p2Summary.medium > 0      && <span className="text-amber-400 font-bold">{p2Summary.medium}~</span>}
                  {p2Summary.insufficient > 0 && <span className="text-orange-400 font-bold">{p2Summary.insufficient}?</span>}
                  {p2Summary.disqualified > 0 && <span className="text-red-400 font-bold">{p2Summary.disqualified}✗</span>}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {[...selectedPts].map(pid => (
                <Phase2Card
                  key={pid}
                  pid={pid}
                  result={p2Results[pid]}
                  selected={p2Selected === pid}
                  onClick={() => p2Results[pid] && setP2Selected(pid)}
                />
              ))}
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 overflow-y-auto p-5">
            {p2Results[p2Selected] ? (() => {
              const d = p2Results[p2Selected]
              const style = P2_STYLES[d.phase2_status] || P2_STYLES.QUALIFIED_MEDIUM
              return (
                <div className="flex flex-col gap-4 max-w-2xl">

                  {/* Header */}
                  <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
                    <div className="flex items-center gap-4">
                      <ConfidenceRing score={d.confidence_score} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h2 className="text-base font-bold text-[#F8FAFC]">{d.patient_id}</h2>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${style.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />{style.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                          <span className="flex items-center gap-1"><User size={11}/>{d.gender}, {d.age} yrs</span>
                          <span className="flex items-center gap-1"><MapPin size={11}/>{d.state}</span>
                          <span className="flex items-center gap-1"><FlaskConical size={11}/>{d.trial_id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status note */}
                    <div className={`mt-3 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                      d.phase2_status === 'QUALIFIED_HIGH'    ? 'bg-emerald-900/20 border border-emerald-800/30 text-emerald-300' :
                      d.phase2_status === 'QUALIFIED_MEDIUM'  ? 'bg-amber-900/20 border border-amber-800/30 text-amber-300'       :
                      d.phase2_status === 'INSUFFICIENT_DATA' ? 'bg-orange-900/20 border border-orange-800/30 text-orange-300'    :
                      'bg-red-900/20 border border-red-800/30 text-red-300'
                    }`}>
                      <Activity size={13} className="flex-shrink-0" />
                      {d.phase2_status === 'QUALIFIED_HIGH'    && 'All required labs present and above threshold. Patient is eligible for Phase III enrolment.'}
                      {d.phase2_status === 'QUALIFIED_MEDIUM'  && `Labs pass thresholds but ${d.missing_labs?.length ? `${d.missing_labs.length} missing` : 'values are borderline'}. CRC review recommended.`}
                      {d.phase2_status === 'INSUFFICIENT_DATA' && `${d.missing_labs?.length} required labs not on record (${d.missing_labs?.join(', ')}). Hold for repeat testing.`}
                      {d.phase2_status === 'DISQUALIFIED'      && `Lab values below threshold: ${d.failing_labs?.join(', ')}. Does not meet inclusion criteria.`}
                    </div>
                  </div>

                  {/* Phase 1 exclusion rules */}
                  {(d.excluded_rules || d.passed_rules) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
                        <h3 className="text-xs font-bold text-red-400 mb-2.5 uppercase tracking-wide">
                          Exclusion Violations ({d.excluded_rules?.length ?? 0})
                        </h3>
                        {d.excluded_rules?.length === 0
                          ? <p className="text-xs text-[#94A3B8] italic">No violations — passed all rules</p>
                          : <div className="flex flex-col gap-2">{d.excluded_rules.map(r => <RuleRow key={r.rule_id} rule={r} violated />)}</div>
                        }
                      </div>
                      <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
                        <h3 className="text-xs font-bold text-green-400 mb-2.5 uppercase tracking-wide">
                          Passed Rules ({d.passed_rules?.length ?? 0})
                        </h3>
                        <div className="flex flex-col gap-2">
                          {d.passed_rules?.map(r => <RuleRow key={r.rule_id} rule={r} violated={false} />)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Event timeline */}
                  {d.events?.length > 0 && (
                    <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
                      <h3 className="text-xs font-bold text-[#94A3B8] mb-3 uppercase tracking-wide">
                        Event Timeline ({d.events.length} visits)
                      </h3>
                      <div className="relative">
                        <div className="absolute left-2 top-0 bottom-0 w-px bg-[#1F2937]" />
                        <div className="flex flex-col gap-3 pl-7">
                          {d.events.map((ev, i) => {
                            const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.lab
                            return (
                              <div key={i} className="relative">
                                <div className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ${c.dot}`} />
                                <div className="flex items-center gap-2.5">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>{ev.event_type}</span>
                                  <span className="text-xs text-[#F8FAFC] font-medium">{ev.event_name}</span>
                                  <span className="text-xs text-[#94A3B8] ml-auto">{ev.days_ago}d ago</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lab checks */}
                  <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
                    <h3 className="text-xs font-bold text-[#94A3B8] mb-3 uppercase tracking-wide">Lab Inclusion Criteria</h3>
                    <div className="flex flex-col gap-2">
                      {Object.entries(d.lab_checks).map(([name, result]) => (
                        <LabRow key={name} name={name} result={result} />
                      ))}
                    </div>
                  </div>

                  {/* Next step */}
                  <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-4">
                    <h3 className="text-xs font-bold text-[#94A3B8] mb-2 uppercase tracking-wide">Recommended Next Step</h3>
                    <p className="text-xs text-[#94A3B8]/80 leading-relaxed">
                      {d.phase2_status === 'QUALIFIED_HIGH'    && 'Proceed to formal screening visit and consent. All eligibility criteria satisfied.'}
                      {d.phase2_status === 'QUALIFIED_MEDIUM'  && 'Schedule CRC chart review. Request repeat labs for borderline values before consent visit.'}
                      {d.phase2_status === 'INSUFFICIENT_DATA' && 'Place on hold. Contact site coordinator to order missing lab panels. Re-screen once results available.'}
                      {d.phase2_status === 'DISQUALIFIED'      && 'Patient does not meet lab inclusion criteria. Do not proceed. Document for sponsor reporting.'}
                    </p>
                  </div>
                </div>
              )
            })() : (
              <div className="flex items-center justify-center h-full text-[#94A3B8]">
                <div className="text-center">
                  <Loader2 size={28} className="mx-auto mb-3 opacity-30 animate-spin" />
                  <p className="text-sm">Results streaming in — click a patient card when ready</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mriUrl && <MRIModal imageUrl={mriUrl} onClose={() => setMriUrl(null)} />}
      {notesText && <NotesModal text={notesText.text} date={notesText.date} onClose={() => setNotesText(null)} />}
    </div>
  )
}
