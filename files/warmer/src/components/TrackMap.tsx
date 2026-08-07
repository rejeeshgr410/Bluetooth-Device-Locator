import React, { useMemo } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { c, mono } from '../lib/theme';
import { Crumb, Estimate } from '../lib/breadcrumbs';
import { Fix } from '../lib/useDeadReckoning';

type Props = {
  track: { x: number; y: number }[];
  crumbs: Crumb[];
  estimate: Estimate;
  fix: Fix;
  size: number;
};

/**
 * A plan view of the walk. Faint dots are where you have been, amber dots are
 * signal peaks sized by strength, the ring is the current best guess. Grid
 * squares are two metres.
 */
export function TrackMap({ track, crumbs, estimate, fix, size }: Props) {
  const view = useMemo(() => {
    const points = [
      ...track,
      ...crumbs,
      { x: fix.x, y: fix.y },
      ...(crumbs.length ? [{ x: estimate.x, y: estimate.y }] : []),
    ];
    let minX = -2;
    let maxX = 2;
    let minY = -2;
    let maxY = 2;
    // A loop rather than Math.min(...xs): the spread form passes one argument
    // per point, which is a stack overflow waiting for a long enough walk.
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY, 6) * 1.2;
    const scale = size / span;
    return {
      span,
      toScreen: (p: { x: number; y: number }) => ({
        left: size / 2 + (p.x - cx) * scale,
        top: size / 2 - (p.y - cy) * scale, // screen y grows downward
      }),
    };
  }, [track, crumbs, estimate, fix, size]);

  const strongest = crumbs.length ? Math.max(...crumbs.map((k) => k.rssi)) : 0;
  const weakest = crumbs.length ? Math.min(...crumbs.map((k) => k.rssi)) : 0;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {[0.25, 0.5, 0.75].map((f) => (
        <React.Fragment key={f}>
          <View style={[styles.grid, { left: size * f, top: 0, bottom: 0, width: 1 }]} />
          <View style={[styles.grid, { top: size * f, left: 0, right: 0, height: 1 }]} />
        </React.Fragment>
      ))}

      {track.map((p, i) => {
        const s = view.toScreen(p);
        return (
          <View
            key={`t${i}`}
            style={[styles.trackDot, { left: s.left - 1, top: s.top - 1, opacity: 0.12 + (i / track.length) * 0.4 }]}
          />
        );
      })}

      {crumbs.map((k) => {
        const s = view.toScreen(k);
        const range = Math.max(1, strongest - weakest);
        const strength = (k.rssi - weakest) / range;
        const d = 8 + strength * 14;
        return (
          <View
            key={k.id}
            style={{
              position: 'absolute',
              left: s.left - d / 2,
              top: s.top - d / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: c.amber,
              opacity: 0.25 + strength * 0.6,
              borderWidth: k.manual ? 1.5 : 0,
              borderColor: c.text,
            }}
          />
        );
      })}

      {crumbs.length >= 2 && (
        <View
          style={[
            styles.estimate,
            {
              left: view.toScreen(estimate).left - 20,
              top: view.toScreen(estimate).top - 20,
              borderColor: estimate.confidence === 'good' ? c.warm : c.muted,
            },
          ]}
        >
          <View style={[styles.estimateCore, { backgroundColor: estimate.confidence === 'good' ? c.warm : c.muted }]} />
        </View>
      )}

      <View
        style={[
          styles.you,
          {
            left: view.toScreen(fix).left - 9,
            top: view.toScreen(fix).top - 9,
            transform: [{ rotate: `${fix.heading}deg` }],
          },
        ]}
      >
        <View style={styles.youArrow} />
      </View>

      <Text style={styles.scaleLabel}>{view.span.toFixed(0)} m across</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: c.inkRaised,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  grid: { position: 'absolute', backgroundColor: c.hairline, opacity: 0.6 },
  trackDot: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: c.text },
  estimate: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estimateCore: { width: 5, height: 5, borderRadius: 3 },
  you: { position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  youArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: c.text,
  },
  scaleLabel: {
    position: 'absolute',
    left: 8,
    bottom: 6,
    fontFamily: mono,
    fontSize: 9,
    color: c.dim,
  },
});
