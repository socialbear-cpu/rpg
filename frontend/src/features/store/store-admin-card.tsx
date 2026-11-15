'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type FormEventHandler } from 'react';
import {
  createOwnerStoreItem,
  getOwnerStore,
  updateOwnerStoreCurrencyField,
  updateOwnerStoreOfferField,
  type CreateStoreItemInput,
  type OwnerStore,
  type StoreCurrencyFieldUpdate,
  type StoreOffer,
  type StoreOfferFieldUpdate,
} from '../../api';
import './store.css';

type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'error';
const autosaveDelayMs = 500;

function useAutosaveField<T>(initialValue: T, save: (value: T) => Promise<unknown>, isValid: (value: T) => boolean) {
  const [value, setValue] = useState(initialValue);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const inFlightRevisionRef = useRef(0);
  const valueRef = useRef(initialValue);
  const saveRef = useRef(save);
  const isValidRef = useRef(isValid);

  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { isValidRef.current = isValid; }, [isValid]);
  useEffect(() => {
    if (revision === 0) return;
    const currentRevision = revision;
    const currentValue = value;
    if (!isValidRef.current(currentValue)) { setStatus('invalid'); return; }
    const timer = window.setTimeout(() => {
      inFlightRevisionRef.current = currentRevision;
      setStatus('saving');
      void saveRef.current(currentValue).then(() => {
        savedRevisionRef.current = Math.max(savedRevisionRef.current, currentRevision);
        if (revisionRef.current === currentRevision) setStatus('saved');
      }).catch(() => {
        if (revisionRef.current === currentRevision) setStatus('error');
      }).finally(() => {
        if (inFlightRevisionRef.current === currentRevision) inFlightRevisionRef.current = 0;
      });
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [revision, value]);

  useEffect(() => () => {
    const pendingRevision = revisionRef.current;
    const pendingValue = valueRef.current;
    if (pendingRevision <= savedRevisionRef.current || pendingRevision === inFlightRevisionRef.current || !isValidRef.current(pendingValue)) return;
    void saveRef.current(pendingValue).then(() => {
      savedRevisionRef.current = Math.max(savedRevisionRef.current, pendingRevision);
    }).catch(() => undefined);
  }, []);

  function updateValue(next: T) {
    revisionRef.current += 1;
    valueRef.current = next;
    setRevision(revisionRef.current);
    setValue(next);
    setStatus(isValid(next) ? 'pending' : 'invalid');
  }
  return { value, onChange: updateValue, status };
}

function autosaveStatusText(status: AutosaveStatus, invalidMessage: string) {
  switch (status) {
    case 'pending': return 'Aguardando…';
    case 'saving': return 'Salvando…';
    case 'saved': return 'Salvo';
    case 'invalid': return invalidMessage;
    case 'error': return 'Não foi possível salvar. Tente editar novamente.';
    default: return '';
  }
}

function isValidCurrencyName(value: string) {
  return value.trim().length > 0 && value.trim().length <= 80;
}

function isValidImageUrl(value: string) {
  if (!value.trim()) return true;
  if (value.trim().length > 2048) return false;
  try { return new URL(value.trim()).protocol === 'https:'; } catch { return false; }
}

function isValidPrice(value: string) {
  if (!value.trim() || !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return false;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 9999999999.99;
}

function SaveStatus({ status, invalidMessage }: { status: AutosaveStatus; invalidMessage: string }) {
  if (status === 'idle') return null;
  const isError = status === 'invalid' || status === 'error';
  return <span className={`store-admin-autosave-status${isError ? ' is-error' : ''}`} role={isError ? 'alert' : 'status'} aria-live="polite">
    {autosaveStatusText(status, invalidMessage)}
  </span>;
}

function CurrencySlot({ store, onSaveField }: {
  store: OwnerStore;
  onSaveField: (input: StoreCurrencyFieldUpdate) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const currencyName = useAutosaveField(store.currency_name,
    (value) => onSaveField({ currency_name: value.trim() }), isValidCurrencyName);
  const currencyImage = useAutosaveField(store.currency_image_url ?? '',
    (value) => onSaveField({ currency_image_url: value.trim() || null }), isValidImageUrl);

  return <>
    <button className="store-admin-slot is-filled is-currency" type="button" aria-label={`Editar moeda: ${store.currency_name}`} onClick={() => dialog.current?.showModal()}>
      {store.currency_image_url ? <img src={store.currency_image_url} alt="" loading="lazy" /> : <span className="store-admin-slot-placeholder" aria-hidden="true">✧</span>}
      <span className="store-admin-slot-name">{store.currency_name}</span>
    </button>
    <dialog className="store-admin-item-dialog" ref={dialog} aria-labelledby="store-admin-currency-title">
      <div className="store-admin-editor-form">
        <h3 id="store-admin-currency-title">Moeda do sistema</h3>
        <label>Nome da moeda<input maxLength={80} value={currencyName.value} onChange={(event) => currencyName.onChange(event.target.value)} />
          <SaveStatus status={currencyName.status} invalidMessage="Informe um nome de até 80 caracteres." />
        </label>
        <label>Endereço da imagem<input type="url" pattern="https://.*" maxLength={2048} placeholder="https://…" value={currencyImage.value} onChange={(event) => currencyImage.onChange(event.target.value)} />
          <span className="store-admin-editor-hint">Opcional · use um endereço HTTPS.</span>
          <SaveStatus status={currencyImage.status} invalidMessage="Use um endereço HTTPS válido de até 2048 caracteres." />
        </label>
        <button className="button secondary" type="button" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>
    </dialog>
  </>;
}

function OfferEditor({ item, offer, currencyName, onSaveField }: {
  item: OwnerStore['items'][number];
  offer?: StoreOffer;
  currencyName: string;
  onSaveField: (itemId: string, input: StoreOfferFieldUpdate) => Promise<void>;
}) {
  const price = useAutosaveField(offer ? String(offer.price) : '',
    (value) => onSaveField(item.id, { price: Number(value) }), isValidPrice);
  const [available, setAvailable] = useState(offer?.is_available ?? true);
  const [availabilityStatus, setAvailabilityStatus] = useState<AutosaveStatus>('idle');
  const availabilityRevision = useRef(0);

  function updateAvailability(next: boolean) {
    setAvailable(next);
    if (!offer) return;
    availabilityRevision.current += 1;
    const currentRevision = availabilityRevision.current;
    setAvailabilityStatus('saving');
    void onSaveField(item.id, { is_available: next }).then(() => {
      if (availabilityRevision.current === currentRevision) setAvailabilityStatus('saved');
    }).catch(() => {
      if (availabilityRevision.current === currentRevision) setAvailabilityStatus('error');
    });
  }

  return <div className="store-admin-editor-form">
    <h3 id="store-admin-offer-dialog-title">{offer ? 'Editar oferta' : 'Criar oferta'}</h3>
    <p className="store-admin-editor-item-name">{item.name}</p>
    <label>Preço ({currencyName})<input required type="number" min={0} max={9999999999.99} step="0.01" value={price.value} onChange={(event) => price.onChange(event.target.value)} />
      <SaveStatus status={price.status} invalidMessage="Informe um preço válido com até duas casas decimais." />
    </label>
    {offer && <label className="store-admin-availability-field"><span><input type="checkbox" checked={available} onChange={(event) => updateAvailability(event.target.checked)} /> Disponível</span>
      <SaveStatus status={availabilityStatus} invalidMessage="" />
    </label>}
  </div>;
}

export function StoreAdminCard({ store, message, creatingItem = false, onCreateItem = async () => false, onSaveCurrencyField, onSaveOfferField }: {
  store: OwnerStore;
  message: string | null;
  creatingItem?: boolean;
  onCreateItem?: (input: CreateStoreItemInput) => Promise<boolean>;
  onSaveCurrencyField: (input: StoreCurrencyFieldUpdate) => Promise<void>;
  onSaveOfferField: (itemId: string, input: StoreOfferFieldUpdate) => Promise<void>;
}) {
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemType, setItemType] = useState<CreateStoreItemInput['item_type']>('misc');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const itemDialog = useRef<HTMLDialogElement>(null);
  const [offerItemId, setOfferItemId] = useState<string | null>(null);
  const offerDialog = useRef<HTMLDialogElement>(null);

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemError(null);
    const created = await onCreateItem({ name: itemName.trim(), description: itemDescription.trim() || null, item_type: itemType, image_url: itemImageUrl.trim() || null });
    if (created) itemDialog.current?.close();
    else setItemError('Não foi possível adicionar o item. Confira os dados e tente novamente.');
  }
  function resetItemForm() {
    setItemName(''); setItemDescription(''); setItemType('misc'); setItemImageUrl(''); setItemError(null);
  }
  const itemTypeLabels: Record<string, string> = { consumable: 'Consumível', equipment: 'Equipamento', misc: 'Outro' };
  const offerByItem = new Map(store.offers.map((offer) => [offer.item_id, offer]));
  const slotCount = Math.max(27, (Math.floor(store.items.length / 9) + 1) * 9);
  const selectedOfferItem = store.items.find((item) => item.id === offerItemId) ?? null;

  return <article className="card store-admin-card"><h2>Gerenciar loja</h2>
    {message && <p role="status" aria-live="polite">{message}</p>}
    <section className="store-admin-items" aria-labelledby="store-admin-items-title">
      <div><h3 id="store-admin-items-title">Itens do sistema</h3><p>Selecione a moeda para configurar seu nome e imagem. Selecione um item para criar ou editar sua oferta.</p></div>
      <div className="store-admin-slot-grid" aria-label="Moeda e itens da loja">
        <CurrencySlot store={store} onSaveField={onSaveCurrencyField} />
        {Array.from({ length: slotCount }, (_, index) => {
          const item = store.items[index];
          const offer = item ? offerByItem.get(item.id) : undefined;
          return item ? <button className="store-admin-slot is-filled" type="button" key={item.id} title={`${item.name} · ${itemTypeLabels[item.item_type ?? 'misc'] ?? item.item_type}`} aria-label={`${item.name}${offer ? `, oferta de ${offer.price} ${store.currency_name}${offer.is_available ? '' : ', indisponível'}` : ', sem oferta'}`} onClick={() => { setOfferItemId(item.id); offerDialog.current?.showModal(); }}>
            {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span className="store-admin-slot-placeholder" aria-hidden="true">✧</span>}
            <span className="store-admin-slot-name">{item.name}</span>
            {offer && <span className={`store-admin-slot-offer${offer.is_available ? '' : ' is-unavailable'}`}>{offer.is_available ? `${offer.price} ${store.currency_name}` : `Indisponível · ${offer.price}`}</span>}
          </button> : <button className="store-admin-slot is-empty" type="button" key={`empty-${index}`} aria-label={`Criar item no espaço ${index + 1}`} onClick={() => { setItemError(null); itemDialog.current?.showModal(); }}><span aria-hidden="true">+</span></button>;
        })}
      </div>
      <dialog className="store-admin-item-dialog" ref={itemDialog} aria-labelledby="store-admin-item-dialog-title" onClose={resetItemForm}>
        <form className="store-admin-item-form" onSubmit={(event) => void submitItem(event)}>
          <h3 id="store-admin-item-dialog-title">Adicionar item</h3>
          {itemError && <p role="alert">{itemError}</p>}
          <label>Nome do item<input required maxLength={80} value={itemName} onChange={(event) => setItemName(event.target.value)} /></label>
          <label>Tipo<select value={itemType} onChange={(event) => setItemType(event.target.value as CreateStoreItemInput['item_type'])}><option value="consumable">Consumível</option><option value="equipment">Equipamento</option><option value="misc">Outro</option></select></label>
          <label className="store-admin-item-description">Descrição<textarea maxLength={500} value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} /></label>
          <label className="store-admin-item-description">Endereço da imagem<input type="url" pattern="https://.*" maxLength={2048} placeholder="https://…" value={itemImageUrl} onChange={(event) => setItemImageUrl(event.target.value)} /><span>Opcional · use um endereço HTTPS.</span></label>
          <div className="store-admin-item-dialog-actions"><button className="button secondary" type="button" disabled={creatingItem} onClick={() => itemDialog.current?.close()}>Cancelar</button><button className="button primary" type="submit" disabled={creatingItem}>{creatingItem ? 'Adicionando…' : 'Adicionar item'}</button></div>
        </form>
      </dialog>
      <dialog className="store-admin-item-dialog" ref={offerDialog} aria-labelledby="store-admin-offer-dialog-title" >
        {selectedOfferItem && <OfferEditor key={selectedOfferItem.id} item={selectedOfferItem} offer={offerByItem.get(selectedOfferItem.id)} currencyName={store.currency_name} onSaveField={onSaveOfferField} />}
        <button className="button secondary store-admin-editor-close" type="button" onClick={() => offerDialog.current?.close()}>Fechar</button>
      </dialog>
    </section>
  </article>;
}

export function SystemStoreAdmin({ systemId }: { systemId: string }) {
  const [store, setStore] = useState<OwnerStore | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const writeQueues = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    let active = true; setStore(null); setMessage(null);
    getOwnerStore(systemId).then((data) => { if (active) setStore(data); })
      .catch(() => { if (active) setMessage('Não foi possível carregar a loja.'); });
    return () => { active = false; };
  }, [systemId, reload]);

  function enqueueFieldWrite(key: string, write: () => Promise<void>) {
    const previous = writeQueues.current.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(write);
    writeQueues.current.set(key, current);
    const clear = () => { if (writeQueues.current.get(key) === current) writeQueues.current.delete(key); };
    void current.then(clear, clear);
    return current;
  }

  const saveCurrencyField = useCallback((input: StoreCurrencyFieldUpdate) => {
    const field = 'currency_name' in input ? 'currency_name' : 'currency_image_url';
    return enqueueFieldWrite(`currency:${field}`, async () => {
      const updated = await updateOwnerStoreCurrencyField(systemId, input);
      setStore((current) => current ? { ...current, ...updated } : current);
    });
  }, [systemId]);

  const saveOfferField = useCallback((itemId: string, input: StoreOfferFieldUpdate) => {
    const field = 'price' in input ? 'price' : 'is_available';
    return enqueueFieldWrite(`offer:${itemId}:${field}`, async () => {
      const { offer } = await updateOwnerStoreOfferField(systemId, itemId, input);
      setStore((current) => current ? {
        ...current,
        offers: [...current.offers.filter((entry) => entry.item_id !== itemId), offer].sort((a, b) => a.item_name.localeCompare(b.item_name)),
      } : current);
    });
  }, [systemId]);

  async function addItem(input: CreateStoreItemInput) {
    if (creatingItem) return false;
    setCreatingItem(true); setMessage(null);
    try {
      const { item } = await createOwnerStoreItem(systemId, input);
      setStore((current) => current ? { ...current, items: [...current.items, item].sort((a, b) => a.name.localeCompare(b.name)) } : current);
      setMessage('Item adicionado. Clique no quadrado para criar uma oferta.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar o item.');
      return false;
    } finally { setCreatingItem(false); }
  }

  if (!store) return <article className="card store-admin-card"><h2>Gerenciar loja</h2><p role="status">{message ?? 'Carregando loja…'}</p>{message && <button type="button" className="button secondary" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button>}</article>;
  return <StoreAdminCard store={store} creatingItem={creatingItem} message={message} onCreateItem={addItem} onSaveCurrencyField={saveCurrencyField} onSaveOfferField={saveOfferField} />;
}
