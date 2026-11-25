export type LoadingPhase = 'hidden' | 'travelling' | 'departing';
export interface LoadingState { phase: LoadingPhase; label: string; }

export function createLoadingController(onChange: (state: LoadingState) => void) {
  const pending = new Map<symbol, string>();
  let phase: LoadingPhase = 'hidden';
  let label = 'Carregando…';
  let entrance: ReturnType<typeof setTimeout> | undefined;
  let departure: ReturnType<typeof setTimeout> | undefined;
  const publish = (next: LoadingPhase) => { phase = next; onChange({ phase, label }); };

  return {
    begin(description: string) {
      const token = Symbol();
      pending.set(token, description);
      label = description;
      clearTimeout(departure);
      if (phase !== 'hidden') publish('travelling');
      else if (!entrance) entrance = setTimeout(() => {
        entrance = undefined;
        if (pending.size) publish('travelling');
      }, 300);
      return () => {
        if (!pending.delete(token)) return;
        if (pending.size) {
          label = [...pending.values()].at(-1)!;
          if (phase !== 'hidden') publish('travelling');
          return;
        }
        clearTimeout(entrance); entrance = undefined;
        if (phase === 'hidden') return;
        publish('departing');
        departure = setTimeout(() => publish('hidden'), 760);
      };
    },
    dispose() {
      clearTimeout(entrance); clearTimeout(departure);
      entrance = undefined; departure = undefined;
      pending.clear(); phase = 'hidden';
    },
  };
}
