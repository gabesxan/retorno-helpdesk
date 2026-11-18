import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  type RequesterOption,
  type TicketCategory,
  type TicketPriority,
  type TicketSummary,
  type UserRole,
} from '../lib/types';

interface NewTicketModalProps {
  open: boolean;
  role: UserRole;
  onClose: () => void;
  onCreated: (ticket: TicketSummary) => void;
}

export function NewTicketModal({ open, role, onClose, onCreated }: NewTicketModalProps) {
  const isStaff = role === 'AGENT' || role === 'ADMIN';
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('PRINTER_HARDWARE');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [description, setDescription] = useState('');
  const [requesterId, setRequesterId] = useState('');
  const [requesters, setRequesters] = useState<RequesterOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isStaff) return;
    api
      .listRequesters()
      .then((res) => setRequesters(res.requesters))
      .catch(() => {
        // Lista opcional se atendente abrir chamado em nome próprio
      });
  }, [open, isStaff]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = isStaff
        ? {
            subject,
            category,
            priority,
            description,
            ...(requesterId ? { requesterId } : {}),
          }
        : {
            subject,
            category,
            description,
          };

      const res = await api.createTicket(payload);
      setSubject('');
      setDescription('');
      setRequesterId('');
      onCreated(res.ticket);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir o chamado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-ticket-title"
    >
      <div className="modal-panel">
        <div className="modal-head">
          <div className="section-heading">
            <span className="section-num">NOVO //</span>
            <h2 id="new-ticket-title" className="section-title" style={{ fontSize: '20px' }}>
              Abrir novo chamado
            </h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancelar
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          {isStaff && requesters.length > 0 && (
            <label className="field">
              <span className="field-label">Cliente / Solicitante (opcional)</span>
              <select
                className="select"
                value={requesterId}
                onChange={(e) => setRequesterId(e.target.value)}
              >
                <option value="">Abrir para meu próprio usuário</option>
                {requesters.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.companyName} — {req.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span className="field-label">Assunto do chamado</span>
            <input
              type="text"
              className="input"
              required
              minLength={5}
              maxLength={180}
              placeholder="Ex.: Impressora do caixa 03 deixou de imprimir cupom"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>

          <div className={isStaff ? 'filter-row' : ''}>
            <label className="field">
              <span className="field-label">Categoria</span>
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
              >
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {isStaff && (
              <label className="field">
                <span className="field-label">Prioridade inicial</span>
                <select
                  className="select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                >
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="field">
            <span className="field-label">Descrição do ocorrido</span>
            <textarea
              className="textarea"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              placeholder="Descreva qual terminal ou caixa apresenta o erro, quando começou e o que aparece na tela."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Registrando...' : 'Registrar chamado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
