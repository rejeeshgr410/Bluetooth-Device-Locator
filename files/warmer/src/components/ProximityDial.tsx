import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { c } from '../lib/theme';
import { fill } from '../lib/signal';

type Props = {
  rssi: number | null;
  size: number;
  stale: boolean;
  /** Classic devices update in ~12s bursts; the dial should not pretend to flow. */
  stepped?: boolean;
  /** Two glyphs or so, shown in the travelling puck. */
  badge?: string;
};

/**
 * Radar-style proximity view: nested rings, you at the centre, the target as a
 * puck that travels inward as the signal strengthens.
 *
 * The puck's ANGLE is fixed at twelve o'clock and means nothing. Only its
 * distance from the centre carries information. Apple can place a real bearing
 * because the U1 chip does angle-of-arrival over ultra-wideband; Bluetooth RSSI
 * carries no direction at all, and a puck sitting at some arbitrary angle would
 * read as "it is over there" to every single user. Direction lives in TRAIL,
 * where a walked path earns it.
 */
export function ProximityDial({ rssi, size, stale, stepped = false, badge = '?' }: Props) {
  const proximity = rssi === null || stale ? 0 : fill(rssi);
  const grow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: proximity,
      duration: stepped ? 900 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // travel distance is a layout value
    }).start();
  }, [proximity, stepped, grow]);

  useEffect(() => {
    if (proximity === 0) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    // Closer target, quicker breath.
    const period = 2000 - proximity * 1200;
    const loop = Animated.loop(
      Animated.sequence([
        // Must match grow's driver: these values are combined below, and mixing
        // a native-driven node with a JS-driven one throws at mount.
        Animated.timing(pulse, { toValue: 1, duration: period / 2, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: period / 2, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [proximity, pulse]);

  const R = size / 2;
  const puck = 62;
  const core = size * 0.30;

  // Far signal parks the puck on the outer ring; a strong one brings it home.
  const travel = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [R - puck / 2 - 4, R - core / 2 - puck / 2 + 10],
  });

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0] });

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {/* Nested rings, faintest outermost. */}
      <View style={[styles.ring, { width: size, height: size, borderRadius: R, backgroundColor: c.ring1 }]} />
      <View style={[styles.ring, { width: size * 0.74, height: size * 0.74, borderRadius: size * 0.37, backgroundColor: c.ring2 }]} />
      <View style={[styles.ring, { width: size * 0.50, height: size * 0.50, borderRadius: size * 0.25, backgroundColor: c.ring3 }]} />

      {/* You: a white disc with a solid green core. */}
      <View style={[styles.core, { width: core, height: core, borderRadius: core / 2 }]}>
        <View style={[styles.coreDot, { width: core * 0.38, height: core * 0.38, borderRadius: core * 0.19 }]} />
      </View>

      {/* The target, travelling inward. Angle is fixed and carries no meaning. */}
      <Animated.View style={[styles.puckWrap, { transform: [{ translateY: Animated.multiply(travel, -1) }] }]}>
        <Animated.View
          style={[
            styles.puckHalo,
            {
              width: puck,
              height: puck,
              borderRadius: puck / 2,
              opacity: stale ? 0 : haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
        <View style={[styles.puck, { width: puck, height: puck, borderRadius: puck / 2, opacity: stale ? 0.45 : 1 }]}>
          <Text style={styles.puckText} numberOfLines={1}>
            {badge}
          </Text>
        </View>
        <View style={[styles.puckPip, { backgroundColor: stale ? c.amberDim : c.amber }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ring: { position: 'absolute' },
  core: {
    position: 'absolute',
    backgroundColor: c.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B8A3C',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  coreDot: { backgroundColor: c.amber },
  puckWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  puckHalo: { position: 'absolute', backgroundColor: c.amber },
  puck: {
    backgroundColor: c.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B8A3C',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  puckText: { fontSize: 22, fontWeight: '700', color: c.text },
  puckPip: {
    position: 'absolute',
    bottom: -9,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
