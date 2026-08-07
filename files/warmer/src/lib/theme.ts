import { Platform } from 'react-native';

/**
 * Amber on ink. The reference is a radio-direction-finding set, not a
 * dashboard: one live number, a phosphor trace behind it, everything else
 * dimmed so it stays readable in a dark room at arm's length.
 */
export const c = {
  ink: '#070B10',
  inkRaised: '#0E141C',
  hairline: '#1B242F',
  amber: '#FFB000',
  amberDim: '#6A4A08',
  warm: '#63E6E2',
  cold: '#5B6B7C',
  text: '#E8EDF2',
  muted: '#7C8B9A',
  alarm: '#FF5A47',
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
