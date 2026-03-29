import { useState } from 'react';
import { Activity } from 'lucide-react';

export default function ConnectionStatus() {
  const [showTooltip, setShowTooltip] = useState(false);

  // Todo: Connect this to actual backend status via SSE/Websockets later.
  // For now, this is a mockup UI.
  const platforms = [
    { name: 'PerfectPay', status: 'connected' },
    { name: 'Payt', status: 'connected' },
    { name: 'Kirvano', status: 'connected' },
    { name: 'XP Empresas (Pix)', status: 'connected' },
  ];

  const allConnected = platforms.every(p => p.status === 'connected');
  const anyConnected = platforms.some(p => p.status === 'connected');

  const mainColor = allConnected ? 'var(--color-green)' : (anyConnected ? '#facc15' : '#ef4444');
  const textColor = allConnected ? '#14532d' : (anyConnected ? '#713f12' : '#7f1d1d');
  const bgColor = allConnected ? 'rgba(34,197,94,0.15)' : (anyConnected ? 'rgba(250,204,21,0.15)' : 'rgba(239,68,68,0.15)');

  return (
    <div style={{ position: 'relative' }} 
         onMouseEnter={() => setShowTooltip(true)} 
         onMouseLeave={() => setShowTooltip(false)}>
      
      {/* Pill Indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 99,
        background: bgColor, cursor: 'help',
        border: `1px solid ${mainColor}40`,
        transition: 'all 0.2s'
      }}>
        {/* Pulsing dot */}
        <div style={{ position: 'relative', width: 8, height: 8 }}>
           <div style={{
             position: 'absolute', inset: 0, borderRadius: '50%',
             background: mainColor, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
             opacity: 0.75
           }} />
           <div style={{
             position: 'absolute', inset: 0, borderRadius: '50%',
             background: mainColor
           }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: mainColor }}>
          Ao Vivo
        </span>
      </div>

      {/* Popover/Tooltip */}
      {showTooltip && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 200, padding: 12, borderRadius: 12,
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', zIndex: 50,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--color-text)' }}>
            <Activity size={14} style={{ color: 'var(--color-green)' }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Status do Webhook</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {platforms.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.status === 'connected' ? 'var(--color-green)' : '#ef4444' }} />
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: p.status === 'connected' ? 'var(--color-green)' : '#ef4444' }}>
                    {p.status === 'connected' ? 'Ativo' : 'Offline'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Internal frames */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
