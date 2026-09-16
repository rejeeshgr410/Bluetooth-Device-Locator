import React, { useEffect, useMemo, useState } from 'react';
import { fill, kindOf, STALE_AFTER_MS } from '../lib/signal';
import { Capability, Contact, ScanMode } from '../lib/useScanner';

interface SurveyScreenProps {
  contacts: Record<string, Contact>;
  scanning: boolean;
  isSimulator: boolean;
  capability: Capability;
  mode: ScanMode;
  error: string | null;
  notice: string | null;
  onStart: () => void;
  onStop: () => void;
  onToggleSimulator: () => void;
  onPick: (contact: Contact) => void;
}

/** What the button actually does, per mode. No mode promises more than it delivers. */
const START_LABEL: Record<ScanMode, string> = {
  scan: 'START LISTENING',
  single: 'CHOOSE A DEVICE',
  unsupported: 'CANNOT LISTEN',
  simulator: 'START SIMULATION',
};

const IDLE_COPY: Record<ScanMode, string> = {
  scan:
    'Tap START LISTENING to hear every Bluetooth device advertising nearby, sorted by signal strength.',
  single:
    'This browser can track one device at a time. Tap CHOOSE A DEVICE, pick your target from the browser’s list, and its signal will be tracked from there.',
  unsupported:
    'This browser cannot follow a signal as it changes, so there is nothing to read. Switch on the simulator to see how the app works.',
  simulator:
    'Simulator mode. Tap START SIMULATION to walk through the app against five invented devices — no radio is involved and no reading is real.',
};

const LISTENING_COPY: Record<ScanMode, string> = {
  scan: 'Listening for advertising packets… Make sure Bluetooth and Location are switched on.',
  single: 'Waiting for advertising packets from the device you picked…',
  unsupported: 'Nothing to listen to on this browser.',
  simulator: 'Generating invented readings for five fictional devices…',
};

const EXPERIMENTAL_FLAG = 'chrome://flags/#enable-experimental-web-platform-features';

export const SurveyScreen: React.FC<SurveyScreenProps> = ({
  contacts,
  scanning,
  isSimulator,
  capability,
  mode,
  error,
  notice,
  onStart,
  onStop,
  onToggleSimulator,
  onPick,
}) => {
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Date.now());
  const [namedOnly, setNamedOnly] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.values(contacts)
      .filter((d) => now - d.lastSeen < 20000)
      .filter((d) => (namedOnly ? !!d.name : true))
      .filter((d) => (q ? (d.name ?? '').toLowerCase().includes(q) || d.id.toLowerCase().includes(q) : true))
      .sort((a, b) => b.rssi - a.rssi);
  }, [contacts, filter, now, namedOnly]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--c-text)' }}>
          Bluetooth Device Locator
        </h1>
      </div>

      {mode === 'simulator' && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'rgba(99, 230, 226, 0.08)',
            border: '1px dashed var(--c-warm)',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-warm)', marginTop: '2px' }}>[SIM]</div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--c-warm)' }}>
              SIMULATED — NOT REAL DEVICES
            </div>
            <div style={{ fontSize: '13px', color: 'var(--c-dim)', marginTop: '4px', lineHeight: 1.5 }}>
              {capability.bluetooth
                ? 'Every reading below is invented. Switch the simulator off to use the radio.'
                : 'This browser has no Web Bluetooth, so nothing here can be measured. Chrome on Android can.'}
            </div>
          </div>
        </div>
      )}

      {mode === 'unsupported' && (
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--c-ink-raised)',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-alarm)', marginTop: '2px' }}>[!]</div>
          <div style={{ fontSize: '13px', color: 'var(--c-dim)', lineHeight: 1.6 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--c-alarm)', marginBottom: '6px' }}>
              SIGNAL TRACKING UNAVAILABLE
            </div>
            This browser can see Bluetooth devices but cannot follow how strong their signal is —
            which is the one thing this app needs. That is a browser limitation, not a fault in your
            phone or your Bluetooth.
            <div style={{ marginTop: '10px' }}>
              To enable it in Chrome or Edge, switch on{' '}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--c-amber)',
                  wordBreak: 'break-all',
                }}
              >
                {EXPERIMENTAL_FLAG}
              </span>{' '}
              and restart the browser. Otherwise, switch on the simulator below to see how the app
              works.
            </div>
          </div>
        </div>
      )}

      {mode === 'single' && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'var(--c-ink-raised)',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-amber)', marginTop: '2px' }}>[BT]</div>
          <div style={{ fontSize: '13px', color: 'var(--c-dim)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--c-text)' }}>One device at a time.</strong> This browser will
            not list everything in range — only the device you pick from its own chooser. A full sweep
            needs{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--c-amber)',
                wordBreak: 'break-all',
              }}
            >
              {EXPERIMENTAL_FLAG}
            </span>{' '}
            switched on as well.
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'var(--c-ink-raised)',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-alarm)' }}>[!]</div>
          <span style={{ fontSize: '14px', color: 'var(--c-text)' }}>{error}</span>
        </div>
      )}

      {notice && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'var(--c-ink-raised)',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-muted)' }}>[i]</div>
          <span style={{ fontSize: '14px', color: 'var(--c-dim)' }}>{notice}</span>
        </div>
      )}

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          onClick={scanning ? onStop : onStart}
          disabled={mode === 'unsupported'}
          title={
            mode === 'unsupported'
              ? 'This browser cannot follow a signal as it changes'
              : undefined
          }
          style={{
            flex: 2,
            padding: '14px 20px',
            borderRadius: '4px',
            border: `1px solid ${mode === 'unsupported' ? 'var(--c-hairline)' : 'var(--c-amber)'}`,
            backgroundColor: scanning ? 'var(--c-amber)' : 'transparent',
            color: scanning ? 'var(--c-ink)' : mode === 'unsupported' ? 'var(--c-dim)' : 'var(--c-amber)',
            fontWeight: 700,
            letterSpacing: '2px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            minWidth: '160px',
            opacity: mode === 'unsupported' ? 0.55 : 1,
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>(o)</span>
          {scanning ? 'STOP LISTENING' : START_LABEL[mode]}
        </button>

        <button
          onClick={() => setNamedOnly((v) => !v)}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '4px',
            border: '1px solid var(--c-hairline)',
            backgroundColor: 'var(--c-ink-raised)',
            color: namedOnly ? 'var(--c-dim)' : 'var(--c-amber)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>=</span>
          {namedOnly ? 'NAMED ONLY' : 'ALL SIGNALS'}
        </button>

        <button
          onClick={onToggleSimulator}
          disabled={!capability.bluetooth}
          title={
            capability.bluetooth
              ? 'Toggle BLE Simulator Mode'
              : 'This browser has no Web Bluetooth, so only the simulator is available'
          }
          style={{
            padding: '12px 14px',
            borderRadius: '4px',
            border: `1px solid ${isSimulator ? 'var(--c-warm)' : 'var(--c-hairline)'}`,
            backgroundColor: isSimulator ? 'rgba(99, 230, 226, 0.1)' : 'var(--c-ink-raised)',
            color: isSimulator ? 'var(--c-warm)' : 'var(--c-dim)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            opacity: capability.bluetooth ? 1 : 0.5,
            cursor: capability.bluetooth ? 'pointer' : 'not-allowed',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>[SIM]</span>
          {isSimulator ? 'SIMULATOR ON' : 'SIMULATOR OFF'}
        </button>
      </div>

      {/* Filter Input */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--c-dim)", fontFamily: "var(--font-mono)" }}>Q</span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by device name or address..."
          aria-label="Filter devices by name or address"
          style={{
            width: '100%',
            backgroundColor: 'var(--c-ink-raised)',
            color: 'var(--c-text)',
            borderRadius: '4px',
            padding: '12px 14px 12px 40px',
            border: '1px solid var(--c-hairline)',
            fontSize: '14px',
          }}
        />
      </div>

      {/* Device List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              backgroundColor: 'var(--c-ink-raised)',
              borderRadius: '4px',
              border: '1px dashed var(--c-hairline)',
              marginTop: '12px',
            }}
          >
            <p style={{ color: 'var(--c-dim)', fontSize: '14px', lineHeight: '1.6' }}>
              {scanning ? LISTENING_COPY[mode] : IDLE_COPY[mode]}
            </p>
          </div>
        ) : (
          rows.map((item) => {
            const stale = now - item.lastSeen > STALE_AFTER_MS;
            const fillWidth = fill(item.rssi) * 100;

            return (
              <button
                key={item.id}
                onClick={() => onPick(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: 'var(--c-ink-raised)',
                  borderRadius: '4px',
                  border: '1px solid var(--c-hairline)',
                  gap: '16px',
                  textAlign: 'left',
                  
                }}
                
                
              >
                {/* RSSI Bar */}
                <div
                  style={{
                    width: '46px',
                    height: '4px',
                    backgroundColor: 'var(--c-hairline)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${fillWidth}%`,
                      backgroundColor: item.simulated ? 'var(--c-warm)' : 'var(--c-amber)',
                      opacity: stale ? 0.25 : 1,
                      transition: 'width 200ms ease-out',
                    }}
                  />
                </div>

                {/* Device Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'var(--c-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name ?? 'Unnamed Device'}
                    </span>
                    {/* Per-row tag, so a fabricated reading can never be mistaken
                        for a measured one even at a glance. */}
                    {item.simulated && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          letterSpacing: '1.5px',
                          color: 'var(--c-warm)',
                          border: '1px solid var(--c-warm)',
                          borderRadius: '3px',
                          padding: '1px 5px',
                          flexShrink: 0,
                        }}
                      >
                        SIM
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--c-dim)', marginTop: '2px', letterSpacing: '0.4px' }}>
                    {kindOf(item.name)} · {item.packets} packets{stale ? ' · quiet' : ''}
                  </div>
                </div>

                {/* RSSI Mono Value */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: stale ? 'var(--c-amber-dim)' : item.simulated ? 'var(--c-warm)' : 'var(--c-amber)',
                    flexShrink: 0,
                  }}
                >
                  {item.rssi.toFixed(0)} <span style={{ fontSize: '11px', color: 'var(--c-dim)' }}>dBm</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
