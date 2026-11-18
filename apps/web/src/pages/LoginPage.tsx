import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/chamados" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/chamados', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-frame" aria-labelledby="login-heading">
        <div className="login-head">
          <div className="brand-mark-row">
            <h1 id="login-heading" className="brand-title">
              RETORNO
            </h1>
            <span className="brand-tag">AUTOMAÇÃO COMERCIAL</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Central de chamados para suporte a PDV, impressoras fiscais, estoque e terminais.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <label className="field">
            <span className="field-label">E-mail de acesso</span>
            <input
              type="email"
              className="input"
              required
              autoComplete="username"
              placeholder="nome@empresa.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Senha</span>
            <input
              type="password"
              className="input"
              required
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Validando sessão...' : 'Entrar na fila de atendimento'}
          </button>

          {import.meta.env.DEV && (
            <div
              style={{
                borderTop: '1px solid var(--border-grid)',
                paddingTop: '10px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <p className="mono" style={{ fontSize: '11px', marginBottom: '4px' }}>
                AMBIENTE LOCAL DE DESENVOLVIMENTO
              </p>
              <p>
                Contas seed disponíveis no <code>README.md</code> (desabilitadas em produção).
              </p>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
