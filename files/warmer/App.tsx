import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { State } from 'react-native-ble-plx';
import { SurveyScreen } from './src/screens/SurveyScreen';
import { HuntScreen } from './src/screens/HuntScreen';
import { useScanner, Contact } from './src/lib/useScanner';
import { c } from './src/lib/theme';

export default function App() {
  const { contacts, scanning, radio, error, start, stop } = useScanner();
  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  // Scanning must keep running while hunting — the hunt screen reads from the
  // same stream rather than opening a second one.
  useEffect(() => {
    if (target && !scanning) start();
  }, [target, scanning, start]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={c.ink} />
      {target ? (
        <HuntScreen target={target} contacts={contacts} onBack={() => setTarget(null)} />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          error={error}
          radioOn={radio === State.PoweredOn}
          onStart={start}
          onStop={stop}
          onPick={(d: Contact) => setTarget({ id: d.id, name: d.name })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ink },
});
