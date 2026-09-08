import type { EnemyDef } from './types';

export const ENEMIES: Record<string, EnemyDef> = {
  ember_imp: {
    id: 'ember_imp',
    name: 'Cinder Imp',
    maxHp: 28,
    intents: [
      { type: 'Attack', damage: 6, label: 'Attack 6' },
      { type: 'Attack', damage: 8, label: 'Attack 8' },
      { type: 'Defend', block: 5, label: 'Defend 5' },
    ],
  },
  ash_skeleton: {
    id: 'ash_skeleton',
    name: 'Charred Man-at-Arms',
    maxHp: 40,
    intents: [
      { type: 'AttackDefend', damage: 7, block: 5, label: 'Attack 7 / Block 5' },
      { type: 'Attack', damage: 10, label: 'Attack 10' },
      { type: 'Defend', block: 8, label: 'Defend 8' },
    ],
  },
  cinder_beast: {
    id: 'cinder_beast',
    name: 'Hearth Hound',
    maxHp: 52,
    intents: [
      { type: 'Attack', damage: 12, label: 'Attack 12' },
      { type: 'Buff', strength: 2, label: 'Strength +2' },
      { type: 'Attack', damage: 9, hits: 2, label: 'Attack 9×2' },
    ],
  },
  rune_cultist: {
    id: 'rune_cultist',
    name: 'Usurper Acolyte',
    maxHp: 36,
    intents: [
      { type: 'Buff', strength: 2, label: 'Strength +2' },
      { type: 'Attack', damage: 8, label: 'Attack 8' },
      { type: 'Debuff', vulnerable: 2, label: 'Vulnerable 2' },
      { type: 'Attack', damage: 11, label: 'Attack 11' },
    ],
  },
  flame_wretch: {
    id: 'flame_wretch',
    name: 'Burned Levy',
    maxHp: 44,
    intents: [
      { type: 'Debuff', vulnerable: 2, label: 'Vulnerable 2' },
      { type: 'Attack', damage: 9, label: 'Attack 9' },
      { type: 'AttackDefend', damage: 6, block: 6, label: 'Attack 6 / Block 6' },
    ],
  },
  slag_golem: {
    id: 'slag_golem',
    name: 'Slag Sentinel',
    maxHp: 70,
    elite: true,
    intents: [
      { type: 'Defend', block: 12, label: 'Defend 12' },
      { type: 'Attack', damage: 16, label: 'Attack 16' },
      { type: 'Buff', strength: 3, label: 'Strength +3' },
      { type: 'Attack', damage: 10, hits: 2, label: 'Attack 10×2' },
    ],
  },
  ash_warden: {
    id: 'ash_warden',
    name: 'Ash Warden',
    maxHp: 140,
    boss: true,
    intents: [
      { type: 'Buff', strength: 2, label: 'Strength +2' },
      { type: 'Attack', damage: 14, label: 'Attack 14' },
      { type: 'AttackDefend', damage: 10, block: 10, label: 'Attack 10 / Block 10' },
      { type: 'Debuff', vulnerable: 2, label: 'Vulnerable 2' },
      { type: 'Attack', damage: 8, hits: 3, label: 'Attack 8×3' },
    ],
  },
};

export const NORMAL_ENEMY_IDS = [
  'ember_imp',
  'ash_skeleton',
  'cinder_beast',
  'rune_cultist',
  'flame_wretch',
];

export function scaleHp(base: number, floor: number, elite = false, boss = false): number {
  const mult = 1 + floor * 0.12 + (elite ? 0.25 : 0) + (boss ? 0.15 : 0);
  return Math.round(base * mult);
}

export function scaleDamage(base: number, floor: number): number {
  return Math.round(base * (1 + floor * 0.08));
}
