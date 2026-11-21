import type { ReactNode } from 'react';

export function WorkspaceHeading({ eyebrow, title, description, children }: {
  eyebrow: string; title: string; description: string; children?: ReactNode;
}) {
  return <header className="workspace-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
    {children && <div className="workspace-heading-actions">{children}</div>}
  </header>;
}

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  return <nav className="settings-index" aria-label="Seções das configurações">
    <p className="eyebrow">NESTA PÁGINA</p>
    {items.map((item, index) => <a key={item.href} href={item.href}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{item.label}</a>)}
  </nav>;
}
