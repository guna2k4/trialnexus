import { LayoutDashboard, FlaskConical, Search, TrendingUp } from 'lucide-react'

function TrialNexusLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bn-glow-sb" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b"/>
          <feMerge>
            <feMergeNode in="b"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* 4-pointed star at apex */}
      <path
        d="M18 1 L19.4 6.5 L25 4.5 L20.5 8.5 L23 13 L18 10.5 L13 13 L15.5 8.5 L11 4.5 L16.6 6.5 Z"
        fill="white" filter="url(#bn-glow-sb)" opacity="0.96"
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

export default function Sidebar({ activeView, onNavigate }) {
  const items = [
    { id: 'portfolio',   Icon: LayoutDashboard, label: 'Portfolio'           },
    { id: 'trials',      Icon: FlaskConical,    label: 'My Trials'           },
    { id: 'commercial',  Icon: TrendingUp, label: 'Commercial Insights' },
    { id: 'trialnexus', Icon: Search,    label: 'TrialNexus Search' },
  ]

  return (
    <aside className="w-16 bg-[#0D1117] border-r border-[#1F2937] flex flex-col items-center py-5 gap-2 flex-shrink-0">
      {/* TrialNexus Logo */}
      <div className="w-10 h-10 rounded-xl bg-[#0D1B2E] border border-cyan-900/40 flex items-center justify-center mb-4 flex-shrink-0 shadow-lg shadow-cyan-900/20">
        <TrialNexusLogo size={28} />
      </div>

      {items.map(({ id, Icon, label }) => (
        <button
          key={id}
          title={label}
          onClick={() => onNavigate(id)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            activeView === id
              ? 'bg-cyan-500 text-white'
              : 'text-slate-600 hover:bg-[#1F2937] hover:text-slate-300'
          }`}
        >
          <Icon size={18} />
        </button>
      ))}

      <div className="flex-1" />

      {/* User avatar */}
      <div className="w-9 h-9 rounded-full bg-[#1F2937] border border-[#334155] flex items-center justify-center">
        <span className="text-slate-300 text-xs font-bold">ET</span>
      </div>
    </aside>
  )
}
