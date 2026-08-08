import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { c, mono } from '../lib/theme';
import { band, fill, roughRange } from '../lib/signal';

type Props = {
  rssi: number | null;
  size: number;
  stale: boolean;
  /** Classic devices update in ~12s bursts; the dial should not pretend to flow. */
  stepped?: boolean;
};

/**
 * Find My-style proximity dial: a disc that grows and warms as you close in.
 *
 * Deliberately NOT an arrow. Apple can point at an AirTag because the U1 chip
 * does angle-of-arrival over ultra-wideband. Bluetooth RSSI carries no bearing
 * whatsoever, and an arrow that looks authoritative while pointing at nothing
 * is worse than no arrow at all. Direction lives in TRAIL mode, where it is
 * earned from a walked path.
 */
export function ProximityDial({ rssi, size, stale, stepped = false }: Props) {
  const target = rssi === null || stale ? 0 : fill(rssi);
  const grow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: target,
      // A stepped source jumps every ~12s; easing it over a second reads as
      // deliberate rather than broken.
      duration: stepped ? 900 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // colour interpolation cannot go native
    }).start();
  }, [target, stepped, grow]);

  useEffect(() => {
    if (target === 0) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    // Closer target, quicker breath. Nothing precise, just a sense of urgency.
    //
    // useNativeDriver MUST stay false here. `pulse` gets multiplied against
    // `grow` below, and `grow` is JS-driven because colour interpolation cannot
    // run natively. Mixing the two drivers on one node throws at mount:
    // "Attempting to run JS driven animation on animated node that has been
    // moved to native earlier". One disc breathing is not worth the risk of
    // splitting these across two views to reclaim the native driver.
    const period = 1900 - target * 1100;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: period / 2, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: period / 2, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [target, pulse]);

  const disc = size * 0.86;

  const scale = grow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1] });
  const colour = grow.interpolate({
    inputRange: [0, 0.45, 0.75, 1],
    outputRange: [c.cold, c.amber, c.amber, c.near],
  });
  const glow = grow.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.42] });

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0] });

  const b = rssi !== null && !stale ? band(rssi) : null;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {/* Static range rings, so growth has something to be measured against. */}
      {[1, 0.72, 0.46].map((f) => (
        <View
          key={f}
          style={[
            styles.ring,
            { width: disc * f, height: disc * f, borderRadius: (disc * f) / 2 },
          ]}
        />
      ))}

      {/* Breathing halo */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            opacity: pulseOpacity,
            transform: [{ scale: Animated.multiply(scale, pulseScale) }],
          },
        ]}
      />

      {/* The disc itself */}
      <Animated.View
        style={[
          styles.disc,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            backgroundColor: colour,
            opacity: glow,
            transform: [{ scale }],
          },
        ]}
      />

      {/* Readout */}
      <View style={styles.centre} pointerEvents="none">
        {rssi === null || stale ? (
          <>
            <Text style={styles.lost}>NO CONTACT</Text>
            <Text style={styles.sub}>Walk back the way you came</Text>
          </>
        ) : (
          <>
            <Text style={styles.distance} numberOfLines={1} adjustsFontSizeToFit>
              {roughRange(rssi)}
            </Text>
            <Text style={styles.bandLabel} numberOfLines={2}>
              {b?.label}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: c.hairline,
  },
  halo: { position: 'absolute', backgroundColor: c.warm },
  disc: { position: 'absolute' },
  centre: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  distance: {
    fontFamily: mono,
    fontSize: 34,
    color: c.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  bandLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: c.dim,
    textAlign: 'center',
  },
  lost: { fontSize: 15, fontWeight: '700', letterSpacing: 3, color: c.alarm },
  sub: { marginTop: 8, fontSize: 13, color: c.dim, textAlign: 'center' },
});
