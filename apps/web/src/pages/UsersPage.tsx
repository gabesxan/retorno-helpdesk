import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { ROLE_LABELS, type ManagedUser, type UserRole } from '../lib/types';

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [companyName, setCompanyName] = useState('Equipe Retorno');
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao listar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .listUsers()
      .then((res) => {
        if (active) {
          setUsers(res.users);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Erro ao listar usuários.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.createUser({ name, email, password, role, companyName });
      setName('');
      setEmail('');
      setPassword('');
      setActionSuccess('Usuário criado com sucesso.');
      await loadUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao cadastrar usuário.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (target: ManagedUser) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.updateUser(target.id, { isActive: !target.isActive });
      setActionSuccess(
        !target.isActive
          ? `Usuário ${target.name} reativado.`
          : `Usuário ${target.name} desativado e sessões revogadas.`,
      );
      await loadUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível alterar usuário.');
    }
  };

  const handleChangeRole = async (target: ManagedUser, nextRole: UserRole) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.updateUser(target.id, { role: nextRole });
      setActionSuccess(`Perfil de ${target.name} alterado para ${ROLE_LABELS[nextRole]}.`);
      await loadUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível alterar o perfil.');
    }
  };

  return (
    <main className="page-container">
      <div className="page-header">
        <div>
          <div className="section-heading">
            <span className="section-num">03 //</span>
            <h1 className="section-title">Usuários e permissões</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Gerencie solicitantes, atendentes e administradores. Desativar uma conta revoga suas
            sessões ativas.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="alert alert-success" role="status">
          {actionSuccess}
        </div>
      )}

      <form
        onSubmit={handleCreateUser}
        style={{
          border: '1px solid var(--border-strong)',
          background: 'var(--bg-surface)',
          padding: '16px',
          display: 'grid',
          gap: '10px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          alignItems: 'end',
        }}
      >
        <label className="field">
          <span className="field-label">Nome completo</span>
          <input
            type="text"
            className="input"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">E-mail</span>
          <input
            type="email"
            className="input"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Senha inicial (mín. 8 chars)</span>
          <input
            type="password"
            className="input"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Perfil</span>
          <select
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="REQUESTER">Solicitante</option>
            <option value="AGENT">Atendente</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Cliente / Equipe</span>
          <input
            type="text"
            className="input"
            required
            minLength={2}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? 'Cadastrando...' : '+ Cadastrar usuário'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Empresa / Equipe</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 && (
              <tr>
                <td colSpan={6}>Carregando usuários...</td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td className="mono" style={{ fontSize: '12px' }}>
                  {u.email}
                </td>
                <td>{u.companyName}</td>
                <td>
                  <select
                    aria-label={`Perfil de ${u.name}`}
                    className="select"
                    style={{ width: 'auto', minHeight: '30px' }}
                    value={u.role}
                    onChange={(e) => void handleChangeRole(u, e.target.value as UserRole)}
                  >
                    <option value="REQUESTER">Solicitante</option>
                    <option value="AGENT">Atendente</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </td>
                <td>
                  <span
                    className={`badge ${u.isActive ? 'badge-status-RESOLVED' : 'badge-priority-URGENT'}`}
                  >
                    {u.isActive ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-lime'}`}
                    onClick={() => void handleToggleActive(u)}
                  >
                    {u.isActive ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
