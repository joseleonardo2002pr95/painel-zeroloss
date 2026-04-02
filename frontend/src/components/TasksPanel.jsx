import { useState, useEffect, useCallback } from 'react';

// ── Ícones inline ────────────────────────────────────────────────────────────
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconMinus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function getBrtDate() {
  const now = new Date();
  // BRT = UTC-3
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt;
}

function formatDate(d) {
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]}`;
}

function getWeekRange() {
  const now = getBrtDate();
  const dayOfWeek = now.getDay(); // 0 = Dom
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function getWeekNumber() {
  const now = getBrtDate();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil((diff / oneWeek) + 1);
}

// ── Projeto → cor ─────────────────────────────────────────────────────────────
const PROJECT_COLORS = {
  ZeroLoss: '#22c55e',
  Virtual:  '#3b82f6',
  Cashout:  '#f59e0b',
  Wincerto: '#8b5cf6',
  Geral:    '#6b7280',
};
const projectColor = (p) => PROJECT_COLORS[p] || '#6b7280';

// ── Componente Principal ──────────────────────────────────────────────────────
export default function TasksPanel() {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [updating, setUpdating] = useState({}); // { taskId: true }

  const today   = formatDate(getBrtDate());
  const weekNum = getWeekNumber();
  const weekRange = getWeekRange();

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Erro ao buscar tarefas');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setTasks(data.tasks || []);
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    // Recarrega a cada 5 minutos (caso dois usuários usem ao mesmo tempo)
    const interval = setInterval(fetchTasks, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleToggle = async (task, delta) => {
    if (updating[task.id]) return;
    setUpdating(prev => ({ ...prev, [task.id]: true }));

    // Otimista: atualiza localmente primeiro
    setTasks(prev => prev.map(t => {
      if (t.id !== task.id) return t;
      const newCount = Math.max(0, t.current_count + delta);
      return { ...t, current_count: newCount, completed: newCount >= t.target_count };
    }));

    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
      const data = await res.json();
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, current_count: data.count, completed: data.completed } : t
      ));
    } catch (e) {
      // Reverte em caso de erro
      setTasks(prev => prev.map(t => {
        if (t.id !== task.id) return t;
        const reverted = Math.max(0, t.current_count - delta);
        return { ...t, current_count: reverted, completed: reverted >= t.target_count };
      }));
    } finally {
      setUpdating(prev => ({ ...prev, [task.id]: false }));
    }
  };

  // Separa por tipo
  const dailyTasks      = tasks.filter(t => t.frequency === 'daily' || t.frequency === 'custom');
  const weeklyTasks     = tasks.filter(t => t.frequency === 'weekly');
  const continuousTasks = tasks.filter(t => t.frequency === 'continuous');

  const dailyDone  = dailyTasks.filter(t => t.completed).length;
  const weeklyDone = weeklyTasks.filter(t => t.completed).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--color-border)', borderTopColor: 'var(--color-green)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Carregando rotinas...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
        borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
        <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Supabase não configurado</div>
        <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
          Configure as variáveis de ambiente <code style={{ color: 'var(--color-green)', fontFamily: 'monospace' }}>SUPABASE_URL</code> e{' '}
          <code style={{ color: 'var(--color-green)', fontFamily: 'monospace' }}>SUPABASE_KEY</code> no Railway para ativar as Rotinas.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
            Rotinas & Metas ✅
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {today} · Semana {weekNum}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchTasks(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)', borderRadius: 8, padding: '6px 12px',
            fontSize: '0.8125rem', cursor: 'pointer', transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-green)'; e.currentTarget.style.color = 'var(--color-green)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
        >
          <IconRefresh /> Atualizar
        </button>
      </div>

      {/* Progresso geral */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <SummaryBadge
          label="Diárias"
          done={dailyDone}
          total={dailyTasks.length}
          color="#22c55e"
        />
        <SummaryBadge
          label={`Semanais · ${weekRange}`}
          done={weeklyDone}
          total={weeklyTasks.length}
          color="#3b82f6"
        />
      </div>

      {/* Seção: Tarefas Diárias */}
      {dailyTasks.length > 0 && (
        <Section
          title="⚡ Tarefas Diárias"
          badge={`${dailyDone}/${dailyTasks.length}`}
          badgeColor={dailyDone === dailyTasks.length ? '#22c55e' : '#f59e0b'}
          subtitle={`Resetam à meia-noite · ${today}`}
        >
          {dailyTasks.map(task => (
            <DailyTaskRow
              key={task.id}
              task={task}
              onToggle={handleToggle}
              isUpdating={!!updating[task.id]}
            />
          ))}
        </Section>
      )}

      {/* Seção: Metas Semanais */}
      {weeklyTasks.length > 0 && (
        <Section
          title="📅 Metas Semanais"
          badge={`Semana ${weekRange}`}
          badgeColor="#3b82f6"
          subtitle="Resetam toda segunda-feira"
        >
          {weeklyTasks.map(task => (
            <WeeklyTaskRow
              key={task.id}
              task={task}
              onToggle={handleToggle}
              isUpdating={!!updating[task.id]}
            />
          ))}
        </Section>
      )}

      {/* Seção: Metas Contínuas */}
      {continuousTasks.length > 0 && (
        <Section
          title="🔄 Metas Contínuas"
          badge="Em andamento"
          badgeColor="#8b5cf6"
          subtitle="Metas de longo prazo"
        >
          {continuousTasks.map(task => (
            <WeeklyTaskRow
              key={task.id}
              task={task}
              onToggle={handleToggle}
              isUpdating={!!updating[task.id]}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SummaryBadge({ label, done, total, color }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const allDone = done === total && total > 0;
  return (
    <div style={{
      background: 'var(--color-bg-card)', border: `1px solid ${allDone ? color + '44' : 'var(--color-border)'}`,
      borderRadius: 10, padding: '1rem 1.25rem',
      transition: 'border-color 0.3s',
    }}>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 800, color: allDone ? color : 'var(--color-text)' }}>
          {done}<span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>/{total}</span>
        </span>
        {allDone && <span style={{ fontSize: '0.75rem', color, fontWeight: 700 }}>✓ Tudo feito!</span>}
      </div>
      <div style={{ height: 4, background: 'var(--color-bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function Section({ title, badge, badgeColor, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
      borderRadius: 12, overflow: 'hidden'
    }}>
      {/* Header da seção */}
      <div style={{
        padding: '0.875rem 1.5rem',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{title}</span>
          {subtitle && (
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <span style={{
          fontSize: '0.6875rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: badgeColor + '22', color: badgeColor, border: `1px solid ${badgeColor}44`
        }}>
          {badge}
        </span>
      </div>
      {/* Conteúdo */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

function DailyTaskRow({ task, onToggle, isUpdating }) {
  const done = task.completed;
  const color = projectColor(task.project);
  const isCustom = task.frequency === 'custom';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem',
      padding: '0.875rem 1.5rem',
      borderBottom: '1px solid var(--color-border)',
      transition: 'background 0.15s',
      opacity: isUpdating ? 0.6 : 1,
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task, done ? -1 : 1)}
        disabled={isUpdating}
        style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          border: done ? 'none' : '2px solid var(--color-border)',
          background: done ? color : 'transparent',
          color: '#000', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s', boxShadow: done ? `0 0 8px ${color}55` : 'none'
        }}
      >
        {done && <IconCheck />}
      </button>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.9375rem', fontWeight: 500,
          color: done ? 'var(--color-text-muted)' : 'var(--color-text)',
          textDecoration: done ? 'line-through' : 'none',
          transition: 'all 0.2s'
        }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <ProjectTag project={task.project} color={color} />
          {isCustom && task.custom_interval_days && (
            <span style={{ fontSize: '0.625rem', color: '#6b7280', background: '#1a1a1a', padding: '1px 6px', borderRadius: 4 }}>
              a cada {task.custom_interval_days} dias
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {done ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>✓ Feito</span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Pendente</span>
        )}
      </div>
    </div>
  );
}

function WeeklyTaskRow({ task, onToggle, isUpdating }) {
  const done = task.completed;
  const count = task.current_count || 0;
  const target = task.target_count || 1;
  const pct = Math.min(100, (count / target) * 100);
  const color = projectColor(task.project);

  return (
    <div style={{
      padding: '1rem 1.5rem',
      borderBottom: '1px solid var(--color-border)',
      opacity: isUpdating ? 0.6 : 1,
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Linha superior: título + contador */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{
            fontSize: '0.9375rem', fontWeight: 500,
            color: done ? color : 'var(--color-text)'
          }}>
            {task.title}
            {done && <span style={{ marginLeft: 6, fontSize: '0.75rem', color }}>✓</span>}
          </div>
          <div style={{ marginTop: 3 }}>
            <ProjectTag project={task.project} color={color} />
          </div>
        </div>

        {/* Contador +/- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'center' }}>
            {count}/{target}
          </span>
          <button
            onClick={() => onToggle(task, -1)}
            disabled={isUpdating || count === 0}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', opacity: count === 0 ? 0.3 : 1
            }}
            onMouseEnter={e => { if (count > 0) { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
          >
            <IconMinus />
          </button>
          <button
            onClick={() => onToggle(task, 1)}
            disabled={isUpdating}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: done ? color + '22' : 'var(--color-bg-elevated)',
              border: `1px solid ${done ? color + '44' : 'var(--color-border)'}`,
              color: done ? color : 'var(--color-text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = done ? color + '44' : 'var(--color-border)'; e.currentTarget.style.color = done ? color : 'var(--color-text-muted)'; }}
          >
            <IconPlus />
          </button>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ height: 5, background: 'var(--color-bg-base)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct >= 100 ? color : `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 99,
          transition: 'width 0.4s ease',
          boxShadow: pct >= 100 ? `0 0 8px ${color}88` : 'none'
        }} />
      </div>
    </div>
  );
}

function ProjectTag({ project, color }) {
  return (
    <span style={{
      fontSize: '0.625rem', fontWeight: 700,
      padding: '1px 7px', borderRadius: 99,
      background: color + '22', color, border: `1px solid ${color}33`,
      letterSpacing: '0.3px'
    }}>
      {project}
    </span>
  );
}
