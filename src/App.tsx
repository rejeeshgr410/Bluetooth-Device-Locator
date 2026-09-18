import { useEffect, useRef, useState } from 'react';
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
    calibrate,
    pin,
  } = useScanner();

  const { theme, toggleTheme } = useTheme();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [followNote, setFollowNote] = useState<string | null>(null);
  const lastKnown = useRef<Contact | null>(null);

  useWakeLock(scanning);

  useEffect(() => {
    pin(targetId);
  }, [targetId, pin]);

  const live = targetId ? contacts[targetId] : undefined;
  if (live) lastKnown.current = live;

  // Phones, earbuds and watches rotate their private address (~15 min). When the
  // target goes quiet and exactly one device with the same *advertised* name shows
  // up, follow it. Guessed labels carry the address, so they can never match.
  useEffect(() => {
    const prev = lastKnown.current;
    if (!targetId || !prev || prev.isGuessed) return;
    if (live && !live.stats.isStale) return;

    const candidates = Object.values(contacts).filter(
      (c) =>
        c.id !== targetId &&
        !c.isGuessed &&
        !c.stats.isStale &&
        c.name === prev.name &&
        c.firstSeen >= prev.stats.lastSeen - 3000,
    );
    if (candidates.length === 1) {
      setTargetId(candidates[0].id);
      setFollowNote(`${prev.name} changed its Bluetooth address. Now following the new one.`);
    }
  }, [contacts, live, targetId]);

  const activeContact: Contact | null = targetId
    ? live ?? (lastKnown.current && { ...lastKnown.current, stats: { ...lastKnown.current.stats, isStale: true } })
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      {activeContact ? (
        <HuntScreen
          contact={activeContact}
          scanning={scanning}
          onBack={() => {
            setTargetId(null);
            setFollowNote(null);
            lastKnown.current = null;
          }}
          onCalibrate={() => calibrate(activeContact.id)}
          followNote={followNote}
          onDismissNote={() => setFollowNote(null)}
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
          onPick={(d: Contact) => {
            lastKnown.current = d;
            setTargetId(d.id);
            if (!scanning) start();
          }}
        />
      )}
    </div>
  );
}
