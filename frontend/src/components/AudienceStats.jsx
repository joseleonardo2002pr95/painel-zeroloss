import { useEffect, useState, useRef } from 'react';
import { UserPlus, Users, RefreshCw, Wifi } from 'lucide-react';
import axios from 'axios';

export default function AudienceStats() {
  const [stats, setStats] = useState({ leads: 0, clients: 0, totalLeadsRows: 0, totalClientsRows: 0 });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const esRef = useRef(null);

  const connect = () => {
    if (esRef.current) esRef.current.close();

    const es = new EventSource('/api/audience/stream');
    esRef.current = es;

    es.onopen = () => setLive(true);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) {
        setError(data.error);
      } else {
        setError(null);
        setStats({
          leads:            data.leads_count,
          clients:          data.clients_count,
          totalLeadsRows:   data.total_leads_rows   ?? 0,
          totalClientsRows: data.total_clients_rows ?? 0,
        });
        setLastUpdated(data.last_updated);
        setLoading(false);
      }
    };

    es.onerror = () => {
      setLive(false);
      es.close();
      // Tenta reconectar após 5 segundos
      setTimeout(connect, 5000);
    };
  };

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, []);

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      await axios.post('/api/audience/refresh');
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  return (
    <div>
      {/* Status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: live ? 'var(--color-green)' : '#6b7280',
            boxShadow: live ? '0 0 6px var(--color-green)' : 'none',
          }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {live ? 'Conectado ao Google Sheets' : 'Reconectando…'}
          </span>
          {lastUpdated && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              · Atualizado às {lastUpdated}
            </span>
          )}
        </div>

        <button
          onClick={manualRefresh}
          disabled={refreshing}
          title="Forçar atualização da planilha"
          style={{
            background: 'none', border: 'none', cursor: refreshing ? 'not-allowed' : 'pointer',
            color: 'var(--color-text-muted)', padding: 4, borderRadius: 6,
            transition: 'color 0.2s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-green)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
        >
          <RefreshCw
            size={14}
            style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}
          />
          <span style={{ fontSize: '0.75rem' }}>Atualizar agora</span>
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          label="Leads (Nunca Compraram)"
          value={loading ? '…' : stats.leads.toLocaleString('pt-BR')}
          totalRows={stats.totalLeadsRows}
          icon={<UserPlus size={20} />}
          color="#3b82f6"
          glow="rgba(59,130,246,0.12)"
          error={error}
          loading={loading}
        />
        <StatCard
          label="Clientes (Já Compraram)"
          value={loading ? '…' : stats.clients.toLocaleString('pt-BR')}
          totalRows={stats.totalClientsRows}
          icon={<Users size={20} />}
          color="var(--color-green)"
          glow="var(--color-green-glow)"
          error={error}
          loading={loading}
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatCard({ label, value, totalRows, icon, color, glow, error, loading }) {
  return (
    <div className="stat-card">
      <div>
        <p style={{
          fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)',
          marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </p>
        <p style={{
          fontSize: '2.125rem', fontWeight: 700,
          color: error ? '#ef4444' : 'var(--color-text)',
          lineHeight: 1,
        }}>
          {error ? '—' : value}
        </p>
        {!error && !loading && totalRows > 0 && (
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 5 }}>
            Total na planilha: {totalRows.toLocaleString('pt-BR')}
          </p>
        )}
        {error && (
          <p style={{ fontSize: '0.6875rem', color: '#ef4444', marginTop: 4 }}>
            Erro ao conectar à planilha
          </p>
        )}
      </div>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: glow,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0,
      }}>
        {icon}
      </div>
    </div>
  );
}
