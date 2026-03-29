import { useState, useEffect } from 'react';
import { ShoppingCart, DollarSign, TrendingUp, CreditCard, Gift, Loader2, Trash2 } from 'lucide-react';

export default function SalesDashboard() {
  const [summary, setSummary] = useState({ today: 0, count: 0, ticket: 0 });
  const [offsetConfig, setOffsetConfig] = useState({ today: 0, count: 0, ontemVal: 0, ontemCount: 0, mesVal: 0, metaGoal: 1000000 });
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
    } else {
      localStorage.removeItem('sales_offset_value');
      localStorage.removeItem('sales_offset_count');
      localStorage.setItem('sales_offset_date', todayStr);
    }
    
    const ontemV = parseFloat(localStorage.getItem('sales_ontem_value') || '0');
    const ontemC = parseInt(localStorage.getItem('sales_ontem_count') || '0');
    
    const mesV = parseFloat(localStorage.getItem('sales_mes_value') || '0');
    const metaG = parseFloat(localStorage.getItem('sales_meta_goal') || '1000000');
    
    setOffsetConfig({ today: offsetVal, count: offsetCount, ontemVal: ontemV, ontemCount: ontemC, mesVal: mesV, metaGoal: metaG });

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
          
          setPlatformsData(prev => {
             const plt = { ...prev };
             dbSales.forEach(s => {
                const pName = s.platform;
                const pKey = Object.keys(plt).find(k => k.toLowerCase() === pName?.toLowerCase()) || 'Kirvano';
                plt[pKey].value += s.value;
             });
             return plt;
          });
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
        const platName = data.platform || 'Kirvano';
        const pKey = Object.keys(prev).find(k => k.toLowerCase() === platName.toLowerCase()) || 'Kirvano';
        return {
          ...prev,
          [pKey]: {
            ...prev[pKey],
            value: prev[pKey].value + data.value
          }
        };
      });

      playCashSound();
    });

    es.addEventListener('delete_sale', (e) => {
      const data = JSON.parse(e.data);
      
      setRecentSales(prev => prev.filter(sale => sale.id !== data.id));
      
      setSummary(prev => {
        const newCount = Math.max(0, prev.count - 1);
        const newToday = Math.max(0, prev.today - data.value);
        return {
          today: newToday,
          count: newCount,
          ticket: newCount > 0 ? newToday / newCount : 0
        };
      });

      setPlatformsData(prev => {
        const platName = data.platform || 'Kirvano';
        const pKey = Object.keys(prev).find(k => k.toLowerCase() === platName.toLowerCase()) || 'Kirvano';
        
        return {
          ...prev,
          [pKey]: {
            ...prev[pKey],
            value: Math.max(0, prev[pKey].value - data.value)
          }
        };
      });
    });

    return () => es.close();
  }, []);

  const handleDeleteSale = async (sale) => {
    if (!window.confirm(`Tem certeza que deseja apagar a venda de ${sale.name} no valor de R$${sale.value.toFixed(2)}?`)) return;
    
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(sale.id)}`, { method: 'DELETE' });
      if (!res.ok) alert("Erro ao apagar venda!");
    } catch(e) {
      console.error(e);
      alert("Falha de conexão ao deletar.");
    }
  };

  const totalValue = summary.today + offsetConfig.today;
  const totalCount = summary.count + offsetConfig.count;
  const totalTicket = totalCount > 0 ? totalValue / totalCount : 0;
  
  const volumeTotal = (offsetConfig.mesVal || 0) + totalValue;
  const metaAlvo = offsetConfig.metaGoal || 1000000;
  const faltaMeta = Math.max(0, metaAlvo - volumeTotal);

  const fmtMon = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const handleConfigClick = () => {
    setIsModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
      
      {/* Metricas Vaidosas (Volume Total e Meta) */}
      <div className="card" style={{ 
        position: 'relative', overflow: 'hidden', padding: '2.5rem 2rem', 
        background: 'linear-gradient(to bottom right, var(--color-bg-card), #111827)',
        border: '1px solid #1f2937'
      }}>
        {/* Subtle green glow at the top */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--color-green), transparent)', opacity: 0.5 }} />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-green)', boxShadow: '0 0 8px var(--color-green)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>Volume Total</span>
            </div>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--color-green)', letterSpacing: '-1.5px', textShadow: '0 0 30px rgba(34, 197, 94, 0.25)' }}>
              {fmtMon(volumeTotal)}
            </div>
          </div>
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                Falta para {metaAlvo >= 1000000 ? `${metaAlvo / 1000000}MM` : fmtMon(metaAlvo)}
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
              {fmtMon(faltaMeta)}
            </div>
          </div>
        </div>
      </div>

      {/* Cards Superiores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <SummaryCard 
          title="Receita de Hoje" 
          value={totalValue} 
          formatter={fmtMon}
          icon={<DollarSign size={20} />} 
          main 
          onTitleClick={handleConfigClick}
          subtext={`Ontem: ${fmtMon(offsetConfig.ontemVal || 0)}`}
        />
        <SummaryCard 
          title="Vendas Hoje" 
          value={totalCount} 
          formatter={(v) => Math.round(v).toString()}
          icon={<ShoppingCart size={20} />} 
          subtext={`Ontem: ${offsetConfig.ontemCount || 0} vendas`}
        />
        <SummaryCard 
          title="Ticket Médio" 
          value={totalTicket} 
          formatter={fmtMon}
          icon={<TrendingUp size={20} />} 
          subtext=""
        />
      </div>

      {/* Gráfico de Origem das Vendas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CreditCard size={18} style={{ color: 'var(--color-green)' }} /> Origem das Vendas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
      </div>

      {/* Feed de Vendas ("Ao Vivo") na largura Total */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-green)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    + {fmtMon(sale.value)}
                    <button 
                      onClick={() => handleDeleteSale(sale)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                      title="Remover Venda"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{sale.time}</div>
                </div>
              </div>
            ))
            )}
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

function SummaryCard({ title, value, formatter, icon, main, onTitleClick, subtext }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', border: main ? '1px solid var(--color-green)' : '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: onTitleClick ? 'pointer' : 'default' }} onClick={onTitleClick}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: main ? 'var(--color-green)' : 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </span>
        <div style={{ color: main ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
          {icon}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
          <AnimatedNumber value={value} formatter={formatter} />
        </div>
        {subtext && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigModal({ onClose, offsetConfig, setOffsetConfig }) {
  const [tab, setTab] = useState('offset');
  const [valPix, setValPix] = useState(offsetConfig.today.toString());
  const [countPix, setCountPix] = useState(offsetConfig.count.toString());
  
  const [ontemVal, setOntemVal] = useState((offsetConfig.ontemVal || 0).toString());
  const [ontemCount, setOntemCount] = useState((offsetConfig.ontemCount || 0).toString());
  
  const [mesVal, setMesVal] = useState((offsetConfig.mesVal || 0).toString());
  const [metaGoal, setMetaGoal] = useState((offsetConfig.metaGoal || 1000000).toString());

  const [manPlat, setManPlat] = useState('XP Empresas (Pix)');
  const [manName, setManName] = useState('');
  const [manProd, setManProd] = useState('');
  const [manVal, setManVal] = useState('');
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
      await fetch('/api/sales/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manName,
          product: manProd || 'Produto',
          value: parseFloat(manVal.replace(',', '.')),
          platform: manPlat
        })
      });
      setManName(''); setManVal('');
      alert('Venda lançada!');
    } catch(e) { console.error(e); }
    setIsLoading(false);
  };
  
  const handleBulkImport = async () => {
    try {
      const list = JSON.parse(bulkJson);
      if (!Array.isArray(list)) return alert('Deve ser uma lista (Array) de JSON.');
      setIsLoading(true);
      
      for (const item of list) {
         await fetch('/api/sales/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.name || 'Cliente',
              product: item.product || 'Produto',
              value: parseFloat(item.value) || 0.0,
              platform: item.platform || 'Kirvano'
            })
         });
         // Pausa curta para não engasgar o servidor
         await new Promise(r => setTimeout(r, 200));
      }
      alert(`Foram importadas ${list.length} vendas com sucesso!`);
      setBulkJson('');
    } catch (e) {
      alert('Erro de JSON inválido ou falha na importação.');
    }
    setIsLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
      <div className="card" style={{ width: 450, maxWidth: '90vw', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Maleta de Operações</h2>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => setTab('offset')} style={{ padding: '8px 12px', background: 'transparent', border: 'none', color: tab === 'offset' ? 'var(--color-green)' : 'var(--color-text-muted)', borderBottom: tab === 'offset' ? '2px solid var(--color-green)' : '2px solid transparent', cursor: 'pointer', fontWeight: 600 }}>Cofre Base</button>
          <button onClick={() => setTab('manual')} style={{ padding: '8px 12px', background: 'transparent', border: 'none', color: tab === 'manual' ? 'var(--color-green)' : 'var(--color-text-muted)', borderBottom: tab === 'manual' ? '2px solid var(--color-green)' : '2px solid transparent', cursor: 'pointer', fontWeight: 600 }}>Lançador</button>
          <button onClick={() => setTab('bulk')} style={{ padding: '8px 12px', background: 'transparent', border: 'none', color: tab === 'bulk' ? 'var(--color-green)' : 'var(--color-text-muted)', borderBottom: tab === 'bulk' ? '2px solid var(--color-green)' : '2px solid transparent', cursor: 'pointer', fontWeight: 600 }}>Lote Oculto</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tab === 'offset' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{fontSize: 13, color: 'var(--color-text-muted)'}}>Estipule abaixo os valores que devem ser mantidos como base protegida no seu navegador.</p>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-green)', fontWeight: 600}}>Receita Oculta Hoje (R$)</label>
                  <input type="number" value={valPix} onChange={e => setValPix(e.target.value)} className="input" placeholder="0.00" style={{marginTop: 4}} />
                </div>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-green)', fontWeight: 600}}>Quantidade Oculta Hoje</label>
                  <input type="number" value={countPix} onChange={e => setCountPix(e.target.value)} className="input" placeholder="0" style={{marginTop: 4}} />
                </div>
                
                <hr style={{borderColor: 'var(--color-border)', margin: '8px 0'}} />
                
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text)', fontWeight: 600}}>Receita de ONTEM (R$)</label>
                  <input type="number" value={ontemVal} onChange={e => setOntemVal(e.target.value)} className="input" placeholder="Ex: 5000.00" style={{marginTop: 4}} />
                </div>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text)', fontWeight: 600}}>Quantidade de ONTEM</label>
                  <input type="number" value={ontemCount} onChange={e => setOntemCount(e.target.value)} className="input" placeholder="Ex: 20" style={{marginTop: 4}} />
                </div>

                <hr style={{borderColor: 'var(--color-border)', margin: '8px 0'}} />
                
                <h4 style={{fontSize: 14, color: 'var(--color-text)', marginTop: 4, fontWeight: 700}}>Métricas de Vaidade</h4>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Faturamento Total Base Mês (R$)</label>
                  <input type="number" value={mesVal} onChange={e => setMesVal(e.target.value)} className="input" placeholder="Ex: 50000.00" style={{marginTop: 4}} />
                </div>
                <div>
                  <label style={{fontSize: 14, color: 'var(--color-text-muted)'}}>Meta Personalizada (R$)</label>
                  <input type="number" value={metaGoal} onChange={e => setMetaGoal(e.target.value)} className="input" placeholder="Ex: 1000000" style={{marginTop: 4}} />
                </div>

                <button className="btn-primary" onClick={handleSaveOffset} style={{ marginTop: 8 }}>Salvar Configuração</button>
             </div>
          )}
          
          {tab === 'manual' && (
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

          {tab === 'bulk' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{fontSize: 13, color: 'var(--color-text-muted)'}}>Cole a Lista Mágica (Formato JSON) para replicar vendas passadas automaticamente.</p>
                <textarea 
                  className="input" 
                  style={{ height: 150, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                  placeholder={'[\n  {"name": "Fulano", "value": 150.00, "platform": "Kirvano", "product": "VIP"}\n]'}
                  value={bulkJson}
                  onChange={e => setBulkJson(e.target.value)}
                />
                <button className="btn-primary" onClick={handleBulkImport} disabled={isLoading} style={{ marginTop: 8 }}>
                  {isLoading ? 'Forjando Vendas...' : 'Importar Lote de Vendas'}
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
