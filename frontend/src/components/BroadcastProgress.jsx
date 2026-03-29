import { useEffect, useState, useRef } from 'react';
import { CheckCircle, XCircle, Clock, X, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function BroadcastProgress({ jobId, onClose }) {
  const [job, setJob] = useState({ status: 'running', total: 0, sent: 0, failed: 0 });
  const [isConfirming, setIsConfirming] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    // Connect to Server-Sent Events stream
    const es = new EventSource(`/api/broadcast/${jobId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setJob(data);
      if (data.status === 'done' || data.status === 'canceled') {
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  const { total, sent, failed, status } = job;
  const processed = sent + failed;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isDone = status === 'done';
  const isCanceled = status === 'canceled';
  
  const handleCancel = async () => {
    try {
      await axios.post(`/api/broadcast/${jobId}/cancel`);
      setJob(prev => ({ ...prev, status: 'canceled' }));
    } catch (e) {
      console.error(e);
      alert("Erro ao cancelar o disparo.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div style={{
      background: 'var(--color-bg-card)',
      border: `1px solid ${isDone ? 'rgba(34,197,94,0.4)' : 'var(--color-border-hover)'}`,
      borderRadius: 12,
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
      transition: 'border-color 0.4s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isDone
            ? <CheckCircle size={18} style={{ color: 'var(--color-green)' }} />
            : isCanceled
            ? <XCircle size={18} style={{ color: '#ef4444' }} />
            : <Loader2 size={18} style={{ color: 'var(--color-green)', animation: 'spin 1s linear infinite' }} />
          }
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
            {isDone ? 'Disparo Concluído' : isCanceled ? 'Disparo Cancelado' : 'Disparo em Andamento…'}
          </span>
          {!isDone && !isCanceled && (
             isConfirming ? (
               <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                 <button onClick={handleCancel} style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: '#ef4444', color: '#fff', border: 'none' }}>
                   Sim, parar
                 </button>
                 <button onClick={() => setIsConfirming(false)} style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                   Não
                 </button>
               </div>
             ) : (
               <button
                 onClick={() => setIsConfirming(true)}
                 style={{
                   marginLeft: 8, fontSize: '0.6875rem', fontWeight: 600,
                   padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                   background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                   border: '1px solid rgba(239,68,68,0.2)'
                 }}
                 onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                 onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
               >
                 Cancelar
               </button>
             )
          )}
        </div>
        {(isDone || isCanceled) && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--color-bg-elevated)', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 99,
          background: failed > 0
            ? 'linear-gradient(90deg, var(--color-green), #facc15)'
            : 'var(--color-green)',
          boxShadow: '0 0 8px rgba(34,197,94,0.5)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        <MiniStat icon={<Clock size={14} />} label="Total" value={total} color="var(--color-text-subtle)" />
        <MiniStat icon={<CheckCircle size={14} />} label="Enviados" value={sent} color="var(--color-green)" />
        <MiniStat icon={<XCircle size={14} />} label="Falhas" value={failed} color="#ef4444" />
        <MiniStat icon={null} label="Progresso" value={`${pct}%`} color={isDone ? 'var(--color-green)' : isCanceled ? '#ef4444' : 'var(--color-text-subtle)'} />
      </div>

      {/* Spin keyframe (inline) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MiniStat({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--color-bg-elevated)',
      borderRadius: 8, padding: '0.75rem',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon} {label}
      </span>
      <span style={{ fontSize: '1.375rem', fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
