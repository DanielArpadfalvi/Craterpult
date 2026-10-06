import type { Mission, StarRule } from '../core/campaign';
import { t, type TranslationKey } from '../i18n';

export function missionName(id: string): string {
  return t(`mission.${id}.name` as TranslationKey);
}

export function missionDesc(id: string): string {
  return t(`mission.${id}.desc` as TranslationKey);
}

export function starRuleText(rule: StarRule): string {
  switch (rule.kind) {
    case 'turns':
      return t('star.turns', { n: rule.max });
    case 'noLosses':
      return t('star.noLosses');
    case 'hpLeft':
      return t('star.hpLeft', { hp: rule.min });
    case 'onlyWeapon':
      return t('star.onlyWeapon', { weapon: t(`weapon.${rule.weapon}` as TranslationKey) });
  }
}

/** Short tags describing what is special about a mission (map, physics, crates). */
export function missionTags(m: Mission): string[] {
  const tags = [t(`map.${m.map.style ?? 'hills'}` as TranslationKey)];
  const c = m.config ?? {};
  if ((c.gravityPct ?? 100) < 100) tags.push(t('tag.lowGravity'));
  if ((c.gravityPct ?? 100) > 100) tags.push(t('tag.highGravity'));
  if ((c.windScale ?? 100) > 100) tags.push(t('tag.wind'));
  if (c.windEnabled === false) tags.push(t('tag.calm'));
  if ((c.crateChance ?? 0) >= 100) tags.push(t('tag.crates'));
  return tags;
}
