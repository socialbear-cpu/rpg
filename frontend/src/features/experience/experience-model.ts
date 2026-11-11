import type { ExperienceSettingsInput } from '../../api';

const builtInSourceTypes = ['daily_login', 'mission', 'fight'] as const;

export function addCustomExperienceSource(sources: ExperienceSettingsInput['sources']): ExperienceSettingsInput['sources'] {
  const usedNames = new Set(sources.filter((source) => source.source_type === 'custom')
    .map((source) => source.name.trim().toLocaleLowerCase()));
  let name = 'Fonte personalizada';
  let suffix = 2;
  while (usedNames.has(name.toLocaleLowerCase())) {
    name = `Fonte personalizada ${suffix}`;
    suffix += 1;
  }
  return [...sources, { name, source_type: 'custom', award_amount: 0, is_enabled: false }];
}

export function experienceSettingsAreValid(settings: ExperienceSettingsInput | null): boolean {
  if (!settings || !Number.isInteger(settings.xp_per_level)
    || settings.xp_per_level < 1 || settings.xp_per_level > 1_000_000) return false;

  const sources = settings.sources;
  if (sources.length < 3) return false;
  for (const sourceType of builtInSourceTypes) {
    if (sources.filter((source) => source.source_type === sourceType).length !== 1) return false;
  }
  if (sources.some((source) => !source.name.trim() || source.name.trim().length > 80
    || !Number.isInteger(source.award_amount) || source.award_amount < 0
    || source.award_amount > 1_000_000 || (source.is_enabled && source.award_amount === 0))) return false;

  const customNames = sources.filter((source) => source.source_type === 'custom')
    .map((source) => source.name.trim().toLocaleLowerCase());
  if (new Set(customNames).size !== customNames.length) return false;

  const ids = sources.flatMap((source) => source.id ? [source.id] : []);
  return new Set(ids).size === ids.length;
}
