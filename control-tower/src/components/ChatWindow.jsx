import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, X } from 'lucide-react'
import { PORTFOLIO_KPIS } from '../data'

const API = '/api'

export default function ChatWindow() {
  const [open,     setOpen]     = useState(false)
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [messages, setMessages] = useState([{
    role: 'ai',
    text: 'Hello! Ask me anything about your trial portfolio — enrollment gaps, dropout trends, or at-risk sites.',
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
        body:    JSON.stringify({
          user_message:      text,
          dashboard_context: PORTFOLIO_KPIS,
        }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'ai', text: data.answer || 'No response.' }])
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Server unreachable — is api.py running?' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare size={14} /> Chat with Data
            </span>
            <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white">
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-2 p-3 overflow-y-auto max-h-72">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-100 text-slate-800 rounded-bl-none'
                }`}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-400 px-3 py-2 rounded-xl rounded-bl-none text-xs">Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 p-3 border-t border-slate-100 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about your trials…"
              className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
            />
            <button
              onClick={send} disabled={loading}
              className="w-8 h-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center justify-center text-white"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
      >
        {open ? <X size={14} /> : <MessageSquare size={14} />}
        {!open && 'Chat with Data'}
      </button>
    </div>
  )
}
