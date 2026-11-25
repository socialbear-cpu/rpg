import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoreCard } from '../src/features/store/store-card.js';
import { StoreAdminCard } from '../src/features/store/store-admin-card.js';
const offer = { store_product_id: 'offer', item_id: 'item', item_name: 'Poção', price: 12.5, is_available: true };
describe('system store', () => {
 it('uses one shared loading scene while loading or purchasing, without repeating it for every offer', () => {
  const common = { characterId: 'hero', characterName: 'Heroína', busy: true, message: null, onPurchase: vi.fn() };
  const loading = renderToStaticMarkup(createElement(StoreCard, { ...common, store: null }));
  expect(loading).toContain('bifrost-loading--panel'); expect(loading).toContain('Carregando loja…');
  const purchasing = renderToStaticMarkup(createElement(StoreCard, { ...common, store: { currency_name: 'Cristais', character_id: 'hero', balance: 20, offers: [offer, { ...offer, store_product_id: 'second' }] } }));
  expect(purchasing.match(/<canvas/g)).toHaveLength(1);
  expect(purchasing).toContain('Comprando…');
  expect(purchasing.match(/<button[^>]*disabled=""[^>]*>Comprar/g)).toHaveLength(2);
 });
 it('displays the market balance, named currency and offer price', () => {
  const html = renderToStaticMarkup(createElement(StoreCard, { characterId: 'hero', characterName: 'Heroína', store: { currency_name: 'Cristais', character_id: 'hero', balance: 20, offers: [offer] }, busy: false, message: null, onPurchase: vi.fn() }));
  expect(html).toContain('Saldo disponível:');
  expect(html).toContain('Cristais'); expect(html).toContain('12,50'); expect(html).toContain('20,00');
 });
 it('disables purchases without a selected character', () => {
  const html = renderToStaticMarkup(createElement(StoreCard, { characterId: null, characterName: '', store: { currency_name: 'Cristais', character_id: 'hero', balance: 20, offers: [offer] }, busy: false, message: null, onPurchase: vi.fn() }));
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Comprar/); expect(html).toContain('Selecione um personagem');
 });
 it('exposes named currency and offer controls before opening their editors', () => {
  const html = renderToStaticMarkup(createElement(StoreAdminCard, { store: { currency_name: 'Cristais', items: [{ id: 'item', name: 'Poção' }], offers: [offer] }, message: null, onSaveCurrencyField: vi.fn(async () => {}), onSaveOfferField: vi.fn(async () => {}) }));
  expect(html).toContain('aria-label="Editar moeda: Cristais"');
  expect(html).toContain('Nome da moeda'); expect(html).toContain('value="Cristais"');
  expect(html).toContain('aria-label="Poção, oferta de 12.5 Cristais"');
  expect(html).toContain('aria-labelledby="store-admin-offer-dialog-title"');
 });
 it('provides an accessible item creation control for an empty catalog', () => {
  const html = renderToStaticMarkup(createElement(StoreAdminCard, { store: { currency_name: 'Cristais', items: [], offers: [{ ...offer, store_product_id: undefined }] }, message: null, onSaveCurrencyField: vi.fn(async () => {}), onSaveOfferField: vi.fn(async () => {}) }));
  expect(html).toContain('aria-label="Criar item no espaço 1"');
  expect(html).toContain('aria-labelledby="store-admin-item-dialog-title"');
  expect(html).toContain('Nome do item');
 });
});
