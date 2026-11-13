'use client';

import { useEffect, useState, type FormEvent, type FormEventHandler } from 'react';
import { createOwnerStoreItem, getOwnerStore, saveOwnerStore, type CreateStoreItemInput, type OwnerStore } from '../../api';
import './store.css';

export function StoreAdminCard({ store, saving, message, onChange, onSave, creatingItem = false, onCreateItem = async () => false }: {
  store: OwnerStore; saving: boolean; message: string | null;
  onChange: (store: OwnerStore) => void; onSave: FormEventHandler<HTMLFormElement>;
  creatingItem?: boolean; onCreateItem?: (input: CreateStoreItemInput) => Promise<boolean>;
}) {
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemType, setItemType] = useState<CreateStoreItemInput['item_type']>('misc');
  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await onCreateItem({ name: itemName.trim(), description: itemDescription.trim() || null, item_type: itemType });
    if (created) { setItemName(''); setItemDescription(''); setItemType('misc'); }
  }
  const itemTypeLabels: Record<string, string> = { consumable: 'Consumível', equipment: 'Equipamento', misc: 'Outro' };
  return <article className="card store-admin-card"><h2>Gerenciar loja</h2>
    {message && <p role="status" aria-live="polite">{message}</p>}
    <section className="store-admin-items" aria-labelledby="store-admin-items-title">
      <div><h3 id="store-admin-items-title">Itens do sistema</h3><p>Cadastre os itens que poderão ser oferecidos na loja.</p></div>
      <form className="store-admin-item-form" onSubmit={(event) => void submitItem(event)}>
        <label>Nome do item<input required maxLength={80} value={itemName} onChange={(event) => setItemName(event.target.value)} /></label>
        <label>Tipo<select value={itemType} onChange={(event) => setItemType(event.target.value as CreateStoreItemInput['item_type'])}><option value="consumable">Consumível</option><option value="equipment">Equipamento</option><option value="misc">Outro</option></select></label>
        <label className="store-admin-item-description">Descrição<textarea maxLength={500} value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} /></label>
        <button className="button secondary" type="submit" disabled={saving || creatingItem}>{creatingItem ? 'Adicionando…' : 'Adicionar item'}</button>
      </form>
      {store.items.length > 0 && <ul className="store-admin-item-list">{store.items.map((item) => <li key={item.id}><strong>{item.name}</strong><span>{itemTypeLabels[item.item_type ?? 'misc'] ?? item.item_type}</span>{item.description && <p>{item.description}</p>}</li>)}</ul>}
    </section>
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
  const [creatingItem, setCreatingItem] = useState(false);
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
  async function addItem(input: CreateStoreItemInput) {
    if (creatingItem) return false;
    setCreatingItem(true); setMessage(null);
    try {
      const { item } = await createOwnerStoreItem(systemId, input);
      setStore((current) => current ? { ...current, items: [...current.items, item].sort((a, b) => a.name.localeCompare(b.name)) } : current);
      setMessage('Item adicionado. Agora ele pode ser incluído em uma oferta.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar o item.');
      return false;
    } finally { setCreatingItem(false); }
  }
  if (!store) return <article className="card store-admin-card"><h2>Gerenciar loja</h2><p role="status">{message ?? 'Carregando loja…'}</p>{message && <button type="button" className="button secondary" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button>}</article>;
  return <StoreAdminCard store={store} saving={saving} creatingItem={creatingItem} message={message} onChange={setStore} onCreateItem={addItem} onSave={(event) => { event.preventDefault(); void save(); }} />;
}
