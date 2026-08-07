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
    capability,
    mode,
    error,
    notice,
    start,
    stop,
    toggleSimulator,
    moveUserSimPosition,
  } = useScanner();

  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  // Keep the screen alive while a hunt is running — you are looking at it
  // while walking, not touching it.
  useWakeLock(scanning);

  // No effect restarts the scan here on purpose: both Bluetooth entry points
  // need a user gesture, and stopping now clears the store, so there is never
  // a stale row left to pick while stopped.

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--c-ink)', display: 'flex', flexDirection: 'column' }}>
      {target ? (
        <HuntScreen
          target={target}
          contacts={contacts}
          isSimulator={isSimulator}
          onMoveSimPosition={moveUserSimPosition}
          onBack={() => setTarget(null)}
        />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          isSimulator={isSimulator}
          capability={capability}
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
