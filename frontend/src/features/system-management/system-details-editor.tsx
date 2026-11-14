'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { deleteGameSystemCover, getGameSystemCoverUrl, updateGameSystem, uploadGameSystemCover, type GameSystem, type GameSystemPlayMode } from '../../api';
import { SystemDetailsFields } from '../system-creation/system-details-fields';
import { SystemPresentationFields } from '../system-creation/system-presentation-fields';

export function SystemDetailsEditor({ system, onSaved }: {
  system: Pick<GameSystem, 'id' | 'name' | 'description' | 'is_public' | 'play_mode' | 'tags' | 'cover_image_path' | 'cover_focus_x' | 'cover_focus_y'>;
  onSaved: (system: GameSystem) => void;
}) {
  const [name, setName] = useState(system.name);
  const [description, setDescription] = useState(system.description ?? '');
  const [isPublic, setIsPublic] = useState(system.is_public ?? true);
  const [playMode, setPlayMode] = useState<GameSystemPlayMode>(system.play_mode ?? 'text');
  const [tags, setTags] = useState((system.tags ?? []).map(({ slug }) => slug));
  const [coverImagePath, setCoverImagePath] = useState(system.cover_image_path ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(getGameSystemCoverUrl(system.cover_image_path));
  const [coverFocusX, setCoverFocusX] = useState(system.cover_focus_x ?? 50);
  const [coverFocusY, setCoverFocusY] = useState(system.cover_focus_y ?? 50);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(getGameSystemCoverUrl(coverImagePath));
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile, coverImagePath]);

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
    let uploadedPath: string | null = null;
    let saved = false;
    try {
      const previousCoverPath = system.cover_image_path ?? null;
      let nextCoverPath = coverImagePath;
      if (coverFile) {
        uploadedPath = await uploadGameSystemCover(system.id, coverFile);
        nextCoverPath = uploadedPath;
      }
      const result = await updateGameSystem(system.id, {
        name: name.trim(),
        description: description.trim() || null,
        is_public: isPublic,
        ...(password ? { password } : {}),
        play_mode: playMode,
        tags,
        cover_image_path: nextCoverPath,
        cover_focus_x: coverFocusX,
        cover_focus_y: coverFocusY,
      });
      saved = true;
      setName(result.system.name);
      setDescription(result.system.description ?? '');
      setIsPublic(result.system.is_public ?? true);
      setCoverImagePath(result.system.cover_image_path ?? null);
      setCoverFile(null);
      setPassword('');
      onSaved(result.system);
      if (previousCoverPath && previousCoverPath !== nextCoverPath) {
        try {
          await deleteGameSystemCover(previousCoverPath);
        } catch {
          setMessage('Informações salvas, mas não foi possível remover a imagem substituída.');
          setError(true);
          return;
        }
      }
      setMessage('Informações do sistema salvas.');
    } catch (saveError) {
      if (uploadedPath && !saved) {
        try {
          await deleteGameSystemCover(uploadedPath);
        } catch {
          setMessage('Não foi possível salvar as informações e também falhou a limpeza da imagem enviada.');
          setError(true);
          return;
        }
      }
      setMessage(saveError instanceof Error ? saveError.message : 'Não foi possível salvar as informações do sistema.');
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <form className="system-details-editor" onSubmit={(event) => void submit(event)}>
    <SystemDetailsFields name={name} description={description} onNameChange={setName} onDescriptionChange={setDescription} />
    <SystemPresentationFields
      playMode={playMode}
      tags={tags}
      imagePreviewUrl={coverPreview}
      focusX={coverFocusX}
      focusY={coverFocusY}
      onPlayModeChange={setPlayMode}
      onTagsChange={setTags}
      onImageChange={(file) => {
        if (file && (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
          setCoverFile(null);
          setMessage('Escolha uma imagem JPEG, PNG, WebP ou AVIF de até 5 MB.');
          setError(true);
          return;
        }
        setMessage('');
        setError(false);
        setCoverFile(file);
      }}
      onRemoveImage={() => { setCoverFile(null); setCoverImagePath(null); }}
      onFocusXChange={setCoverFocusX}
      onFocusYChange={setCoverFocusY}
    />
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
