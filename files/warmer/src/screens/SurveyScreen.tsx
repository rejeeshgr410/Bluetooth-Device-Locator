import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
import { c, type, mono } from '../lib/theme';
import { fill, kindOf, staleWindow, CLASSIC_STALE_AFTER_MS } from '../lib/signal';
import { Contact, RadioStatus } from '../lib/useScanner';
import type { BondedDevice } from '../../modules/classic-bluetooth';

type Tab = 'nearby' | 'paired';

export function SurveyScreen({
  contacts,
  scanning,
  error,
  status,
  bonded,
  onStart,
  onStop,
  onRequestPermission,
  onRefreshBonded,
  onTrackBonded,
  onPick,
}: {
  contacts: Record<string, Contact>;
  scanning: boolean;
  error: string | null;
  status: RadioStatus;
  bonded: BondedDevice[];
  onStart: () => void;
  onStop: () => void;
  onRequestPermission: () => void;
  onRefreshBonded: () => void;
  onTrackBonded: (d: BondedDevice) => void;
  onPick: (contact: Contact) => void;
}) {
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Date.now());
  const [namedOnly, setNamedOnly] = useState(true);
  const [tab, setTab] = useState<Tab>('nearby');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // The paired list is a snapshot, not a stream — refresh whenever it is shown.
  useEffect(() => {
    if (tab === 'paired') onRefreshBonded();
  }, [tab, onRefreshBonded]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.values(contacts)
      // Classic devices report about once per inquiry burst, so they need a
      // longer grace period than an LE advertiser before we drop the row.
      .filter((d) => now - d.lastSeen < (d.classic ? CLASSIC_STALE_AFTER_MS + 20000 : 20000))
      .filter((d) => (namedOnly ? !!d.name : true))
      .filter((d) =>
        q
          ? d.label.toLowerCase().includes(q) ||
            (d.name ?? '').toLowerCase().includes(q) ||
            d.id.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.rssi - a.rssi);
  }, [contacts, filter, now, namedOnly]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>WARMER</Text>
        <Text style={type.eyebrow}>SIGNAL HUNT</Text>
      </View>

      {status === 'needsPermission' && (
        <View style={[styles.notice, { borderLeftColor: c.amber }]}>
          <Text style={[type.body, { color: c.text }]}>
            Warmer needs Bluetooth permission before it can see anything — including whether your
            Bluetooth is even switched on. Nothing is sent anywhere.
          </Text>
          <Pressable onPress={onRequestPermission} style={styles.noticeButton}>
            <Text style={styles.noticeButtonText}>GRANT BLUETOOTH PERMISSION</Text>
          </Pressable>
        </View>
      )}
      {status === 'off' && (
        <Notice text="Bluetooth is switched off. Turn it on to hear anything at all." tone="alarm" />
      )}
      {status === 'unsupported' && (
        <Notice text="This device has no Bluetooth LE radio, so there is nothing to scan with." tone="alarm" />
      )}
      {error && <Notice text={error} tone="alarm" />}

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('nearby')} style={[styles.tab, tab === 'nearby' && styles.tabOn]}>
          <Text style={[styles.tabText, tab === 'nearby' && styles.tabTextOn]}>NEARBY</Text>
        </Pressable>
        <Pressable onPress={() => setTab('paired')} style={[styles.tab, tab === 'paired' && styles.tabOn]}>
          <Text style={[styles.tabText, tab === 'paired' && styles.tabTextOn]}>MY DEVICES</Text>
        </Pressable>
      </View>

      {tab === 'paired' ? (
        <PairedList bonded={bonded} onTrack={onTrackBonded} />
      ) : (
      <>
      <View style={styles.controls}>
        <Pressable
          onPress={scanning ? onStop : onStart}
          disabled={status === 'off' || status === 'unsupported'}
          style={[
            styles.button,
            scanning && styles.buttonActive,
            (status === 'off' || status === 'unsupported') && styles.buttonDisabled,
          ]}
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
        placeholderTextColor={c.dim}
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
          const stale = now - item.lastSeen > staleWindow(item.classic);
          return (
            <Pressable onPress={() => onPick({ ...item, name: item.label })} style={styles.row}>
              <View style={styles.rowMeter}>
                <View style={[styles.rowMeterFill, { width: `${fill(item.rssi) * 100}%`, opacity: stale ? 0.25 : 1 }]} />
              </View>
              <View style={styles.rowBody}>
                <Text
                  style={[type.item, !item.name && { color: c.dim, fontStyle: 'italic' }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.classic ? 'Classic' : kindOf(item.name ?? item.label)} · {item.packets}{' '}
                  {item.classic ? 'sightings' : 'packets'}
                  {stale ? ' · quiet' : ''}
                </Text>
              </View>
              <Text style={[styles.rowRssi, { color: stale ? c.amberDim : c.amber }]}>
                {item.rssi.toFixed(0)}
              </Text>
            </Pressable>
          );
        }}
      />
      </>
      )}
    </View>
  );
}

/**
 * Paired devices. These are exactly the ones a scan can never find: connecting
 * makes a device stop advertising, so your earbuds and watch vanish from the
 * air the moment they attach to the phone. The pairing is still there, though,
 * and for anything with a BLE side the link itself has a signal strength.
 */
function PairedList({
  bonded,
  onTrack,
}: {
  bonded: BondedDevice[];
  onTrack: (d: BondedDevice) => void;
}) {
  return (
    <FlatList
      data={bonded}
      keyExtractor={(d) => d.id}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={{ paddingBottom: 40 }}
      ListHeaderComponent={
        <Text style={[type.body, { marginBottom: 14 }]}>
          Devices paired with this phone. A connected device stops advertising, so these will not
          appear in a scan — tracking opens a link and measures that instead.
        </Text>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          Nothing paired with this phone yet, or Bluetooth permission has not been granted.
        </Text>
      }
      renderItem={({ item }) => {
        const trackable = item.type === 'le' || item.type === 'dual';
        return (
          <Pressable
            onPress={() => onTrack(item)}
            disabled={!trackable}
            style={[styles.row, !trackable && { opacity: 0.5 }]}
          >
            <View style={styles.rowBody}>
              <Text style={type.item} numberOfLines={1}>
                {item.name ?? 'Unnamed device'}
              </Text>
              <Text style={styles.rowMeta}>
                {item.id} ·{' '}
                {trackable
                  ? item.type === 'dual'
                    ? 'Classic + LE · trackable'
                    : 'LE · trackable'
                  : 'Classic only · no signal link'}
              </Text>
            </View>
            {trackable && <Text style={styles.trackCta}>TRACK</Text>}
          </Pressable>
        );
      }}
    />
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.inkRaised,
  },
  tabOn: { backgroundColor: c.amber, borderColor: c.amber },
  tabText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: c.muted },
  tabTextOn: { color: '#FFFFFF' },
  trackCta: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: c.amber },
  controls: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.amber,
    alignItems: 'center',
  },
  buttonActive: { backgroundColor: c.amber },
  buttonDisabled: { opacity: 0.4, borderColor: c.hairline },
  buttonText: { color: c.amber, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  noticeButton: {
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.amber,
    alignSelf: 'flex-start',
  },
  noticeButtonText: { color: c.amber, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  chip: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  chipText: { color: c.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  input: {
    backgroundColor: c.inkRaised,
    color: c.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  rowBody: { flex: 1 },
  rowMeta: { fontSize: 11, color: c.dim, marginTop: 3, letterSpacing: 0.4 },
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
    borderRadius: 12,
  },
});
