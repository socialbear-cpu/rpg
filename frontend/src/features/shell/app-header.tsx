import type { ReactNode } from 'react';
import './app-header.css';

interface AppHeaderProps {
  section?: string;
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
}

export function AppHeader({ section, backHref, backLabel = 'Voltar', children }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <a className="app-header-brand" href="/dashboard" aria-label="Nexus RPG início">
          <span className="app-header-mark" aria-hidden="true">✧</span>
          <span>NEXUS <em>RPG</em></span>
        </a>
        {section && <div className="app-header-breadcrumb"><span>Plataforma</span><span aria-hidden="true">/</span><strong>{section}</strong></div>}
      </div>
      <div className="app-header-actions">
        {backHref && <a className="app-header-back" href={backHref}>← {backLabel}</a>}
        {children}
      </div>
    </header>
  );
}
