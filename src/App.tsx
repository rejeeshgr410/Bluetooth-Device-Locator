import React, { useEffect, useState } from 'react';
import { SurveyScreen } from './screens/SurveyScreen';
import { HuntScreen } from './screens/HuntScreen';
import { useScanner, Contact } from './lib/useScanner';

export default function App() {
  const {
    contacts,
    scanning,
    isSimulator,
    error,
    start,
    stop,
    toggleSimulator,
    moveUserSimPosition,
  } = useScanner();

  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  // Scanning must keep running while hunting
  useEffect(() => {
    if (target && !scanning) {
      start();
    }
  }, [target, scanning, start]);

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
          error={error}
          onStart={start}
          onStop={stop}
          onToggleSimulator={toggleSimulator}
          onPick={(d: Contact) => setTarget({ id: d.id, name: d.name })}
        />
      )}
    </div>
  );
}
