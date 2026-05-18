import { useState } from 'react'
import Sidebar        from './components/Sidebar'
import ChatWindow     from './components/ChatWindow'
import PortfolioView  from './views/PortfolioView'
import MyTrialsView   from './views/MyTrialsView'
import TrialDetailView from './views/TrialDetailView'
import TrialNexusView from './views/BioNexusView'
import CommercialView   from './views/CommercialView'

export default function App() {
  const [view,          setView]          = useState('portfolio') // 'portfolio' | 'trials' | 'detail' | 'trialnexus'
  const [selectedTrial, setSelectedTrial] = useState(null)

  function openTrial(trial) {
    setSelectedTrial(trial)
    setView('detail')
  }

  function navigateTo(v) {
    setView(v)
    if (v !== 'detail') setSelectedTrial(null)
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-['Inter',sans-serif]">
      <Sidebar
        activeView={view}
        onNavigate={navigateTo}
      />

      <div className="flex-1 overflow-hidden">
        {view === 'portfolio' && (
          <PortfolioView onGoToTrials={() => setView('trials')} />
        )}
        {view === 'trials' && (
          <MyTrialsView onViewTrial={openTrial} />
        )}
        {view === 'detail' && selectedTrial && (
          <TrialDetailView
            trial={selectedTrial}
            onBack={() => setView('trials')}
            onRecruitPatient={() => setView('trialnexus')}
          />
        )}
        {view === 'trialnexus' && (
          <TrialNexusView
            trialName={selectedTrial?.name}
            onBack={() => setView(selectedTrial ? 'detail' : 'trials')}
          />
        )}
        {view === 'commercial' && (
          <CommercialView />
        )}

      </div>

      <ChatWindow />
    </div>
  )
}
