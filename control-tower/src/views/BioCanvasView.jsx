import { useState, useRef, useEffect, useCallback } from 'react'
import { SlidersHorizontal, ImagePlus, Send, X, ArrowLeft, ChevronRight } from 'lucide-react'

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
  return ages.length ? `${Math.min(...ages)}–${Math.max(...ages)} yrs` : 'N/A'
}
function sexDist(pts) {
  const m = pts.filter(p => p.sex === 'Male').length
  const f = pts.filter(p => p.sex === 'Female').length
  return [m && `${m}M`, f && `${f}F`].filter(Boolean).join(' / ') || 'N/A'
}

// ── Sub-components ────────────────────────────────────────────

function DemoChip({ label, selected, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        selected
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
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
        {/* toolbar */}
        <div className="absolute top-3 left-3 z-10 flex gap-1.5">
          {[
            { label: 'Zoom +', fn: () => { zoom.current = Math.min(5, zoom.current + 0.3); applyTransform() } },
            { label: 'Zoom −', fn: () => { zoom.current = Math.max(0.4, zoom.current - 0.3); applyTransform() } },
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

        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/15 border border-white/25 text-white hover:bg-white/30 flex items-center justify-center transition-colors"
        >
          <X size={13} />
        </button>

        {/* viewer */}
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
function PatientRow({ p, onViewMRI }) {
  const tags = [
    p.tumorSize      && `Tumor: ${p.tumorSize}`,
    p.tumorGrade     && `Grade: ${p.tumorGrade}`,
    p.mgmtStatus     && `MGMT: ${p.mgmtStatus}`,
    p.idhStatus      && `IDH: ${p.idhStatus}`,
    p.histologicType && `Type: ${p.histologicType}`,
    p.surgery        && `Surgery: ${p.surgery}`,
  ].filter(Boolean)

  const pct    = Math.min(100, Math.max(0, p.matchPercentage || 0))
  const isFem  = p.sex === 'Female'

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-2.5 font-semibold text-slate-900 text-xs">{p.patientId}</td>
      <td className="px-4 py-2.5">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isFem ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
          {p.sex}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-600">{p.age || '–'}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span key={i} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold text-teal-600">{pct}%</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {p.imageUrl ? (
          <button
            onClick={() => onViewMRI(p.imageUrl)}
            className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-400 hover:border-indigo-400 hover:text-indigo-500 flex items-center justify-center transition-colors"
            title="View MRI"
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 9.75h18M4.5 19.5h15a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
          </button>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="relative group inline-block">
          <button className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-400 hover:border-indigo-400 hover:text-indigo-500 flex items-center justify-center transition-colors">
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
            </svg>
          </button>
          {p.clinicalText && (
            <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-64 bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl z-10 pointer-events-none leading-relaxed">
              {p.clinicalText}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main BioCanvasView ────────────────────────────────────────
export default function BioCanvasView({ trialName = 'NBM-BMX Administered Orally', onBack }) {
  const [screen,      setScreen]      = useState('search')  // search | loading | groups | detail
  const [selectedFile, setFile]       = useState(null)
  const [previewUrl,  setPreviewUrl]  = useState(null)
  const [query,       setQuery]       = useState('')
  const [chips,       setChips]       = useState({ 'Age 20–59': true, Female: false, Male: false, 'Platelets ≥ 75k': false, 'Hgb ≥ 8.0': false })
  const [error,       setError]       = useState('')
  const [allResults,  setAllResults]  = useState([])
  const [groupLabel,  setGroupLabel]  = useState('')
  const [groupSub,    setGroupSub]    = useState('')
  const [groupPts,    setGroupPts]    = useState([])
  const [page,        setPage]        = useState(1)
  const [mriUrl,      setMriUrl]      = useState(null)
  const fileRef = useRef(null)

  const groups = categorise(allResults)

  // ── image upload ──
  function handleFile(file) {
    if (!file) return
    setFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  // ── search ──
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

  const paged = groupPts.slice((page - 1) * PAGE_SZ, page * PAGE_SZ)
  const totalPages = Math.ceil(groupPts.length / PAGE_SZ)

  // ── breadcrumb ──
  const crumbs = {
    search:  [trialName],
    loading: [trialName],
    groups:  [trialName, 'Groups'],
    detail:  [trialName, 'Groups', groupLabel],
  }[screen] || []

  return (
    <div className="flex flex-col h-screen bg-[#f2f2f2] overflow-hidden">

      {/* ── Internal topbar ── */}
      <div className="bg-white border-b border-slate-100 h-11 flex items-center px-5 gap-2 flex-shrink-0">
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-slate-700 transition-colors mr-1"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-slate-900">BioCanvas</span>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight size={11} className="text-slate-300" />
              <span className={i === crumbs.length - 1 ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
                {c.length > 32 ? c.slice(0, 32) + '…' : c}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        {/* Progress */}
        {screen !== 'search' && screen !== 'loading' && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, allResults.length)}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-slate-900">{allResults.length}</span>/100
            </span>
            <button className="text-xs border border-slate-200 text-slate-500 px-2.5 py-1 rounded-md hover:bg-slate-50">
              ↑ Cohort Overview
            </button>
          </div>
        )}

        <button className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors">
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
          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" className="mb-2">
              <path d="M10 40C10 26 22 9 38 9" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M20 44C20 30 30 16 44 13" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M5 36C5 22 17 13 32 17" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round"/>
            </svg>
            <h1 className="text-2xl font-bold text-slate-900">BioCanvas</h1>
            <p className="text-sm text-slate-400 mt-1">Find and refine participant matches for your trial.</p>
          </div>

          {/* Search card */}
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
            {/* Image preview inside card */}
            {previewUrl && (
              <div className="flex items-center gap-3 px-4 pt-3">
                <div className="relative">
                  <img src={previewUrl} alt="preview" className="w-16 h-12 object-cover rounded-lg border border-slate-200" />
                  <button
                    onClick={() => { setFile(null); setPreviewUrl(null) }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-600"
                  >
                    <X size={8} />
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-700">{selectedFile?.name}</p>
                  <p className="text-xs text-slate-400">{selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' kB' : ''}</p>
                </div>
              </div>
            )}

            {/* Textarea */}
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSearch() } }}
              placeholder="Type criteria to find your ideal cohort…"
              rows={3}
              className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-300 outline-none resize-none bg-transparent"
            />

            {/* Footer bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 flex items-center justify-center">
                  <SlidersHorizontal size={12} />
                </button>
                <label className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 flex items-center justify-center cursor-pointer">
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
                <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">Brain Cancer</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">Mammary Carcinoma</span>
                <button
                  onClick={doSearch}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    selectedFile && query.trim()
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Demographic chips */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {Object.keys(chips).map(label => (
              <DemoChip
                key={label}
                label={label}
                selected={chips[label]}
                onToggle={() => setChips(c => ({ ...c, [label]: !c[label] }))}
              />
            ))}
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
            <div className="w-7 h-7 rounded-full border-[3px] border-red-200 border-t-red-500 animate-spin" />
            <span className="text-lg font-semibold text-slate-800">
              Compiling <span className="text-indigo-600">Groups…</span>
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
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 mb-5 transition-colors"
          >
            <ArrowLeft size={13} /> New Search
          </button>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            {allResults.length} patients matched — grouped by confidence
          </p>

          <div className="flex flex-col gap-4">
            {[
              { key: 'exact', label: 'Exact Match Group', sub: 'Match ≥ 85% – high-confidence matches',   pts: groups.exact, badge: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40', btn: 'bg-emerald-700 hover:bg-emerald-600' },
              { key: 'image', label: 'Image Match Group', sub: 'Match 65–84% – image-similarity matches', pts: groups.image, badge: 'bg-blue-900/40 text-blue-300 border border-blue-700/40',       btn: 'bg-blue-700 hover:bg-blue-600'     },
            ].map(def => (
              <div key={def.key} className="bg-[#0F172A] rounded-2xl border border-[#1E293B] px-6 py-5 flex items-center gap-6 hover:border-cyan-700/40 transition-colors shadow-lg">
                <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${def.badge}`}>
                  {def.pts.length} patients
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{def.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{def.sub}</p>
                </div>
                <div className="flex gap-6 text-xs shrink-0">
                  <div><p className="text-slate-500 uppercase tracking-wide text-[10px] mb-0.5">Age Range</p><p className="font-semibold text-slate-200">{ageRange(def.pts)}</p></div>
                  <div><p className="text-slate-500 uppercase tracking-wide text-[10px] mb-0.5">Sex</p><p className="font-semibold text-slate-200">{sexDist(def.pts)}</p></div>
                  <div><p className="text-slate-500 uppercase tracking-wide text-[10px] mb-0.5">Patients</p><p className="font-semibold text-slate-200">{def.pts.length}</p></div>
                </div>
                <button
                  onClick={() => openGroup(def.label, def.sub, def.pts)}
                  className={`shrink-0 text-xs font-semibold text-white px-5 py-2 rounded-lg transition-colors ${def.btn}`}
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
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <button
                onClick={() => setScreen('groups')}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 mb-2 transition-colors"
              >
                <ArrowLeft size={13} /> Back to Groups
              </button>
              <p className="text-sm font-bold text-slate-900">{groupLabel}</p>
              <p className="text-xs text-slate-400">{groupSub}</p>
            </div>
            <button className="text-xs font-semibold bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
              Save Selected
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['All', 'Age 20–59', 'Female', 'Male', 'Grade IV', 'Grade III'].map((c, i) => (
              <button
                key={c}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  i === 0
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Patient ID ↕', 'Sex ↕', 'Age ↕', 'Clinical Data', 'Match %', 'Attachments ↕', "Doctor's Notes ↕"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-300">No patients in this group.</td></tr>
                ) : (
                  paged.map(p => (
                    <PatientRow key={p.patientId} p={p} onViewMRI={url => setMriUrl(url)} />
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <div className="flex gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                      n === page ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button className="text-xs font-semibold bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
                Save Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MRI Modal */}
      {mriUrl && <MRIModal imageUrl={mriUrl} onClose={() => setMriUrl(null)} />}
    </div>
  )
}
