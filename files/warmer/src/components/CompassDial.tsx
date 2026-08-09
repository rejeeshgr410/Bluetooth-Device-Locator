import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { c } from '../lib/theme';
import { band, roughRange } from '../lib/signal';
import type { DirectionConfidence } from '../lib/useDirectionScan';

type Props = {
  size: number;
  rssi: number | null;
  stale: boolean;
  /** Live compass heading, degrees clockwise from north. */
  heading: number;
  /** Absolute bearing to the target, or null if unknown. */
  bearing: number | null;
  /** Half-width of the wedge in degrees — the honest uncertainty. */
  spread: number;
  confidence: DirectionConfidence;
};

const TICKS = 36;
const CARDINALS: Array<[string, number]> = [
  ['N', 0],
  ['E', 90],
  ['S', 180],
  ['W', 270],
];

/**
 * Compass rose with a direction wedge.
 *
 * The rose counter-rotates with the phone so north stays north; the wedge sits
 * at the target's absolute bearing inside it. The visible result is that when
 * you turn to face the target, the wedge swings to the top of the screen.
 *
 * It is a wedge and not an arrow on purpose. The bearing comes from body-
 * shadowing DF, which is good to a few tens of degrees at best, and an arrow
 * would claim a precision the physics cannot support.
 */
export function CompassDial({ size, rssi, stale, heading, bearing, spread, confidence }: Props) {
  const R = size / 2;
  const live = rssi !== null && !stale;
  const b = live ? band(rssi!) : null;
  const hub = size * 0.26;

  const wedgeColour = confidence === 'good' ? c.near : c.amber;
  const wedgeOpacity = confidence === 'good' ? 0.85 : confidence === 'fair' ? 0.6 : 0.34;

  // The wedge is a fan of thin radial bars. Each is rotated about the hub and
  // pushed outward, which avoids pulling in an SVG dependency for one shape.
  const bars = 15;
  const reach = R * 0.78;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {/* Fixed outer face */}
      <View style={[styles.face, { width: size, height: size, borderRadius: R }]} />
      <View
        style={[
          styles.innerRing,
          { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35 },
        ]}
      />
      <View
        style={[
          styles.innerRing,
          { width: size * 0.46, height: size * 0.46, borderRadius: size * 0.23 },
        ]}
      />

      {/* Everything that must stay pinned to the world rotates as one. */}
      <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${-heading}deg` }] }]}>
        {/*
          Positioned with trigonometry, not rotate+translate. An absolutely
          positioned View with no left/top anchors to the parent's top-left
          corner, so transforming from there threw the ticks and letters clear
          of the dial entirely.
        */}
        {Array.from({ length: TICKS }).map((_, i) => {
          const major = i % 9 === 0;
          const a = (i * (360 / TICKS) * Math.PI) / 180;
          const d = R - 15;
          const w = major ? 2 : 1;
          const h = major ? 14 : 7;
          return (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  width: w,
                  height: h,
                  backgroundColor: major ? c.muted : c.hairline,
                  left: R + d * Math.sin(a) - w / 2,
                  top: R - d * Math.cos(a) - h / 2,
                  transform: [{ rotate: `${i * (360 / TICKS)}deg` }],
                },
              ]}
            />
          );
        })}

        {CARDINALS.map(([label, deg]) => {
          const a = (deg * Math.PI) / 180;
          const d = R - 40;
          const box = 26;
          return (
            <View
              key={label}
              style={[
                styles.cardinalWrap,
                {
                  width: box,
                  height: box,
                  left: R + d * Math.sin(a) - box / 2,
                  top: R - d * Math.cos(a) - box / 2,
                },
              ]}
            >
              <Text style={styles.cardinal}>{label}</Text>
            </View>
          );
        })}

        {bearing !== null && !stale && (
          <>
            {Array.from({ length: bars }).map((_, i) => {
              const frac = i / (bars - 1);
              const a = bearing - spread + frac * spread * 2;
              // Taper the edges so the fan reads as one soft cone.
              const edge = 1 - Math.abs(frac - 0.5) * 2;
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: R - 1,
                    top: R - reach / 2,
                    width: (2 * Math.PI * reach) / (bars * 4) + 4,
                    height: reach,
                    borderRadius: 6,
                    backgroundColor: wedgeColour,
                    opacity: wedgeOpacity * (0.45 + edge * 0.55),
                    transform: [{ rotate: `${a}deg` }, { translateY: -reach / 2 }],
                  }}
                />
              );
            })}
          </>
        )}
      </View>

      {/* Hub: you. Sits above the wedge so the fan appears to emanate from it. */}
      <View style={[styles.hub, { width: hub, height: hub, borderRadius: hub / 2 }]}>
        <View style={styles.phoneGlyph} />
      </View>

      {/* Heading marker, fixed at the top: the way the phone is pointing. */}
      <View style={[styles.marker, { top: -2 }]} />

      <View style={[styles.readout, { top: R + hub / 2 + 14 }]}>
        <Text style={styles.distance} numberOfLines={1} adjustsFontSizeToFit>
          {live ? roughRange(rssi!) : '—'}
        </Text>
        <Text style={styles.sub}>{live ? (b?.label ?? '').toLowerCase() : 'no contact'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  face: {
    position: 'absolute',
    backgroundColor: c.inkRaised,
    borderWidth: 1,
    borderColor: c.hairline,
    shadowColor: '#0B1F12',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: c.hairline,
  },
  tick: { position: 'absolute' },
  cardinalWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  cardinal: { fontSize: 17, fontWeight: '700', color: c.text },
  hub: {
    position: 'absolute',
    backgroundColor: c.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1F12',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  phoneGlyph: {
    width: 18,
    height: 28,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: c.text,
  },
  marker: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: c.amber,
  },
  readout: { position: 'absolute', alignItems: 'center' },
  distance: { fontSize: 26, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
});
