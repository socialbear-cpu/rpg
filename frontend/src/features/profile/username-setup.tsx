'use client';

import { useState, type FormEvent } from 'react';

interface UsernameSetupProps {
  onSubmit: (username: string) => Promise<void>;
}

export function UsernameSetup({ onSubmit }: UsernameSetupProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase();
  const validUsername = /^[a-z0-9_]{3,20}$/.test(normalizedUsername);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validUsername || saving) return;
    setError(null);
    setSaving(true);
    try {
      await onSubmit(normalizedUsername);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar seu nick.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="username-setup-page">
      <section className="username-setup-card" aria-labelledby="username-setup-title">
        <p className="username-setup-eyebrow">PRIMEIRO ACESSO</p>
        <h1 id="username-setup-title">Como você quer ser chamado?</h1>
        <p>Escolha um nick único para aparecer no seu perfil e nas suas aventuras.</p>
        <form onSubmit={submit}>
          <label htmlFor="username-setup-input">Seu nick</label>
          <div className="username-setup-input">
            <span aria-hidden="true">@</span>
            <input
              id="username-setup-input"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              maxLength={20}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="seunick"
              aria-describedby="username-setup-hint"
              required
            />
          </div>
          <p id="username-setup-hint" className="username-setup-hint">
            Use de 3 a 20 letras, números ou _. O nick não poderá ser alterado depois.
          </p>
          {error && <p className="username-setup-error" role="alert">{error}</p>}
          <button type="submit" disabled={!validUsername || saving}>
            {saving ? 'Salvando…' : 'Continuar'}
          </button>
        </form>
      </section>
    </main>
  );
}
