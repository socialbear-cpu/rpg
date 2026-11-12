'use client';

import type { CharacterSheetStep } from '../../api';

export function CharacterSheetStepRenderer({ step, values, onValueChange, onFieldBlur, mode }: { step: CharacterSheetStep; values: Record<string, unknown>; onValueChange: (key: string, value: unknown) => void; onFieldBlur?: () => void; mode: 'preview' | 'entry' }) {
  const elements = step.elements ?? [];
  return <>
    {elements.length > 0 && <div className="character-sheet-visual-stage" aria-label="Elementos visuais da ficha">{elements.map((element) => <div key={element.key} className="character-sheet-visual-element" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, transform: `rotate(${element.rotation}deg)` }} title={element.type === 'image' ? element.description : undefined}>
      {element.type === 'text' ? element.text : <img src={element.image_url} alt={element.description || 'Imagem da ficha'} title={element.description} />}
    </div>)}</div>}
    <div className="character-sheet-step-grid">{step.components.slice().sort((a,b)=>a.position-b.position).map(component=><fieldset className={`character-sheet-component width-${component.width}`} key={component.key}>
    <legend>{component.label}{component.required?' *':''}</legend>
    {component.type==='single_select'&&component.presentation==='cards'?<div className="character-sheet-option-cards" role="radiogroup" aria-label={component.label}>{component.options.map(option=><button key={option.label} type="button" role="radio" aria-checked={values[component.key]===option.label} aria-label={`${option.label}${option.description?`: ${option.description}`:''}`} title={option.description} className={values[component.key]===option.label?'selected':''} onClick={()=>onValueChange(component.key,option.label)} onBlur={onFieldBlur}>{option.image_url&&<img src={option.image_url} alt={option.description || ''} title={option.description} loading="lazy"/>}<strong>{option.label}</strong>{option.description&&<span>{option.description}</span>}</button>)}</div>:component.type==='single_select'?<select aria-label={component.label} value={String(values[component.key]??'')} onChange={e=>onValueChange(component.key,e.target.value)} onBlur={onFieldBlur} disabled={mode==='preview'}><option value="">Escolha uma opção</option>{component.options.map(o=><option key={o.label}>{o.label}</option>)}</select>:component.type==='long_text'?<textarea aria-label={component.label} value={String(values[component.key]??'')} onChange={e=>onValueChange(component.key,e.target.value)} onBlur={onFieldBlur} disabled={mode==='preview'}/>:<input aria-label={component.label} type={component.type==='number'?'number':'text'} value={String(values[component.key]??'')} onChange={e=>onValueChange(component.key,component.type==='number'?Number(e.target.value):e.target.value)} onBlur={onFieldBlur} disabled={mode==='preview'}/>}
  </fieldset>)}</div>
  </>;
}
