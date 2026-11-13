'use client';

import { useState, type FormEvent } from 'react';
import { updateGameSystem, type GameSystem } from '../../api';
import { SystemDetailsFields } from '../system-creation/system-details-fields';

export function SystemDetailsEditor({ system, onSaved }: {
  system: Pick<GameSystem, 'id' | 'name' | 'description' | 'is_public'>;
  onSaved: (system: GameSystem) => void;
}) {
  const [name, setName] = useState(system.name);
  const [description, setDescription] = useState(system.description ?? '');
  const [isPublic, setIsPublic] = useState(system.is_public ?? true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setMessage('Informe o nome do sistema.');
      setError(true);
      return;
    }
    if (!isPublic && (system.is_public ?? true) && password.length < 8) {
      setMessage('Defina uma senha com pelo menos 8 caracteres para tornar o sistema privado.');
      setError(true);
      return;
    }
    setSaving(true);
    setMessage('');
    setError(false);
    try {
      const result = await updateGameSystem(system.id, { name: name.trim(), description: description.trim() || null, is_public: isPublic, ...(password ? { password } : {}) });
      setName(result.system.name);
      setDescription(result.system.description ?? '');
      setIsPublic(result.system.is_public ?? true);
      setPassword('');
      onSaved(result.system);
      setMessage('Informações do sistema salvas.');
    } catch {
      setMessage('Não foi possível salvar as informações do sistema.');
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <form className="system-details-editor" onSubmit={(event) => void submit(event)}>
    <SystemDetailsFields name={name} description={description} onNameChange={setName} onDescriptionChange={setDescription} />
    <label className="daily-field">Visibilidade do sistema
      <select value={isPublic ? 'public' : 'private'} onChange={(event) => setIsPublic(event.target.value === 'public')}>
        <option value="public">Público — qualquer pessoa pode entrar</option>
        <option value="private">Privado — exige senha para novos participantes</option>
      </select>
    </label>
    {!isPublic && <label className="daily-field">Senha do sistema
      <input type="password" autoComplete="new-password" minLength={8} maxLength={72} required={(system.is_public ?? true) && !password} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={(system.is_public ?? true) ? 'Defina uma senha com pelo menos 8 caracteres' : 'Deixe em branco para manter a senha atual'} />
      {(system.is_public ?? true) ? <small>Jogadores precisarão desta senha antes de acessar o sistema.</small> : <small>Preencha para trocar a senha. Vazia, a senha atual será mantida.</small>}
    </label>}
    <div className="system-details-editor-actions">
      <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar informações'}</button>
    </div>
    {message && <p className={error ? 'systems-error' : 'system-sheet-saved'} role={error ? 'alert' : 'status'}>{message}</p>}
  </form>;
}
