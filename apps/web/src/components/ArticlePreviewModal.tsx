import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CATEGORY_LABELS, type KnowledgeArticleItem } from '../lib/types';
import { SafeMarkdown } from './SafeMarkdown';

interface ArticlePreviewModalProps {
  slugOrId: string;
  onClose: () => void;
}

export function ArticlePreviewModal({ slugOrId, onClose }: ArticlePreviewModalProps) {
  const [article, setArticle] = useState<KnowledgeArticleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getArticle(slugOrId)
      .then((res) => {
        if (active) {
          setArticle(res.article);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar o artigo.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slugOrId]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-modal-title"
    >
      <div className="modal-panel">
        <div className="modal-head">
          <div className="section-heading">
            <span className="section-num">KB //</span>
            <h2 id="kb-modal-title" className="section-title" style={{ fontSize: '20px' }}>
              Consulta à base de conhecimento
            </h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="modal-body">
          {loading && <p>Carregando artigo...</p>}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {article && (
            <>
              <div>
                <span className="badge">{CATEGORY_LABELS[article.category]}</span>
                <h3 style={{ marginTop: '8px', fontSize: '18px' }}>{article.title}</h3>
                <p style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {article.summary}
                </p>
              </div>
              <hr style={{ border: 0, borderTop: '1px solid var(--border-grid)', width: '100%' }} />
              <SafeMarkdown content={article.bodyMarkdown} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
