import { useState } from 'react';
import { SurveyScreen } from './screens/SurveyScreen';
import { HuntScreen } from './screens/HuntScreen';
import { useScanner, Contact } from './lib/useScanner';
import { useWakeLock } from './lib/useWakeLock';
import { useTheme } from './lib/theme';

export default function App() {
  const {
    contacts,
    scanning,
    searchMode,
    error,
    notice,
    start,
    stop,
    clear,
    setSearchMode,
  } = useScanner();

  const { theme, toggleTheme } = useTheme();
  const [selectedTarget, setSelectedTarget] = useState<Contact | null>(null);

  useWakeLock(scanning);

  // If a target is selected, retrieve its live data or fallback to the last snapshot
  const activeContact = selectedTarget
    ? contacts[selectedTarget.id] || selectedTarget
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      {activeContact ? (
        <HuntScreen
          contact={activeContact}
          onBack={() => setSelectedTarget(null)}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          error={error}
          notice={notice}
          theme={theme}
          onToggleTheme={toggleTheme}
          onStart={start}
          onStop={stop}
          onClear={clear}
          onPick={(d: Contact) => setSelectedTarget(d)}
        />
      )}
    </div>
  );
}
