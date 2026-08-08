import React, { useState } from 'react';
import { Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { SurveyScreen } from './src/screens/SurveyScreen';
import { HuntScreen } from './src/screens/HuntScreen';
import { useScanner, Contact } from './src/lib/useScanner';
import { c } from './src/lib/theme';

export default function App() {
  const {
    contacts,
    scanning,
    status,
    error,
    bonded,
    refreshBonded,
    trackBonded,
    start,
    stop,
    requestPermission,
  } = useScanner();
  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  // No restart-on-select effect here. start() wipes the store before rescanning,
  // so picking a device while stopped used to erase the very contact just picked
  // and drop the hunt screen straight into NO CONTACT. Stopping now clears the
  // list, so there is no stale row left to select in the first place.

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {target ? (
        <HuntScreen target={target} contacts={contacts} onBack={() => setTarget(null)} />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          error={error}
          status={status}
          onStart={start}
          onStop={stop}
          onRequestPermission={requestPermission}
          bonded={bonded}
          onRefreshBonded={refreshBonded}
          // Only navigate once the link is actually up, so a failed connect
          // leaves you on the list with the reason rather than on a dead
          // hunt screen showing NO CONTACT.
          onTrackBonded={async (d) => {
            if (await trackBonded(d)) setTarget({ id: d.id, name: d.name });
          }}
          onPick={(d: Contact) => setTarget({ id: d.id, name: d.name })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.ink,
    // SafeAreaView only applies insets on iOS. Android 15+ forces edge-to-edge,
    // so without this the header draws underneath the clock and battery, which
    // is exactly what it was doing on a Pixel running Android 17.
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
});

