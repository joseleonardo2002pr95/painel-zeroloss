import { useState, useEffect } from 'react';
import { ShoppingCart, DollarSign, TrendingUp, CreditCard, Gift, Loader2 } from 'lucide-react';

export default function SalesDashboard() {
  const [summary, setSummary] = useState({ today: 0, count: 0, ticket: 0 });
  const [offsetConfig, setOffsetConfig] = useState({ today: 0, count: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [platformsData, setPlatformsData] = useState({
    PerfectPay: { value: 0, color: '#3b82f6', label: 'PerfectPay' },
    Payt:       { value: 0, color: '#f59e0b', label: 'Payt' },
    Kirvano:    { value: 0, color: '#10b981', label: 'Kirvano' },
    'XP Empresas (Pix)': { value: 0, color: '#8b5cf6', label: 'XP (Pix)' }
  });
  const [recentSales, setRecentSales] = useState([]);
  
  // Audio effect para "cash" opcional (pode ser adicionado se quiser depois)
  const playCashSound = () => {
    // const audio = new Audio('/cash.mp3'); audio.play().catch(e=>e);
  };

  // Carrega offset do localStorage e Vendas do BD
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const savedDate = localStorage.getItem('sales_offset_date');
    let offsetVal = 0;
    let offsetCount = 0;

    if (savedDate === todayStr) {
      offsetVal = parseFloat(localStorage.getItem('sales_offset_value') || '0');
      offsetCount = parseInt(localStorage.getItem('sales_offset_count') || '0');
      setOffsetConfig({ today: offsetVal, count: offsetCount });
    } else {
      localStorage.removeItem('sales_offset_value');
      localStorage.removeItem('sales_offset_count');
      localStorage.setItem('sales_offset_date', todayStr);
    }

    // Puxa as vendas de hoje que estão salvas no banco de dados do servidor
    fetch('/api/sales/today')
      .then(r => r.json())
      .then(data => {
        if (data.sales) {
          const dbSales = data.sales;
          const totalVal = dbSales.reduce((acc, curr) => acc + curr.value, 0);
          
          setSummary({
             today: totalVal,
             count: dbSales.length,
             ticket: dbSales.length > 0 ? (totalVal / dbSales.length) : 0
          });

          // Pega as últimas 50 para o feed
          const last50 = dbSales.slice(-50).map(s => ({...s, time: new Date(s.created_at + 'Z').toLocaleTimeString()}));
          setRecentSales(last50);
        }
      })
      .catch(e => console.error("Erro ao puxar vendas do dia:", e));
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/sales/stream');

    es.addEventListener('new_sale', (e) => {
      const data = JSON.parse(e.data);
      // data format: { id, name, product, value, platform }
      
      setRecentSales(prev => {
        const updated = [
          ...prev, 
          { ...data, time: 'Agora mesmo' }
        ];
        // Mantém apenas os 50 mais recentes
        return updated.slice(-50);
      });

      setSummary(prev => {
        const newCount = prev.count + 1;
        const newToday = prev.today + data.value;
        return {
          today: newToday,
          count: newCount,
          ticket: newToday / newCount
        };
      });

      setPlatformsData(prev => {
        const plat = data.platform;
        if (!prev[plat]) return prev; // Ignore desconhecidos
        return {
          ...prev,
          [plat]: {
            ...prev[plat],
            value: prev[plat].value + data.value
          }
        };
      });

      playCashSound();
    });

    return () => es.close();
  }, []);

  const totalValue = summary.today + offsetConfig.today;
  const totalCount = summary.count + offsetConfig.count;
  const totalTicket = totalCount > 0 ? totalValue / totalCount : 0;

  const fmtMon = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const handleConfigClick = () => {
    setIsModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
      
      {/* Cards Superiores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <SummaryCard 
          title="Receita de Hoje" 
          value={totalValue} 
          formatter={fmtMon}
          icon={<DollarSign size={20} />} 
          main 
          onTitleClick={handleConfigClick}
        />
        <SummaryCard 
          title="Vendas Hoje" 
          value={totalCount} 
          formatter={(v) => Math.round(v).toString()}
          icon={<ShoppingCart size={20} />} 
        />
        <SummaryCard 
          title="Ticket Médio" 
          value={totalTicket} 
          formatter={fmtMon}
          icon={<TrendingUp size={20} />} 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Divisão por Plataforma */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CreditCard size={18} style={{ color: 'var(--color-green)' }} /> Origem das Vendas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.values(platformsData).map(p => {
              // Adiciona o offset apenas na barra de PIX
              const displayValue = p.label === 'XP (Pix)' ? p.value + offsetConfig.today : p.value;
              const pct = totalValue > 0 ? (displayValue / totalValue) * 100 : 0;
              
              return (
                <div key={p.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>{p.label}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{fmtMon(displayValue)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: p.color, borderRadius: 99, transition: 'width 0.5s ease-out' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feed de Vendas ("Ao Vivo") */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 500 }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Gift size={18} style={{ color: 'var(--color-green)' }} /> Feed de Transações
             </h2>
             <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--color-green)', fontWeight: 600 }}>
               <Loader2 size={12} style={{ animation: 'spin 1.5s linear infinite' }} /> Aguardando novos webhooks...
             </span>
          </div>

          <div style={{ overflowY: 'auto', padding: '0.5rem 0' }}>
            {recentSales.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Nenhuma venda registrada ainda nessa sessão.
              </div>
            ) : (
              [...recentSales].reverse().map((sale, i) => (
                <div key={sale.id + '_' + i} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '1rem',
                  padding: '1rem 1.5rem',
                  borderBottom: i === recentSales.length - 1 ? 'none' : '1px solid var(--color-border)',
                  transition: 'background 0.2s',
                  animation: 'fadeIn 0.4s ease-out'
                }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-green)' }}>
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>{sale.name}</span>
                    <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 4, background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)' }}>
                      {sale.platform}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Comprou {sale.product}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-green)', marginBottom: 2 }}>
                    + {fmtMon(sale.value)}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{sale.time}</div>
                </div>
              </div>
            ))
            )}
          </div>
        </div>
      </div>
      {isModalOpen && (
        <ConfigModal 
          onClose={() => setIsModalOpen(false)} 
          offsetConfig={offsetConfig} 
          setOffsetConfig={setOffsetConfig} 
        />
      )}
    </div>
  );
}

function AnimatedNumber({ value, formatter }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let startTimestamp = null;
    const duration = 1000; // 1 segundo de animação
    const startValue = displayValue;
    const change = value - startValue;

    if (change === 0) return;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Easing out quint
      const easeOut = 1 - Math.pow(1 - progress, 5);
      setDisplayValue(startValue + change * easeOut);
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    window.requestAnimationFrame(step);
  }, [value]);

  return <span>{formatter ? formatter(displayValue) : displayValue}</span>;
}

function SummaryCard({ title, value, formatter, icon, main, onTitleClick }) {
  return (
    <div className="card" style={{ 
      display: 'flex', flexDirection: 'column', gap: 8,
      border: main ? '1px solid var(--color-green)' : '1px solid var(--color-border)',
      background: main ? 'linear-gradient(145deg, var(--color-bg-card), rgba(34, 197, 94, 0.05))' : 'var(--color-bg-card)',
      boxShadow: main ? '0 0 20px rgba(34, 197, 94, 0.08)' : 'none'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: main ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
        <span 
          onClick={onTitleClick}
          style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: onTitleClick ? 'pointer' : 'default' }}
          title={onTitleClick ? "Clique duas vezes para ajustar o valor inicial do dia" : ""}
        >
          {title}
        </span>
        {icon}
      </div>
      <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text)' }}>
        <AnimatedNumber value={value} formatter={formatter} />
      </span>
    </div>
  );
}

function ConfigModal({ onClose, offsetConfig, setOffsetConfig }) {
  const [tab, setTab] = useState('offset');
  const [valPix, setValPix] = useState(offsetConfig.today ? offsetConfig.today.toString() : "");
  const [countPix, setCountPix] = useState(offsetConfig.count ? offsetConfig.count.toString() : "");

  const [manName, setManName] = useState("");
  const [manProd, setManProd] = useState("");
  const [manVal, setManVal] = useState("");
  const [manPlat, setManPlat] = useState("XP Empresas (Pix)");
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveOffset = () => {
    const valStr = valPix.trim() === "" ? "0" : valPix;
    const countStr = countPix.trim() === "" ? "0" : countPix;
    const val = parseFloat(valStr.replace(',', '.')) || 0;
    const count = parseInt(countStr) || 0;
    setOffsetConfig({ today: val, count: count });
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem('sales_offset_date', todayStr);
    localStorage.setItem('sales_offset_value', val);
    localStorage.setItem('sales_offset_count', count);
    onClose();
  };

  const handleManualSale = async () => {
    if (!manName || !manVal) return alert("Preencha Nome e Valor");
    setIsLoading(true);
    try {
      const res = await fetch('/api/sales/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manName,
          product: manProd || "Produto Manual",
          value: parseFloat(manVal.replace(',', '.')) || 0,
          platform: manPlat
        })
      });
      if (res.ok) {
        setManName("");
        setManVal("");
        setManProd("");
        alert("Venda enviada com sucesso! Feche a janela para ver.");
      } else {
        alert("Erro ao enviar venda.");
      }
    } catch (e) {
      alert("Erro de conexão.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 450, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
          <button 
            onClick={() => setTab('offset')}
            style={{ flex: 1, padding: 16, background: tab === 'offset' ? 'var(--color-bg-elevated)' : 'transparent', border: 'none', color: tab === 'offset' ? 'var(--color-text)' : 'var(--color-text-muted)', fontWeight: 600, cursor: 'pointer' }}
          >
            Caixa Inicial (Pix)
          </button>
          <button 
            onClick={() => setTab('manual')}
            style={{ flex: 1, padding: 16, background: tab === 'manual' ? 'var(--color-bg-elevated)' : 'transparent', border: 'none', color: tab === 'manual' ? 'var(--color-text)' : 'var(--color-text-muted)', fontWeight: 600, cursor: 'pointer' }}
          >
            Lançamento Manual
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'offset' ? (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Valor total de Pix já recebido hoje (ex: 1500.50)</label>
                  <input 
                    type="text" 
                    value={valPix} 
                    onChange={e => setValPix(e.target.value)} 
                    className="input" 
                    placeholder="0.00"
                    style={{marginTop: 4}}
                  />
                </div>
                
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Quantidade de vendas via Pix hoje</label>
                  <input 
                    type="number" 
                    value={countPix} 
                    onChange={e => setCountPix(e.target.value)} 
                    className="input" 
                    placeholder="0"
                    style={{marginTop: 4}}
                  />
                </div>

                <button className="btn-primary" onClick={handleSaveOffset} style={{ marginTop: 8 }}>Salvar Configuração</button>
             </div>
          ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Plataforma</label>
                  <select className="input" value={manPlat} onChange={e => setManPlat(e.target.value)} style={{marginTop: 4}}>
                    <option>XP Empresas (Pix)</option>
                    <option>PerfectPay</option>
                    <option>Payt</option>
                    <option>Kirvano</option>
                  </select>
                </div>

                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Nome do Cliente</label>
                  <input type="text" value={manName} onChange={e => setManName(e.target.value)} className="input" placeholder="João da Silva" style={{marginTop: 4}} />
                </div>

                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Nome do Produto (opcional)</label>
                  <input type="text" value={manProd} onChange={e => setManProd(e.target.value)} className="input" placeholder="Mentoria VIP" style={{marginTop: 4}} />
                </div>

                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Valor (R$)</label>
                  <input type="text" value={manVal} onChange={e => setManVal(e.target.value)} className="input" placeholder="97.00" style={{marginTop: 4}} />
                </div>

                <button className="btn-primary" onClick={handleManualSale} disabled={isLoading} style={{ marginTop: 8 }}>
                  {isLoading ? 'Enviando...' : 'Fazer Lançamento'}
                </button>
             </div>
          )}
          
          <button onClick={onClose} style={{ padding: 12, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 8, cursor: 'pointer', marginTop: 8 }}>
            Cancelar / Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
