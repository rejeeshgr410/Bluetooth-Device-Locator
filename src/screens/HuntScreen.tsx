import React, { useState } from 'react';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { Trend, Proximity, Confidence, SignalStats } from '../lib/signal';

type Props = {
  contact: Contact;
  onBack: () => void;
};

export const HuntScreen: React.FC<Props> = ({ contact, onBack }) => {
  const { stats, name, kind } = contact;
  const [expertMode, setExpertMode] = useState(false);

  // Audio/Haptic clicker
  useClicker({
    rssi: stats.filtered,
    active: !stats.isStale,
    sound: true, // TODO: toggle in UI
    haptics: true,
    trend: stats.trend,
    confidence: stats.confidence,
  });

  const getAssistantMessage = (stats: SignalStats) => {
    if (stats.isStale) return 'Signal lost. Return toward the last strong signal.';
    
    if (stats.proximity === 'VERY CLOSE') {
      if (stats.confidence === 'LOW') return "You're probably very close. Move slowly.";
      return 'Move slowly. Try rotating the phone. Check underneath nearby objects.';
    }

    if (stats.trend === 'GETTING WARMER') return "You're moving closer. Keep going.";
    if (stats.trend === 'GETTING COLDER') return "Try turning around.";
    if (stats.trend === 'STABLE') return "Move a little and compare the signal.";
    
    return 'Walk around to establish a trend.';
  };

  const getTrendArrow = (trend: Trend) => {
    if (trend === 'GETTING WARMER') return '↑ WARMER';
    if (trend === 'GETTING COLDER') return '↓ COLDER';
    if (trend === 'STABLE') return '→ STABLE';
    return '? UNCERTAIN';
  };

  const getConfidenceColor = (conf: Confidence) => {
    if (conf === 'HIGH') return 'var(--c-warm)';
    if (conf === 'MEDIUM') return 'var(--c-amber)';
    return 'var(--c-alarm)';
  };

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', backgroundColor: 'var(--c-ink)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--c-dim)',
            padding: '8px 0',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '2px',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", marginRight: '4px' }}>[X]</span> STOP
        </button>
      </div>

      {/* Target Info */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'var(--c-dim)', marginBottom: '8px' }}>
          TARGET DEVICE
        </div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--c-text)', wordBreak: 'break-word' }}>
          {name ?? 'Unknown Device'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--c-muted)', marginTop: '4px' }}>
          {kind}
        </div>
      </div>

      {/* Primary Display */}
      <div style={{ 
        backgroundColor: 'var(--c-ink-raised)', 
        padding: '24px', 
        borderRadius: '8px',
        border: `1px solid ${stats.isStale ? 'var(--c-alarm)' : 'var(--c-hairline)'}`,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '24px'
      }}>
        {stats.isStale ? (
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--c-alarm)', letterSpacing: '2px' }}>
            SIGNAL LOST
          </div>
        ) : (
          <>
            <div style={{ fontSize: '32px', fontWeight: 700, color: stats.proximity === 'VERY CLOSE' ? 'var(--c-warm)' : 'var(--c-text)', letterSpacing: '2px' }}>
              {stats.proximity}
            </div>

            {/* Signal Strength Bar */}
            <div style={{ width: '100%', height: '16px', backgroundColor: 'var(--c-ink)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.max(0, Math.min(100, (stats.filtered + 95) * 1.8))}%`, 
                backgroundColor: 'var(--c-warm)',
                transition: 'width 0.3s ease-out'
              }} />
            </div>

            <div style={{ fontSize: '18px', fontWeight: 700, color: getConfidenceColor(stats.confidence) }}>
              {getTrendArrow(stats.trend)}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--c-muted)' }}>
              Confidence: <span style={{ color: getConfidenceColor(stats.confidence), fontWeight: 700 }}>{stats.confidence}</span>
            </div>
            
            <div style={{ 
              marginTop: '16px', 
              padding: '16px', 
              backgroundColor: 'rgba(255, 255, 255, 0.05)', 
              borderRadius: '8px',
              textAlign: 'center',
              lineHeight: 1.5,
              fontSize: '14px',
              color: 'var(--c-text)'
            }}>
              {getAssistantMessage(stats)}
            </div>
          </>
        )}
      </div>

      {/* Expert Mode Toggle */}
      <button 
        onClick={() => setExpertMode(!expertMode)}
        style={{
          marginTop: '24px',
          padding: '12px',
          background: 'none',
          border: '1px solid var(--c-hairline)',
          borderRadius: '4px',
          color: 'var(--c-dim)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '2px',
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }}>[DEBUG]</span> EXPERT VIEW
      </button>

      {/* Expert Panel */}
      {expertMode && (
        <div style={{ 
          marginTop: '12px', 
          padding: '16px', 
          backgroundColor: 'var(--c-ink-raised)', 
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--c-dim)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>ID: {contact.id.substring(0,8)}...</div>
            <div>Raw: {stats.raw} dBm</div>
            <div>Filtered: {Math.round(stats.filtered)} dBm</div>
            <div>Median: {stats.median} dBm</div>
            <div>Pkts/Sec: {stats.packetsPerSec.toFixed(1)}</div>
            <div>Variance: {stats.variance.toFixed(1)}</div>
            <div>Peak RSSI: {Math.round(stats.peakRssi)}</div>
            <div>Age: {((Date.now() - stats.lastSeen) / 1000).toFixed(1)}s</div>
          </div>
        </div>
      )}
    </div>
  );
};
