'use client';

import type { GameSystem } from '../../api';

interface SystemsSectionProps {
  systems: GameSystem[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEnter: (systemId: string) => void;
}

export function SystemsSection({ systems, loading, error, onCreate, onEnter }: SystemsSectionProps) {
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
      {loading && <p role="status">Carregando sistemas...</p>}
      {error && <p className="systems-error" role="alert">{error}</p>}
      {!loading && !error && systems.length === 0 && (
        <div className="systems-empty-state">
          <h3>Seu próximo mundo começa aqui</h3>
          <p>Crie um sistema para definir a ficha e começar a montar seu grupo.</p>
          <button type="button" className="primary-button" onClick={onCreate}>Criar meu primeiro sistema</button>
        </div>
      )}
      {!loading && !error && systems.length > 0 && (
        <div className="system-grid">
          {systems.map((system) => (
            <article className="system-card" key={system.id}>
              <span className="system-card-eyebrow">SISTEMA DE RPG</span>
              <h3>{system.name}</h3>
              <p>{system.description || 'Sem descrição.'}</p>
              <button type="button" className="text-button" aria-label={`Entrar no sistema ${system.name}`} onClick={() => onEnter(system.id)}>
                Entrar <span aria-hidden="true">→</span>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
