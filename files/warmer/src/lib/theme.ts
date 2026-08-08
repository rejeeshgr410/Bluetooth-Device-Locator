import { Platform } from 'react-native';

/**
 * Amber on ink. The reference is a radio-direction-finding set, not a
 * dashboard: one live number, a phosphor trace behind it, everything else
 * dimmed so it stays readable in a dark room at arm's length.
 */
export const c = {
  ink: '#070B10',
  inkRaised: '#0E141C',
  /**
   * Rules and borders ONLY. As a text colour this measures 1.26:1 on ink,
   * which is not dim, it is absent. Small print goes on `dim`.
   */
  hairline: '#1B242F',
  amber: '#FFB000',
  /** Stale readout. 3.68:1 on ink — dimmed, but still readable, which is
   *  the whole point at the moment contact is lost. */
  amberDim: '#8A6410',
  warm: '#63E6E2',
  cold: '#5B6B7C',
  text: '#E8EDF2',
  muted: '#7C8B9A',
  /** Small labels and secondary copy. 6.35:1 on inkRaised. */
  dim: '#8A99A8',
  alarm: '#FF5A47',
  /** Proximity dial, closest band. Reads as "you have arrived". */
  near: '#35D07F',
};

export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const type = {
  reading: { fontFamily: mono, fontSize: 92, fontWeight: '200' as const, letterSpacing: -4 },
  unit: { fontFamily: mono, fontSize: 20, color: c.muted, letterSpacing: 2 },
  band: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 3 },
  eyebrow: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 2.5, color: c.muted },
  body: { fontSize: 14, color: c.muted, lineHeight: 21 },
  item: { fontSize: 17, color: c.text, fontWeight: '500' as const },
};
