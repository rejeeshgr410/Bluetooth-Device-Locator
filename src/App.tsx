import { useState } from 'react';
import { SurveyScreen } from './screens/SurveyScreen';
import { HuntScreen } from './screens/HuntScreen';
import { useScanner, Contact } from './lib/useScanner';
import { useWakeLock } from './lib/useWakeLock';

export default function App() {
  const {
    contacts,
    scanning,
    isSimulator,
    mode,
    error,
    notice,
    start,
    stop,
    toggleSimulator,
  } = useScanner();

  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  useWakeLock(scanning);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--c-ink)', display: 'flex', flexDirection: 'column' }}>
      {target && contacts[target.id] ? (
        <HuntScreen
          contact={contacts[target.id]}
          onBack={() => setTarget(null)}
        />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          isSimulator={isSimulator}
          mode={mode}
          error={error}
          notice={notice}
          onStart={start}
          onStop={stop}
          onToggleSimulator={toggleSimulator}
          onPick={(d: Contact) => setTarget({ id: d.id, name: d.name })}
        />
      )}
    </div>
  );
}
