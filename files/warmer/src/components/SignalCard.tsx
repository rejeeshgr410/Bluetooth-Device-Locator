import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { c } from '../lib/theme';
import { band, fill, roughRange } from '../lib/signal';

/** Plain-language strength, keyed off the same bands the rest of the app uses. */
const STRENGTH: Record<string, string> = {
  reach: 'Very strong',
  table: 'Strong',
  room: 'Moderate',
  far: 'Weak',
  veryFar: 'Very weak',
};

export function SignalCard({ rssi, stale }: { rssi: number | null; stale: boolean }) {
  const live = rssi !== null && !stale;
  const b = live ? band(rssi!) : null;
  const bars = live ? Math.max(1, Math.ceil(fill(rssi!) * 5)) : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.caption}>Bluetooth signal strength</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.strength, { color: live ? c.amber : c.muted }]}>
            {live ? STRENGTH[b!.key] : 'No contact'}
          </Text>
          {/* Coarse on purpose. RSSI cannot support a confident single number:
              a phone in a drawer two metres away reads like one fifteen metres
              away in the open. */}
          <Text style={styles.range}>{live ? roughRange(rssi!) : 'nothing heard recently'}</Text>
        </View>

        <View style={styles.bars}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.bar,
                { height: 12 + i * 8 },
                i < bars ? { backgroundColor: c.amber } : { backgroundColor: c.hairline },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: c.inkRaised,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginTop: 4,
    shadowColor: '#0B1F12',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  caption: { fontSize: 13, color: c.muted, marginBottom: 10, letterSpacing: 0.2 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  strength: { fontSize: 27, fontWeight: '700', letterSpacing: -0.3 },
  range: { fontSize: 15, color: c.muted, marginTop: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginLeft: 12 },
  bar: { width: 7, borderRadius: 3 },
});
