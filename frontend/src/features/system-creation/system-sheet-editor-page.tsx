'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getGameSystems, type GameSystem } from '../../api';
import { AppHeader } from '../shell/app-header';
import { SystemSheetEditor } from './system-sheet-editor';
import './system-creation.css';

export function SystemSheetEditorPage({ systemId }: { systemId: string }) {
  const router = useRouter();
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getGameSystems().then(({ systems }) => {
      if (!cancelled) setSystem(systems.find((entry) => entry.id === systemId) ?? null);
    }).catch(() => {
      if (!cancelled) setError('Não foi possível carregar este sistema.');
    });
    return () => { cancelled = true; };
  }, [systemId]);

  return <main className="system-creation-page">
    <AppHeader activeItem="Meus sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" />
    <div className="system-creation-panel system-creation-sheet-panel">
      {error ? <p className="systems-error" role="alert">{error}</p> : system ? <SystemSheetEditor systemId={systemId} systemName={system.name} onSaved={() => router.push('/dashboard')} onCancel={() => router.back()} /> : <p role="status">Carregando sistema...</p>}
    </div>
  </main>;
}
