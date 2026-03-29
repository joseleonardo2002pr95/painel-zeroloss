import { useEffect, useState } from 'react';
import { CheckCircle, Clock, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

const TARGET_LABEL = { leads: 'Leads', clients: 'Clientes' };

export default function BroadcastHistory() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    try {
      const res = await axios.get('/api/broadcasts');
      setRecords(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (jobId) => {
    try {
      await axios.post(`/api/broadcast/${jobId}/cancel`);
      load(); // Refresh list to catch new 'canceled' status
    } catch (e) {
      console.error("Erro ao cancelar:", e);
      alert("Erro ao cancelar o disparo.");
    }
  };

  // Poll every 5s while any job is still running
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (records.some(r => r.status === 'running')) load();
    }, 5000);
    return () => clearInterval(interval);
  }, [records.length]);

  if (!loading && records.length === 0) {
    return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '1rem' }}>
          Histórico de Disparos
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
          Nenhum disparo realizado ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-text)' }}>
          Histórico de Disparos
        </h2>
        <button onClick={load} title="Atualizar histórico"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-green)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}>
          <RefreshCw size={14} /> <span style={{ fontSize: '0.75rem' }}>Atualizar</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
          : records.map(r => (
            <HistoryRow
              key={r.job_id}
              record={r}
              isExpanded={expanded === r.job_id}
              onToggle={() => setExpanded(expanded === r.job_id ? null : r.job_id)}
              onCancel={handleCancel}
            />
          ))
        }
      </div>
    </div>
  );
}

function HistoryRow({ record, isExpanded, onToggle, onCancel }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const { job_id, status, target, total, sent, failed, started_at, finished_at } = record;
  const isRunning = status === 'running';
  const isCanceled = status === 'canceled';
  const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const statusColor = isRunning ? 'var(--color-green)' : isCanceled ? '#ef4444' : failed > 0 ? '#facc15' : 'var(--color-green)';
  const StatusIcon = isRunning ? Clock : isCanceled ? XCircle : CheckCircle;

  return (
    <div style={{
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border-hover)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
    >
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto auto',
          gap: '0.75rem',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          cursor: 'pointer',
        }}
      >
        {/* Status + target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <StatusIcon
            size={16}
            style={{
              color: statusColor,
              flexShrink: 0,
              animation: isRunning ? 'spin 1.5s linear infinite' : 'none',
            }}
          />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {TARGET_LABEL[target] ?? target}
            </span>
            <span style={{
              marginLeft: 8, fontSize: '0.6875rem', fontWeight: 500,
              padding: '2px 7px', borderRadius: 4,
              background: isRunning ? 'rgba(34,197,94,0.1)' : isCanceled ? 'rgba(239,68,68,0.1)' : 'rgba(100,100,100,0.15)',
              color: isRunning ? 'var(--color-green)' : isCanceled ? '#ef4444' : 'var(--color-text-muted)',
            }}>
              {isRunning ? 'Em andamento' : isCanceled ? 'Cancelado' : 'Concluído'}
            </span>
            {isRunning && (
               isConfirming ? (
                 <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                   <button onClick={(e) => { e.stopPropagation(); setIsConfirming(false); onCancel(job_id); }} style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: '#ef4444', color: '#fff', border: 'none' }}>
                     Sim, parar
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); setIsConfirming(false); }} style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                     Não
                   </button>
                 </div>
               ) : (
                 <button
                   onClick={(e) => { e.stopPropagation(); setIsConfirming(true); }}
                   style={{
                     marginLeft: 8, fontSize: '0.6875rem', fontWeight: 600,
                     padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                     background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                     border: '1px solid rgba(239,68,68,0.2)'
                   }}
                   onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                   onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                 >
                   Parar
                 </button>
               )
            )}
          </div>
        </div>

        {/* Counts */}
        <MiniCount icon={<CheckCircle size={12} />} value={sent} color="var(--color-green)" />
        <MiniCount icon={<XCircle size={12} />} value={failed} color={failed > 0 ? '#ef4444' : 'var(--color-text-muted)'} />
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {fmtDate(started_at)}
        </span>
        {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--color-bg-card)' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: failed > 0 ? 'linear-gradient(90deg, var(--color-green), #facc15)' : 'var(--color-green)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
          <Detail label="Total" value={total?.toLocaleString('pt-BR')} />
          <Detail label="Enviados" value={sent?.toLocaleString('pt-BR')} color="var(--color-green)" />
          <Detail label="Falhas" value={failed?.toLocaleString('pt-BR')} color={failed > 0 ? '#ef4444' : undefined} />
          <Detail label="Progresso" value={`${pct}%`} />
          <Detail label="Iniciado" value={fmtDate(started_at)} />
          <Detail label="Finalizado" value={fmtDate(finished_at)} />
          <Detail label="Job ID" value={job_id?.slice(0, 8) + '…'} mono />
        </div>
      )}
    </div>
  );
}

function MiniCount({ icon, value, color }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.8125rem', fontWeight: 600, color }}>
      {icon} {value?.toLocaleString('pt-BR') ?? '—'}
    </span>
  );
}

function Detail({ label, value, color, mono }) {
  return (
    <div>
      <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: color ?? 'var(--color-text)', fontFamily: mono ? 'monospace' : undefined }}>{value ?? '—'}</p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ height: 52, borderRadius: 10, background: 'var(--color-bg-elevated)', animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
}
