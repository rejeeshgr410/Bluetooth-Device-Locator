import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { State } from 'react-native-ble-plx';
import { SurveyScreen } from './src/screens/SurveyScreen';
import { HuntScreen } from './src/screens/HuntScreen';
import { useScanner, Contact } from './src/lib/useScanner';
import { c } from './src/lib/theme';

export default function App() {
  const { contacts, scanning, radio, error, start, stop } = useScanner();
  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  // No restart-on-select effect here. start() wipes the store before rescanning,
  // so picking a device while stopped used to erase the very contact just picked
  // and drop the hunt screen straight into NO CONTACT. Stopping now clears the
  // list, so there is no stale row left to select in the first place.

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
