import type { ReactNode } from 'react';
import './app-header.css';

interface AppHeaderProps {
  activeItem?: string;
  backHref?: string;
  backLabel?: string;
  onNavigate?: (label: string) => void;
  children?: ReactNode;
}

const navItems = [
  { label: 'Início', href: '/dashboard' },
  { label: 'Meus Sistemas', href: '/dashboard' },
  { label: 'Explorar sistemas', href: '/dashboard/systems/new' },
  { label: 'Comunidade', href: '/dashboard' },
];

export function AppHeader({ activeItem = 'Meus Sistemas', backHref, backLabel = 'Voltar', onNavigate, children }: AppHeaderProps) {
  return (
    <header className="app-header">
      <a className="app-header-brand" href="/dashboard" aria-label="Nexus RPG início">
        <span className="app-header-mark" aria-hidden="true">✧</span>
        <span>NEXUS <em>RPG</em></span>
      </a>
      <nav className="app-header-nav" aria-label="Navegação principal">
        {navItems.map((item) => <a key={item.label} className={`app-header-nav-link ${activeItem === item.label ? 'active' : ''}`} href={item.href} aria-current={activeItem === item.label ? 'page' : undefined} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate(item.label); } : undefined}>{item.label}</a>)}
      </nav>
      <details className="app-header-mobile-menu">
        <summary aria-label="Abrir navegação">☰</summary>
        <nav aria-label="Navegação principal">
          {navItems.map((item) => <a key={item.label} className={activeItem === item.label ? 'active' : ''} href={item.href} aria-current={activeItem === item.label ? 'page' : undefined} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate(item.label); } : undefined}>{item.label}</a>)}
        </nav>
      </details>
      <div className="app-header-actions">
        {backHref && <a className="app-header-back" href={backHref}>← {backLabel}</a>}
        {children}
      </div>
    </header>
  );
}
