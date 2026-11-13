export function SystemDetailsFields({ name, description, autoFocus = false, onNameChange, onDescriptionChange }: {
  name: string;
  description: string;
  autoFocus?: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return <>
    <label className="system-creation-label">Nome do sistema
      <input autoFocus={autoFocus} required maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ex.: Crônicas de Aether" />
    </label>
    <label className="system-creation-label">Descrição <span>(opcional)</span>
      <textarea maxLength={500} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Conte um pouco sobre este universo" rows={4} />
    </label>
  </>;
}
