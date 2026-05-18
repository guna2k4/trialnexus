import { useState, useRef, useEffect } from 'react'
import { X, Send } from 'lucide-react'

const API = 'http://localhost:8000'

const AGENT_META = {
  orchestrator: { label: 'Orchestrator',   icon: '🧠', color: '#818cf8' },
  internal:     { label: 'Internal Agent', icon: '🗄️', color: '#22d3ee' },
  web_scout:    { label: 'Web Scout',      icon: '🌐', color: '#34d399' },
  synthesizer:  { label: 'Synthesizer',    icon: '⚡', color: '#fb923c' },
}
const AGENT_ORDER = ['orchestrator', 'internal', 'web_scout', 'synthesizer']

const SUGGESTIONS = {
  Marketing: [
    'Which competitor messages are being amplified most by media in the last 30 days?',
    'Why is Ohio losing market share to abemaciclib?',
    'How is brand perception trending in the Southeast?',
  ],
  Research: [
    'What does MONALEESA-7 show for premenopausal patients?',
    'What are KOLs saying about QTc monitoring burden?',
    'How does real-world PFS compare to trial data?',
  ],
}

// ── Inline markdown renderer ──────────────────────────────────
function MarkdownLine({ line }) {
  if (line.startsWith('## ')) {
    return (
      <p className="text-sm font-extrabold text-white mt-5 mb-1.5 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-cyan-400 flex-shrink-0 inline-block" />
        {line.slice(3)}
      </p>
    )
  }
  if (line.startsWith('### ')) {
    return <p className="text-xs font-bold text-cyan-400 mt-3 mb-0.5">{line.slice(4)}</p>
  }
  if (/^\*\*.*\*\*:?$/.test(line.trim())) {
    return <p className="text-[11px] font-bold text-slate-300 mt-2.5 mb-0.5">{line.replace(/\*\*/g, '')}</p>
  }
  if (/^[-•]\s/.test(line)) {
    const parts = line.slice(2).split(/\*\*(.*?)\*\*/)
    return (
      <p className="text-xs text-slate-400 pl-3 relative mb-0.5 leading-relaxed">
        <span className="absolute left-0 text-cyan-500 select-none">•</span>
        {parts.map((p, i) => i % 2 === 1
          ? <strong key={i} className="text-slate-200 font-semibold">{p}</strong>
          : p
        )}
      </p>
    )
  }
  if (/^\d+\.\s/.test(line)) {
    return <p className="text-xs font-bold text-slate-200 mt-3 mb-0.5 leading-relaxed">{line}</p>
  }
  if (!line.trim()) return <div className="h-1" />
  const parts = line.split(/\*\*(.*?)\*\*/)
  return (
    <p className="text-xs text-slate-300 leading-relaxed mb-0.5">
      {parts.map((p, i) => i % 2 === 1
        ? <strong key={i} className="text-white font-semibold">{p}</strong>
        : p
      )}
    </p>
  )
}

function MarkdownAnswer({ text, streaming }) {
  return (
    <div className="flex flex-col">
      {text.split('\n').map((l, i) => <MarkdownLine key={i} line={l} />)}
      {streaming && <span className="text-cyan-400 animate-pulse text-sm">▌</span>}
    </div>
  )
}

// ── Agent step ────────────────────────────────────────────────
function AgentStep({ name, info }) {
  const meta = AGENT_META[name] || { label: name, icon: '●', color: '#94a3b8' }
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2"
      style={{ background: '#060D1A', border: '1px solid #1E3A5F' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
        style={{ background: meta.color + '1a', border: `1px solid ${meta.color}33` }}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</p>
        <p className="text-[10px] text-slate-600 truncate">{info.message}</p>
      </div>
      {info.status === 'done' ? (
        <span className="text-[10px] font-bold text-emerald-400 flex-shrink-0">
          ✓ {info.count != null ? `${info.count} found` : 'done'}
        </span>
      ) : (
        <span className="flex gap-0.5 flex-shrink-0">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      )}
    </div>
  )
}

// ── Source card ───────────────────────────────────────────────
function SourceCard({ source }) {
  const sentColor =
    source.sentiment === 'Positive' ? { bg: '#052e16', text: '#34d399', label: 'Positive' } :
    source.sentiment === 'Negative' ? { bg: '#2d0a0a', text: '#f87171', label: 'Negative' } :
    { bg: '#1E3A5F', text: '#94a3b8', label: 'Neutral' }

  const isInternal = !source.source   // internal signals have no domain
  const platform   = source.url?.includes('twitter') ? 'Twitter'
    : isInternal ? 'Internal'
    : (source.source || source.source_type || 'Web')
  const icon     = source.url?.includes('twitter') ? '🐦' : isInternal ? '📊' : '🌐'
  const state    = source.state || ''
  const shortUrl = (source.url || '').replace(/^https?:\/\//, '').slice(0, 45)

  return (
    <a
      href={source.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-row rounded-xl overflow-hidden group transition-all hover:border-cyan-700/60 w-full"
      style={{ background: '#060D1A', border: '1px solid #1E3A5F' }}
    >
      {/* Icon panel */}
      <div
        className="relative flex-shrink-0 flex items-center justify-center text-2xl"
        style={{ width: 64, background: '#0a1628', minHeight: 76 }}
      >
        {icon}
        <span
          className="absolute bottom-1.5 left-1 text-[9px] font-bold px-1 py-0.5 rounded"
          style={{ background: sentColor.bg, color: sentColor.text }}
        >
          {sentColor.label}
        </span>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1.5 px-3 py-2.5 flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2 group-hover:text-cyan-400 transition-colors">
          {source.title || source.url}
        </p>
        {(source.author || source.source) && (
          <p className="text-[10px] text-slate-500 truncate">
            {source.author || source.source}
          </p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: '#1E3A5F', color: '#94a3b8' }}>
            {platform}
          </span>
          {state && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: '#0a2240', color: '#22d3ee' }}>
              {state}
            </span>
          )}
        </div>
        {shortUrl && <p className="text-[10px] text-slate-600 truncate">{shortUrl}</p>}
      </div>
    </a>
  )
}

// ── Main panel ────────────────────────────────────────────────
export default function CommercialChatPanel({ onClose }) {
  const [role,       setRole]       = useState('Marketing')
  const [input,      setInput]      = useState('')
  const [steps,      setSteps]      = useState({})
  const [answer,     setAnswer]     = useState('')
  const [intSources, setIntSources] = useState([])
  const [webSources, setWebSources] = useState([])
  const [streaming,  setStreaming]  = useState(false)
  const [asked,      setAsked]      = useState(false)

  const bottomRef = useRef(null)
  const esRef     = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps, answer, webSources])

  useEffect(() => () => esRef.current?.close(), [])

  const ask = () => {
    const q = input.trim()
    if (!q || streaming) return
    esRef.current?.close()
    setSteps({})
    setAnswer('')
    setIntSources([])
    setWebSources([])
    setStreaming(true)
    setAsked(true)

    const url = `${API}/commercial/intelligence/stream?question=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}`
    const es  = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.done) {
          setStreaming(false)
          es.close()
          return
        }
        if (data.token != null) { setAnswer(a => a + data.token); return }
        const { agent, status, message, sources, count } = data
        if (!agent) return
        if (status === 'done') {
          setSteps(s => ({ ...s, [agent]: { status: 'done', message, count } }))
          if (agent === 'internal')  setIntSources(sources || [])
          if (agent === 'web_scout') setWebSources(sources || [])
        } else {
          setSteps(s => ({ ...s, [agent]: { status, message } }))
        }
      } catch (_) {}
    }
    es.onerror = () => { setStreaming(false); es.close() }
  }

  // Merge web + internal sources for the SOURCES section
  const allSources = [...webSources, ...intSources]

  const hasSteps = Object.keys(steps).length > 0

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col"
      style={{ width: 700, background: '#0D1B2E', borderLeft: '1px solid #1E3A5F', boxShadow: '-16px 0 56px rgba(0,0,0,0.7)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 border-b" style={{ borderColor: '#1E3A5F' }}>
        <div>
          <h2 className="text-sm font-bold text-white">Commercial Intelligence</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">4-agent pipeline · Ribociclib market analysis</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
          <X size={16} />
        </button>
      </div>

      {/* Role tabs */}
      <div className="flex gap-2 px-5 py-3 flex-shrink-0 border-b" style={{ borderColor: '#1E3A5F' }}>
        {[
          { key: 'Marketing', icon: '📊', sub: 'Strategy & market trends' },
          { key: 'Research',  icon: '🔬', sub: 'Clinical & evidence'      },
        ].map(r => {
          const active = role === r.key
          return (
            <button key={r.key} onClick={() => setRole(r.key)}
              className="flex-1 rounded-xl px-3 py-2 text-left transition-all"
              style={{ background: active ? '#0a2240' : 'transparent', border: `1px solid ${active ? '#22d3ee' : '#1E3A5F'}` }}>
              <p className={`text-xs font-bold ${active ? 'text-cyan-400' : 'text-slate-400'}`}>{r.icon} {r.key}</p>
              <p className="text-[10px] text-slate-600">{r.sub}</p>
            </button>
          )
        })}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

        {/* Empty state */}
        {!asked && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: '#0a2240', border: '1px solid #1E3A5F' }}>
              {role === 'Marketing' ? '📊' : '🔬'}
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">
                {role === 'Marketing' ? 'Marketing Intelligence' : 'Research Intelligence'}
              </p>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {role === 'Marketing'
                  ? 'Ask about competitor messaging, market trends, prescriber adoption, or territory performance.'
                  : 'Ask about clinical evidence, KOL perspectives, trial data, or safety profiles.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">Try asking</p>
              {SUGGESTIONS[role].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  className="text-left text-xs px-3 py-2.5 rounded-xl text-slate-400 hover:text-cyan-400 transition-colors"
                  style={{ background: '#0a2240', border: '1px solid #1E3A5F' }}>
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Agent pipeline */}
        {hasSteps && (
          <div>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Agent Pipeline</p>
            <div className="flex flex-col gap-1.5">
              {AGENT_ORDER.filter(a => steps[a]).map(a => (
                <AgentStep key={a} name={a} info={steps[a]} />
              ))}
            </div>
          </div>
        )}

        {/* Answer text */}
        {answer && (
          <div className="rounded-2xl p-5" style={{ background: '#0a2240', border: '1px solid #1E3A5F' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3"
              style={{ color: role === 'Marketing' ? '#22d3ee' : '#a78bfa' }}>
              {role === 'Marketing' ? '📊 Marketing Analysis' : '🔬 Research Analysis'}
            </p>
            <MarkdownAnswer text={answer} streaming={streaming} />
          </div>
        )}

        {/* SOURCES grid — top to bottom, 2 columns, YouTube thumbnails */}
        {allSources.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              Sources · {allSources.length} results
            </p>
            <div className="flex flex-col gap-3">
              {allSources.map((s, i) => (
                <SourceCard key={i} source={s} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: '#1E3A5F' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
            placeholder={
              role === 'Marketing'
                ? 'Ask about market trends, competitor activity...'
                : 'Ask about clinical evidence, KOL opinions...'
            }
            className="flex-1 text-xs rounded-xl px-4 py-3 outline-none transition-colors"
            style={{ background: '#060D1A', border: '1px solid #1E3A5F', color: '#e2e8f0' }}
            onFocus={e => (e.target.style.borderColor = '#22d3ee')}
            onBlur={e  => (e.target.style.borderColor = '#1E3A5F')}
          />
          <button
            onClick={ask}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 rounded-xl font-bold transition-colors disabled:opacity-40 flex items-center justify-center flex-shrink-0"
            style={{ background: '#22d3ee', color: '#0D1B2E', minWidth: 40 }}
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-slate-700 mt-2 text-center">
          Internal signals (Elasticsearch) · Live pharma web (Tavily)
        </p>
      </div>
    </div>
  )
}
