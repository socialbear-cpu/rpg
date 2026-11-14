'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { deleteGameSystemCover, updateGameSystem, uploadGameSystemCover, type CharacterSheetDefinition, type CreateGameSystemInput, type GameSystem, type GameSystemPlayMode } from '../../api';
import { CharacterSheetBuilder } from './character-sheet-builder';
import { SystemDetailsFields } from './system-details-fields';
import { SystemPresentationFields } from './system-presentation-fields';
import { AppHeader } from '../shell/app-header';
import { createDefaultCharacterSheetDefinition, isCharacterSheetDefinitionValid } from './sheet-model';
import './system-creation.css';

interface SystemCreationWizardProps {
  createSystem: (input: CreateGameSystemInput) => Promise<{ system: GameSystem; definition: CharacterSheetDefinition }>;
  push: (path: string) => void;
}

export function SystemCreationWizard({ createSystem, push }: SystemCreationWizardProps) {
  const [step, setStep] = useState<'details' | 'sheet'>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [playMode, setPlayMode] = useState<GameSystemPlayMode | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFileError, setCoverFileError] = useState('');
  const [coverFocusX, setCoverFocusX] = useState(50);
  const [coverFocusY, setCoverFocusY] = useState(50);
  const [createdSystem, setCreatedSystem] = useState<GameSystem | null>(null);
  const [pendingCoverPath, setPendingCoverPath] = useState<string | null>(null);
  const [definition, setDefinition] = useState<CharacterSheetDefinition>(createDefaultCharacterSheetDefinition);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function continueToSheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    if (coverFileError) {
      setError(coverFileError);
      return;
    }
    if (!playMode) {
      setError('Escolha a modalidade principal do RPG.');
      return;
    }
    setError(null);
    setStep('sheet');
  }

  async function finishCreation(system: GameSystem, selectedPlayMode: GameSystemPlayMode) {
    if (coverFile) {
      const coverPath = pendingCoverPath ?? await uploadGameSystemCover(system.id, coverFile);
      setPendingCoverPath(coverPath);
      await updateGameSystem(system.id, {
        name: name.trim(),
        description: description.trim() || null,
        is_public: true,
        play_mode: selectedPlayMode,
        tags,
        cover_image_path: coverPath,
        cover_focus_x: coverFocusX,
        cover_focus_y: coverFocusY,
      });
    }
    push(`/systems/${encodeURIComponent(system.id)}/characters`);
  }

  async function submitSystem() {
    setError(null);
    if (coverFileError) {
      setError(coverFileError);
      setStep('details');
      return;
    }
    if (!isCharacterSheetDefinitionValid(definition)) {
      setError('Revise as etapas, campos, opções e elementos visuais (incluindo URLs HTTPS) antes de continuar.');
      return;
    }
    if (!playMode) {
      setError('Escolha a modalidade principal do RPG.');
      setStep('details');
      return;
    }
    setSaving(true);
    try {
      const system = createdSystem ?? (await createSystem({
        name: name.trim(),
        description: description.trim() || null,
        definition,
        play_mode: playMode,
        tags,
      })).system;
      if (!createdSystem) setCreatedSystem(system);
      await finishCreation(system, playMode);
    } catch (error) {
      setError(error instanceof Error ? error.message : createdSystem
        ? 'O sistema foi criado, mas não foi possível salvar a imagem.'
        : 'Não foi possível criar o sistema. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function continueWithoutCover() {
    if (!createdSystem) return;
    if (pendingCoverPath) {
      try {
        await deleteGameSystemCover(pendingCoverPath);
        setPendingCoverPath(null);
      } catch {
        setError('Não foi possível limpar a imagem temporária. Tente novamente ou salve a imagem antes de continuar.');
        return;
      }
    }
    push(`/systems/${encodeURIComponent(createdSystem.id)}/characters`);
  }

  return (
    <main className="system-creation-page">
      <AppHeader activeItem="Criar sistema" backHref="/dashboard" backLabel="Voltar ao dashboard" />
      <div className="system-creation-progress"><span>ETAPA {step === 'details' ? '1' : '2'} DE 2</span><span>{step === 'details' ? 'Detalhes do sistema' : 'Ficha do personagem'}</span></div>
      {step === 'details' ? (
        <form className="system-creation-panel" onSubmit={continueToSheet}>
          <span className="sheet-builder-eyebrow">NOVO SISTEMA</span>
          <h1>Crie um mundo para jogar</h1>
          <p>Defina a apresentação do sistema e, em seguida, os campos da ficha de personagem.</p>
          <SystemDetailsFields name={name} description={description} autoFocus onNameChange={setName} onDescriptionChange={setDescription} />
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
                setCoverFileError('Escolha uma imagem JPEG, PNG, WebP ou AVIF de até 5 MB.');
                setError('Escolha uma imagem JPEG, PNG, WebP ou AVIF de até 5 MB.');
                return;
              }
              setCoverFileError('');
              setError(null);
              setCoverFile(file);
            }}
            onRemoveImage={() => setCoverFile(null)}
            onFocusXChange={setCoverFocusX}
            onFocusYChange={setCoverFocusY}
          />
          {error && <p className="systems-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={!name.trim()}>Continuar para ficha →</button>
        </form>
      ) : (
        <div className="system-creation-panel system-creation-sheet-panel">
          <div className="system-creation-title"><span className="sheet-builder-eyebrow">{name.trim()}</span><h1>Como são os personagens?</h1><p>Adicione os campos usados pela ficha deste sistema.</p></div>
          <CharacterSheetBuilder definition={definition} onChange={setDefinition} />
          {error && <p className="systems-error" role="alert">{error}</p>}
          <div className="system-creation-actions">
            <button type="button" className="secondary-button" disabled={saving || Boolean(createdSystem)} onClick={() => setStep('details')}>Voltar</button>
            <button type="button" className="primary-button" disabled={saving} onClick={() => void submitSystem()}>{saving ? (createdSystem ? 'Salvando imagem...' : 'Criando sistema...') : createdSystem ? 'Tentar salvar imagem novamente' : 'Criar sistema'}</button>
          </div>
          {createdSystem && <button type="button" className="secondary-button" disabled={saving} onClick={() => void continueWithoutCover()}>Continuar sem imagem</button>}
        </div>
      )}
    </main>
  );
}
