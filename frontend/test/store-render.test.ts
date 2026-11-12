import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoreCard } from '../src/features/store/store-card.js';
import { StoreAdminCard } from '../src/features/store/store-admin-card.js';
const offer = { store_product_id: 'offer', item_id: 'item', item_name: 'Poção', price: 12.5, is_available: true };
describe('system store', () => {
 it('displays named currency, character balance and offer price', () => {
  const html = renderToStaticMarkup(createElement(StoreCard, { characterId: 'hero', characterName: 'Heroína', store: { currency_name: 'Cristais', character_id: 'hero', balance: 20, offers: [offer] }, busy: false, message: null, onPurchase: vi.fn() }));
  expect(html).toContain('Cristais'); expect(html).toContain('12,50'); expect(html).toContain('20,00'); expect(html).toContain('Heroína');
 });
 it('disables purchases without a selected character', () => {
  const html = renderToStaticMarkup(createElement(StoreCard, { characterId: null, characterName: '', store: { currency_name: 'Cristais', character_id: 'hero', balance: 20, offers: [offer] }, busy: false, message: null, onPurchase: vi.fn() }));
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Comprar/); expect(html).toContain('Selecione um personagem');
 });
 it('lets owners edit currency, price and availability', () => {
  const html = renderToStaticMarkup(createElement(StoreAdminCard, { store: { currency_name: 'Cristais', items: [{ id: 'item', name: 'Poção' }], offers: [offer] }, saving: false, message: null, onChange: vi.fn(), onSave: vi.fn() }));
  expect(html).toContain('Nome da moeda'); expect(html).toContain('value="Cristais"'); expect(html).toContain('Preço'); expect(html).toContain('value="12.5"'); expect(html).toContain('Disponível'); expect(html).toContain('Adicionar oferta');
 });
});
