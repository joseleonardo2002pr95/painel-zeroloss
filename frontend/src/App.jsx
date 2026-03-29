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
        <div style={{ padding: '1.25rem 1.25rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 32, height: 32, background: 'var(--color-green)', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px rgba(34,197,94,0.4)',
            }}>
              <Zap size={18} color="#000" strokeWidth={2.5} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text)' }}>
              Painel <span style={{ color: 'var(--color-green)' }}>ZeroLoss</span>
            </span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="sidebar-close-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a href="#" className={`nav-item ${activeTab === 'aovivo' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('aovivo'); setSidebarOpen(false); }}>
            <Activity size={16} /> Ao Vivo
          </a>
          <a href="#" className={`nav-item ${activeTab === 'disparos' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('disparos'); setSidebarOpen(false); }}>
            <Send size={16} /> Disparos
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); }}>
            <Settings size={16} /> Configurações
          </a>
        </nav>

        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <UserCircle size={28} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>Admin</p>
              <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Service Cloud</p>
            </div>
          </div>
          <button onClick={toggleTheme} title="Mudar tema" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
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
            <Menu size={20} />
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
