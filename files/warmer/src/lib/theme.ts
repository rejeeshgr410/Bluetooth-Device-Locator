import { Platform } from 'react-native';

/**
 * Light "Find Device" palette.
 *
 * This replaced the original amber-on-ink instrument look. The token NAMES are
 * kept from that scheme so the change stayed a one-file edit rather than a
 * sweeping rename across every component — but be warned that `amber` now
 * holds green, `ink` is off-white, and `inkRaised` is a white card. Renaming
 * them properly is safe to do later (the palette is a typed object, so the
 * compiler finds every use) and worth doing before anyone new touches this.
 */
export const c = {
  /** Page background. */
  ink: '#F4F6F4',
  /** Cards and raised surfaces. */
  inkRaised: '#FFFFFF',
  /** Borders and rules only — never text. */
  hairline: '#E2E7E2',

  /** Primary accent. Green, despite the name. */
  amber: '#1B8A3C',
  /** Muted accent for stale/disabled states. 3.3:1 on the page background. */
  amberDim: '#8FA894',

  /** Trend up / near. */
  warm: '#1B8A3C',
  /** Trend down / far. */
  cold: '#94A3A0',

  /** Primary text. 15.8:1 on the page background. */
  text: '#151A17',
  /** Secondary text. 5.6:1. */
  muted: '#5F6B64',
  /** Small labels and captions. 4.8:1. */
  dim: '#6B7770',
  alarm: '#C3372B',
  /** Closest band on the dial. */
  near: '#12752F',

  /** Soft ring fills for the radar, outermost first. */
  ring1: 'rgba(27,138,60,0.05)',
  ring2: 'rgba(27,138,60,0.09)',
  ring3: 'rgba(27,138,60,0.15)',
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
