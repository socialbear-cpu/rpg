'use client';

import { useEffect, useState, type FormEventHandler } from 'react';
import { getOwnerStore, saveOwnerStore, type OwnerStore } from '../../api';
import './store.css';

export function StoreAdminCard({ store, saving, message, onChange, onSave }: {
  store: OwnerStore; saving: boolean; message: string | null;
  onChange: (store: OwnerStore) => void; onSave: FormEventHandler<HTMLFormElement>;
}) {
  return <article className="card store-admin-card"><h2>Gerenciar loja</h2>
    {message && <p role="status" aria-live="polite">{message}</p>}
    <form className="store-admin-form" onSubmit={onSave}><fieldset disabled={saving}>
      <label>Nome da moeda<input required maxLength={80} value={store.currency_name} onChange={(event) => onChange({ ...store, currency_name: event.target.value })} /></label>
      {store.items.length === 0 && <p>Cadastre itens neste sistema antes de criar ofertas.</p>}
      {store.offers.map((offer, index) => <div className="store-admin-offer" key={offer.store_product_id ?? index}>
        <label>Item<select required value={offer.item_id} onChange={(event) => onChange({ ...store, offers: store.offers.map((entry, i) => i === index ? { ...entry, item_id: event.target.value, item_name: store.items.find((item) => item.id === event.target.value)?.name ?? '' } : entry) })} disabled={Boolean(offer.store_product_id)}>
          <option value="">Selecione um item</option>{store.items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>
        <label>Preço<input required type="number" min={0} max={9999999999.99} step="0.01" value={offer.price} onChange={(event) => onChange({ ...store, offers: store.offers.map((entry, i) => i === index ? { ...entry, price: Number(event.target.value) } : entry) })} /></label>
        <label><input type="checkbox" checked={offer.is_available} onChange={(event) => onChange({ ...store, offers: store.offers.map((entry, i) => i === index ? { ...entry, is_available: event.target.checked } : entry) })} /> Disponível</label>
        <button className="button secondary" type="button" onClick={() => onChange({ ...store, offers: store.offers.filter((_, i) => i !== index) })}>{offer.store_product_id ? 'Desativar oferta' : 'Remover oferta'}</button>
      </div>)}
      <button className="button secondary" type="button" disabled={store.items.length === 0} onClick={() => onChange({ ...store, offers: [...store.offers, { item_id: '', item_name: '', price: 0, is_available: true }] })}>Adicionar oferta</button>
      <button className="button primary" type="submit">{saving ? 'Salvando…' : 'Salvar loja'}</button>
    </fieldset></form>
  </article>;
}

export function SystemStoreAdmin({ systemId }: { systemId: string }) {
  const [store, setStore] = useState<OwnerStore | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setStore(null); setMessage(null);
    getOwnerStore(systemId).then((data) => { if (active) setStore(data); })
      .catch(() => { if (active) setMessage('Não foi possível carregar a loja.'); });
    return () => { active = false; };
  }, [systemId, reload]);
  async function save() {
    if (!store || saving) return;
    if (!store.currency_name.trim() || store.offers.some((offer) => !offer.item_id || !Number.isFinite(offer.price) || offer.price < 0 || offer.price > 9999999999.99 || Math.abs(offer.price * 100 - Math.round(offer.price * 100)) > 0.0001)) {
      setMessage('Escolha uma moeda, itens e preços válidos com até duas casas decimais.'); return;
    }
    setSaving(true); setMessage(null);
    try {
      const data = await saveOwnerStore(systemId, { currency_name: store.currency_name.trim(), offers: store.offers.map(({ item_name: _, ...offer }) => offer) });
      setStore(data); setMessage('Loja salva.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a loja.'); }
    finally { setSaving(false); }
  }
  if (!store) return <article className="card store-admin-card"><h2>Gerenciar loja</h2><p role="status">{message ?? 'Carregando loja…'}</p>{message && <button type="button" className="button secondary" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button>}</article>;
  return <StoreAdminCard store={store} saving={saving} message={message} onChange={setStore} onSave={(event) => { event.preventDefault(); void save(); }} />;
}
