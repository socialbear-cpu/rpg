'use client';

import { BifrostLoading } from '../loading/bifrost-loading';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { CharacterInventory, CharacterSheetDefinition, SystemCharacter } from '../../api';
import type { CharacterSheetComponent, CharacterSheetStep } from '../../api';

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Não preenchido';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function selectedOptionLabels(component: Extract<CharacterSheetComponent, { type: 'single_select' }>, value: unknown) {
  const selectedValues = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string' ? [value] : [];
  const matches = selectedValues.map((selected) => component.options.find((option) => (option.value ?? option.label) === selected));
  const rendered = matches.flatMap((option, index) => option
    ? [{ label: option.label, description: option.description, imageUrl: safeImageUrl(option.image_url) }]
    : selectedValues[index] ? [{ label: selectedValues[index]!, description: undefined, imageUrl: null }] : []);
  return rendered.length > 0 ? rendered : [{ label: 'Não preenchido', description: undefined, imageUrl: null }];
}

function CharacterSheetValue({ component, value }: {
  component: Exclude<CharacterSheetComponent, { type: 'visual_composition' }>;
  value: unknown;
}) {
  if (component.type === 'single_select') {
    return <div className="character-record-selected-options">{selectedOptionLabels(component, value).map((option, index) =>
      <div className="character-record-selected-option" key={`${option.label}-${index}`}>
        {option.imageUrl && <img src={option.imageUrl} alt="" />}
        <div><strong>{option.label}</strong>{option.description && <p>{option.description}</p>}</div>
      </div>)}</div>;
  }
  return <p className={`character-record-value${component.type === 'long_text' ? ' is-long' : ''}`}>{displayValue(value)}</p>;
}

function SheetArt({ step, compositionKey, excludeCompositions = [] }: { step: CharacterSheetStep; compositionKey?: string; excludeCompositions?: string[] }) {
  const elements = step.elements ?? [];
  if (elements.length === 0) return null;
  const compositions = compositionKey ? [compositionKey] : [...new Set(elements.map((element) => element.composition_key ?? 'composition_1'))].filter((key) => !excludeCompositions.includes(key));
  if (compositions.length === 0) return null;
  return <>{compositions.map((compositionKey, index) => <div key={compositionKey} className="character-record-sheet-art" aria-label={`Composição visual ${index + 1}: ${step.label}`}>
    {elements.filter((element) => (element.composition_key ?? 'composition_1') === compositionKey).map((element) => <div key={element.key} className="character-record-sheet-art-element" style={{
      left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`,
      transform: `rotate(${element.rotation}deg)`,
    }}>
      {element.type === 'text' ? element.text : <img src={element.image_url} alt={element.description || 'Imagem da ficha'} />}
    </div>)}
  </div>)}</>;
}

function CharacterSheetView({ character, definition, experience, error }: {
  character: SystemCharacter;
  definition: CharacterSheetDefinition | null;
  experience: { level: number; total_xp: number; xp_in_level: number; xp_to_next_level: number } | null;
  error: string | null;
}) {
  if (error) return <p role="alert" className="character-record-notice">{error}</p>;
  if (!definition) return <BifrostLoading variant="panel" label="Carregando ficha..." />;

  const componentsByStep = new Map(definition.steps.map((step) => [step.key, [...step.components]
    .sort((a, b) => a.position - b.position).map((component) => ({ step, component }))]));
  const visibleSteps = [...definition.steps]
    .sort((a, b) => a.position - b.position)
      .filter((step) => (componentsByStep.get(step.key)?.length ?? 0) > 0 || (step.elements?.length ?? 0) > 0);

  return <>
    {experience && <section className="character-record-experience" aria-label="Experiência do personagem">
      <div><span>Nível</span><strong>{experience.level}</strong></div>
      <div><span>Experiência total</span><strong>{experience.total_xp} XP</strong></div>
      <div><span>Próximo nível</span><strong>{experience.xp_in_level} / {experience.xp_to_next_level} XP</strong></div>
    </section>}
    {visibleSteps.length === 0
      ? <p className="character-record-notice">Esta ficha ainda não possui campos preenchidos ou visíveis.</p>
      : visibleSteps.map((step) => <section className="character-record-sheet-section" key={step.key}>
        <SheetArt step={step} excludeCompositions={step.components.filter((component) => component.type === 'visual_composition').map((component) => component.composition_key)} />
        <div className="character-record-fields">
          {(componentsByStep.get(step.key) ?? []).map(({ component }) => component.type === 'visual_composition'
            ? <article className={`character-record-field character-record-visual-field width-${component.width}`} key={component.key}><h3>{component.label}</h3><SheetArt step={step} compositionKey={component.composition_key} /></article>
            : <article className={`character-record-field width-${component.width}`} key={component.key}><h3>{component.label}</h3><CharacterSheetValue component={component} value={character.attributes[component.key]} /></article>)}
        </div>
      </section>)}
  </>;
}

function itemCategory(item: CharacterInventory['stacks'][number]): string {
  const configuredCategory = item.rules_data.category;
  if (typeof configuredCategory === 'string' && configuredCategory.trim()) return configuredCategory.trim();
  const knownCategories: Record<string, string> = {
    equipment: 'Equipamentos',
    consumable: 'Consumíveis',
    material: 'Materiais',
    misc: 'Outros itens',
  };
  return knownCategories[item.item_type] ?? (item.item_type || 'Outros itens');
}

function itemAttributes(item: CharacterInventory['stacks'][number]) {
  return Object.entries(item.rules_data).filter(([key]) => key !== 'image_url');
}

function CharacterInventoryView({ inventory, selectedStackId, onSelect }: {
  inventory: CharacterInventory | null;
  selectedStackId: string | null;
  onSelect: (stackId: string) => void;
}) {
  const selectedStack = inventory?.stacks.find((stack) => stack.stack_id === selectedStackId) ?? null;
  const categories = new Map<string, NonNullable<typeof inventory>['stacks']>();
  for (const stack of inventory?.stacks ?? []) {
    const category = itemCategory(stack);
    const current = categories.get(category) ?? [];
    current.push(stack);
    categories.set(category, current);
  }

  if (!inventory) return <p className="character-record-notice">O inventário ainda não foi carregado.</p>;
  if (inventory.stacks.length === 0) return <p className="character-record-notice">Seu inventário está vazio.</p>;

  return <div className="character-record-inventory-layout">
    <div className="character-record-inventory-categories">
      {[...categories.entries()].map(([category, stacks]) => <section className="character-record-inventory-category" key={category}>
        <header><span>{stacks.length} {stacks.length === 1 ? 'item' : 'itens'}</span><h2>{category}</h2></header>
        <div className="character-record-inventory-grid">
          {stacks.map((stack) => {
            const imageUrl = safeImageUrl(stack.rules_data.image_url);
            return <button type="button" className={`character-record-item${selectedStackId === stack.stack_id ? ' is-selected' : ''}`} key={stack.stack_id} aria-pressed={selectedStackId === stack.stack_id} onClick={() => onSelect(stack.stack_id)}>
              <span className="character-record-item-art">{imageUrl ? <img src={imageUrl} alt="" /> : <span aria-hidden="true">✧</span>}</span>
              <span className="character-record-item-name">{stack.item_name}</span>
              <span className="character-record-item-quantity" aria-label={`Quantidade: ${stack.quantity}`}>×{stack.quantity}</span>
            </button>;
          })}
        </div>
      </section>)}
    </div>
    {selectedStack && <aside className="character-record-item-detail" aria-live="polite">
      <span className="character-entry-eyebrow">DETALHES DO ITEM</span>
      <h2>{selectedStack.item_name}</h2>
      <p className="character-record-item-category-label">{itemCategory(selectedStack)}</p>
      <p>{selectedStack.description || 'Sem descrição.'}</p>
      <dl>
        <div><dt>Quantidade</dt><dd>{selectedStack.quantity}</dd></div>
        <div><dt>Tipo</dt><dd>{selectedStack.item_type}</dd></div>
        {itemAttributes(selectedStack).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}
        {Object.keys(selectedStack.metadata).length > 0 && <div className="character-record-item-metadata"><dt>Características da pilha</dt><dd>{Object.entries(selectedStack.metadata).map(([key, value]) => <span key={key}><strong>{key}:</strong> {displayValue(value)}</span>)}</dd></div>}
      </dl>
    </aside>}
  </div>;
}

export function CharacterRecord({ character, definition, experience, inventory, activeTab, onTabChange, loading, sheetError, inventoryError, onRefresh, onClose }: {
  character: SystemCharacter;
  definition: CharacterSheetDefinition | null;
  experience: CharacterSheetViewExperience;
  inventory: CharacterInventory | null;
  activeTab: 'sheet' | 'inventory';
  onTabChange: (tab: 'sheet' | 'inventory') => void;
  loading: boolean;
  sheetError: string | null;
  inventoryError: string | null;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const tabButtons = useRef<Partial<Record<'sheet' | 'inventory', HTMLButtonElement>>>({});
  const tabPanelNeedsTabStop = activeTab === 'sheet' || inventoryError !== null || (inventory?.stacks.length ?? 0) === 0;
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const nextTab = event.key === 'ArrowRight' ? (activeTab === 'sheet' ? 'inventory' : 'sheet')
      : event.key === 'ArrowLeft' ? (activeTab === 'sheet' ? 'inventory' : 'sheet')
        : event.key === 'Home' ? 'sheet'
          : event.key === 'End' ? 'inventory' : null;
    if (!nextTab) return;
    event.preventDefault();
    onTabChange(nextTab);
    tabButtons.current[nextTab]?.focus();
  }
  return <section className="character-record-page" aria-labelledby="character-record-title">
    <div className="character-record-topline">
      <button type="button" className="character-record-back" onClick={onClose}>← Voltar à aventura</button>
      <button type="button" className="character-record-refresh" onClick={onRefresh} disabled={loading}>{loading ? <BifrostLoading variant="inline" label="Atualizando..." /> : 'Atualizar dados'}</button>
    </div>
    <header className="character-record-heading">
      <span className="character-entry-eyebrow">FICHA DA AVENTURA</span>
      <h1 id="character-record-title">{character.character_name}</h1>
      <p>Ficha e inventário deste personagem.</p>
    </header>
    <div className="character-record-tabs bifrost-tab-list--segment" role="tablist" aria-label="Dados do personagem">
      <button ref={(element) => { tabButtons.current.sheet = element ?? undefined; }} id="character-record-tab-sheet" type="button" role="tab" aria-selected={activeTab === 'sheet'} aria-controls="character-record-panel" tabIndex={activeTab === 'sheet' ? 0 : -1} className="bifrost-tab" onKeyDown={handleTabKeyDown} onClick={() => onTabChange('sheet')}>Ficha</button>
      <button ref={(element) => { tabButtons.current.inventory = element ?? undefined; }} id="character-record-tab-inventory" type="button" role="tab" aria-selected={activeTab === 'inventory'} aria-controls="character-record-panel" tabIndex={activeTab === 'inventory' ? 0 : -1} className="bifrost-tab" onKeyDown={handleTabKeyDown} onClick={() => onTabChange('inventory')}>Inventário <span>{inventory?.stacks.length ?? 0}</span></button>
    </div>
    <div id="character-record-panel" role="tabpanel" aria-labelledby={activeTab === 'sheet' ? 'character-record-tab-sheet' : 'character-record-tab-inventory'} className="character-record-panel" tabIndex={tabPanelNeedsTabStop ? 0 : undefined}>
      {activeTab === 'sheet'
        ? <CharacterSheetView character={character} definition={definition} experience={experience} error={sheetError} />
        : inventoryError
          ? <p role="alert" className="character-record-notice">{inventoryError}</p>
          : <CharacterInventoryView inventory={inventory} selectedStackId={selectedStackId} onSelect={setSelectedStackId} />}
    </div>
  </section>;
}

type CharacterSheetViewExperience = { level: number; total_xp: number; xp_in_level: number; xp_to_next_level: number } | null;
