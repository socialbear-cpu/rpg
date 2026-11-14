'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { FormEventHandler } from 'react';
import {
  cancelTradeOffer,
  counterTradeOffer,
  createTradeOffer,
  getTradeCharacterInventory,
  getTradeCharacters,
  getTradeOffers,
  respondToTradeOffer,
  type DailyLoginSystemView,
  type TradeCharacter,
  type TradeInventoryStack,
  type TradeOffer,
  type TradeOfferBox,
  type TradeOfferLineInput,
} from '../../api';

type StackSelection = Record<string, number>;

export type TradingCardViewProps = {
  systems: DailyLoginSystemView[];
  selectedSystemId: string;
  characters: TradeCharacter[];
  senderCharacterId: string;
  recipientCharacterId: string;
  senderStacks: TradeInventoryStack[];
  recipientStacks: TradeInventoryStack[];
  senderSelection: StackSelection;
  recipientSelection: StackSelection;
  offers: TradeOffer[];
  box: TradeOfferBox;
  loading: boolean;
  submitting: boolean;
  busyOfferId?: string | null;
  message: string | null;
  messageIsError: boolean;
  counterOfferId: string | null;
  systemsLoading?: boolean;
  onSystemChange: (systemId: string) => void;
  onSenderCharacterChange: (characterId: string) => void;
  onRecipientCharacterChange: (characterId: string) => void;
  onSenderQuantityChange: (stackId: string, quantity: number) => void;
  onRecipientQuantityChange: (stackId: string, quantity: number) => void;
  onSubmitComposer: FormEventHandler<HTMLFormElement>;
  onBoxChange: (box: TradeOfferBox) => void;
  onRespond: (offerId: string, action: 'accept' | 'decline') => void;
  onStartCounter: (offer: TradeOffer) => void;
  onCancelCounter: () => void;
  onCancel: (offerId: string) => void;
};

const statusLabels: Record<TradeOffer['status'], string> = {
  pending: 'Pendente', accepted: 'Aceita', declined: 'Recusada', cancelled: 'Cancelada',
  countered: 'Contraproposta enviada', expired: 'Expirada', invalidated: 'Indisponível',
};

function formatMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return 'sem características adicionais';
  return entries.map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ');
}

function OfferLines({ title, lines }: { title: string; lines: TradeOffer['sender_lines'] }) {
  return <div className="trade-offer-lines">
    <h4>{title}</h4>
    {lines.length === 0 ? <p className="trade-empty-lines">Nenhum item oferecido.</p> : <ul>
      {lines.map((line) => <li key={`${line.stack_id}-${line.item_id}`}>
        <span>{line.quantity} × {line.item_name}</span>
        <small>{formatMetadata(line.metadata)}</small>
      </li>)}
    </ul>}
  </div>;
}

function StackQuantityRows({
  stacks,
  selection,
  onChange,
  label,
}: {
  stacks: TradeInventoryStack[];
  selection: StackSelection;
  onChange: (stackId: string, quantity: number) => void;
  label: string;
}) {
  if (stacks.length === 0) return <p className="trade-empty-lines">Este personagem não tem itens disponíveis para troca.</p>;
  return <div className="trade-stack-list">
    {stacks.map((stack) => <label className="trade-stack-row" key={stack.stack_id}>
      <span><strong>{stack.item_name}</strong><small>{stack.quantity} disponíveis · {formatMetadata(stack.metadata)}</small></span>
      <input
        type="number"
        min={0}
        max={stack.quantity}
        step={1}
        value={selection[stack.stack_id] ?? 0}
        aria-label={`${label}: ${stack.item_name}, ${formatMetadata(stack.metadata)}`}
        onChange={(event) => onChange(stack.stack_id, event.target.value === '' ? 0 : Number(event.target.value))}
      />
    </label>)}
  </div>;
}

export function TradingCardView({
  systems,
  selectedSystemId,
  characters,
  senderCharacterId,
  recipientCharacterId,
  senderStacks,
  recipientStacks,
  senderSelection,
  recipientSelection,
  offers,
  box,
  loading,
  submitting,
  busyOfferId = null,
  message,
  messageIsError,
  counterOfferId,
  systemsLoading = false,
  onSystemChange,
  onSenderCharacterChange,
  onRecipientCharacterChange,
  onSenderQuantityChange,
  onRecipientQuantityChange,
  onSubmitComposer,
  onBoxChange,
  onRespond,
  onStartCounter,
  onCancelCounter,
  onCancel,
}: TradingCardViewProps) {
  const activeSystems = systems.filter((entry) => entry.system.is_active && entry.characters.length > 0);
  const selectedSystem = activeSystems.find((entry) => entry.system.id === selectedSystemId);
  const ownCharacters = characters.filter((character) => character.is_mine);
  const otherCharacters = characters.filter((character) => !character.is_mine);
  const hasSelectedItems = Object.values(senderSelection).some((quantity) => quantity > 0)
    || Object.values(recipientSelection).some((quantity) => quantity > 0);
  const senderCharacter = characters.find((character) => character.id === senderCharacterId);
  const recipientCharacter = characters.find((character) => character.id === recipientCharacterId);

  return <article className="card trading-card">
    <div className="section-heading"><div><p className="eyebrow">JOGADORES</p><h2>Troca de itens</h2></div><span className="step">↔</span></div>
    <p className="card-copy">Envie ofertas entre personagens do mesmo sistema. Os itens só mudam de inventário quando a oferta é aceita.</p>
    {message && <p className={`notice${messageIsError ? ' error' : ''}`} role="status" aria-live="polite">{message}</p>}
    {(systemsLoading || loading) && <p className="card-copy" role="status">Carregando ofertas e personagens…</p>}
    {!systemsLoading && activeSystems.length === 0 && <p className="card-copy">Nenhum sistema com personagem ativo disponível para troca.</p>}
    {activeSystems.length > 0 && <>
      <form className="trade-composer" onSubmit={onSubmitComposer}>
        <div className="trade-composer-heading">
          <div><h3>{counterOfferId ? 'Contraproposta' : 'Criar oferta de troca'}</h3>
            {counterOfferId && <p>Você pode ajustar os itens dos dois lados antes de devolver a oferta.</p>}
          </div>
          {counterOfferId && <button className="button secondary" type="button" onClick={onCancelCounter}>Sair da contraproposta</button>}
        </div>
        {!counterOfferId && activeSystems.length > 1 && <label className="daily-field" htmlFor="trade-system">Sistema de RPG
          <select id="trade-system" value={selectedSystem?.system.id ?? ''} onChange={(event) => onSystemChange(event.target.value)}>
            {activeSystems.map(({ system }) => <option key={system.id} value={system.id}>{system.name}</option>)}
          </select>
        </label>}
        {counterOfferId && <div className="trade-counter-note">Personagens: {senderCharacter?.character_name ?? 'seu personagem'} ↔ {recipientCharacter?.character_name ?? 'personagem parceiro'}.</div>}
        <div className="trade-composer-columns">
          <fieldset className="trade-side">
            <legend>Você oferece</legend>
            {!counterOfferId && <label className="daily-field" htmlFor="trade-sender-character">Seu personagem
              <select id="trade-sender-character" value={senderCharacterId} onChange={(event) => onSenderCharacterChange(event.target.value)} required>
                {ownCharacters.map((character) => <option key={character.id} value={character.id}>{character.character_name}</option>)}
              </select>
            </label>}
            {counterOfferId && <p className="trade-fixed-character">{senderCharacter?.character_name ?? 'Seu personagem'}</p>}
            <StackQuantityRows stacks={senderStacks} selection={senderSelection} onChange={onSenderQuantityChange} label="Oferecer" />
          </fieldset>
          <fieldset className="trade-side">
            <legend>Você pede em troca</legend>
            {!counterOfferId && <label className="daily-field" htmlFor="trade-recipient-character">Personagem do outro jogador
              <select id="trade-recipient-character" value={recipientCharacterId} onChange={(event) => onRecipientCharacterChange(event.target.value)} required>
                {otherCharacters.map((character) => <option key={character.id} value={character.id}>{character.character_name} · {character.owner_display_name}</option>)}
              </select>
            </label>}
            {counterOfferId && <p className="trade-fixed-character">{recipientCharacter?.character_name ?? 'Personagem parceiro'}</p>}
            <StackQuantityRows stacks={recipientStacks} selection={recipientSelection} onChange={onRecipientQuantityChange} label="Pedir" />
          </fieldset>
        </div>
        <div className="trade-review" aria-live="polite">
          <strong>Resumo</strong>
          <span>{Object.values(senderSelection).filter((quantity) => quantity > 0).reduce((sum, quantity) => sum + quantity, 0)} item(ns) oferecido(s)</span>
          <span>{Object.values(recipientSelection).filter((quantity) => quantity > 0).reduce((sum, quantity) => sum + quantity, 0)} item(ns) solicitado(s)</span>
          {Object.values(recipientSelection).every((quantity) => quantity === 0) && <small>O outro lado não oferece itens; a proposta será um presente.</small>}
        </div>
        <div className="trade-composer-actions">
          <button className="button primary" type="submit" disabled={submitting || !hasSelectedItems || !senderCharacterId || !recipientCharacterId}>
            {submitting ? 'Enviando…' : counterOfferId ? 'Enviar contraproposta' : 'Enviar oferta'}
          </button>
          {counterOfferId && <button className="button secondary" type="button" onClick={onCancelCounter}>Cancelar</button>}
        </div>
      </form>

      <section className="trade-offer-section" aria-label="Ofertas de troca">
        <div className="trade-box-tabs nexus-tab-list--segment" role="tablist" aria-label="Caixas de ofertas">
          {(['incoming', 'sent', 'history'] as const).map((value) => <button
            key={value} type="button" role="tab" aria-selected={box === value}
            className="nexus-tab"
            onClick={() => onBoxChange(value)}
          >{value === 'incoming' ? 'Recebidas' : value === 'sent' ? 'Enviadas' : 'Histórico'}</button>)}
        </div>
        {loading && <p className="card-copy" role="status">Carregando caixa de ofertas…</p>}
        {!loading && offers.length === 0 && <p className="card-copy">Não há ofertas nesta caixa.</p>}
        <div className="trade-offer-list">
          {offers.map((offer) => <article className="trade-offer" key={offer.id}>
            <div className="trade-offer-heading">
              <div><h3>{offer.sender_character.character_name} ↔ {offer.recipient_character.character_name}</h3>
                <p>{offer.sender_character.owner_display_name} → {offer.recipient_character.owner_display_name}</p>
              </div>
              <span className={`trade-status trade-status-${offer.status}`}>{statusLabels[offer.status]}</span>
            </div>
            {offer.status === 'pending' && <p className="trade-expiry">Válida até {new Date(offer.expires_at).toLocaleDateString('pt-BR')}</p>}
            <div className="trade-offer-parts">
              <OfferLines title="Oferece" lines={offer.sender_lines} />
              <OfferLines title="Pede" lines={offer.recipient_lines} />
            </div>
            {offer.status === 'invalidated' && <p className="trade-invalidated" role="status">Oferta indisponível. Um ou mais itens mudaram desde o envio e nenhum item foi transferido.</p>}
            {offer.status === 'pending' && box === 'incoming' && <div className="trade-offer-actions">
              <button className="button primary" type="button" disabled={busyOfferId === offer.id} onClick={() => onRespond(offer.id, 'accept')}>Aceitar</button>
              <button className="button secondary" type="button" disabled={busyOfferId === offer.id} onClick={() => onRespond(offer.id, 'decline')}>Recusar</button>
              <button className="button secondary" type="button" onClick={() => onStartCounter(offer)}>Contrapropor</button>
            </div>}
            {offer.status === 'pending' && box === 'sent' && <div className="trade-offer-actions">
              <button className="button secondary" type="button" disabled={busyOfferId === offer.id} onClick={() => onCancel(offer.id)}>Cancelar oferta</button>
            </div>}
          </article>)}
        </div>
      </section>
    </>}
  </article>;
}

export function TradingCard({ systems, systemsLoading = false }: { systems: DailyLoginSystemView[]; systemsLoading?: boolean }) {
  const activeSystems = systems.filter((entry) => entry.system.is_active && entry.characters.length > 0);
  const [selectedSystemId, setSelectedSystemId] = useState(activeSystems[0]?.system.id ?? '');
  const [characters, setCharacters] = useState<TradeCharacter[]>([]);
  const [senderCharacterId, setSenderCharacterId] = useState('');
  const [recipientCharacterId, setRecipientCharacterId] = useState('');
  const [senderStacks, setSenderStacks] = useState<TradeInventoryStack[]>([]);
  const [recipientStacks, setRecipientStacks] = useState<TradeInventoryStack[]>([]);
  const [senderSelection, setSenderSelection] = useState<StackSelection>({});
  const [recipientSelection, setRecipientSelection] = useState<StackSelection>({});
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [box, setBox] = useState<TradeOfferBox>('incoming');
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [loadingSenderInventory, setLoadingSenderInventory] = useState(false);
  const [loadingRecipientInventory, setLoadingRecipientInventory] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [counterOfferId, setCounterOfferId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSystems.some((entry) => entry.system.id === selectedSystemId)) {
      setSelectedSystemId(activeSystems[0]?.system.id ?? '');
    }
  }, [activeSystems, selectedSystemId]);

  useEffect(() => {
    if (!selectedSystemId) {
      setCharacters([]);
      return;
    }
    let current = true;
    setLoadingCharacters(true);
    void getTradeCharacters(selectedSystemId).then((result) => {
      if (!current) return;
      setCharacters(result.characters);
      const own = result.characters.filter((character) => character.is_mine);
      const others = result.characters.filter((character) => !character.is_mine);
      setSenderCharacterId(own[0]?.id ?? '');
      setRecipientCharacterId(others[0]?.id ?? '');
      setSenderSelection({});
      setRecipientSelection({});
    }).catch((error) => {
      if (current) {
        setCharacters([]);
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os personagens.');
        setMessageIsError(true);
      }
    }).finally(() => { if (current) setLoadingCharacters(false); });
    return () => { current = false; };
  }, [selectedSystemId]);

  useEffect(() => {
    if (!selectedSystemId || !senderCharacterId) {
      setSenderStacks([]);
      return;
    }
    let current = true;
    setLoadingSenderInventory(true);
    void getTradeCharacterInventory(selectedSystemId, senderCharacterId).then((result) => {
      if (current) setSenderStacks(result.stacks);
    }).catch((error) => {
      if (current) {
        setSenderStacks([]);
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar seu inventário.');
        setMessageIsError(true);
      }
    }).finally(() => { if (current) setLoadingSenderInventory(false); });
    return () => { current = false; };
  }, [selectedSystemId, senderCharacterId]);

  useEffect(() => {
    if (!selectedSystemId || !recipientCharacterId) {
      setRecipientStacks([]);
      return;
    }
    let current = true;
    setLoadingRecipientInventory(true);
    void getTradeCharacterInventory(selectedSystemId, recipientCharacterId).then((result) => {
      if (current) setRecipientStacks(result.stacks);
    }).catch((error) => {
      if (current) {
        setRecipientStacks([]);
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o inventário do outro personagem.');
        setMessageIsError(true);
      }
    }).finally(() => { if (current) setLoadingRecipientInventory(false); });
    return () => { current = false; };
  }, [selectedSystemId, recipientCharacterId]);

  async function loadOffers(nextBox = box) {
    setLoadingOffers(true);
    try {
      setOffers((await getTradeOffers(nextBox)).offers);
    } catch (error) {
      setOffers([]);
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as ofertas.');
      setMessageIsError(true);
    } finally {
      setLoadingOffers(false);
    }
  }

  useEffect(() => { void loadOffers(box); }, [box]);

  function selectedLines(stacks: TradeInventoryStack[], selection: StackSelection): TradeOfferLineInput[] {
    return stacks.flatMap((stack) => {
      const quantity = selection[stack.stack_id] ?? 0;
      return quantity > 0 ? [{ stack_id: stack.stack_id, quantity }] : [];
    });
  }

  async function submitComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const senderLines = selectedLines(senderStacks, senderSelection);
    const recipientLines = selectedLines(recipientStacks, recipientSelection);
    if (senderLines.length + recipientLines.length === 0 || !senderCharacterId || !recipientCharacterId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      if (counterOfferId) {
        await counterTradeOffer(counterOfferId, { sender_lines: senderLines, recipient_lines: recipientLines });
        setMessage('Contraproposta enviada. O jogador recebeu uma nova oferta para avaliar.');
      } else {
        await createTradeOffer({
          sender_character_id: senderCharacterId,
          recipient_character_id: recipientCharacterId,
          sender_lines: senderLines,
          recipient_lines: recipientLines,
        });
        setMessage('Oferta enviada. Os itens permanecem no inventário até a aceitação.');
      }
      setMessageIsError(false);
      setCounterOfferId(null);
      setSenderSelection({});
      setRecipientSelection({});
      await loadOffers(box);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a oferta.');
      setMessageIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function respond(offerId: string, action: 'accept' | 'decline') {
    setBusyOfferId(offerId);
    setMessage(null);
    try {
      await respondToTradeOffer(offerId, action);
      setMessage(action === 'accept' ? 'Troca concluída; os itens foram transferidos.' : 'Oferta recusada.');
      setMessageIsError(false);
      await loadOffers(box);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível responder à oferta.');
      setMessageIsError(true);
      await loadOffers(box);
    } finally {
      setBusyOfferId(null);
    }
  }

  async function cancel(offerId: string) {
    setBusyOfferId(offerId);
    setMessage(null);
    try {
      await cancelTradeOffer(offerId);
      setMessage('Oferta cancelada.');
      setMessageIsError(false);
      await loadOffers(box);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar a oferta.');
      setMessageIsError(true);
      await loadOffers(box);
    } finally {
      setBusyOfferId(null);
    }
  }

  function startCounter(offer: TradeOffer) {
    setSelectedSystemId(offer.game_system_id);
    setCounterOfferId(offer.id);
    setSenderCharacterId(offer.recipient_character.id);
    setRecipientCharacterId(offer.sender_character.id);
    setSenderSelection({});
    setRecipientSelection({});
    setMessage(null);
    setBox('incoming');
  }

  return <TradingCardView
    systems={systems}
    selectedSystemId={selectedSystemId}
    characters={characters}
    senderCharacterId={senderCharacterId}
    recipientCharacterId={recipientCharacterId}
    senderStacks={senderStacks}
    recipientStacks={recipientStacks}
    senderSelection={senderSelection}
    recipientSelection={recipientSelection}
    offers={offers}
    box={box}
    loading={loadingCharacters || loadingSenderInventory || loadingRecipientInventory || loadingOffers}
    submitting={submitting}
    busyOfferId={busyOfferId}
    message={message}
    messageIsError={messageIsError}
    counterOfferId={counterOfferId}
    systemsLoading={systemsLoading}
    onSystemChange={(systemId) => { setSelectedSystemId(systemId); setCounterOfferId(null); }}
    onSenderCharacterChange={(characterId) => { setSenderCharacterId(characterId); setSenderSelection({}); }}
    onRecipientCharacterChange={(characterId) => { setRecipientCharacterId(characterId); setRecipientSelection({}); }}
    onSenderQuantityChange={(stackId, quantity) => setSenderSelection((current) => ({ ...current, [stackId]: quantity }))}
    onRecipientQuantityChange={(stackId, quantity) => setRecipientSelection((current) => ({ ...current, [stackId]: quantity }))}
    onSubmitComposer={submitComposer}
    onBoxChange={setBox}
    onRespond={(offerId, action) => { void respond(offerId, action); }}
    onStartCounter={startCounter}
    onCancelCounter={() => { setCounterOfferId(null); setSenderSelection({}); setRecipientSelection({}); }}
    onCancel={(offerId) => { void cancel(offerId); }}
  />;
}
