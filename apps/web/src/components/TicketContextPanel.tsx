import { useState } from 'react';
import { api } from '../lib/api';
import { formatFullDateTime } from '../lib/date';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AgentOption,
  type ClassificationSuggestion,
  type DraftReplySuggestion,
  type TicketCategory,
  type TicketDetailData,
  type TicketPriority,
  type TicketStatus,
  type UserRole,
} from '../lib/types';

interface TicketContextPanelProps {
  ticket: TicketDetailData;
  role: UserRole;
  agents: AgentOption[];
  onClosePanel: () => void;
  onTicketUpdated: () => Promise<void>;
  onInsertAiDraft: (text: string) => void;
  onPreviewArticle: (slugOrId: string) => void;
}

export function TicketContextPanel({
  ticket,
  role,
  agents,
  onClosePanel,
  onTicketUpdated,
  onInsertAiDraft,
  onPreviewArticle,
}: TicketContextPanelProps) {
  const isStaff = role === 'AGENT' || role === 'ADMIN';

  const [statusEdit, setStatusEdit] = useState<TicketStatus | null>(null);
  const [priorityEdit, setPriorityEdit] = useState<TicketPriority | null>(null);
  const [categoryEdit, setCategoryEdit] = useState<TicketCategory | null>(null);
  const [assigneeEdit, setAssigneeEdit] = useState<string | null>(null);

  const status = statusEdit ?? ticket.status;
  const priority = priorityEdit ?? ticket.priority;
  const category = categoryEdit ?? ticket.category;
  const assigneeId = assigneeEdit ?? ticket.assigneeId ?? '';

  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSuccess, setMetaSuccess] = useState<string | null>(null);

  const [includeInternalNotes, setIncludeInternalNotes] = useState(false);
  const [internalNotesReason, setInternalNotesReason] = useState('');
  const [aiLoading, setAiLoading] = useState<'classify' | 'draft' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [classification, setClassification] = useState<ClassificationSuggestion | null>(null);
  const [draftReply, setDraftReply] = useState<DraftReplySuggestion | null>(null);

  const clearEdits = () => {
    setStatusEdit(null);
    setPriorityEdit(null);
    setCategoryEdit(null);
    setAssigneeEdit(null);
  };

  const handleSaveMetadata = async () => {
    setSavingMeta(true);
    setMetaError(null);
    setMetaSuccess(null);
    try {
      await api.updateTicket(ticket.id, {
        expectedVersion: ticket.version,
        status,
        priority,
        category,
        assigneeId: assigneeId || null,
      });
      clearEdits();
      setMetaSuccess('Classificação e atribuição atualizadas.');
      await onTicketUpdated();
    } catch (err: unknown) {
      setMetaError(err instanceof Error ? err.message : 'Erro ao atualizar o chamado.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSuggestClassification = async () => {
    setAiLoading('classify');
    setAiError(null);
    try {
      const res = await api.suggestClassification(ticket.id, {
        includeInternalNotes,
        ...(includeInternalNotes ? { internalNotesReason } : {}),
      });
      setClassification(res.suggestion);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'IA indisponível no momento.');
    } finally {
      setAiLoading(null);
    }
  };

  const handleApplyClassification = async () => {
    if (!classification) return;
    setSavingMeta(true);
    setMetaError(null);
    setMetaSuccess(null);
    try {
      await api.updateTicket(ticket.id, {
        expectedVersion: ticket.version,
        category: classification.suggestedCategory,
        priority: classification.suggestedPriority,
      });
      clearEdits();
      setMetaSuccess('Sugestão de classificação aplicada após sua confirmação.');
      setClassification(null);
      await onTicketUpdated();
    } catch (err: unknown) {
      setMetaError(err instanceof Error ? err.message : 'Falha ao aplicar classificação.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handlePrepareDraft = async () => {
    setAiLoading('draft');
    setAiError(null);
    try {
      const res = await api.prepareDraftReply(ticket.id, {
        includeInternalNotes,
        ...(includeInternalNotes ? { internalNotesReason } : {}),
      });
      setDraftReply(res.draft);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'IA indisponível no momento.');
    } finally {
      setAiLoading(null);
    }
  };

  const draftIsStale =
    draftReply !== null &&
    (draftReply.staleDuringGeneration || draftReply.ticketVersionAtStart !== ticket.version);

  const classifyIsStale =
    classification !== null &&
    (classification.staleDuringGeneration ||
      classification.ticketVersionAtStart !== ticket.version);

  return (
    <aside className="context-pane" aria-label="Contexto e assistente de IA">
      <div className="pane-header">
        <div className="section-heading">
          <span className="section-num">03 //</span>
          <h2 className="section-title" style={{ fontSize: '18px' }}>
            {isStaff ? 'Contexto & IA' : 'Dados do chamado'}
          </h2>
        </div>
        <button type="button" className="btn btn-sm" onClick={onClosePanel}>
          Recolher
        </button>
      </div>

      <div className="context-section">
        <div className="context-section-title">
          <span>METADADOS TÉCNICOS</span>
          <span className="mono">v{ticket.version}</span>
        </div>
        <dl style={{ margin: 0, display: 'grid', gap: '6px', fontSize: '12.5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Cliente</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{ticket.customerName}</dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Solicitante</dt>
            <dd style={{ margin: 0 }}>{ticket.requester.name}</dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Abertura</dt>
            <dd className="mono" style={{ margin: 0, fontSize: '11.5px' }}>
              {formatFullDateTime(ticket.createdAt)}
            </dd>
          </div>
          {ticket.resolvedAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <dt style={{ color: 'var(--text-secondary)' }}>Resolvido em</dt>
              <dd className="mono" style={{ margin: 0, fontSize: '11.5px' }}>
                {formatFullDateTime(ticket.resolvedAt)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {isStaff && (
        <>
          <div className="context-section">
            <div className="context-section-title">
              <span>CLASSIFICAÇÃO E RESPONSÁVEL</span>
            </div>

            {metaError && (
              <div className="alert alert-error" role="alert">
                {metaError}
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: '6px' }}
                  onClick={() => {
                    clearEdits();
                    void onTicketUpdated();
                  }}
                >
                  Recarregar chamado
                </button>
              </div>
            )}
            {metaSuccess && (
              <div className="alert alert-success" role="status">
                {metaSuccess}
              </div>
            )}

            <label className="field">
              <span className="field-label">Responsável</span>
              <select
                className="select"
                value={assigneeId}
                onChange={(e) => setAssigneeEdit(e.target.value)}
              >
                <option value="">Não atribuído</option>
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Status</span>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatusEdit(e.target.value as TicketStatus)}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Prioridade</span>
              <select
                className="select"
                value={priority}
                onChange={(e) => setPriorityEdit(e.target.value as TicketPriority)}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Categoria</span>
              <select
                className="select"
                value={category}
                onChange={(e) => setCategoryEdit(e.target.value as TicketCategory)}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn btn-primary"
              disabled={savingMeta}
              onClick={handleSaveMetadata}
            >
              {savingMeta ? 'Salvando...' : 'Salvar classificação'}
            </button>
          </div>

          <div className="context-section">
            <div className="context-section-title">
              <span>ASSISTENTE IA (REVISÃO OBRIGATÓRIA)</span>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              A IA sugere classificação e rascunhos com base na base de conhecimento. Nenhuma
              alteração ou envio ocorre sem sua confirmação.
            </p>

            <label
              style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px' }}
            >
              <input
                type="checkbox"
                checked={includeInternalNotes}
                onChange={(e) => setIncludeInternalNotes(e.target.checked)}
              />
              <span>Incluir notas internas no contexto da IA (exige justificativa)</span>
            </label>

            {includeInternalNotes && (
              <label className="field">
                <span className="field-label">
                  Motivo para enviar notas internas (mín. 15 chars)
                </span>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex.: Diagnóstico depende do número de série registrado internamente"
                  value={internalNotesReason}
                  onChange={(e) => setInternalNotesReason(e.target.value)}
                />
              </label>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={aiLoading !== null}
                onClick={handleSuggestClassification}
              >
                {aiLoading === 'classify' ? 'Analisando...' : 'Sugerir classificação'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={aiLoading !== null}
                onClick={handlePrepareDraft}
              >
                {aiLoading === 'draft' ? 'Redigindo...' : 'Preparar resposta'}
              </button>
            </div>

            {aiError && (
              <div className="alert alert-error" role="alert">
                {aiError}
              </div>
            )}

            {classification && (
              <div className="ai-box" aria-live="polite">
                <span className="ai-mode-badge">{classification.providerLabel}</span>
                {classifyIsStale && (
                  <div className="alert alert-warning" style={{ fontSize: '12px' }}>
                    O chamado foi alterado durante/após a análise. Confira antes de aplicar.
                  </div>
                )}
                <div style={{ fontSize: '12.5px' }}>
                  <strong>Categoria sugerida:</strong>{' '}
                  {CATEGORY_LABELS[classification.suggestedCategory]}
                  <br />
                  <strong>Prioridade sugerida:</strong>{' '}
                  {PRIORITY_LABELS[classification.suggestedPriority]}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {classification.justification}
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-lime"
                    disabled={savingMeta}
                    onClick={handleApplyClassification}
                  >
                    Aplicar sugestão
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setClassification(null)}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {draftReply && (
              <div className="ai-box" aria-live="polite">
                <span className="ai-mode-badge">{draftReply.providerLabel}</span>
                {draftIsStale && (
                  <div className="alert alert-warning" style={{ fontSize: '12px' }}>
                    O chamado mudou após a geração deste rascunho. Revise o histórico antes de usar.
                  </div>
                )}

                {!draftReply.sufficientDocumentation ? (
                  <>
                    <div className="alert alert-warning" style={{ fontSize: '12.5px' }}>
                      <strong>Documentação insuficiente:</strong> {draftReply.limitationNotice}
                    </div>
                    {draftReply.suggestedQuestion && (
                      <>
                        <p style={{ fontSize: '12.5px' }}>
                          <strong>Pergunta sugerida ao cliente:</strong>{' '}
                          {draftReply.suggestedQuestion}
                        </p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-lime"
                            onClick={() => onInsertAiDraft(draftReply.suggestedQuestion ?? '')}
                          >
                            Usar pergunta no editor
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setDraftReply(null)}
                          >
                            Descartar
                          </button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-grid)',
                        padding: '8px',
                        fontSize: '12.5px',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {draftReply.draftText}
                    </div>

                    {draftReply.citations.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span className="field-label">Fontes da base consultadas</span>
                        {draftReply.citations.map((cit) => (
                          <div
                            key={cit.articleId}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-grid)',
                              padding: '6px 8px',
                              fontSize: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <strong>{cit.title}</strong>
                            <span style={{ color: 'var(--text-secondary)' }}>{cit.excerpt}</span>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ alignSelf: 'flex-start' }}
                              onClick={() => onPreviewArticle(cit.slug)}
                            >
                              Consultar artigo fonte
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-lime"
                        onClick={() => onInsertAiDraft(draftReply.draftText)}
                      >
                        Aproveitar no editor
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setDraftReply(null)}
                      >
                        Descartar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
