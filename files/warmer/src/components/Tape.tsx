import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { c, mono } from '../lib/theme';
import { fill } from '../lib/signal';

/**
 * The last ~90 readings as a scrolling trace. The whole point of the tool is
 * that a single number lies and the slope does not, so the slope gets the
 * space and the number sits on top of it.
 */
export function Tape({ history, height = 150 }: { history: number[]; height?: number }) {
  const slots = 60;
  const recent = history.slice(-slots);
  const pad = new Array(Math.max(0, slots - recent.length)).fill(null);
  const cells: (number | null)[] = [...pad, ...recent];

  return (
    <View style={[styles.wrap, { height }]}>
      {[-45, -60, -72, -85].map((line) => (
        <View key={line} style={[styles.grid, { bottom: fill(line) * height }]}>
          <Text style={styles.gridLabel}>{line}</Text>
        </View>
      ))}
      <View style={styles.bars}>
        {cells.map((v, i) => {
          const age = i / slots;
          return (
            <View key={i} style={styles.slot}>
              {v !== null && (
                <View
                  style={{
                    height: Math.max(2, fill(v) * height),
                    width: '100%',
                    backgroundColor: c.amber,
                    opacity: 0.18 + age * 0.82,
                  }}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%' },
  slot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 0.6, height: '100%' },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: c.hairline,
    justifyContent: 'center',
  },
  gridLabel: {
    position: 'absolute',
    right: 0,
    top: -13,
    fontFamily: mono,
    fontSize: 9,
    color: c.dim,
  },
});
