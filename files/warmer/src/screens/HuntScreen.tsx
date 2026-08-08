import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, useWindowDimensions } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Tape } from '../components/Tape';
import { TrackMap } from '../components/TrackMap';
import { ProximityDial } from '../components/ProximityDial';
import { c, type, mono } from '../lib/theme';
import { band, roughRange, trend, staleWindow } from '../lib/signal';
import { distanceTo, relativeBearing, steer } from '../lib/breadcrumbs';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { useTrail } from '../lib/useTrail';

type Mode = 'meter' | 'trail';

export function HuntScreen({
  target,
  contacts,
  onBack,
}: {
  target: { id: string; name: string | null };
  contacts: Record<string, Contact>;
  onBack: () => void;
}) {
  useKeepAwake();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('meter');
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const contact = contacts[target.id];
  const isClassic = contact?.classic ?? false;
  const stale = !contact || now - contact.lastSeen > staleWindow(isClassic);
  const live = stale ? null : contact!.rssi;

  // In an effect, not mutated during render: writing a ref while rendering is
  // a rules-of-React violation that misbehaves under StrictMode.
  useEffect(() => {
    if (live !== null) setBest((b) => (b === null || live > b ? live : b));
  }, [live]);

  const t = useMemo(() => (contact ? trend(contact.history) : 'steady'), [contact?.history]);
  useClicker({ rssi: live, active: !stale, sound, haptics });

  const trail = useTrail({ rssi: live, active: mode === 'trail' });

  const b = live !== null ? band(live) : null;
  const trendColor = t === 'warmer' ? c.warm : t === 'colder' ? c.cold : c.muted;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ ALL SIGNALS</Text>
        </Pressable>
        <Text style={type.eyebrow}>{stale ? 'NO CONTACT' : 'TRACKING'}</Text>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {target.name ?? 'Unnamed device'}
      </Text>
      <Text style={styles.id}>{target.id}</Text>

      {/* Compact now: in METER the dial is the headline, in TRAIL the map is.
          A 92pt number competing with either just split the attention. */}
      <View style={styles.readout}>
        <Text style={[styles.readoutValue, { color: stale ? c.amberDim : c.amber }]}>
          {live === null ? '––' : live.toFixed(0)}
        </Text>
        <Text style={styles.readoutUnit}>dBm</Text>
      </View>

      {isClassic && (
        <View style={[styles.card, { borderLeftColor: c.warm, marginTop: 14 }]}>
          <Text style={[type.band, { color: c.warm, fontSize: 12 }]}>CLASSIC BLUETOOTH</Text>
          <Text style={type.body}>
            This device was found by Classic inquiry, not an LE scan. It reports roughly once every
            twelve seconds, so the number steps rather than flows — and the trail cannot work from
            that few samples. Walk slowly and read the trend across several updates.
          </Text>
        </View>
      )}

      <View style={styles.segment}>
        <Seg label="METER" active={mode === 'meter'} onPress={() => setMode('meter')} />
        <Seg
          label="TRAIL"
          active={mode === 'trail'}
          onPress={() => setMode('trail')}
          disabled={isClassic}
        />
      </View>

      {mode === 'meter' ? (
        <>
          <ProximityDial
            rssi={live}
            size={Math.min(width - 44, 340)}
            stale={stale}
            stepped={isClassic}
          />

          <View style={[styles.trendRow, { justifyContent: 'center' }]}>
            <View style={[styles.dot, { backgroundColor: trendColor }]} />
            <Text style={[styles.trendText, { color: trendColor }]}>
              {stale ? 'SIGNAL LOST' : t === 'warmer' ? 'WARMER' : t === 'colder' ? 'COLDER' : 'HOLDING'}
            </Text>
          </View>

          <Text style={styles.dialHint}>
            {stale
              ? 'Nothing heard recently. Walk back the way you came, or it may have gone to sleep.'
              : (b?.hint ?? 'Waiting for a packet.')}
          </Text>

          {/* The trace still matters — a single number lies and the slope does
              not — but it is supporting evidence now, not the headline. */}
          <Tape history={contact?.history ?? []} height={92} />

          <View style={styles.stats}>
            <Stat label="BEST SEEN" value={best === null ? '—' : `${best.toFixed(0)} dBm`} />
            <Stat label={isClassic ? 'SIGHTINGS' : 'PACKETS'} value={String(contact?.packets ?? 0)} />
            <Stat label="RANGE" value={live === null ? '—' : roughRange(live)} />
          </View>
        </>
      ) : (
        <TrailPanel trail={trail} width={width - 44} live={live} />
      )}

      <View style={styles.toggles}>
        <Toggle label="Clicks" value={sound} onChange={setSound} />
        <Toggle label="Vibration" value={haptics} onChange={setHaptics} />
      </View>

      <Text style={styles.caveat}>
        Signal strength is a coarse proxy for distance. Metal, walls and people absorb it, so a
        phone in a drawer two metres away can read the same as one fifteen metres away in the open.
        Walk slowly and trust the trace, not any single number.
      </Text>
    </ScrollView>
  );
}

function TrailPanel({
  trail,
  width,
  live,
}: {
  trail: ReturnType<typeof useTrail>;
  width: number;
  live: number | null;
}) {
  const { fix, crumbs, track, estimate, dropManual, clear, available } = trail;
  const showArrow = crumbs.length >= 2;
  const metres = distanceTo(fix, estimate);
  const rel = relativeBearing(fix, estimate);

  if (available === false) {
    return (
      <View style={styles.card}>
        <Text style={[type.band, { color: c.alarm }]}>NO MOTION SENSORS</Text>
        <Text style={type.body}>
          This device has no usable accelerometer or compass, so the trail cannot be plotted. The
          meter still works.
        </Text>
      </View>
    );
  }

  return (
    <>
      <TrackMap track={track} crumbs={crumbs} estimate={estimate} fix={fix} size={width} />

      <View style={styles.card}>
        <Text style={[type.band, { color: showArrow ? c.amber : c.muted }]}>
          {showArrow ? steer(rel, metres).toUpperCase() : 'GATHERING MARKS'}
        </Text>
        <Text style={type.body}>{estimate.note}</Text>
        <View style={styles.stats}>
          <Stat label="MARKS" value={String(crumbs.length)} />
          <Stat label="BASELINE" value={`${estimate.spread.toFixed(0)} m`} />
          <Stat label="STEPS" value={String(fix.steps)} />
          <Stat label="CONFIDENCE" value={estimate.confidence.toUpperCase()} />
        </View>
      </View>

      <View style={styles.trailButtons}>
        <Pressable
          onPress={dropManual}
          disabled={live === null}
          style={[styles.trailButton, live === null && { opacity: 0.35 }]}
        >
          <Text style={styles.trailButtonText}>DROP A MARK HERE</Text>
        </Pressable>
        <Pressable onPress={clear} style={[styles.trailButton, styles.trailButtonGhost]}>
          <Text style={[styles.trailButtonText, { color: c.muted }]}>RESET</Text>
        </Pressable>
      </View>

      <Text style={styles.caveat}>
        Hold the phone flat, screen up, and walk a loop rather than a line — two points on a
        straight path cannot separate near from far. Position comes from counting your steps, so it
        drifts over a few minutes. Reset when it stops agreeing with the room.
      </Text>
    </>
  );
}

function Seg({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.seg, active && styles.segActive, disabled && { opacity: 0.35 }]}
    >
      <Text style={[styles.segText, active && { color: c.ink }]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.amberDim, false: c.hairline }}
        thumbColor={value ? c.amber : c.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ink },
  content: { padding: 22, paddingBottom: 48 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  back: { ...type.eyebrow, color: c.amber },
  name: { fontSize: 26, color: c.text, fontWeight: '600' },
  id: { fontFamily: mono, fontSize: 11, color: c.muted, marginTop: 4 },
  readout: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10, marginBottom: 2, gap: 6 },
  readoutValue: { fontFamily: mono, fontSize: 30, fontWeight: '300', letterSpacing: -1 },
  readoutUnit: { fontFamily: mono, fontSize: 13, color: c.dim, letterSpacing: 2 },
  dialHint: {
    ...type.body,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  segment: { flexDirection: 'row', gap: 6, marginVertical: 16 },
  seg: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  segActive: { backgroundColor: c.amber, borderColor: c.amber },
  segText: { color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 },
  trendText: { fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  card: {
    marginTop: 22,
    padding: 18,
    backgroundColor: c.inkRaised,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: c.amber,
    gap: 8,
  },
  stats: { flexDirection: 'row', marginTop: 12, gap: 12 },
  statLabel: { fontSize: 9, letterSpacing: 1.5, color: c.dim, fontWeight: '700' },
  statValue: { fontFamily: mono, fontSize: 14, color: c.text, marginTop: 3 },
  trailButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  trailButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.amber,
    alignItems: 'center',
  },
  trailButtonGhost: { flex: 0.45, borderColor: c.hairline },
  trailButtonText: { color: c.amber, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  toggles: { flexDirection: 'row', gap: 26, marginTop: 22 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { color: c.text, fontSize: 15 },
  caveat: { ...type.body, fontSize: 12, marginTop: 26, color: c.dim, lineHeight: 18 },
});
