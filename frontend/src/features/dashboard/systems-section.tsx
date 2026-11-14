'use client';

import { getGameSystemCoverUrl, type GameSystem } from '../../api';

interface SystemsSectionProps {
  systems: GameSystem[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEnter: (systemId: string) => void;
  ownerSystemIds?: Set<string>;
  isPlatformAdmin?: boolean;
  onManage?: (systemId: string) => void;
}

export function SystemsSection({ systems, loading, error, onCreate, onEnter, ownerSystemIds = new Set(), isPlatformAdmin = false, onManage }: SystemsSectionProps) {
  return (
    <section className="systems-section" aria-labelledby="systems-title">
      <div className="section-heading">
        <div>
          <h2 id="systems-title">Meus sistemas</h2>
          <p>Escolha um sistema para abrir sua aventura ou crie um novo.</p>
        </div>
        {(systems.length > 0 || loading || error) && (
          <button type="button" className="primary-button" onClick={onCreate}>+ Criar sistema</button>
        )}
      </div>
      {loading && (
        <>
          <p className="systems-loading-label" role="status">Preparando seus mundos...</p>
          <div className="system-grid" aria-hidden="true">
            {[0, 1, 2].map((item) => <div className="system-card-skeleton" key={item} />)}
          </div>
        </>
      )}
      {error && <p className="systems-error" role="alert">{error}</p>}
      {!loading && !error && systems.length === 0 && (
        <div className="systems-empty-state">
          <span className="systems-empty-sigil" aria-hidden="true">✧</span>
          <span className="system-card-eyebrow">SUA AVENTURA COMEÇA AQUI</span>
          <h3>Seu próximo mundo começa aqui</h3>
          <p>Crie um sistema, personalize a ficha e reúna seu grupo em torno de uma nova aventura.</p>
          <button type="button" className="primary-button" onClick={onCreate}>Criar meu primeiro sistema</button>
        </div>
      )}
      {!loading && !error && systems.length > 0 && (
        <div className="system-grid">
          {systems.map((system, index) => (
            <article className={`system-card system-card-tone-${index % 4}${system.is_active === false ? ' system-card-archived' : ''}`} key={system.id}>
              <div className={`system-card-art${system.cover_image_path ? ' has-cover' : ''}`} aria-hidden="true">
                {system.cover_image_path
                  ? <img className="system-card-cover" src={getGameSystemCoverUrl(system.cover_image_path) ?? undefined} alt="" style={{ objectPosition: `${system.cover_focus_x ?? 50}% ${system.cover_focus_y ?? 50}%` }} />
                  : <>
                    <span className="system-card-art-brand">NEXUS RPG</span>
                    <span className="system-card-art-sigil">✧</span>
                    <span className="system-card-art-caption">UM MUNDO À SUA MANEIRA</span>
                  </>}
              </div>
              {(ownerSystemIds.has(system.id) || isPlatformAdmin) && <button type="button" className="system-card-settings" aria-label={`Gerenciar ${system.name}`} title="Gerenciar sistema" onClick={() => onManage?.(system.id)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></svg>
              </button>}
              <div className="system-card-content">
                <span className="system-card-eyebrow">{system.is_active === false ? 'SISTEMA DESATIVADO' : 'SISTEMA DE RPG'}</span>
                <h3>{system.name}</h3>
                <p>{system.is_active === false ? 'Este sistema está desativado. Você pode reativá-lo nas configurações.' : system.description || 'Uma nova aventura espera pelo seu grupo.'}</p>
                <div className="system-card-metadata">
                  <span className="system-card-mode">{system.play_mode === 'voice' ? '◉ Voz' : '▤ Texto'}</span>
                  {(system.tags ?? []).slice(0, 3).map((tag) => <span className="system-card-tag" key={tag.slug}>{tag.label}</span>)}
                  {(system.tags?.length ?? 0) > 3 && <span className="system-card-tag">+{(system.tags?.length ?? 0) - 3}</span>}
                </div>
                {system.is_active === false
                  ? <span className="system-card-disabled">Aventura indisponível</span>
                  : <button type="button" className="system-card-enter" aria-label={`Entrar no sistema ${system.name}`} onClick={() => onEnter(system.id)}>
                    Abrir aventura <span aria-hidden="true">↗</span>
                  </button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
