'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMyDailyLoginSystems, type DailyLoginSystemView } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { TradingCard } from './trading-card';

export function TradingPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [systems, setSystems] = useState<DailyLoginSystemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/');
      return;
    }
    setAuthenticated(true);
    let active = true;
    setLoading(true);
    setError(null);
    void getMyDailyLoginSystems().then((value) => {
      if (active) setSystems(value);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus sistemas para troca.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, reloadKey]);

  if (!authenticated) return null;
  return <main className="shell">
    <AppHeader activeItem="Trocas" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <section className="intro"><p className="eyebrow">ENTRE PERSONAGENS</p><h1>Trocas</h1><p>Negocie itens com outros jogadores dos seus sistemas.</p></section>
    {error ? <section><p className="notice error" role="alert">{error}</p><button className="button secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></section>
      : <TradingCard systems={systems} systemsLoading={loading} />}
  </main>;
}
