import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import AudienceStats from './components/AudienceStats';
import BroadcastComposer from './components/BroadcastComposer';
import BroadcastHistory from './components/BroadcastHistory';
import SalesDashboard from './components/SalesDashboard';
import TasksPanel from './components/TasksPanel';
import ProductsAdmin from './components/ProductsAdmin';
import ConnectionStatus from './components/ConnectionStatus';
import LoginPage, { isAuthenticated } from './components/LoginPage';

// ── Ícones SVG inline ─────────────────────────────────────────────────────────
const IconLive = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IconTasks = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);
const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

function App() {
  const [authed, setAuthed]         = useState(isAuthenticated());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const getInitialTab = () => window.location.pathname === '/dash/produtos' ? 'produtos' : 'aovivo';
  const [activeTab, setActiveTab]   = useState(getInitialTab);
  const [theme, setTheme]           = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  const navTo = (tab) => { setActiveTab(tab); setSidebarOpen(false); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-base)', position: 'relative' }}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1a1a1a', color: '#f0f0f0', border: '1px solid #2a2a2a', borderRadius: '10px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#000' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30 }} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Brand */}
        <div style={{ padding: '1.5rem 1.25rem 1.25rem', borderBottom: '1px solid var(--color-border)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, var(--color-green), #16a34a)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(34,197,94,0.35)', flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
                Dash <span style={{ color: 'var(--color-green)' }}>Circle</span>
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 1 }}>Painel de Vendas</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="sidebar-close-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, position: 'absolute', top: 16, right: 12 }}>
            <IconClose />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Visão Geral */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: 4, marginTop: 4 }}>
            Visão Geral
          </div>
          <a href="#" className={`nav-item ${activeTab === 'aovivo' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); navTo('aovivo'); }}>
            <IconLive />
            Ao Vivo
            <div className="live-dot" style={{ marginLeft: 'auto' }} />
          </a>

          {/* Operações */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: 4, marginTop: 12 }}>
            Operações
          </div>
          <a href="#" className={`nav-item ${activeTab === 'disparos' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); navTo('disparos'); }}>
            <IconSend />
            Disparos
          </a>
          <a href="#" className={`nav-item ${activeTab === 'rotinas' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); navTo('rotinas'); }}>
            <IconTasks />
            Rotinas
            {/* Badge de destaque para nova feature */}
            <span style={{
              marginLeft: 'auto', fontSize: '0.5rem', fontWeight: 800, padding: '2px 5px',
              background: 'var(--color-green)', color: '#000', borderRadius: 4, letterSpacing: '0.5px'
            }}>NOVO</span>
          </a>

          {/* Sistema */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: 4, marginTop: 12 }}>
            Sistema
          </div>
          <button className="nav-item" onClick={toggleTheme}
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
            {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          </button>
        </nav>

        {/* User footer */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#000' }}>A</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>Admin</p>
            <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Circle Digital</p>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem('zl_auth_token'); setAuthed(false); }}
            title="Sair da conta"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#444'}
          >
            <IconLogout />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{
          height: 56, borderBottom: '1px solid var(--color-border)',
          background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', padding: '0 1.25rem', gap: '0.75rem',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <button onClick={() => setSidebarOpen(true)} className="hamburger-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <IconMenu />
          </button>

          {/* Tab pills no header para desktop */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }} className="header-tabs">
            {[
              { id: 'aovivo',   label: 'Ao Vivo' },
              { id: 'disparos', label: 'Disparos' },
              { id: 'rotinas',  label: 'Rotinas' },
            ].map(t => (
              <button key={t.id} onClick={() => navTo(t.id)}
                style={{
                  padding: '5px 12px', background: activeTab === t.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                  border: `1px solid ${activeTab === t.id ? 'rgba(34,197,94,0.3)' : 'transparent'}`,
                  color: activeTab === t.id ? 'var(--color-green)' : 'var(--color-text-muted)',
                  borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >{t.label}</button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto' }}>
            <ConnectionStatus />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>

            {/* Aba: Disparos */}
            {activeTab === 'disparos' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 700, color: 'var(--color-text)', marginBottom: 6 }}>
                    Disparo no Telegram 🚀
                  </h1>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
                    Engaje leads ou reconecte-se com clientes via bot.
                  </p>
                </div>
                <AudienceStats />
                <BroadcastComposer />
                <BroadcastHistory />
              </>
            )}

            {/* Aba: Rotinas */}
            {activeTab === 'rotinas' && <TasksPanel />}

            {/* Aba: Produtos (rota oculta /dash/produtos) */}
            {activeTab === 'produtos' && <ProductsAdmin />}

            {/* Aba: Ao Vivo (default) */}
            {activeTab === 'aovivo' && <SalesDashboard />}

          </div>
        </div>
      </main>

      <style>{`
        .sidebar {
          width: 220px;
          border-right: 1px solid var(--color-border);
          background: var(--color-bg-card);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          transition: background 0.2s;
        }
        .header-tabs { display: flex; }
        @media (max-width: 767px) {
          .sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            transform: translateX(-100%);
            transition: transform 0.25s ease, background 0.2s;
            z-index: 40;
          }
          .sidebar.sidebar-open { transform: translateX(0); }
          .hamburger-btn   { display: flex !important; }
          .sidebar-close-btn { display: flex !important; }
          .header-tabs { display: none; }
        }
        @media (min-width: 768px) {
          .hamburger-btn   { display: none !important; }
          .sidebar-close-btn { display: none !important; }
        }
        .input {
          width: 100%;
          background-color: var(--color-bg-elevated);
          border: 1px solid var(--color-border-hover);
          border-radius: 8px;
          padding: 0.625rem 0.875rem;
          color: var(--color-text);
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .input:focus { border-color: var(--color-green); }
        .input::placeholder { color: var(--color-text-muted); }
        select.input option { background: #111; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default App;
