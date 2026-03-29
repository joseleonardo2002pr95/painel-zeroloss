import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Send, LayoutDashboard, Settings, UserCircle, Zap, Menu, X, Activity, Sun, Moon } from 'lucide-react';
import AudienceStats from './components/AudienceStats';
import BroadcastComposer from './components/BroadcastComposer';
import BroadcastHistory from './components/BroadcastHistory';
import SalesDashboard from './components/SalesDashboard';
import ConnectionStatus from './components/ConnectionStatus';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('aovivo');
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

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
              boxShadow: '0 0 16px rgba(34,197,94,0.35)',
              flexShrink: 0,
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Category: Visão Geral */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: 4, marginTop: 4 }}>
            Visão Geral
          </div>
          <a href="#" className={`nav-item ${activeTab === 'aovivo' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('aovivo'); setSidebarOpen(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Ao Vivo
            <div className="live-dot" style={{ marginLeft: 'auto' }} />
          </a>

          {/* Category: Operações */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: 4, marginTop: 12 }}>
            Operações
          </div>
          <a href="#" className={`nav-item ${activeTab === 'disparos' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('disparos'); setSidebarOpen(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Disparos
          </a>

          {/* Category: Sistema */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: 4, marginTop: 12 }}>
            Sistema
          </div>
          <button className="nav-item" onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
            {theme === 'dark'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
            {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          </button>
        </nav>

        {/* User footer */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#000' }}>A</span>
          </div>
          <div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>Admin</p>
            <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Circle Digital</p>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{
          height: 56,
          borderBottom: '1px solid var(--color-border)',
          background: 'rgba(10,10,10,0.9)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center',
          padding: '0 1.25rem', gap: '0.75rem',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <button onClick={() => setSidebarOpen(true)} className="hamburger-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-subtle)' }}>
            Gerenciador de Campanhas
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <ConnectionStatus />
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {activeTab === 'disparos' ? (
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
            ) : (
              <SalesDashboard />
            )}
          </div>
        </div>
      </main>

      <style>{`
        .sidebar {
          width: 220px;
          border-right: 1px solid var(--color-border);
          background: #0d0d0d;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        @media (max-width: 767px) {
          .sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 40;
          }
          .sidebar.sidebar-open { transform: translateX(0); }
          .hamburger-btn   { display: flex !important; }
          .sidebar-close-btn { display: flex !important; }
        }
        @media (min-width: 768px) {
          .hamburger-btn   { display: none !important; }
          .sidebar-close-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default App;
