import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from 'react';
import { api } from '../lib/api';
import { formatFullDateTime } from '../lib/date';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../lib/drafts';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type MessageVisibility,
  type TicketDetailData,
  type UserRole,
} from '../lib/types';
import { IconArrowLeft, IconLock, IconSliders } from './Icons';
import { SafeMarkdown } from './SafeMarkdown';

export interface TicketDetailHandle {
  injectPublicDraft: (text: string) => void;
}

interface TicketDetailProps {
  ref?: Ref<TicketDetailHandle>;
  ticket: TicketDetailData | null;
  loading: boolean;
  error: string | null;
  currentUserId: string;
  role: UserRole;
  contextOpen: boolean;
  onToggleContext: () => void;
  onBackMobile: () => void;
  onRefresh: () => Promise<void>;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNextActionCopy(ticket: TicketDetailData, role: UserRole): string {
  if (ticket.status === 'RESOLVED') {
    return 'Chamado encerrado. Caso o problema volte a acontecer no PDV, utilize Reabrir chamado.';
  }
  if (role === 'REQUESTER') {
    if (ticket.status === 'WAITING_CUSTOMER') {
      return 'A equipe aguarda sua resposta com o resultado do teste para concluir o atendimento.';
    }
    return 'Acompanhe o histórico abaixo ou envie informações adicionais para o atendente.';
  }
  if (!ticket.assigneeId) {
    return 'Chamado sem responsável: atribua um atendente no painel Contexto & IA e envie o diagnóstico inicial.';
  }
  if (ticket.status === 'WAITING_CUSTOMER') {
    return 'Aguardando retorno do cliente. Você pode registrar notas internas da equipe ou resolver se já validado.';
  }
  return 'Analise o histórico, consulte a base de conhecimento ou IA e envie uma resposta pública ao cliente.';
}

export function TicketDetail({
  ref,
  ticket,
  loading,
  error,
  currentUserId,
  role,
  contextOpen,
  onToggleContext,
  onBackMobile,
  onRefresh,
}: TicketDetailProps) {
  const isStaff = role === 'AGENT' || role === 'ADMIN';
  const [visibility, setVisibility] = useState<MessageVisibility>('PUBLIC');

  const [publicDraft, setPublicDraft] = useState<string>(() => {
    if (!ticket) return '';
    const server = ticket.drafts.find((d) => d.visibility === 'PUBLIC')?.content ?? '';
    return loadLocalDraft(currentUserId, ticket.id, 'PUBLIC') ?? server;
  });

  const [internalDraft, setInternalDraft] = useState<string>(() => {
    if (!ticket || !isStaff) return '';
    const server = ticket.drafts.find((d) => d.visibility === 'INTERNAL')?.content ?? '';
    return loadLocalDraft(currentUserId, ticket.id, 'INTERNAL') ?? server;
  });

  const [nextStatus, setNextStatus] = useState<'IN_PROGRESS' | 'WAITING_CUSTOMER'>('IN_PROGRESS');
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createIdempotencyKey());
  const syncTimerRef = useRef<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      injectPublicDraft: (text: string) => {
        if (!ticket) return;
        setVisibility('PUBLIC');
        setPublicDraft(text);
        saveLocalDraft(currentUserId, ticket.id, 'PUBLIC', text);
        setSubmitSuccess('Rascunho inserido no editor. Revise antes de enviar.');
      },
    }),
    [ticket, currentUserId],
  );

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  const activeDraft = visibility === 'PUBLIC' ? publicDraft : internalDraft;

  const handleDraftChange = (val: string, targetVis: MessageVisibility) => {
    if (!ticket) return;
    if (targetVis === 'PUBLIC') setPublicDraft(val);
    else setInternalDraft(val);

    saveLocalDraft(currentUserId, ticket.id, targetVis, val);

    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      api.saveDraft(ticket.id, targetVis, val).catch(() => {
        // Falha silenciosa na sincronização de rascunho; cópia local segue intacta
      });
    }, 500);
  };

  const handleDiscardDraft = async () => {
    if (!ticket) return;
    if (visibility === 'PUBLIC') setPublicDraft('');
    else setInternalDraft('');
    clearLocalDraft(currentUserId, ticket.id, visibility);
    try {
      await api.clearDraft(ticket.id, visibility);
    } catch {
      // Ignora erro de rede ao limpar
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticket || !activeDraft.trim()) return;

    setSending(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      await api.sendMessage(ticket.id, {
        body: activeDraft,
        visibility,
        idempotencyKey,
        ...(isStaff && visibility === 'PUBLIC' ? { nextStatus } : {}),
      });

      clearLocalDraft(currentUserId, ticket.id, visibility);
      if (visibility === 'PUBLIC') setPublicDraft('');
      else setInternalDraft('');

      setIdempotencyKey(createIdempotencyKey());
      setSubmitSuccess(
        visibility === 'INTERNAL'
          ? 'Nota interna registrada apenas para a equipe.'
          : 'Resposta pública enviada ao chamado.',
      );
      await onRefresh();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar a mensagem. Rascunho preservado.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleResolveOrReopen = async () => {
    if (!ticket) return;
    setActionBusy(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      if (ticket.status === 'RESOLVED') {
        await api.reopenTicket(ticket.id, ticket.version);
        setSubmitSuccess('Chamado reaberto.');
      } else {
        await api.resolveTicket(ticket.id, ticket.version);
        setSubmitSuccess('Chamado marcado como resolvido.');
      }
      await onRefresh();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível alterar o status.');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && !ticket) {
    return (
      <section className="detail-pane" aria-label="Detalhe do chamado">
        <div className="mobile-back-bar">
          <button type="button" className="btn btn-sm" onClick={onBackMobile}>
            <IconArrowLeft />
            <span>Voltar à fila</span>
          </button>
        </div>
        <p style={{ padding: '24px', color: 'var(--text-secondary)' }}>Carregando chamado...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="detail-pane" aria-label="Detalhe do chamado">
        <div className="mobile-back-bar">
          <button type="button" className="btn btn-sm" onClick={onBackMobile}>
            <IconArrowLeft />
            <span>Voltar à fila</span>
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          <div className="alert alert-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: '8px' }}
              onClick={() => void onRefresh()}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="detail-pane" aria-label="Detalhe do chamado">
        <div style={{ padding: '32px', color: 'var(--text-secondary)' }}>
          <h2 className="display-title" style={{ fontSize: '24px', color: 'var(--text-primary)' }}>
            Selecione um chamado na fila
          </h2>
          <p style={{ marginTop: '6px' }}>
            Escolha um item à esquerda para ler o histórico, responder ou consultar a IA.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-pane" aria-label={`Chamado ${ticket.code}`}>
      <div className="mobile-back-bar">
        <button type="button" className="btn btn-sm" onClick={onBackMobile}>
          <IconArrowLeft />
          <span>Voltar à fila</span>
        </button>
        <span className="ticket-code">{ticket.code}</span>
      </div>

      <header className="detail-header">
        <div className="detail-header-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '6px',
              }}
            >
              <span className="ticket-code">{ticket.code}</span>
              <span className={`badge badge-status-${ticket.status}`}>
                {STATUS_LABELS[ticket.status]}
              </span>
              <span className={`badge badge-priority-${ticket.priority}`}>
                Prioridade {PRIORITY_LABELS[ticket.priority]}
              </span>
              <span className="badge">{CATEGORY_LABELS[ticket.category]}</span>
            </div>
            <h2 className="detail-subject">{ticket.subject}</h2>
          </div>

          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-sm"
              aria-expanded={contextOpen}
              onClick={onToggleContext}
            >
              <IconSliders />
              <span>
                {contextOpen ? 'Ocultar contexto' : isStaff ? 'Contexto & IA' : 'Detalhes'}
              </span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${ticket.status === 'RESOLVED' ? '' : 'btn-lime'}`}
              disabled={actionBusy}
              onClick={handleResolveOrReopen}
            >
              {ticket.status === 'RESOLVED' ? 'Reabrir chamado' : 'Marcar como resolvido'}
            </button>
          </div>
        </div>

        <div className="detail-summary-strip">
          <span>
            <strong>Cliente:</strong> {ticket.customerName} ({ticket.requester.name})
          </span>
          <span>
            <strong>Responsável:</strong> {ticket.assignee?.name ?? 'Não atribuído'}
          </span>
          <span>
            <strong>Última interação:</strong>{' '}
            <span className="mono">{formatFullDateTime(ticket.lastInteractionAt)}</span>
          </span>
        </div>
      </header>

      <div className="next-action-bar">
        <div>
          <span
            className="mono"
            style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-purple)' }}
          >
            PRÓXIMA AÇÃO //{' '}
          </span>
          <span>{getNextActionCopy(ticket, role)}</span>
        </div>
      </div>

      <div className="timeline-scroll" aria-label="Histórico do chamado">
        {ticket.messages.map((msg) => {
          const isInternal = msg.visibility === 'INTERNAL';
          const isEvent = msg.kind === 'EVENT';

          if (isEvent) {
            return (
              <div key={msg.id} className="timeline-item event">
                <div className="timeline-item-header">
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    {msg.body}
                  </span>
                  <span className="timeline-time">{formatFullDateTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          }

          return (
            <article
              key={msg.id}
              className={`timeline-item ${isInternal ? 'internal' : ''}`}
              aria-label={isInternal ? 'Nota interna da equipe' : 'Mensagem pública'}
            >
              <div className="timeline-item-header">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                >
                  <span className="timeline-author">{msg.author.name}</span>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    ({ROLE_LABELS[msg.author.role]})
                  </span>
                  {isInternal ? (
                    <span
                      className="visibility-tag internal"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <IconLock />
                      NOTA INTERNA — EQUIPE
                    </span>
                  ) : (
                    <span className="visibility-tag">RESPOSTA PÚBLICA</span>
                  )}
                </div>
                <time className="timeline-time" dateTime={msg.createdAt}>
                  {formatFullDateTime(msg.createdAt)}
                </time>
              </div>
              <SafeMarkdown content={msg.body} />
            </article>
          );
        })}
      </div>

      <form className="composer-box" onSubmit={handleSendMessage}>
        {submitError && (
          <div className="alert alert-error" role="alert">
            {submitError}
          </div>
        )}
        {submitSuccess && (
          <div className="alert alert-success" role="status">
            {submitSuccess}
          </div>
        )}

        <div className="composer-tabs">
          <div className="tab-group" role="tablist" aria-label="Tipo de registro">
            <button
              type="button"
              role="tab"
              aria-selected={visibility === 'PUBLIC'}
              className={`tab-btn ${visibility === 'PUBLIC' ? 'active-public' : ''}`}
              onClick={() => setVisibility('PUBLIC')}
            >
              Resposta pública
            </button>
            {isStaff && (
              <button
                type="button"
                role="tab"
                aria-selected={visibility === 'INTERNAL'}
                className={`tab-btn ${visibility === 'INTERNAL' ? 'active-internal' : ''}`}
                onClick={() => setVisibility('INTERNAL')}
              >
                Nota interna (oculta ao cliente)
              </button>
            )}
          </div>

          {isStaff && visibility === 'PUBLIC' && (
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <span>Ao enviar:</span>
              <select
                className="select"
                style={{ width: 'auto', minHeight: '30px', padding: '2px 8px' }}
                value={nextStatus}
                onChange={(e) =>
                  setNextStatus(e.target.value as 'IN_PROGRESS' | 'WAITING_CUSTOMER')
                }
              >
                <option value="IN_PROGRESS">Manter em atendimento</option>
                <option value="WAITING_CUSTOMER">Marcar aguardando cliente</option>
              </select>
            </label>
          )}
        </div>

        <label className="field">
          <span className="sr-only">
            {visibility === 'INTERNAL' ? 'Texto da nota interna' : 'Texto da resposta pública'}
          </span>
          <textarea
            className="textarea"
            rows={4}
            maxLength={5000}
            style={
              visibility === 'INTERNAL'
                ? { background: 'var(--internal-bg)', borderColor: 'var(--internal-border)' }
                : undefined
            }
            placeholder={
              visibility === 'INTERNAL'
                ? 'Registre diagnóstico técnico ou orientação visível apenas para a equipe...'
                : 'Escreva a resposta para o chamado (suporta Markdown simples; rascunho salvo automaticamente)...'
            }
            value={activeDraft}
            onChange={(e) => handleDraftChange(e.target.value, visibility)}
          />
        </label>

        <div className="composer-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {activeDraft.trim() ? 'Rascunho preservado localmente' : 'Sem rascunho ativo'}
            </span>
            {activeDraft.trim() && (
              <button type="button" className="btn btn-sm" onClick={handleDiscardDraft}>
                Descartar rascunho
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={sending || !activeDraft.trim()}
            className={`btn ${visibility === 'INTERNAL' ? '' : 'btn-primary'}`}
          >
            {sending
              ? 'Enviando...'
              : visibility === 'INTERNAL'
                ? 'Registrar nota interna'
                : 'Enviar resposta pública'}
          </button>
        </div>
      </form>
    </section>
  );
}
