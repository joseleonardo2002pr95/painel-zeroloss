import { useState, useEffect, useCallback } from 'react';

// ── Ícones ────────────────────────────────────────────────────────────────────
const IconCheck  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconPlus   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconMinus  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconTrash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IconRefresh = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IconClose  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getBrtDate() {
  const now = new Date();
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}
function formatDate(d) {
  const dias   = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const meses  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]}`;
}
function getWeekRange() {
  const now = getBrtDate();
  const dow = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  return `${fmt(mon)} – ${fmt(sun)}`;
}
function getWeekNumber() {
  const now = getBrtDate();
  return Math.ceil(((now - new Date(now.getFullYear(),0,1)) / (7*24*60*60*1000)) + 1);
}

// ── Projetos disponíveis ──────────────────────────────────────────────────────
const PROJECTS = ['ZeroLoss', 'Virtual', 'Cashout', 'Wincerto', 'Geral'];
const PROJECT_COLORS = { ZeroLoss:'#22c55e', Virtual:'#3b82f6', Cashout:'#f59e0b', Wincerto:'#8b5cf6', Geral:'#6b7280' };
const projectColor = (p) => PROJECT_COLORS[p] || '#6b7280';

// ── Tipos / frequências ───────────────────────────────────────────────────────
const FREQ_OPTIONS = [
  { value: 'daily',      label: 'Diária',                type: 'daily'      },
  { value: 'weekly',     label: 'Semanal',               type: 'weekly'     },
  { value: 'continuous', label: 'Contínua / Meta',       type: 'continuous' },
  { value: 'custom',     label: 'Personalizada (N dias)', type: 'daily'      },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function TasksPanel() {
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [updating, setUpdating]   = useState({});
  const [showModal, setShowModal] = useState(false);

  const today    = formatDate(getBrtDate());
  const weekNum  = getWeekNumber();
  const weekRange = getWeekRange();

  const fetchTasks = useCallback(async () => {
    try {
      const res  = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Erro ao buscar tarefas');
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setTasks(data.tasks || []); setError(null); }
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTasks();
    const t = setInterval(fetchTasks, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchTasks]);

  // ── Toggle conclusão ────────────────────────────────────────────────────────
  const handleToggle = async (task, delta) => {
    if (updating[task.id]) return;
    setUpdating(p => ({ ...p, [task.id]: true }));
    setTasks(prev => prev.map(t => {
      if (t.id !== task.id) return t;
      const nc = Math.max(0, t.current_count + delta);
      return { ...t, current_count: nc, completed: nc >= t.target_count };
    }));
    try {
      const res  = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, current_count: data.count, completed: data.completed } : t));
    } catch {
      setTasks(prev => prev.map(t => {
        if (t.id !== task.id) return t;
        const rev = Math.max(0, t.current_count - delta);
        return { ...t, current_count: rev, completed: rev >= t.target_count };
      }));
    } finally { setUpdating(p => ({ ...p, [task.id]: false })); }
  };

  // ── Deletar tarefa ──────────────────────────────────────────────────────────
  const handleDelete = async (task) => {
    if (!window.confirm(`Remover "${task.title}"?`)) return;
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (e) { alert('Erro ao remover tarefa.'); }
  };

  // ── Criar tarefa ────────────────────────────────────────────────────────────
  const handleCreate = async (payload) => {
    const res  = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Erro ao criar tarefa');
    await fetchTasks();
    setShowModal(false);
  };

  // ── Agrupamentos ────────────────────────────────────────────────────────────
  const dailyTasks      = tasks.filter(t => t.frequency === 'daily' || t.frequency === 'custom');
  const weeklyTasks     = tasks.filter(t => t.frequency === 'weekly');
  const continuousTasks = tasks.filter(t => t.frequency === 'continuous');
  const dailyDone  = dailyTasks.filter(t => t.completed).length;
  const weeklyDone = weeklyTasks.filter(t => t.completed).length;

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, flexDirection:'column', gap:12 }}>
      <div style={{ width:28, height:28, border:'2px solid var(--color-border)', borderTopColor:'var(--color-green)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <span style={{ color:'var(--color-text-muted)', fontSize:'0.875rem' }}>Carregando rotinas...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background:'var(--color-bg-card)', border:'1px solid var(--color-border)', borderRadius:12, padding:'2rem', textAlign:'center', color:'var(--color-text-muted)' }}>
      <div style={{ fontSize:'2rem', marginBottom:8 }}>⚠️</div>
      <div style={{ fontWeight:600, color:'var(--color-text)', marginBottom:6 }}>Supabase não configurado</div>
      <div style={{ fontSize:'0.875rem' }}>
        Configure <code style={{ color:'var(--color-green)', fontFamily:'monospace' }}>SUPABASE_URL</code> e{' '}
        <code style={{ color:'var(--color-green)', fontFamily:'monospace' }}>SUPABASE_KEY</code> no Railway.
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem', animation:'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
        <div>
          <h1 style={{ fontSize:'clamp(1.25rem,4vw,1.75rem)', fontWeight:700, color:'var(--color-text)', marginBottom:4 }}>Rotinas & Metas ✅</h1>
          <p style={{ color:'var(--color-text-muted)', fontSize:'0.875rem' }}>{today} · Semana {weekNum}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { setLoading(true); fetchTasks(); }} style={btnSecStyle}>
            <IconRefresh /> Atualizar
          </button>
          <button onClick={() => setShowModal(true)} style={btnPrimStyle}>
            <IconPlus /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'0.75rem' }}>
        <SummaryBadge label="Diárias"                    done={dailyDone}  total={dailyTasks.length}  color="#22c55e" />
        <SummaryBadge label={`Semanais · ${weekRange}`}  done={weeklyDone} total={weeklyTasks.length} color="#3b82f6" />
      </div>

      {/* Diárias */}
      {dailyTasks.length > 0 && (
        <Section title="⚡ Tarefas Diárias" badge={`${dailyDone}/${dailyTasks.length}`}
          badgeColor={dailyDone===dailyTasks.length ? '#22c55e' : '#f59e0b'}
          subtitle={`Resetam à meia-noite · ${today}`}>
          {dailyTasks.map(t => (
            <DailyTaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} isUpdating={!!updating[t.id]} />
          ))}
        </Section>
      )}

      {/* Semanais */}
      {weeklyTasks.length > 0 && (
        <Section title="📅 Metas Semanais" badge={`Semana ${weekRange}`} badgeColor="#3b82f6" subtitle="Resetam toda segunda-feira">
          {weeklyTasks.map(t => (
            <WeeklyTaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} isUpdating={!!updating[t.id]} />
          ))}
        </Section>
      )}

      {/* Contínuas */}
      {continuousTasks.length > 0 && (
        <Section title="🔄 Metas Contínuas" badge="Em andamento" badgeColor="#8b5cf6" subtitle="Metas de longo prazo">
          {continuousTasks.map(t => (
            <WeeklyTaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} isUpdating={!!updating[t.id]} />
          ))}
        </Section>
      )}

      {/* Empty state */}
      {tasks.length === 0 && !loading && (
        <div style={{ background:'var(--color-bg-card)', border:'1px dashed var(--color-border)', borderRadius:12, padding:'3rem', textAlign:'center' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:12 }}>📋</div>
          <div style={{ color:'var(--color-text)', fontWeight:600, marginBottom:6 }}>Nenhuma tarefa ainda</div>
          <div style={{ color:'var(--color-text-muted)', fontSize:'0.875rem', marginBottom:16 }}>Clique em "Nova Tarefa" para começar</div>
          <button onClick={() => setShowModal(true)} style={btnPrimStyle}><IconPlus /> Nova Tarefa</button>
        </div>
      )}

      {/* Modal criar tarefa */}
      {showModal && <NewTaskModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}
    </div>
  );
}

// ── Botões reutilizáveis ──────────────────────────────────────────────────────
const btnSecStyle = {
  display:'flex', alignItems:'center', gap:6,
  background:'var(--color-bg-card)', border:'1px solid var(--color-border)',
  color:'var(--color-text-muted)', borderRadius:8, padding:'6px 12px',
  fontSize:'0.8125rem', cursor:'pointer'
};
const btnPrimStyle = {
  display:'flex', alignItems:'center', gap:6,
  background:'var(--color-green)', border:'none',
  color:'#000', borderRadius:8, padding:'6px 14px',
  fontSize:'0.8125rem', fontWeight:700, cursor:'pointer'
};

// ── Modal: Nova Tarefa ────────────────────────────────────────────────────────
function NewTaskModal({ onClose, onCreate }) {
  const [title,        setTitle]        = useState('');
  const [project,      setProject]      = useState('Geral');
  const [customProject, setCustomProject] = useState('');
  const [freq,         setFreq]         = useState('daily');
  const [target,       setTarget]       = useState(1);
  const [interval,     setInterval]     = useState(3);
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState('');

  const freqInfo = FREQ_OPTIONS.find(f => f.value === freq) || FREQ_OPTIONS[0];
  const finalProject = project === '__custom__' ? customProject : project;

  const handleSubmit = async () => {
    if (!title.trim())        { setErr('Informe um título'); return; }
    if (!finalProject.trim()) { setErr('Informe o projeto'); return; }
    setErr(''); setLoading(true);
    try {
      await onCreate({
        title:                title.trim(),
        type:                 freqInfo.type,
        target_count:         Number(target) || 1,
        project:              finalProject.trim(),
        frequency:            freq,
        custom_interval_days: freq === 'custom' ? Number(interval) : null,
      });
    } catch (e) { setErr(e.message); }
    finally     { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)' }}>
      <div style={{
        background:'var(--color-bg-card)', border:'1px solid var(--color-border)',
        borderRadius:14, padding:'1.75rem', width:440, maxWidth:'92vw',
        maxHeight:'90vh', overflowY:'auto', position:'relative'
      }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
          <div>
            <h2 style={{ fontSize:'1.125rem', fontWeight:700, color:'var(--color-text)' }}>Nova Tarefa</h2>
            <p style={{ fontSize:'0.75rem', color:'var(--color-text-muted)', marginTop:2 }}>Adicione uma nova rotina ou meta</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--color-text-muted)', cursor:'pointer', padding:4 }}>
            <IconClose />
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

          {/* Título */}
          <Field label="Título da tarefa *">
            <input
              className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ex: 3 stories no Instagram"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </Field>

          {/* Projeto */}
          <Field label="Projeto">
            <select className="input" value={project} onChange={e => setProject(e.target.value)}>
              {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">+ Outro projeto...</option>
            </select>
            {project === '__custom__' && (
              <input
                className="input" value={customProject} onChange={e => setCustomProject(e.target.value)}
                placeholder="Nome do projeto" style={{ marginTop:6 }}
              />
            )}
          </Field>

          {/* Frequência */}
          <Field label="Tipo / Frequência">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {FREQ_OPTIONS.map(f => (
                <button key={f.value} onClick={() => setFreq(f.value)}
                  style={{
                    padding:'8px 10px', borderRadius:8, fontSize:'0.8125rem', fontWeight:600,
                    cursor:'pointer', textAlign:'left', transition:'all 0.15s',
                    background: freq === f.value ? 'rgba(34,197,94,0.12)' : 'var(--color-bg-elevated)',
                    border: `1px solid ${freq === f.value ? 'rgba(34,197,94,0.4)' : 'var(--color-border)'}`,
                    color: freq === f.value ? 'var(--color-green)' : 'var(--color-text-muted)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Intervalo customizado */}
          {freq === 'custom' && (
            <Field label="A cada quantos dias?">
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="number" min={1} max={365} value={interval}
                  onChange={e => setInterval(e.target.value)}
                  className="input" style={{ width:90 }} />
                <span style={{ color:'var(--color-text-muted)', fontSize:'0.875rem' }}>dias</span>
              </div>
            </Field>
          )}

          {/* Meta numérica */}
          {(freq === 'weekly' || freq === 'continuous') && (
            <Field label={freq === 'weekly' ? 'Meta semanal (quantidade)' : 'Meta total'}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="number" min={1} value={target}
                  onChange={e => setTarget(e.target.value)}
                  className="input" style={{ width:90 }} />
                <span style={{ color:'var(--color-text-muted)', fontSize:'0.875rem' }}>
                  {freq === 'weekly' ? 'por semana' : 'no total'}
                </span>
              </div>
            </Field>
          )}

          {/* Preview */}
          <div style={{
            background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)',
            borderRadius:8, padding:'0.875rem 1rem', fontSize:'0.8125rem'
          }}>
            <div style={{ color:'var(--color-text-muted)', fontSize:'0.625rem', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', marginBottom:6 }}>Preview</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{
                width:20, height:20, borderRadius:5,
                background: freq==='daily'||freq==='custom' ? 'rgba(34,197,94,0.1)' : freq==='weekly' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)',
                border: `1px solid ${freq==='daily'||freq==='custom' ? '#22c55e44' : freq==='weekly' ? '#3b82f644' : '#8b5cf644'}`,
                flexShrink:0
              }}/>
              <span style={{ fontWeight:600, color:'var(--color-text)' }}>{title || 'Título da tarefa'}</span>
            </div>
            <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap' }}>
              <Tag color={projectColor(finalProject)}>{finalProject || 'Projeto'}</Tag>
              <Tag color="#6b7280">{freqInfo.label}</Tag>
              {(freq==='weekly'||freq==='continuous') && <Tag color="#6b7280">Meta: {target}</Tag>}
              {freq==='custom' && <Tag color="#6b7280">A cada {interval} dias</Tag>}
            </div>
          </div>

          {err && <div style={{ color:'#ef4444', fontSize:'0.8125rem', padding:'8px 12px', background:'rgba(239,68,68,0.08)', borderRadius:6 }}>{err}</div>}

          {/* Ações */}
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onClose} style={{ flex:1, padding:'10px', background:'transparent', border:'1px solid var(--color-border)', color:'var(--color-text)', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={loading} style={{ flex:2, padding:'10px', background:'var(--color-green)', border:'none', color:'#000', borderRadius:8, cursor:'pointer', fontWeight:700, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Criando...' : 'Criar Tarefa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--color-text-muted)', display:'block', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}
function Tag({ color, children }) {
  return (
    <span style={{ fontSize:'0.625rem', fontWeight:700, padding:'2px 7px', borderRadius:99, background:color+'22', color, border:`1px solid ${color}33` }}>
      {children}
    </span>
  );
}

function SummaryBadge({ label, done, total, color }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const allDone = done === total && total > 0;
  return (
    <div style={{ background:'var(--color-bg-card)', border:`1px solid ${allDone ? color+'44' : 'var(--color-border)'}`, borderRadius:10, padding:'1rem 1.25rem', transition:'border-color 0.3s' }}>
      <div style={{ fontSize:'0.6875rem', fontWeight:700, color:'var(--color-text-muted)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <span style={{ fontSize:'1.75rem', fontWeight:800, color: allDone ? color : 'var(--color-text)' }}>
          {done}<span style={{ fontSize:'1rem', color:'var(--color-text-muted)' }}>/{total}</span>
        </span>
        {allDone && <span style={{ fontSize:'0.75rem', color, fontWeight:700 }}>✓ Tudo feito!</span>}
      </div>
      <div style={{ height:4, background:'var(--color-bg-elevated)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:99, transition:'width 0.5s ease' }}/>
      </div>
    </div>
  );
}

function Section({ title, badge, badgeColor, subtitle, children }) {
  return (
    <div style={{ background:'var(--color-bg-card)', border:'1px solid var(--color-border)', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'0.875rem 1.5rem', borderBottom:'1px solid var(--color-border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--color-text)' }}>{title}</span>
          {subtitle && <div style={{ fontSize:'0.6875rem', color:'var(--color-text-muted)', marginTop:2 }}>{subtitle}</div>}
        </div>
        <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'3px 10px', borderRadius:20, background:badgeColor+'22', color:badgeColor, border:`1px solid ${badgeColor}44` }}>{badge}</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column' }}>{children}</div>
    </div>
  );
}

function DailyTaskRow({ task, onToggle, onDelete, isUpdating }) {
  const [hover, setHover] = useState(false);
  const done  = task.completed;
  const color = projectColor(task.project);
  return (
    <div
      style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.875rem 1.5rem', borderBottom:'1px solid var(--color-border)', transition:'background 0.15s', background: hover ? 'var(--color-bg-elevated)' : 'transparent', opacity: isUpdating ? 0.6 : 1 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    >
      <button onClick={() => onToggle(task, done ? -1 : 1)} disabled={isUpdating}
        style={{ width:24, height:24, borderRadius:6, flexShrink:0, border: done ? 'none' : '2px solid var(--color-border)', background: done ? color : 'transparent', color:'#000', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', boxShadow: done ? `0 0 8px ${color}55` : 'none' }}>
        {done && <IconCheck />}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.9375rem', fontWeight:500, color: done ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none', transition:'all 0.2s' }}>
          {task.title}
        </div>
        <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap' }}>
          <Tag color={color}>{task.project}</Tag>
          {task.custom_interval_days && <Tag color="#6b7280">a cada {task.custom_interval_days} dias</Tag>}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        {done
          ? <span style={{ fontSize:'0.75rem', fontWeight:700, color }}>✓ Feito</span>
          : <span style={{ fontSize:'0.75rem', color:'var(--color-text-muted)' }}>Pendente</span>
        }
        {hover && (
          <button onClick={() => onDelete(task)} title="Remover tarefa"
            style={{ background:'transparent', border:'none', color:'#333', cursor:'pointer', padding:2, display:'flex', alignItems:'center' }}
            onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color='#333'}>
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  );
}

function WeeklyTaskRow({ task, onToggle, onDelete, isUpdating }) {
  const [hover, setHover] = useState(false);
  const done   = task.completed;
  const count  = task.current_count || 0;
  const target = task.target_count || 1;
  const pct    = Math.min(100, (count / target) * 100);
  const color  = projectColor(task.project);
  return (
    <div
      style={{ padding:'1rem 1.5rem', borderBottom:'1px solid var(--color-border)', transition:'background 0.15s', background: hover ? 'var(--color-bg-elevated)' : 'transparent', opacity: isUpdating ? 0.6 : 1 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.9375rem', fontWeight:500, color: done ? color : 'var(--color-text)' }}>
            {task.title}{done && <span style={{ marginLeft:6, fontSize:'0.75rem', color }}>✓</span>}
          </div>
          <div style={{ marginTop:3 }}><Tag color={color}>{task.project}</Tag></div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          {hover && (
            <button onClick={() => onDelete(task)} title="Remover"
              style={{ background:'transparent', border:'none', color:'#333', cursor:'pointer', padding:2, display:'flex', alignItems:'center' }}
              onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color='#333'}>
              <IconTrash />
            </button>
          )}
          <span style={{ fontSize:'0.75rem', color:'var(--color-text-muted)', minWidth:36, textAlign:'center' }}>{count}/{target}</span>
          <button onClick={() => onToggle(task, -1)} disabled={isUpdating||count===0}
            style={{ width:28, height:28, borderRadius:6, background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)', color:'var(--color-text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', opacity: count===0?0.3:1 }}
            onMouseEnter={e => { if(count>0){e.currentTarget.style.borderColor='#ef4444';e.currentTarget.style.color='#ef4444';}}}
            onMouseLeave={e => {e.currentTarget.style.borderColor='var(--color-border)';e.currentTarget.style.color='var(--color-text-muted)';}}>
            <IconMinus />
          </button>
          <button onClick={() => onToggle(task, 1)} disabled={isUpdating}
            style={{ width:28, height:28, borderRadius:6, background: done?color+'22':'var(--color-bg-elevated)', border:`1px solid ${done?color+'44':'var(--color-border)'}`, color: done?color:'var(--color-text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.color=color;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=done?color+'44':'var(--color-border)';e.currentTarget.style.color=done?color:'var(--color-text-muted)';}}>
            <IconPlus />
          </button>
        </div>
      </div>
      <div style={{ height:5, background:'var(--color-bg-base)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: pct>=100 ? color : `linear-gradient(90deg,${color}99,${color})`, borderRadius:99, transition:'width 0.4s ease', boxShadow: pct>=100?`0 0 8px ${color}88`:'none' }}/>
      </div>
    </div>
  );
}
