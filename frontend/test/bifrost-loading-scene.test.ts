import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountBifrostScene } from '../src/features/loading/bifrost-scene.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function environment(reducedMotion = false) {
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    setTransform: vi.fn(), fillRect: vi.fn(), createRadialGradient: () => gradient, createLinearGradient: () => gradient,
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {}, quadraticCurveTo() {},
  };
  const bounds = { width: 960, height: 430 };
  const canvas = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => bounds };
  const motion = Object.assign(new EventTarget(), { matches: reducedMotion });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = Object.assign(new EventTarget(), { devicePixelRatio: 2, matchMedia: () => motion });
  const resizeDisconnect = vi.fn(), intersectionDisconnect = vi.fn();
  const requestFrame = vi.fn(() => 1), cancelFrame = vi.fn();
  let intersectionChanged: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = resizeDisconnect; });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersectionChanged) { intersectionChanged = callback; }
    observe() {} disconnect = intersectionDisconnect;
  });
  vi.stubGlobal('requestAnimationFrame', requestFrame); vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, bounds, motion, doc, win, requestFrame, cancelFrame, resizeDisconnect, intersectionDisconnect, hide: () => intersectionChanged([{ isIntersecting: false }]) };
}

describe('Bifrost native-resolution animation', () => {
  it('draws at display density and follows viewport changes without enlarging a raster', () => {
    const env = environment();
    const scene = mountBifrostScene(env.canvas);
    expect([env.canvas.width, env.canvas.height]).toEqual([1920, 860]);
    env.bounds.width = 320; env.bounds.height = 440;
    env.win.dispatchEvent(new Event('resize'));
    expect([env.canvas.width, env.canvas.height]).toEqual([640, 880]);
    expect(env.ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    scene.stop();
  });

  it('renders a static scene for reduced motion and resumes only when allowed', () => {
    const env = environment(true);
    const scene = mountBifrostScene(env.canvas);
    expect(env.ctx.fillRect).toHaveBeenCalled();
    expect(env.requestFrame).not.toHaveBeenCalled();
    env.motion.matches = false; env.motion.dispatchEvent(new Event('change'));
    expect(env.requestFrame).toHaveBeenCalledTimes(1);
    env.requestFrame.mockClear();
    env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.requestFrame).not.toHaveBeenCalled();
    scene.stop();
  });

  it('stops offscreen animation and releases observers and event listeners on unmount', () => {
    const env = environment();
    const scene = mountBifrostScene(env.canvas, true);
    env.requestFrame.mockClear(); env.hide();
    expect(env.requestFrame).not.toHaveBeenCalled();
    scene.stop();
    expect(env.resizeDisconnect).toHaveBeenCalledOnce();
    expect(env.intersectionDisconnect).toHaveBeenCalledOnce();
    const drawCount = env.ctx.fillRect.mock.calls.length;
    env.win.dispatchEvent(new Event('resize'));
    env.motion.dispatchEvent(new Event('change'));
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.ctx.fillRect.mock.calls).toHaveLength(drawCount);
  });
});
