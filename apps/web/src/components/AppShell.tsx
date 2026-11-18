import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/types';
import { IconBook, IconQueue, IconUsers } from './Icons';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const isStaff = user.role === 'AGENT' || user.role === 'ADMIN';
  const isAdmin = user.role === 'ADMIN';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
        aria-label="Navegação principal"
      >
        <div>
          <div className="brand-box">
            <div className="brand-mark-row">
              <span className="brand-title">RETORNO</span>
              <span className="brand-tag">PDV-SUP</span>
            </div>
            <p className="brand-subtitle">Suporte em automação comercial</p>
          </div>

          <nav className="nav-list">
            <NavLink
              to="/chamados"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="nav-num">01</span>
              <IconQueue />
              <span>Chamados</span>
            </NavLink>

            {isStaff && (
              <NavLink
                to="/base-conhecimento"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-num">02</span>
                <IconBook />
                <span>Base de conhecimento</span>
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/usuarios"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-num">03</span>
                <IconUsers />
                <span>Usuários</span>
              </NavLink>
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <span className="user-card-name">{user.name}</span>
            <span className="user-card-meta">
              {ROLE_LABELS[user.role]} · {user.companyName}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="btn btn-sm" style={{ flex: 1 }} onClick={handleLogout}>
              Sair da sessão
            </button>
            {mobileMenuOpen && (
              <button type="button" className="btn btn-sm" onClick={() => setMobileMenuOpen(false)}>
                Fechar
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="mobile-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm"
              aria-expanded={mobileMenuOpen}
              aria-label="Abrir menu de navegação"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              Menu
            </button>
            <span className="brand-title" style={{ fontSize: '22px' }}>
              RETORNO
            </span>
          </div>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {ROLE_LABELS[user.role]}
          </span>
        </header>

        {children}
      </div>
    </div>
  );
}
