import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, useWindowDimensions } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Tape } from '../components/Tape';
import { TrackMap } from '../components/TrackMap';
import { ProximityDial } from '../components/ProximityDial';
import { CompassDial } from '../components/CompassDial';
import { SignalCard } from '../components/SignalCard';
import { useDirectionScan } from '../lib/useDirectionScan';
import { c, type, mono } from '../lib/theme';
import { band, roughRange, trend, staleWindow } from '../lib/signal';
import { distanceTo, relativeBearing, steer } from '../lib/breadcrumbs';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { useTrail, calibrateTxPower } from '../lib/useTrail';

type Mode = 'meter' | 'compass' | 'trail';

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

  /*
   * Reference power at 1 m, measured for this specific device.
   *
   * Assuming the -59 dBm textbook value was the largest single source of
   * error in simulation — 8.85 m of it, more than shadowing or compass bias.
   * Real transmitters vary by 10-20 dB, so one calibration reading is worth
   * more than any refinement downstream.
   */
  const [txPower, setTxPower] = useState<number | undefined>(undefined);
  const calibrate = () => {
    if (live !== null) setTxPower(calibrateTxPower(live, 1));
  };

  const trail = useTrail({ rssi: live, active: mode === 'trail', txPower });
  const dir = useDirectionScan(live);

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

      {/* One line, not a paragraph. The full explanation was pushing the dial
          itself below the fold, which defeated the point of the redesign. */}
      {isClassic && (
        <Text style={styles.classicNote}>
          <Text style={{ color: c.warm, fontWeight: '700' }}>CLASSIC · </Text>
          updates about every 12s, so the reading steps rather than flows. Trail needs more samples
          than that.
        </Text>
      )}

      <View style={styles.segment}>
        <Seg label="METER" active={mode === 'meter'} onPress={() => setMode('meter')} />
        <Seg label="COMPASS" active={mode === 'compass'} onPress={() => setMode('compass')} />
        <Seg
          label="TRAIL"
          active={mode === 'trail'}
          onPress={() => setMode('trail')}
          disabled={isClassic}
        />
      </View>

      {mode === 'compass' ? (
        <>
          <CompassDial
            size={Math.min(width - 40, 330)}
            rssi={live}
            stale={stale}
            heading={dir.heading}
            bearing={dir.bearing}
            spread={dir.spread}
            confidence={dir.confidence}
            txPower={txPower}
          />

          <View style={{ height: 74 }} />

          <Text style={styles.headline}>
            {dir.sampling
              ? dir.coverage < 0.6
                ? 'Keep turning…'
                : 'Reading the sweep'
              : dir.bearing === null
                ? 'No bearing yet'
                : `Signal strongest ${Math.round(dir.bearing)}°`}
          </Text>
          <Text style={styles.dialHint}>
            {dir.sampling
              ? `Turn slowly, all the way round. ${Math.round(dir.coverage * 100)}% of the circle covered.`
              : dir.bearing === null
                ? 'Direction comes from turning: your body blocks the signal on one side, so the peak as you spin points at the source.'
                : `Confidence ${dir.confidence}, ±${Math.round(dir.spread)}°. Walk into the wedge, then sweep again.`}
          </Text>

          <Pressable
            onPress={dir.sampling ? dir.cancel : dir.start}
            disabled={stale}
            style={[styles.cta, (dir.sampling || stale) && styles.ctaOff]}
          >
            <Text style={[styles.ctaTitle, (dir.sampling || stale) && { color: c.amber }]}>
              {dir.sampling ? 'Stop sweeping' : 'Sweep for direction'}
            </Text>
            <Text style={[styles.ctaSub, (dir.sampling || stale) && { color: c.muted }]}>
              {stale
                ? 'Needs a live signal first'
                : dir.sampling
                  ? 'Hold the phone out and rotate on the spot'
                  : 'Turn a full circle while it samples every heading'}
            </Text>
          </Pressable>

          {/*
            Said plainly, because the wedge looks more authoritative than the
            method deserves. One antenna cannot do angle-of-arrival; this is
            body-shadow direction finding and rooms full of reflections will
            fool it.
          */}
          <Text style={styles.caveat}>
            The bearing is inferred from how your own body blocks the signal as you turn, not from
            true angle-of-arrival — a phone has one antenna and cannot measure that. Walls and metal
            bounce 2.4 GHz badly, so treat the wedge as a sector to explore, never a line to follow.
          </Text>
        </>
      ) : mode === 'meter' ? (
        <>
          <ProximityDial
            rssi={live}
            size={Math.min(width - 40, 330)}
            stale={stale}
            stepped={isClassic}
            badge={(target.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
          />

          <Text style={styles.headline}>
            {stale ? 'Signal lost' : t === 'warmer' ? 'Getting warmer' : t === 'colder' ? 'Getting colder' : 'Holding steady'}
          </Text>
          <Text style={styles.dialHint}>
            {stale
              ? 'Walk back the way you came, or it may have gone to sleep.'
              : (b?.hint ?? 'Waiting for a packet.')}
          </Text>

          <SignalCard rssi={live} stale={stale} txPower={txPower} />

          {/*
            The reference design has a "Play Sound" button here. There is no
            honest version of that: you cannot make an arbitrary Bluetooth
            device emit a sound — AirTags and Tiles do it over proprietary
            protocols with hardware they control. This is the real equivalent:
            OUR phone clicks, faster as you close in, so you can hunt with the
            screen in your pocket.
          */}
          <Pressable
            onPress={() => setSound((v) => !v)}
            style={[styles.cta, !sound && styles.ctaOff]}
          >
            <Text style={[styles.ctaTitle, !sound && { color: c.amber }]}>
              {sound ? 'Proximity clicks on' : 'Proximity clicks off'}
            </Text>
            <Text style={[styles.ctaSub, !sound && { color: c.muted }]}>
              {sound ? 'This phone clicks faster as you get closer' : 'Tap to hear how close you are'}
            </Text>
          </Pressable>

          {/* The trace still matters — a single number lies and the slope does
              not — but it is supporting evidence now, not the headline. */}
          <Tape history={contact?.history ?? []} height={80} />

          <View style={styles.stats}>
            <Stat label="BEST SEEN" value={best === null ? '—' : `${best.toFixed(0)} dBm`} />
            <Stat label={isClassic ? 'SIGHTINGS' : 'PACKETS'} value={String(contact?.packets ?? 0)} />
            <Stat label="NOW" value={live === null ? '—' : `${live.toFixed(0)} dBm`} />
          </View>
        </>
      ) : (
        <TrailPanel
          trail={trail}
          width={width - 44}
          live={live}
          calibrated={txPower !== undefined}
          onCalibrate={calibrate}
        />
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
  calibrated,
  onCalibrate,
}: {
  trail: ReturnType<typeof useTrail>;
  width: number;
  live: number | null;
  calibrated: boolean;
  onCalibrate: () => void;
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

      {/*
        Calibration first. Simulation ranked the assumed reference power as the
        largest single error source — bigger than shadowing or compass bias —
        and one reading at a known distance removes it outright.
      */}
      {!calibrated && (
        <Pressable onPress={onCalibrate} disabled={live === null} style={[styles.card, { marginTop: 14, borderLeftColor: c.amber }]}>
          <Text style={[type.band, { color: c.amber, fontSize: 12 }]}>CALIBRATE FOR ACCURACY</Text>
          <Text style={type.body}>
            Stand about one metre from the device and tap here. Transmitters vary by 10–20 dB, and
            guessing that figure is the biggest cause of a wrong distance.
          </Text>
        </Pressable>
      )}

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
  headline: {
    fontSize: 20,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    marginTop: 22,
  },
  dialHint: {
    ...type.body,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
    paddingHorizontal: 12,
  },
  cta: {
    marginTop: 12,
    backgroundColor: c.amber,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  ctaOff: { backgroundColor: c.inkRaised, borderWidth: 1, borderColor: c.hairline },
  ctaTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  ctaSub: { fontSize: 13, color: 'rgba(255,255,255,0.86)', marginTop: 3 },
  classicNote: {
    ...type.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    letterSpacing: 0.2,
  },
  segment: { flexDirection: 'row', gap: 6, marginVertical: 16 },
  seg: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
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
    borderRadius: 16,
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
    borderRadius: 12,
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
