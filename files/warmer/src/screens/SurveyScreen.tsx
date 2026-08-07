import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
import { c, type, mono } from '../lib/theme';
import { fill, kindOf, STALE_AFTER_MS } from '../lib/signal';
import { Contact } from '../lib/useScanner';

export function SurveyScreen({
  contacts,
  scanning,
  error,
  radioOn,
  onStart,
  onStop,
  onPick,
}: {
  contacts: Record<string, Contact>;
  scanning: boolean;
  error: string | null;
  radioOn: boolean;
  onStart: () => void;
  onStop: () => void;
  onPick: (contact: Contact) => void;
}) {
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Date.now());
  const [namedOnly, setNamedOnly] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.values(contacts)
      .filter((d) => now - d.lastSeen < 20000)
      .filter((d) => (namedOnly ? !!d.name : true))
      .filter((d) => (q ? (d.name ?? '').toLowerCase().includes(q) || d.id.toLowerCase().includes(q) : true))
      .sort((a, b) => b.rssi - a.rssi);
  }, [contacts, filter, now, namedOnly]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>WARMER</Text>
        <Text style={type.eyebrow}>SIGNAL HUNT</Text>
      </View>

      {!radioOn && (
        <Notice text="Bluetooth is off. Turn it on to hear anything at all." tone="alarm" />
      )}
      {error && <Notice text={error} tone="alarm" />}

      <View style={styles.controls}>
        <Pressable
          onPress={scanning ? onStop : onStart}
          style={[styles.button, scanning && styles.buttonActive]}
        >
          <Text style={[styles.buttonText, scanning && { color: c.ink }]}>
            {scanning ? 'STOP LISTENING' : 'START LISTENING'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setNamedOnly((v) => !v)} style={styles.chip}>
          <Text style={[styles.chipText, !namedOnly && { color: c.amber }]}>
            {namedOnly ? 'NAMED ONLY' : 'ALL SIGNALS'}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter by name"
        placeholderTextColor={c.hairline}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FlatList
        data={rows}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {scanning
              ? 'Listening. Devices appear as their advertising packets arrive — some go quiet for seconds at a time.'
              : 'Nothing yet. Start listening to see every Bluetooth device within about ten metres, strongest first.'}
          </Text>
        }
        renderItem={({ item }) => {
          const stale = now - item.lastSeen > STALE_AFTER_MS;
          return (
            <Pressable onPress={() => onPick(item)} style={styles.row}>
              <View style={styles.rowMeter}>
                <View style={[styles.rowMeterFill, { width: `${fill(item.rssi) * 100}%`, opacity: stale ? 0.25 : 1 }]} />
              </View>
              <View style={styles.rowBody}>
                <Text style={type.item} numberOfLines={1}>
                  {item.name ?? 'Unnamed'}
                </Text>
                <Text style={styles.rowMeta}>
                  {kindOf(item.name)} · {item.packets} packets{stale ? ' · quiet' : ''}
                </Text>
              </View>
              <Text style={[styles.rowRssi, { color: stale ? c.amberDim : c.amber }]}>
                {item.rssi.toFixed(0)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function Notice({ text, tone }: { text: string; tone: 'alarm' | 'muted' }) {
  return (
    <View style={[styles.notice, tone === 'alarm' && { borderLeftColor: c.alarm }]}>
      <Text style={[type.body, { color: c.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ink, padding: 22 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 },
  wordmark: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: 6 },
  controls: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.amber,
    alignItems: 'center',
  },
  buttonActive: { backgroundColor: c.amber },
  buttonText: { color: c.amber, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  chip: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  chipText: { color: c.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  input: {
    backgroundColor: c.inkRaised,
    color: c.text,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  rowBody: { flex: 1 },
  rowMeta: { fontSize: 11, color: c.hairline, marginTop: 3, letterSpacing: 0.4 },
  rowMeter: { width: 46, height: 3, backgroundColor: c.hairline },
  rowMeterFill: { height: 3, backgroundColor: c.amber },
  rowRssi: { fontFamily: mono, fontSize: 19 },
  sep: { height: 1, backgroundColor: c.inkRaised },
  empty: { ...type.body, marginTop: 30 },
  notice: {
    padding: 14,
    backgroundColor: c.inkRaised,
    borderLeftWidth: 2,
    borderLeftColor: c.amber,
    marginBottom: 14,
    borderRadius: 3,
  },
});
