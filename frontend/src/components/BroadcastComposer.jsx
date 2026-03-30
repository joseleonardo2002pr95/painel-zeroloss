import { useState, useRef } from 'react';
import { Image, Type, Send, Trash2, ChevronUp, ChevronDown, Upload, Video } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import BroadcastProgress from './BroadcastProgress';

export default function BroadcastComposer() {
  const [target, setTarget] = useState('leads');
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const pendingImgIndex = useRef(null);
  const pendingVideoIndex = useRef(null);

  /* ──── Helpers ──── */
  const addBlock = (type) =>
    setMessages(prev => [...prev, { id: Date.now(), type, content: '', preview: null }]);

  const removeBlock = (id) =>
    setMessages(prev => prev.filter(m => m.id !== id));

  const updateContent = (id, content) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content } : m));

  const moveBlock = (idx, dir) => {
    const next = [...messages];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setMessages(next);
  };

  /* ──── Image upload ──── */
  const openFilePicker = (id, idx) => {
    pendingImgIndex.current = id;
    fileInputRef.current.click();
  };

  /* ──── Video upload ──── */
  const openVideoPicker = (id) => {
    pendingVideoIndex.current = id;
    videoInputRef.current.click();
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result; // "data:video/mp4;base64,..."
      setMessages(prev => prev.map(m =>
        m.id === pendingVideoIndex.current
          ? { ...m, content: b64, preview: URL.createObjectURL(file), type: 'video_b64' }
          : m
      ));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result; // "data:image/png;base64,..."
      setMessages(prev => prev.map(m =>
        m.id === pendingImgIndex.current
          ? { ...m, content: b64, preview: b64, type: 'image_b64' }
          : m
      ));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ──── Send ──── */
  const handleSend = async () => {
    if (messages.length === 0) {
      toast.error('Adicione pelo menos um bloco de mensagem.');
      return;
    }
    if (messages.some(m => !m.content.trim())) {
      toast.error('Preencha o conteúdo de todos os blocos.');
      return;
    }
    setIsSending(true);
    try {
      const payload = {
        target,
        messages: messages.map(m => ({ type: m.type, content: m.content })),
      };
      const res = await axios.post('/api/broadcast', payload);
      setActiveJob(res.data.job_id);
      toast.success(`Campanha iniciada para ${res.data.total} usuários!`);
      setMessages([]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao iniciar campanha.');
    } finally {
      setIsSending(false);
    }
  };

  /* ──── Render ──── */
  return (
    <>
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoChange} />

      {/* Progress panel while job running */}
      {activeJob && (
        <BroadcastProgress jobId={activeJob} onClose={() => setActiveJob(null)} />
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Compor Mensagem
          </h2>

          {/* Target toggle */}
          <div style={{ display: 'flex', background: 'var(--color-bg-elevated)', borderRadius: 8, padding: 3, border: '1px solid var(--color-border)' }}>
            <button className={`toggle-btn ${target === 'leads' ? 'active' : 'inactive'}`} onClick={() => setTarget('leads')}>
              Leads
            </button>
            <button className={`toggle-btn ${target === 'clients' ? 'active' : 'inactive'}`} onClick={() => setTarget('clients')}>
              Clientes
            </button>
          </div>
        </div>

        {/* Block list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem',
              border: '2px dashed var(--color-border)', borderRadius: 10,
              color: 'var(--color-text-muted)', fontSize: '0.875rem',
            }}>
              Nenhum bloco adicionado. Use os botões abaixo para compor.
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id} className="message-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                {/* Type badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: msg.type === 'text' ? '#60a5fa' : msg.type === 'video_b64' ? '#a78bfa' : 'var(--color-green)',
                  background: msg.type === 'text' ? 'rgba(96,165,250,0.1)' : msg.type === 'video_b64' ? 'rgba(167,139,250,0.1)' : 'rgba(34,197,94,0.1)',
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  {msg.type === 'text' ? <Type size={11} /> : msg.type === 'video_b64' ? <Video size={11} /> : <Image size={11} />}
                  {msg.type === 'text' ? 'Texto' : msg.type === 'video_b64' ? 'Vídeo' : 'Imagem'}
                </span>

                {/* Controls */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <IconBtn onClick={() => moveBlock(idx, 'up')} disabled={idx === 0} title="Mover para cima">
                    <ChevronUp size={14} />
                  </IconBtn>
                  <IconBtn onClick={() => moveBlock(idx, 'down')} disabled={idx === messages.length - 1} title="Mover para baixo">
                    <ChevronDown size={14} />
                  </IconBtn>
                  <IconBtn onClick={() => removeBlock(msg.id)} danger title="Remover">
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>

              {/* Content area */}
              {msg.type === 'text' ? (
                <textarea
                  className="input-field"
                  style={{ minHeight: 90 }}
                  placeholder="Digite sua mensagem aqui…"
                  value={msg.content}
                  onChange={e => updateContent(msg.id, e.target.value)}
                />
              ) : msg.type === 'video_b64' ? (
                <div>
                  {msg.preview ? (
                    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                      <video
                        src={msg.preview}
                        controls
                        style={{ maxHeight: 200, width: '100%', borderRadius: 8, border: '1px solid var(--color-border-hover)', background: '#000' }}
                      />
                      <button
                        onClick={() => openVideoPicker(msg.id)}
                        style={{
                          marginTop: 8,
                          background: 'rgba(0,0,0,0.7)', color: '#fff',
                          border: 'none', borderRadius: 6, padding: '4px 10px',
                          fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <Upload size={12} /> Trocar vídeo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openVideoPicker(msg.id)}
                      style={{
                        width: '100%', padding: '1.5rem 1rem',
                        border: '2px dashed #a78bfa55', borderRadius: 8,
                        background: 'transparent', cursor: 'pointer',
                        color: 'var(--color-text-muted)', fontSize: '0.875rem',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        transition: 'border-color 0.2s, color 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.color = '#a78bfa'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#a78bfa55'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                    >
                      <Video size={22} />
                      Clique para selecionar vídeo do computador
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  {msg.preview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={msg.preview} alt="preview"
                        style={{ maxHeight: 160, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--color-border-hover)' }} />
                      <button
                        onClick={() => openFilePicker(msg.id, idx)}
                        style={{
                          position: 'absolute', bottom: 8, right: 8,
                          background: 'rgba(0,0,0,0.7)', color: '#fff',
                          border: 'none', borderRadius: 6, padding: '4px 10px',
                          fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <Upload size={12} /> Trocar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openFilePicker(msg.id, idx)}
                      style={{
                        width: '100%', padding: '1.5rem 1rem',
                        border: '2px dashed var(--color-border-hover)', borderRadius: 8,
                        background: 'transparent', cursor: 'pointer',
                        color: 'var(--color-text-muted)', fontSize: '0.875rem',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        transition: 'border-color 0.2s, color 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-green)'; e.currentTarget.style.color = 'var(--color-green)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                    >
                      <Upload size={22} />
                      Clique para selecionar imagem do computador
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '1rem', borderTop: '1px solid var(--color-border)', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => addBlock('text')}>
              <Type size={14} /> Adicionar Texto
            </button>
            <button className="btn-secondary" onClick={() => addBlock('image_b64')}>
              <Image size={14} /> Adicionar Imagem
            </button>
            <button className="btn-secondary" onClick={() => addBlock('video_b64')} style={{ color: '#a78bfa', borderColor: '#a78bfa55' }}>
              <Video size={14} /> Adicionar Vídeo
            </button>
          </div>

          <button
            className="btn-primary"
            onClick={handleSend}
            disabled={isSending || messages.length === 0}
            style={messages.length > 0 ? { animation: 'none' } : {}}
          >
            {isSending ? 'Enviando…' : 'Iniciar Disparo'} <Send size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

function IconBtn({ children, onClick, disabled, danger, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'transparent', border: 'none', padding: 5,
        borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
        color: danger ? '#ef4444' : 'var(--color-text-muted)',
        opacity: disabled ? 0.3 : 1,
        transition: 'color 0.2s, background 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-bg-card)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}
