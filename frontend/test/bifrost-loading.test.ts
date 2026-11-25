import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoadingController } from '../src/features/loading/loading-controller.js';
import { BifrostLoading } from '../src/features/loading/bifrost-loading.js';

afterEach(() => vi.useRealTimers());

describe('Bifrost screen loading', () => {
  it('does not flash for a request completed within 300 ms', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const controller = createLoadingController(changed);
    const finish = controller.begin('Carregando ficha');
    vi.advanceTimersByTime(200);
    finish();
    vi.runAllTimers();
    expect(changed).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('waits for concurrent requests and completes the departure before hiding', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const controller = createLoadingController(changed);
    const first = controller.begin('Carregando sistema');
    const second = controller.begin('Carregando ficha');
    vi.advanceTimersByTime(300);
    expect(changed).toHaveBeenLastCalledWith({ phase: 'travelling', label: 'Carregando ficha' });
    first(); first();
    expect(changed).toHaveBeenLastCalledWith({ phase: 'travelling', label: 'Carregando ficha' });
    second();
    expect(changed).toHaveBeenLastCalledWith({ phase: 'departing', label: 'Carregando ficha' });
    vi.advanceTimersByTime(759);
    expect(changed.mock.lastCall?.[0].phase).toBe('departing');
    vi.advanceTimersByTime(1);
    expect(changed.mock.lastCall?.[0].phase).toBe('hidden');
    controller.dispose();
  });

  it('resumes when another load starts during departure and cancels all timers on dispose', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const controller = createLoadingController(changed);
    const finish = controller.begin('Carregando');
    vi.advanceTimersByTime(300); finish();
    controller.begin('Abrindo perfil');
    vi.advanceTimersByTime(760);
    expect(changed).toHaveBeenLastCalledWith({ phase: 'travelling', label: 'Abrindo perfil' });
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Bifrost loading accessibility', () => {
  it.each(['screen', 'panel', 'inline'] as const)('keeps the %s label accessible and the runes decorative', (variant) => {
    const html = renderToStaticMarkup(createElement(BifrostLoading, { variant, label: 'Carregando personagem' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain('Carregando personagem');
    expect(html).toContain('bifrost-loading-sr');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('ᛒᛁᚠᚱᛟᛊᛏ');
    expect(html).not.toContain('Atravessando a Bifrost');
  });
});
