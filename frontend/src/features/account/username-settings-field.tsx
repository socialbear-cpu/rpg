import type { FormEventHandler } from 'react';

export function UsernameSettingsField({
  username,
  draft,
  changeUsed,
  busy,
  enabled,
  onDraftChange,
  onSave,
}: {
  username: string | null;
  draft: string;
  changeUsed: boolean | null;
  busy: boolean;
  enabled: boolean;
  onDraftChange: (value: string) => void;
  onSave: FormEventHandler<HTMLFormElement>;
}) {
  if (changeUsed === false) return <form className="account-settings-form account-username-form" onSubmit={onSave}>
    <label>Novo @<input value={draft} onChange={(event) => onDraftChange(event.target.value)} minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" autoCapitalize="none" required disabled={!enabled || busy} /></label>
    <p className="account-settings-hint">Você pode trocar seu @ uma única vez. Use de 3 a 20 letras, números ou _.</p>
    <button type="submit" disabled={!enabled || busy}>{busy ? 'Salvando…' : 'Salvar @'}</button>
  </form>;

  return <div className="account-settings-form account-username-form">
    <label>Nome de usuário<input value={username ? `@${username}` : 'Ainda não escolhido'} readOnly /></label>
    <p className="account-settings-hint" role="status">
      {changeUsed ? 'Sua única troca de @ já foi usada.' : 'Verificando se a troca de @ está disponível…'}
    </p>
  </div>;
}
