import { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

export default function SalesDashboard() {
  const [summary, setSummary]           = useState({ today: 0, count: 0, ticket: 0 });
  const [offsetConfig, setOffsetConfig] = useState({ today: 0, count: 0, ontemVal: 0, ontemCount: 0, mesVal: 0, metaGoal: 1000000 });
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [platformsData, setPlatformsData] = useState({
    PerfectPay:          { value: 0, color: '#3b82f6', label: 'PerfectPay' },
    Payt:                { value: 0, color: '#f59e0b', label: 'Payt' },
    Kirvano:             { value: 0, color: '#10b981', label: 'Kirvano' },
    'XP Empresas (Pix)': { value: 0, color: '#8b5cf6', label: 'XP (Pix)' },
    Pix:                 { value: 0, color: '#a78bfa', label: 'Pix' },
  });
  const [recentSales, setRecentSales] = useState([]);
  const seenSaleIds = useRef(new Set());

  // ── Histórico 7 dias ────────────────────────────────────────────────────────
  const [showHistory, setShowHistory]   = useState(false);
  const [historyData, setHistoryData]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Calendário / Range ──────────────────────────────────────────────────────
  const [showCalendar, setShowCalendar] = useState(false);
  const [calStart, setCalStart]         = useState('');
  const [calEnd, setCalEnd]             = useState('');
  const [calData, setCalData]           = useState([]);
  const [calLoading, setCalLoading]     = useState(false);
  const [calTotal, setCalTotal]         = useState(null);

  const fmtMon = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // ── Inicialização ───────────────────────────────────────────────────────────
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const savedDate = localStorage.getItem('sales_offset_date');
    let offsetVal = 0, offsetCount = 0;
    if (savedDate === todayStr) {
      offsetVal   = parseFloat(localStorage.getItem('sales_offset_value')  || '0');
      offsetCount = parseInt(localStorage.getItem('sales_offset_count')   || '0');
    } else {
      localStorage.removeItem('sales_offset_value');
      localStorage.removeItem('sales_offset_count');
      localStorage.setItem('sales_offset_date', todayStr);
    }
    const mesV  = parseFloat(localStorage.getItem('sales_mes_value')   || '0');
    const metaG = parseFloat(localStorage.getItem('sales_meta_goal')   || '1000000');

    // Busca Ontem automaticamente do Supabase (substitui localStorage de ontem)
    let ontemV = parseFloat(localStorage.getItem('sales_ontem_value') || '0');
    let ontemC = parseInt(localStorage.getItem('sales_ontem_count')  || '0');

    fetch('/api/sales/history?days=2')
      .then(r => r.json())
      .then(data => {
        if (data.history && data.history.length >= 2) {
          const ontemDay = data.history[0]; // dias=[0]=anteontem, [1]=hoje → history tem 2 dias, [0]=ontem
          // history retorna do mais antigo ao mais novo, então [0]=ontem, [1]=hoje quando days=2
          if (ontemDay && ontemDay.total > 0) {
            ontemV = ontemDay.total;
            ontemC = ontemDay.count;
            localStorage.setItem('sales_ontem_value', ontemV.toString());
            localStorage.setItem('sales_ontem_count', ontemC.toString());
          }
        }
        setOffsetConfig({ today: offsetVal, count: offsetCount, ontemVal: ontemV, ontemCount: ontemC, mesVal: mesV, metaGoal: metaG });
      })
      .catch(() => {
        setOffsetConfig({ today: offsetVal, count: offsetCount, ontemVal: ontemV, ontemCount: ontemC, mesVal: mesV, metaGoal: metaG });
      });

    // Vendas de hoje
    fetch('/api/sales/today')
      .then(r => r.json())
      .then(data => {
        if (data.sales) {
          const dbSales  = data.sales;
          const totalVal = dbSales.reduce((acc, cur) => acc + cur.value, 0);
          setSummary({ today: totalVal, count: dbSales.length, ticket: dbSales.length > 0 ? totalVal / dbSales.length : 0 });
          const last50 = dbSales.slice(-50).map(s => {
            seenSaleIds.current.add(s.id);
            return { ...s, time: new Date((s.created_at || '') + (s.created_at?.includes('+') || s.created_at?.includes('Z') ? '' : 'Z')).toLocaleTimeString('pt-BR') };
          });
          setRecentSales(last50);
          setPlatformsData(prev => {
            const plt = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v }]));
            dbSales.forEach(s => {
              const pKey = Object.keys(plt).find(k => k.toLowerCase() === s.platform?.toLowerCase()) || 'Kirvano';
              plt[pKey].value += s.value;
            });
            return plt;
          });
        }
      })
      .catch(e => console.error("Erro ao puxar vendas:", e));
  }, []);

  // ── SSE ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/api/sales/stream');
    es.addEventListener('new_sale', (e) => {
      const data = JSON.parse(e.data);
      if (seenSaleIds.current.has(data.id)) return;
      seenSaleIds.current.add(data.id);
      setRecentSales(prev => [...prev, { ...data, time: 'Agora mesmo' }].slice(-50));
      setSummary(prev => {
        const nc = prev.count + 1;
        const nt = prev.today + data.value;
        return { today: nt, count: nc, ticket: nt / nc };
      });
      setPlatformsData(prev => {
        const pKey = Object.keys(prev).find(k => k.toLowerCase() === (data.platform || '').toLowerCase()) || 'Kirvano';
        return { ...prev, [pKey]: { ...prev[pKey], value: prev[pKey].value + data.value } };
      });
    });
    es.addEventListener('delete_sale', (e) => {
      const data = JSON.parse(e.data);
      setRecentSales(prev => {
        const deleted = prev.find(s => s.id === data.id);
        const platName = data.platform || deleted?.platform || 'Kirvano';
        setSummary(s => {
          const nc = Math.max(0, s.count - 1);
          const nt = Math.max(0, s.today - data.value);
          return { today: nt, count: nc, ticket: nc > 0 ? nt / nc : 0 };
        });
        setPlatformsData(plt => {
          const pKey = Object.keys(plt).find(k => k.toLowerCase() === platName.toLowerCase()) || 'Kirvano';
          return { ...plt, [pKey]: { ...plt[pKey], value: Math.max(0, plt[pKey].value - data.value) } };
        });
        return prev.filter(s => s.id !== data.id);
      });
    });
    return () => es.close();
  }, []);

  // ── Histórico 7 dias ────────────────────────────────────────────────────────
  const fetchHistory = async () => {
    if (historyData.length > 0) return; // já carregado
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/sales/history?days=7');
      const data = await res.json();
      setHistoryData(data.history || []);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    if (!showHistory) fetchHistory();
    setShowHistory(v => !v);
    setShowCalendar(false);
  };

  // ── Calendário ──────────────────────────────────────────────────────────────
  const fetchCalendar = async () => {
    if (!calStart || !calEnd) return;
    setCalLoading(true);
    try {
      const res  = await fetch(`/api/sales/range?start=${calStart}&end=${calEnd}`);
      const data = await res.json();
      const rows = data.range || [];
      setCalData(rows);
      setCalTotal({ total: rows.reduce((s, r) => s + r.total, 0), count: rows.reduce((s, r) => s + r.count, 0) });
    } catch (e) {
      console.error(e);
    } finally {
      setCalLoading(false);
    }
  };

  const toggleCalendar = () => {
    setShowCalendar(v => !v);
    setShowHistory(false);
    if (!calStart || !calEnd) {
      // Default: mês atual
      const now = new Date();
      const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setCalStart(`${y}-${m}-01`);
      setCalEnd(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    }
  };

  const handleDeleteSale = async (sale) => {
    if (!window.confirm(`Apagar venda de ${sale.name} (${fmtMon(sale.value)})?`)) return;
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(sale.id)}`, { method: 'DELETE' });
      if (!res.ok) alert("Erro ao apagar venda!");
    } catch (e) { alert("Falha de conexão ao deletar."); }
  };

  // ── Computed ────────────────────────────────────────────────────────────────
  const totalValue  = summary.today + offsetConfig.today;
  const totalCount  = summary.count + offsetConfig.count;
  const totalTicket = totalCount > 0 ? totalValue / totalCount : 0;
  const volumeTotal = (offsetConfig.mesVal || 0) + totalValue;
  const metaAlvo    = offsetConfig.metaGoal || 1000000;
  const maxHistory  = historyData.length > 0 ? Math.max(...historyData.map(d => d.total), 1) : 1;

  const todayStr = new Date().toISOString().split('T')[0];
  const DIAS_PT  = { Mon: 'Seg', Tue: 'Ter', Wed: 'Qua', Thu: 'Qui', Fri: 'Sex', Sat: 'Sáb', Sun: 'Dom' };
  const dayLabel = (dateStr) => {
    if (dateStr === todayStr) return 'Hoje';
    const d = new Date(dateStr + 'T12:00:00');
    const en = d.toLocaleDateString('en-US', { weekday: 'short' });
    return DIAS_PT[en] || en;
  };
  const shortDate = (dateStr) => {
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Platform status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', padding: '0 0.25rem', flexWrap: 'wrap' }}>
        {Object.values(platformsData).map(p => (
          <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }} />
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>{p.label}</span>
          </div>
        ))}
        <button onClick={() => setIsModalOpen(true)} style={{ marginLeft: 4, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, padding: '3px 8px', fontSize: '0.6875rem', cursor: 'pointer' }}>
          ⚙ Config
        </button>
      </div>

      {/* Hero Card – Receita de Hoje */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12,
      }}>
        {/* Glow top */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--color-green), transparent)' }} />

        <div style={{ padding: '2rem 1.75rem 1.5rem' }}>
          {/* Label row com botões */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>Receita de Hoje</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {/* Botão calendário */}
              <button
                onClick={toggleCalendar}
                title="Ver por período"
                style={{
                  background: showCalendar ? 'rgba(34,197,94,0.1)' : 'transparent',
                  border: `1px solid ${showCalendar ? 'var(--color-green)' : 'var(--color-border)'}`,
                  color: showCalendar ? 'var(--color-green)' : 'var(--color-text-muted)',
                  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Período
              </button>
            </div>
          </div>

          {/* Big number */}
          <div style={{ fontSize: 'clamp(2.25rem, 5.5vw, 3.5rem)', fontWeight: 900, color: 'var(--color-green)', letterSpacing: '-1.5px', lineHeight: 1.05, textShadow: '0 0 40px rgba(34,197,94,0.3)', fontVariantNumeric: 'tabular-nums' }}>
            <AnimatedNumber value={totalValue} formatter={fmtMon} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Ontem: <span style={{ color: 'var(--color-text-subtle)' }}>{fmtMon(offsetConfig.ontemVal || 0)}</span>
            </span>
            {(offsetConfig.mesVal || 0) > 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Mês: <span style={{ color: 'var(--color-text-subtle)' }}>{fmtMon(volumeTotal)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Botão expandir histórico */}
        <button
          onClick={toggleHistory}
          style={{
            width: '100%', padding: '0.625rem',
            background: showHistory ? 'rgba(34,197,94,0.06)' : 'transparent',
            border: 'none', borderTop: '1px solid var(--color-border)',
            color: showHistory ? 'var(--color-green)' : 'var(--color-text-muted)',
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.2s',
            letterSpacing: '0.5px'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-green)'; e.currentTarget.style.background = 'rgba(34,197,94,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = showHistory ? 'var(--color-green)' : 'var(--color-text-muted)'; e.currentTarget.style.background = showHistory ? 'rgba(34,197,94,0.06)' : 'transparent'; }}
        >
          <svg
            width="13" height="13"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          {showHistory ? 'Ocultar últimos 7 dias' : 'Ver últimos 7 dias'}
        </button>
      </div>

      {/* Painel: Últimos 7 Dias */}
      {showHistory && (
        <div style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: 12, padding: '1.25rem 1.5rem',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Últimos 7 Dias
          </div>
          {historyLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1rem', fontSize: '0.875rem' }}>Carregando...</div>
          ) : historyData.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#444', padding: '1rem', fontSize: '0.875rem' }}>
              Histórico disponível após configurar Supabase.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {historyData.map((day) => {
                const isToday = day.date === todayStr;
                const pct = maxHistory > 0 ? Math.max(3, (day.total / maxHistory) * 100) : 0;
                return (
                  <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ minWidth: 36, textAlign: 'right' }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: isToday ? 'var(--color-green)' : 'var(--color-text-muted)' }}>{dayLabel(day.date)}</div>
                      <div style={{ fontSize: '0.5625rem', color: '#444' }}>{shortDate(day.date)}</div>
                    </div>
                    <div style={{ flex: 1, height: 20, background: 'var(--color-bg-elevated)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        height: '100%', width: `${day.total > 0 ? pct : 0}%`,
                        background: isToday ? 'var(--color-green)' : 'rgba(34,197,94,0.3)',
                        borderRadius: 4, transition: 'width 0.6s ease',
                        boxShadow: isToday ? '0 0 10px rgba(34,197,94,0.4)' : 'none'
                      }} />
                    </div>
                    <div style={{ minWidth: 90, textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: isToday ? 'var(--color-green)' : 'var(--color-text)' }}>{fmtMon(day.total)}</div>
                      <div style={{ fontSize: '0.5625rem', color: '#444' }}>{day.count} {day.count === 1 ? 'venda' : 'vendas'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Painel: Calendário / Período */}
      {showCalendar && (
        <div style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: 12, padding: '1.25rem 1.5rem',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Consulta por Período
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>De</label>
              <input
                type="date"
                value={calStart}
                onChange={e => setCalStart(e.target.value)}
                className="input"
                style={{ width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Até</label>
              <input
                type="date"
                value={calEnd}
                onChange={e => setCalEnd(e.target.value)}
                className="input"
                style={{ width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <button
              onClick={fetchCalendar}
              disabled={!calStart || !calEnd || calLoading}
              className="btn-primary"
              style={{ padding: '0.5rem 1.25rem', flexShrink: 0 }}
            >
              {calLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {calTotal && (
            <div style={{
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.875rem',
              display: 'flex', gap: '1.5rem', flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Total do Período</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-green)' }}>{fmtMon(calTotal.total)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Total de Vendas</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)' }}>{calTotal.count}</div>
              </div>
              {calTotal.count > 0 && (
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Ticket Médio</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)' }}>{fmtMon(calTotal.total / calTotal.count)}</div>
                </div>
              )}
            </div>
          )}

          {calData.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 260, overflowY: 'auto' }}>
              {calData.map(day => {
                const isToday = day.date === todayStr;
                const maxCal = Math.max(...calData.map(d => d.total), 1);
                const pct = Math.max(2, (day.total / maxCal) * 100);
                const [y, m, d] = day.date.split('-');
                return (
                  <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ minWidth: 56, fontSize: '0.6875rem', color: isToday ? 'var(--color-green)' : 'var(--color-text-muted)', fontWeight: isToday ? 700 : 400 }}>
                      {d}/{m}/{y.slice(2)}
                    </div>
                    <div style={{ flex: 1, height: 16, background: 'var(--color-bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${day.total > 0 ? pct : 0}%`, background: isToday ? 'var(--color-green)' : 'rgba(34,197,94,0.35)', borderRadius: 3, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ minWidth: 100, textAlign: 'right' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: isToday ? 'var(--color-green)' : 'var(--color-text)' }}>{fmtMon(day.total)}</span>
                      <span style={{ fontSize: '0.5625rem', color: '#555', marginLeft: 4 }}>({day.count})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stat tiles row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>Vendas Hoje</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            <AnimatedNumber value={totalCount} formatter={v => Math.round(v).toString()} />
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Ontem: {offsetConfig.ontemCount || 0}
          </div>
        </div>
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>Ticket Médio</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            <AnimatedNumber value={totalTicket} formatter={fmtMon} />
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {offsetConfig.ontemCount > 0 ? `Ontem: ${fmtMon((offsetConfig.ontemVal || 0) / offsetConfig.ontemCount)}` : '\u00a0'}
          </div>
        </div>
      </div>

      {/* Origem das Vendas */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Origem das Vendas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {Object.values(platformsData).filter(p => p.value > 0).map(p => {
            const allTotal = Object.values(platformsData).reduce((acc, pl) => acc + pl.value, 0);
            const pct = allTotal > 0 ? Math.min(100, (p.value / allTotal) * 100) : 0;
            return (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', minWidth: 110 }}>{p.label}</span>
                <div style={{ flex: 1, height: 4, background: 'var(--color-bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: p.color, borderRadius: 99, transition: 'width 0.6s ease-out' }} />
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 80, textAlign: 'right' }}>{fmtMon(p.value)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feed de Transações */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Feed de Transações</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6875rem', color: 'var(--color-green)' }}>
            <div className="live-dot" style={{ width: 6, height: 6 }} /> Ao Vivo
          </span>
        </div>
        <div style={{ overflowY: 'scroll', maxHeight: 480, scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border-hover) transparent' }}>
          {recentSales.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#444', fontSize: '0.875rem' }}>Aguardando transações...</div>
          ) : (
            [...recentSales].reverse().map((sale, i) => (
              <div key={sale.id + '_' + i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.9rem 1.5rem',
                  borderBottom: i < recentSales.length - 1 ? '1px solid #111' : 'none',
                  transition: 'background 0.15s', animation: 'fadeIn 0.3s ease-out'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#111'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#e0e0e0' }}>{sale.name}</span>
                    <span style={{ fontSize: '0.5625rem', padding: '1px 5px', borderRadius: 3, background: '#1a1a1a', color: '#555', fontWeight: 600 }}>
                      {sale.platform}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#444' }}>{sale.product}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-green)', marginBottom: 2 }}>
                    {fmtMon(sale.value)}
                    <button
                      onClick={() => handleDeleteSale(sale)}
                      style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', padding: '0 0 0 6px', verticalAlign: 'middle' }}
                      title="Remover"
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#333'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#444' }}>{sale.time}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <ConfigModal onClose={() => setIsModalOpen(false)} offsetConfig={offsetConfig} setOffsetConfig={setOffsetConfig} />
      )}
    </div>
  );
}

// ── AnimatedNumber ────────────────────────────────────────────────────────────
function AnimatedNumber({ value, formatter }) {
  const [displayValue, setDisplayValue] = useState(value);
  useEffect(() => {
    let startTimestamp = null;
    const duration = 1000;
    const startValue = displayValue;
    const change = value - startValue;
    if (change === 0) return;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 5);
      setDisplayValue(startValue + change * easeOut);
      if (progress < 1) window.requestAnimationFrame(step);
      else setDisplayValue(value);
    };
    window.requestAnimationFrame(step);
  }, [value]);
  return <span>{formatter ? formatter(displayValue) : displayValue}</span>;
}

// ── ConfigModal ───────────────────────────────────────────────────────────────
function ConfigModal({ onClose, offsetConfig, setOffsetConfig }) {
  const [tab, setTab]           = useState('offset');
  const [valPix, setValPix]     = useState(offsetConfig.today.toString());
  const [countPix, setCountPix] = useState(offsetConfig.count.toString());
  const [ontemVal, setOntemVal] = useState((offsetConfig.ontemVal || 0).toString());
  const [ontemCount, setOntemCount] = useState((offsetConfig.ontemCount || 0).toString());
  const [mesVal, setMesVal]     = useState((offsetConfig.mesVal || 0).toString());
  const [metaGoal, setMetaGoal] = useState((offsetConfig.metaGoal || 1000000).toString());
  const [manPlat, setManPlat]   = useState('XP Empresas (Pix)');
  const [manName, setManName]   = useState('');
  const [manProd, setManProd]   = useState('');
  const [manVal, setManVal]     = useState('');
  const [manDate, setManDate]   = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bulkJson, setBulkJson] = useState('');

  const handleSaveOffset = () => {
    const v = parseFloat(valPix) || 0;
    const c = parseInt(countPix) || 0;
    const ov = parseFloat(ontemVal) || 0;
    const oc = parseInt(ontemCount) || 0;
    const mv = parseFloat(mesVal) || 0;
    const mg = parseFloat(metaGoal) || 1000000;
    setOffsetConfig({ today: v, count: c, ontemVal: ov, ontemCount: oc, mesVal: mv, metaGoal: mg });
    localStorage.setItem('sales_offset_value', v.toString());
    localStorage.setItem('sales_offset_count', c.toString());
    localStorage.setItem('sales_ontem_value', ov.toString());
    localStorage.setItem('sales_ontem_count', oc.toString());
    localStorage.setItem('sales_mes_value', mv.toString());
    localStorage.setItem('sales_meta_goal', mg.toString());
    onClose();
  };

  const handleManualSale = async () => {
    if (!manName || !manVal) return alert('Preencha nome e valor');
    setIsLoading(true);
    try {
      const body = {
        name: manName,
        product: manProd || 'Produto',
        value: parseFloat(manVal.replace(',', '.')),
        platform: manPlat,
      };
      if (manDate) body.created_at = manDate;
      await fetch('/api/sales/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setManName(''); setManVal(''); setManDate('');
      alert('Venda lançada!');
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const handleBulkImport = async () => {
    try {
      const sanitized = bulkJson
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
      const list = JSON.parse(sanitized);
      if (!Array.isArray(list)) return alert('Deve ser uma lista (Array) JSON.');
      setIsLoading(true);
      for (const item of list) {
        await fetch('/api/sales/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:       item.name || 'Cliente',
            product:    item.product || 'Produto',
            value:      parseFloat(item.value) || 0.0,
            platform:   item.platform || 'Kirvano',
            created_at: item.created_at || undefined
          })
        });
        await new Promise(r => setTimeout(r, 150));
      }
      alert(`${list.length} vendas importadas com sucesso!`);
      setBulkJson('');
    } catch (e) {
      alert(`Erro no JSON: ${e.message}`);
    }
    setIsLoading(false);
  };

  const tabStyle = (t) => ({
    padding: '8px 12px', background: 'transparent', border: 'none',
    color: tab === t ? 'var(--color-green)' : 'var(--color-text-muted)',
    borderBottom: tab === t ? '2px solid var(--color-green)' : '2px solid transparent',
    cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem'
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
      <div className="card" style={{ width: 450, maxWidth: '90vw', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Maleta de Operações</h2>
        <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => setTab('offset')} style={tabStyle('offset')}>Cofre Base</button>
          <button onClick={() => setTab('manual')} style={tabStyle('manual')}>Lançador</button>
          <button onClick={() => setTab('bulk')} style={tabStyle('bulk')}>Lote Oculto</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tab === 'offset' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Valores protegidos que somam ao total sem aparecer no feed.</p>
              <div><label style={{ fontSize: 14, color: 'var(--color-green)', fontWeight: 600 }}>Receita Oculta Hoje (R$)</label>
                <input type="number" value={valPix} onChange={e => setValPix(e.target.value)} className="input" placeholder="0.00" style={{ marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-green)', fontWeight: 600 }}>Quantidade Oculta Hoje</label>
                <input type="number" value={countPix} onChange={e => setCountPix(e.target.value)} className="input" placeholder="0" style={{ marginTop: 4 }} /></div>
              <hr style={{ borderColor: 'var(--color-border)', margin: '4px 0' }} />
              <div><label style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 600 }}>Receita de ONTEM (R$)</label>
                <input type="number" value={ontemVal} onChange={e => setOntemVal(e.target.value)} className="input" placeholder="Ex: 5000.00" style={{ marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 600 }}>Qtd de Vendas ONTEM</label>
                <input type="number" value={ontemCount} onChange={e => setOntemCount(e.target.value)} className="input" placeholder="Ex: 20" style={{ marginTop: 4 }} /></div>
              <hr style={{ borderColor: 'var(--color-border)', margin: '4px 0' }} />
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Faturamento Base Mês (R$)</label>
                <input type="number" value={mesVal} onChange={e => setMesVal(e.target.value)} className="input" placeholder="Ex: 50000.00" style={{ marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Meta Personalizada (R$)</label>
                <input type="number" value={metaGoal} onChange={e => setMetaGoal(e.target.value)} className="input" placeholder="Ex: 1000000" style={{ marginTop: 4 }} /></div>
              <button className="btn-primary" onClick={handleSaveOffset} style={{ marginTop: 8 }}>Salvar Configuração</button>
            </div>
          )}

          {tab === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Plataforma</label>
                <select className="input" value={manPlat} onChange={e => setManPlat(e.target.value)} style={{ marginTop: 4 }}>
                  <option>XP Empresas (Pix)</option><option>PerfectPay</option><option>Payt</option><option>Kirvano</option>
                </select></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Nome do Cliente</label>
                <input type="text" value={manName} onChange={e => setManName(e.target.value)} className="input" placeholder="João da Silva" style={{ marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Produto (opcional)</label>
                <input type="text" value={manProd} onChange={e => setManProd(e.target.value)} className="input" placeholder="ZeroLoss" style={{ marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Valor (R$)</label>
                <input type="text" value={manVal} onChange={e => setManVal(e.target.value)} className="input" placeholder="97.00" style={{ marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Data/Hora (opcional)</label>
                <input type="datetime-local" value={manDate} onChange={e => setManDate(e.target.value)} className="input" style={{ marginTop: 4 }} /></div>
              <button className="btn-primary" onClick={handleManualSale} disabled={isLoading} style={{ marginTop: 8 }}>
                {isLoading ? 'Enviando...' : 'Fazer Lançamento'}
              </button>
            </div>
          )}

          {tab === 'bulk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                Cole um Array JSON com as vendas. Suporte a campo <code style={{ color: 'var(--color-green)' }}>created_at</code> para datas retroativas.
              </p>
              <textarea
                className="input"
                style={{ height: 180, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                placeholder={'[\n  {\n    "name": "Fulano",\n    "value": 150.00,\n    "platform": "Kirvano",\n    "product": "ZeroLoss",\n    "created_at": "2026-04-02T13:53:17"\n  }\n]'}
                value={bulkJson}
                onChange={e => setBulkJson(e.target.value)}
              />
              <button className="btn-primary" onClick={handleBulkImport} disabled={isLoading} style={{ marginTop: 8 }}>
                {isLoading ? 'Importando...' : 'Importar Lote de Vendas'}
              </button>
            </div>
          )}

          <button onClick={onClose} style={{ padding: 12, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 8, cursor: 'pointer', marginTop: 4 }}>
            Cancelar / Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
