import React, { useEffect, useMemo, useState } from 'react';
import { Tape } from '../components/Tape';
import { TrackMap } from '../components/TrackMap';
import { band, roughRange, trend, STALE_AFTER_MS } from '../lib/signal';
import { distanceTo, relativeBearing, steer } from '../lib/breadcrumbs';
import { Contact } from '../lib/useScanner';
import { MotionPermission } from '../lib/useDeadReckoning';
import { useClicker } from '../lib/useClicker';
import { useTrail } from '../lib/useTrail';

/** iOS has no Vibration API at all, so the toggle must not claim otherwise. */
const HAPTICS_SUPPORTED = typeof navigator !== 'undefined' && 'vibrate' in navigator;

type Mode = 'meter' | 'trail';

interface HuntScreenProps {
  target: { id: string; name: string | null };
  contacts: Record<string, Contact>;
  isSimulator: boolean;
  onMoveSimPosition?: (dx: number, dy: number) => void;
  onBack: () => void;
}

export const HuntScreen: React.FC<HuntScreenProps> = ({
  target,
  contacts,
  isSimulator,
  onMoveSimPosition,
  onBack,
}) => {
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
  const stale = !contact || now - contact.lastSeen > STALE_AFTER_MS;
  const live = stale ? null : contact.rssi;
  const simulated = contact?.simulated ?? false;

  // Tracked in an effect, not mutated during render: writing to a ref while
  // rendering is a rules-of-React violation that misbehaves under StrictMode.
  useEffect(() => {
    if (live !== null) setBest((b) => (b === null || live > b ? live : b));
  }, [live]);

  const t = useMemo(() => (contact ? trend(contact.history) : 'steady'), [contact?.history]);
  useClicker({ rssi: live, active: !stale, sound, haptics: haptics && HAPTICS_SUPPORTED });

  const trail = useTrail({ rssi: live, active: mode === 'trail' });

  const b = live !== null ? band(live) : null;
  const trendColor = t === 'warmer' ? 'var(--c-warm)' : t === 'colder' ? 'var(--c-cold)' : 'var(--c-muted)';

  // Simulation step walker
  const handleSimWalk = (dx: number, dy: number, angleDeg?: number) => {
    let finalDx = dx;
    let finalDy = dy;
    // When angleDeg is undefined, step in current heading direction
    if (angleDeg === undefined) {
      const rad = (trail.fix.heading * Math.PI) / 180;
      finalDx = 0.72 * Math.sin(rad);
      finalDy = 0.72 * Math.cos(rad);
    }
    if (onMoveSimPosition) {
      onMoveSimPosition(finalDx, finalDy);
    }
    trail.simulateStep(angleDeg);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--c-amber)',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '1.5px',
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>&lt;</span> ALL SIGNALS
        </button>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '2px',
            color: stale ? 'var(--c-alarm)' : 'var(--c-warm)',
            backgroundColor: 'var(--c-ink-raised)',
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid var(--c-hairline)',
          }}
        >
          {stale ? 'NO CONTACT' : 'TRACKING'}
        </span>
      </div>

      {/* Target Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--c-text)', margin: 0 }}>
          {target.name ?? 'Unnamed device'}
        </h2>
        {simulated && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '1.5px',
              color: 'var(--c-warm)',
              border: '1px solid var(--c-warm)',
              borderRadius: '3px',
              padding: '2px 6px',
            }}
          >
            SIMULATED
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--c-muted)', marginTop: '2px' }}>
        {target.id}
      </div>

      {/* Big 92pt Monospace Readout */}
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '16px', marginBottom: '8px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '84px',
            fontWeight: 200,
            letterSpacing: '-4px',
            lineHeight: 1,
            color: stale ? 'var(--c-amber-dim)' : 'var(--c-amber)',
            
          }}
        >
          {live === null ? '––' : live.toFixed(0)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', color: 'var(--c-muted)', marginLeft: '12px', letterSpacing: '2px' }}>
          dBm
        </span>
      </div>

      {/* Segmented Control */}
      <div style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        <button
          onClick={() => setMode('meter')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: `1px solid ${mode === 'meter' ? 'var(--c-amber)' : 'var(--c-hairline)'}`,
            backgroundColor: mode === 'meter' ? 'var(--c-amber)' : 'var(--c-ink-raised)',
            color: mode === 'meter' ? 'var(--c-ink)' : 'var(--c-muted)',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '2px',
          }}
        >
          METER
        </button>
        <button
          onClick={() => setMode('trail')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: `1px solid ${mode === 'trail' ? 'var(--c-amber)' : 'var(--c-hairline)'}`,
            backgroundColor: mode === 'trail' ? 'var(--c-amber)' : 'var(--c-ink-raised)',
            color: mode === 'trail' ? 'var(--c-ink)' : 'var(--c-muted)',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '2px',
          }}
        >
          TRAIL
        </button>
      </div>

      {mode === 'meter' ? (
        <>
          {/* Phosphor Trace Tape */}
          <Tape history={contact?.history ?? []} height={140} />

          {/* Trend Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: trendColor }} />
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2.5px', color: trendColor }}>
              {stale ? 'SIGNAL LOST' : t === 'warmer' ? 'WARMER' : t === 'colder' ? 'COLDER' : 'HOLDING'}
            </span>
          </div>

          {/* Proximity Band Card */}
          <div
            style={{
              marginTop: '16px',
              padding: '18px',
              backgroundColor: 'var(--c-ink-raised)',
              borderRadius: '4px',
              
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '2.5px', color: stale ? 'var(--c-muted)' : 'var(--c-amber)' }}>
              {b?.label ?? 'WAITING FOR A PACKET'}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--c-muted)', lineHeight: '1.5' }}>
              {stale
                ? 'Nothing heard for 5 seconds. Walk back the way you came, or the target may have gone to sleep.'
                : b?.hint}
            </div>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '12px' }}>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--c-dim)' }}>ROUGH RANGE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--c-text)', marginTop: '2px' }}>
                  {live === null ? '—' : roughRange(live)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--c-dim)' }}>BEST SEEN</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--c-text)', marginTop: '2px' }}>
                  {best === null ? '—' : `${best.toFixed(0)} dBm`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--c-dim)' }}>PACKETS</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--c-text)', marginTop: '2px' }}>
                  {contact?.packets ?? 0}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Trail Mode Panel */
        <TrailPanel
          trail={trail}
          live={live}
          isSimulator={isSimulator}
          onSimWalk={handleSimWalk}
        />
      )}

      {/* Audio / Haptic Toggles */}
      <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
        <button
          onClick={() => setSound((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--c-text)', fontSize: '14px' }}
        >
          {sound ? <span style={{ fontFamily: "var(--font-mono)" }}>[VOL ON]</span> : <span style={{ fontFamily: "var(--font-mono)" }}>[VOL OFF]</span>}
          <span>Clicks ({sound ? 'ON' : 'OFF'})</span>
        </button>

        <button
          onClick={() => setHaptics((v) => !v)}
          disabled={!HAPTICS_SUPPORTED}
          title={HAPTICS_SUPPORTED ? undefined : 'This browser has no Vibration API'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--c-text)',
            fontSize: '14px',
            opacity: HAPTICS_SUPPORTED ? 1 : 0.45,
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>[VIBE]</span>
          <span>
            Vibration ({!HAPTICS_SUPPORTED ? 'UNSUPPORTED' : haptics ? 'ON' : 'OFF'})
          </span>
        </button>
      </div>

      {/* Caveat Text */}
      <p style={{ fontSize: '12px', color: 'var(--c-dim)', marginTop: '20px', lineHeight: '1.6' }}>
        Signal strength is a relative proxy. Metal, walls, and bodies absorb signal. Trust the trend trace rather than any single number.
      </p>
    </div>
  );
};

interface TrailPanelProps {
  trail: ReturnType<typeof useTrail>;
  live: number | null;
  isSimulator: boolean;
  onSimWalk: (dx: number, dy: number, angleDeg?: number) => void;
}

const TrailPanel: React.FC<TrailPanelProps> = ({ trail, live, isSimulator, onSimWalk }) => {
  const { fix, crumbs, track, estimate, dropManual, clear, permission, receiving, requestAccess } = trail;
  const showArrow = crumbs.length >= 2;
  const metres = distanceTo(fix, estimate);
  const rel = relativeBearing(fix, estimate);

  // Granted but silent is its own failure: sensors that exist and report
  // nothing look exactly like sensors that are working but you stood still.
  const motionState: 'ok' | MotionPermission | 'silent' =
    permission !== 'granted' ? permission : receiving ? 'ok' : 'silent';
  const showMotionCard = !isSimulator && motionState !== 'ok';

  return (
    <>
      {/*
        Motion access. Without this card, iOS silently produced no steps at
        all: the sensors are present but gated, so every listener stayed quiet
        and the panel sat on "GATHERING MARKS" forever with no explanation.
      */}
      {showMotionCard && (
        <div
          style={{
            marginBottom: '14px',
            padding: '16px',
            backgroundColor: 'var(--c-ink-raised)',
            borderRadius: '4px',
            borderLeft: `3px solid ${motionState === 'prompt' ? 'var(--c-amber)' : 'var(--c-alarm)'}`,
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '2px',
              color: motionState === 'prompt' ? 'var(--c-amber)' : 'var(--c-alarm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)" }}>[COMPASS]</span>
            {motionState === 'prompt' ? 'MOTION ACCESS NEEDED' : 'TRAIL UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--c-dim)', marginTop: '8px', lineHeight: 1.5 }}>
            {motionState === 'prompt' &&
              'Trail counts your steps and reads your heading to work out where you have been. Neither is sent anywhere.'}
            {motionState === 'denied' &&
              'Motion access was declined, so steps and heading cannot be read. Re-enable it in your browser settings for this site, then reload.'}
            {motionState === 'unsupported' &&
              'This device has no motion sensors, so there is nothing to dead-reckon with. Use METER mode, or switch on the simulator to try the walker.'}
            {motionState === 'silent' &&
              'No motion data is arriving. Trail needs a phone’s accelerometer and compass — on a desktop there is nothing to read. Use METER mode, or switch on the simulator to try the step walker.'}
          </div>
          {motionState === 'prompt' && (
            <button
              onClick={requestAccess}
              style={{
                marginTop: '12px',
                padding: '10px 16px',
                borderRadius: '4px',
                border: '1px solid var(--c-amber)',
                backgroundColor: 'transparent',
                color: 'var(--c-amber)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
              }}
            >
              ALLOW MOTION ACCESS
            </button>
          )}
        </div>
      )}

      <TrackMap track={track} crumbs={crumbs} estimate={estimate} fix={fix} size={300} />

      {/* Steering & Confidence Card */}
      <div
        style={{
          marginTop: '16px',
          padding: '18px',
          backgroundColor: 'var(--c-ink-raised)',
          borderRadius: '4px',
          
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '2.5px', color: showArrow ? 'var(--c-amber)' : 'var(--c-muted)' }}>
          {showArrow ? steer(rel, metres).toUpperCase() : 'GATHERING MARKS'}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--c-muted)', lineHeight: '1.5' }}>{estimate.note}</div>

        {/* Trail Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '12px' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--c-dim)' }}>MARKS</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--c-text)', marginTop: '2px' }}>{crumbs.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--c-dim)' }}>BASELINE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--c-text)', marginTop: '2px' }}>{estimate.spread.toFixed(0)} m</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--c-dim)' }}>STEPS</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--c-text)', marginTop: '2px' }}>{fix.steps}</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--c-dim)' }}>CONFIDENCE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: estimate.confidence === 'good' ? 'var(--c-warm)' : 'var(--c-muted)', marginTop: '2px', fontWeight: 700 }}>
              {estimate.confidence.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Simulator D-Pad Controls for browser testing */}
      {isSimulator && (
        <div style={{ marginTop: '14px', padding: '12px', backgroundColor: 'rgba(99, 230, 226, 0.05)', borderRadius: '4px', border: '1px dashed var(--c-warm)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--c-warm)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>[STEPS]</span> VIRTUAL STEP WALKER (DESKTOP / SIMULATOR)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', maxWidth: '180px', margin: '0 auto' }}>
            <div />
            <button onClick={() => onSimWalk(0, 0.72, 0)} style={simBtnStyle} title="Step North"><span style={{ fontFamily: "var(--font-mono)" }}>^</span></button>
            <div />
            <button onClick={() => onSimWalk(-0.72, 0, 270)} style={simBtnStyle} title="Step West"><span style={{ fontFamily: "var(--font-mono)" }}>&lt;</span></button>
            <button onClick={() => onSimWalk(0, 0, undefined)} style={{ ...simBtnStyle, backgroundColor: 'var(--c-warm)', color: 'var(--c-ink)' }} title="Step Forward">STEP</button>
            <button onClick={() => onSimWalk(0.72, 0, 90)} style={simBtnStyle} title="Step East"><span style={{ fontFamily: "var(--font-mono)" }}>&gt;</span></button>
            <div />
            <button onClick={() => onSimWalk(0, -0.72, 180)} style={simBtnStyle} title="Step South"><span style={{ fontFamily: "var(--font-mono)" }}>v</span></button>
            <div />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button
          onClick={dropManual}
          disabled={live === null}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '4px',
            border: '1px solid var(--c-amber)',
            backgroundColor: 'transparent',
            color: 'var(--c-amber)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '2px',
            opacity: live === null ? 0.35 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>[PIN]</span> DROP A MARK HERE
        </button>

        <button
          onClick={clear}
          style={{
            flex: 0.5,
            padding: '12px',
            borderRadius: '4px',
            border: '1px solid var(--c-hairline)',
            backgroundColor: 'transparent',
            color: 'var(--c-muted)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>[RESET]</span> RESET
        </button>
      </div>
    </>
  );
};

const simBtnStyle: React.CSSProperties = {
  padding: '8px',
  borderRadius: '4px',
  border: '1px solid var(--c-hairline)',
  backgroundColor: 'var(--c-ink-raised)',
  color: 'var(--c-text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
