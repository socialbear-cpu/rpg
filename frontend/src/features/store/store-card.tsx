'use client';

import { useEffect, useRef, useState } from 'react';
import { getCharacterStore, purchaseStoreOffer, type CharacterStore } from '../../api';
import './store.css';

const money = (amount: number) => amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function StoreCard({ characterId, characterName, store, busy, message, onPurchase }: {
  characterId: string | null; characterName: string; store: CharacterStore | null; busy: boolean;
  message: string | null; onPurchase: (offerId: string) => void;
}) {
  return <article className="card store-card">
    <h2>Loja do sistema</h2>
    {!characterId && <p>Selecione um personagem para comprar.</p>}
    {characterId && store && <p>Saldo de {characterName}: <strong>{money(store.balance)} {store.currency_name}</strong></p>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {store?.offers.length === 0 && <p>Nenhuma oferta disponível.</p>}
    <div className="store-offers">{store?.offers.map((offer, index) => <section className="store-offer" key={offer.store_product_id ?? index}>
      <h3>{offer.item_name}</h3><p>{money(offer.price)} {store.currency_name}</p>
      <button className="button primary" type="button" disabled={busy || !characterId || !offer.is_available || !offer.store_product_id || store.character_id !== characterId} onClick={() => { if (offer.store_product_id) onPurchase(offer.store_product_id); }}>Comprar</button>
    </section>)}</div>
  </article>;
}

export function SystemStore({ systemId, characterId, characterName }: { systemId: string; characterId: string | null; characterName: string }) {
  const [store, setStore] = useState<CharacterStore | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const purchasing = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    setStore(null); setMessage(null); setBusy(false); purchasing.current = false;
    if (!characterId) return;
    setBusy(true);
    getCharacterStore(systemId, characterId).then((data) => { if (generation.current === current) setStore(data); })
      .catch((error: unknown) => { if (generation.current === current) setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a loja.'); })
      .finally(() => { if (generation.current === current) setBusy(false); });
    return () => { generation.current++; };
  }, [systemId, characterId]);
  async function purchase(offerId: string) {
    if (!characterId || purchasing.current || busy || store?.character_id !== characterId) return;
    purchasing.current = true; setBusy(true); setMessage(null);
    const current = generation.current;
    try {
      const result = await purchaseStoreOffer(systemId, characterId, offerId);
      if (current !== generation.current) return;
      setStore((old) => old ? { ...old, balance: result.balance } : old);
      setMessage(`${result.quantity} unidade de ${result.item_name} adicionada ao inventário de ${characterName}.`);
    } catch (error) {
      if (current !== generation.current) return;
      const text = error instanceof Error ? error.message : '';
      setMessage(text === 'Insufficient balance' ? 'Saldo insuficiente para esta compra.' : text === 'Store offer unavailable' ? 'Esta oferta não está mais disponível.' : 'Não foi possível concluir a compra. Confira seu inventário antes de tentar novamente.');
    } finally { if (current === generation.current) { purchasing.current = false; setBusy(false); } }
  }
  return <StoreCard characterId={characterId} characterName={characterName} store={store} busy={busy} message={message ?? (busy && !store ? 'Carregando loja…' : null)} onPurchase={(id) => void purchase(id)} />;
}
