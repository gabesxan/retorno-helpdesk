import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SafeMarkdown } from '../components/SafeMarkdown';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatFullDateTime } from '../lib/date';
import { CATEGORY_LABELS, type KnowledgeArticleItem, type TicketCategory } from '../lib/types';

export function KnowledgeBasePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [q, setQ] = useState('');
  const [category, setCategory] = useState<TicketCategory | 'ALL'>('ALL');
  const [articles, setArticles] = useState<KnowledgeArticleItem[]>([]);
  const [selected, setSelected] = useState<KnowledgeArticleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingMode, setEditingMode] = useState<'none' | 'create' | 'edit'>('none');
  const [title, setTitle] = useState('');
  const [formCategory, setFormCategory] = useState<TicketCategory>('PRINTER_HARDWARE');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listArticles({
        q: q.trim() || undefined,
        category,
        includeUnpublished: isAdmin,
      });
      setArticles(res.articles);
      if (res.articles.length > 0) {
        setSelected(
          (prev) => res.articles.find((a) => a.id === prev?.id) ?? res.articles[0] ?? null,
        );
      } else {
        setSelected(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os artigos.');
    } finally {
      setLoading(false);
    }
  }, [q, category, isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadArticles();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadArticles]);

  const openCreateForm = () => {
    setEditingMode('create');
    setTitle('');
    setFormCategory('PRINTER_HARDWARE');
    setSummary('');
    setTags('');
    setBodyMarkdown('## Procedimento\n\n1. ');
    setIsPublished(true);
    setFormError(null);
    setFormSuccess(null);
  };

  const openEditForm = (art: KnowledgeArticleItem) => {
    setEditingMode('edit');
    setTitle(art.title);
    setFormCategory(art.category);
    setSummary(art.summary);
    setTags(art.tags);
    setBodyMarkdown(art.bodyMarkdown);
    setIsPublished(art.isPublished);
    setFormError(null);
    setFormSuccess(null);
  };

  const handleSaveArticle = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      if (editingMode === 'create') {
        const res = await api.createArticle({
          title,
          category: formCategory,
          summary,
          tags,
          bodyMarkdown,
          isPublished,
        });
        setSelected(res.article);
        setFormSuccess('Artigo criado na base de conhecimento.');
      } else if (editingMode === 'edit' && selected) {
        const res = await api.updateArticle(selected.id, {
          title,
          category: formCategory,
          summary,
          tags,
          bodyMarkdown,
          isPublished,
        });
        setSelected(res.article);
        setFormSuccess('Artigo atualizado.');
      }
      setEditingMode('none');
      await loadArticles();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar artigo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-container">
      <div className="page-header">
        <div>
          <div className="section-heading">
            <span className="section-num">02 //</span>
            <h1 className="section-title">Base de conhecimento</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Procedimentos técnicos em Markdown para consulta no atendimento e fundamentação da IA.
          </p>
        </div>

        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={openCreateForm}>
            + Novo artigo
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          type="search"
          className="input"
          style={{ flex: '1 1 280px' }}
          placeholder="Buscar por erro, impressora, TEF, estoque, operador..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="select"
          style={{ width: 'auto', minWidth: '220px' }}
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory | 'ALL')}
        >
          <option value="ALL">Todas as categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {formSuccess && (
        <div className="alert alert-success" role="status">
          {formSuccess}
        </div>
      )}

      {editingMode !== 'none' && isAdmin ? (
        <form
          onSubmit={handleSaveArticle}
          style={{
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-surface)',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="display-title" style={{ fontSize: '20px' }}>
              {editingMode === 'create' ? 'Novo artigo técnico' : 'Editar artigo'}
            </h2>
            <button type="button" className="btn btn-sm" onClick={() => setEditingMode('none')}>
              Cancelar
            </button>
          </div>

          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}

          <label className="field">
            <span className="field-label">Título</span>
            <input
              type="text"
              className="input"
              required
              minLength={5}
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="filter-row">
            <label className="field">
              <span className="field-label">Categoria</span>
              <select
                className="select"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as TicketCategory)}
              >
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Palavras-chave (tags separadas por vírgula)</span>
              <input
                type="text"
                className="input"
                required
                minLength={2}
                maxLength={255}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Resumo objetivo</span>
            <input
              type="text"
              className="input"
              required
              minLength={10}
              maxLength={400}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Conteúdo em Markdown</span>
            <textarea
              className="textarea"
              rows={10}
              required
              minLength={20}
              value={bodyMarkdown}
              onChange={(e) => setBodyMarkdown(e.target.value)}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            <span>Publicado para atendentes e recuperação da IA</span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar artigo'}
            </button>
          </div>
        </form>
      ) : (
        <div className="kb-grid">
          <div className="kb-list" role="list" aria-label="Lista de artigos">
            {loading && articles.length === 0 && (
              <p style={{ padding: '14px', color: 'var(--text-secondary)' }}>Buscando artigos...</p>
            )}
            {!loading && articles.length === 0 && (
              <p style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                Nenhum artigo correspondente à busca.
              </p>
            )}
            {articles.map((art) => (
              <button
                key={art.id}
                type="button"
                role="listitem"
                className={`queue-row ${selected?.id === art.id ? 'selected' : ''}`}
                onClick={() => setSelected(art)}
              >
                <div className="queue-row-top">
                  <span className="badge">{CATEGORY_LABELS[art.category]}</span>
                  {!art.isPublished && <span className="badge">Rascunho</span>}
                </div>
                <span className="queue-subject">{art.title}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {art.summary}
                </span>
              </button>
            ))}
          </div>

          <article className="kb-article-pane">
            {selected ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}
                    >
                      <span className="badge">{CATEGORY_LABELS[selected.category]}</span>
                      {!selected.isPublished && <span className="badge">Não publicado</span>}
                    </div>
                    <h2 className="display-title" style={{ fontSize: '26px' }}>
                      {selected.title}
                    </h2>
                    <p
                      className="mono"
                      style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}
                    >
                      slug: {selected.slug} · atualizado em {formatFullDateTime(selected.updatedAt)}
                    </p>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openEditForm(selected)}
                    >
                      Editar artigo
                    </button>
                  )}
                </div>

                <p
                  style={{
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border-grid)',
                    paddingBottom: '10px',
                  }}
                >
                  {selected.summary}
                </p>

                <SafeMarkdown content={selected.bodyMarkdown} />
              </>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>
                Selecione um artigo à esquerda para visualizar o procedimento completo.
              </p>
            )}
          </article>
        </div>
      )}
    </main>
  );
}
