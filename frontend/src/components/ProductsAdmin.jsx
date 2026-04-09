import { useState, useEffect } from 'react';

const TYPE_LABELS = { produtor: 'Produtor', coprodutor: 'Coprodutor' };
const TYPE_COLORS = { produtor: '#22c55e', coprodutor: '#f97316' };

export default function ProductsAdmin() {
  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState(null);
  const [editVal, setEditVal]       = useState({});
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ name: '', type: 'coprodutor', commission_percent: '', platform: 'Paradise' });
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditVal({ commission_percent: p.commission_percent, type: p.type });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_percent: parseFloat(editVal.commission_percent), type: editVal.type }),
      });
      setEditingId(null);
      load();
    } catch (e) { alert('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const deleteProduct = async (id, name) => {
    if (!confirm(`Remover produto "${name}"?`)) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    load();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.commission_percent) { alert('Preencha todos os campos'); return; }
    setSaving(true);
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, commission_percent: parseFloat(form.commission_percent) }),
      });
      setForm({ name: '', type: 'coprodutor', commission_percent: '', platform: 'Paradise' });
      setShowForm(false);
      load();
    } catch (e) { alert('Erro ao criar produto'); }
    finally { setSaving(false); }
  };

  const produtores  = products.filter(p => p.type === 'produtor');
  const coprodutores = products.filter(p => p.type === 'coprodutor');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            Gestão de Produtos
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Configure comissões por produto para cálculo automático do lucro líquido.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: showForm ? 'rgba(34,197,94,0.15)' : 'var(--color-green)',
            color: showForm ? 'var(--color-green)' : '#000',
            fontWeight: 700, fontSize: '0.875rem',
          }}
        >
          {showForm ? '✕ Cancelar' : '+ Novo Produto'}
        </button>
      </div>

      {/* Form: novo produto */}
      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-green)',
          borderRadius: 12, padding: '1.25rem 1.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.875rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-green)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Novo Produto</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelSt}>Nome do Produto</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: DUPLO GREEN"
                style={inputSt}
              />
            </div>
            <div>
              <label style={labelSt}>Plataforma</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={inputSt}>
                <option>Paradise</option>
                <option>PerfectPay</option>
                <option>Kirvano</option>
                <option>Payt</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputSt}>
                <option value="coprodutor">Coprodutor</option>
                <option value="produtor">Produtor</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>Comissão (%)</label>
              <input
                type="number" min="0" max="100" step="0.01"
                value={form.commission_percent}
                onChange={e => setForm(f => ({ ...f, commission_percent: e.target.value }))}
                placeholder="Ex: 67"
                style={inputSt}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving} style={{
              padding: '0.5rem 1.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--color-green)', color: '#000', fontWeight: 700, fontSize: '0.875rem',
            }}>
              {saving ? 'Salvando...' : 'Criar Produto'}
            </button>
          </div>
        </form>
      )}

      {/* Tabela: Produtores */}
      <ProductTable
        title="Produtor (você é dono do produto)"
        color="#22c55e"
        products={produtores}
        loading={loading}
        editingId={editingId}
        editVal={editVal}
        setEditVal={setEditVal}
        startEdit={startEdit}
        saveEdit={saveEdit}
        cancelEdit={() => setEditingId(null)}
        deleteProduct={deleteProduct}
        saving={saving}
      />

      {/* Tabela: Coprodutores */}
      <ProductTable
        title="Coprodutor (você recebe % do líquido)"
        color="#f97316"
        products={coprodutores}
        loading={loading}
        editingId={editingId}
        editVal={editVal}
        setEditVal={setEditVal}
        startEdit={startEdit}
        saveEdit={saveEdit}
        cancelEdit={() => setEditingId(null)}
        deleteProduct={deleteProduct}
        saving={saving}
      />

      {/* Nota de cálculo */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
        borderRadius: 10, padding: '0.875rem 1.25rem',
        fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--color-text)' }}>Fórmula de cálculo (Paradise):</strong><br />
        <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
          Líquido = bruto × (1 − 4,99%) − R$1,59
        </span><br />
        <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
          Lucro = Líquido × comissão%
        </span><br />
        Webhooks: <code>/webhooks/paradise</code> (produtor) · <code>/webhooks/paradise/coproducao</code> (coprodutor)
      </div>
    </div>
  );
}

function ProductTable({ title, color, products, loading, editingId, editVal, setEditVal, startEdit, saveEdit, cancelEdit, deleteProduct, saving }) {
  return (
    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{products.length} produto{products.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#444', fontSize: '0.875rem' }}>Carregando...</div>
      ) : products.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#444', fontSize: '0.875rem' }}>Nenhum produto cadastrado.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Produto', 'Plataforma', 'Comissão', ''].map(h => (
                <th key={h} style={{ padding: '0.625rem 1.25rem', textAlign: h === 'Comissão' ? 'center' : 'left', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: i < products.length - 1 ? '1px solid #111' : 'none', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#111'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</td>
                <td style={{ padding: '0.75rem 1.25rem' }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
                    {p.platform}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center' }}>
                  {editingId === p.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <input
                        autoFocus
                        type="number" min="0" max="100" step="0.01"
                        value={editVal.commission_percent ?? p.commission_percent}
                        onChange={e => setEditVal(v => ({ ...v, commission_percent: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(p.id); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ width: 70, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-green)', borderRadius: 4, color: 'var(--color-text)', fontSize: '0.875rem', padding: '2px 6px', textAlign: 'center', outline: 'none' }}
                      />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>%</span>
                      <button onClick={() => saveEdit(p.id)} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--color-green)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>✓</button>
                      <button onClick={cancelEdit} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: color }}>{p.commission_percent}%</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {editingId !== p.id && (
                      <button onClick={() => startEdit(p)} style={btnSt('#facc15')}>✏</button>
                    )}
                    <button onClick={() => deleteProduct(p.id, p.name)} style={btnSt('#ef4444')}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const labelSt = { fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 };
const inputSt = { width: '100%', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-hover)', borderRadius: 6, color: 'var(--color-text)', fontSize: '0.875rem', padding: '0.5rem 0.75rem', outline: 'none', boxSizing: 'border-box' };
const btnSt = (hoverColor) => ({
  background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 5,
  color: 'var(--color-text-muted)', cursor: 'pointer', padding: '3px 8px', fontSize: '0.75rem',
  transition: 'all 0.15s',
});
