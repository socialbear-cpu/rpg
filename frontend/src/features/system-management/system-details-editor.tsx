'use client';

import { useState, type FormEvent } from 'react';
import { updateGameSystem, type GameSystem } from '../../api';
import { SystemDetailsFields } from '../system-creation/system-details-fields';

export function SystemDetailsEditor({ system, onSaved }: {
  system: Pick<GameSystem, 'id' | 'name' | 'description'>;
  onSaved: (system: GameSystem) => void;
}) {
  const [name, setName] = useState(system.name);
  const [description, setDescription] = useState(system.description ?? '');
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
    setSaving(true);
    setMessage('');
    setError(false);
    try {
      const result = await updateGameSystem(system.id, { name: name.trim(), description: description.trim() || null });
      setName(result.system.name);
      setDescription(result.system.description ?? '');
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
    <div className="system-details-editor-actions">
      <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar informações'}</button>
    </div>
    {message && <p className={error ? 'systems-error' : 'system-sheet-saved'} role={error ? 'alert' : 'status'}>{message}</p>}
  </form>;
}
