import { CARDS, STARTER_DECK_IDS, REWARD_POOL_IDS, getCard, getUpgradeId, cardNeedsTarget } from './cards';
import { ENEMIES, NORMAL_ENEMY_IDS, scaleHp, scaleDamage } from './enemies';
import { crownScaling, unlockNextCrown } from './difficulty';
import { t } from './i18n';
import { openWager, openTithe, openStall } from './gamble';
import type {
  CardDef,
  CardInstance,
  CombatEnemy,
  IntentPattern,
  MapNode,
  NodeType,
  PlayerState,
  RunState,
  StatusMap,
} from './types';

let uidCounter = 0;
export function uid(prefix = 'id'): string {
  uidCounter += 1;
  return `${prefix}_${uidCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyStatuses(): StatusMap {
  return { strength: 0, vulnerable: 0, weak: 0 };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

function makeCard(defId: string): CardInstance {
  return { uid: uid('card'), defId };
}

function makeStarterDeck(): CardInstance[] {
  return STARTER_DECK_IDS.map(makeCard);
}

function makePlayer(): PlayerState {
  return {
    hp: 70,
    maxHp: 70,
    block: 0,
    energy: 3,
    maxEnergy: 3,
    statuses: emptyStatuses(),
    gold: 50,
    deck: makeStarterDeck(),
  };
}

/** Linear-ish branching map: ~9 floors ending in boss */
export function generateMap(): MapNode[] {
  const layout: { floor: number; types: NodeType[] }[] = [
    { floor: 0, types: ['combat'] },
    { floor: 1, types: ['combat', 'wager'] },
    { floor: 2, types: ['rest', 'treasure'] },
    { floor: 3, types: ['combat', 'elite'] },
    { floor: 4, types: ['stall', 'tithe'] },
    { floor: 5, types: ['combat', 'treasure'] },
    { floor: 6, types: ['rest', 'elite'] },
    { floor: 7, types: ['wager', 'combat'] },
    { floor: 8, types: ['boss'] },
  ];

  const nodes: MapNode[] = [];
  const byFloor: MapNode[][] = [];

  for (const row of layout) {
    const floorNodes: MapNode[] = [];
    row.types.forEach((type, col) => {
      const node: MapNode = {
        id: `n${row.floor}_${col}`,
        type,
        floor: row.floor,
        row: row.floor,
        col,
        connections: [],
        cleared: false,
        available: row.floor === 0,
      };
      nodes.push(node);
      floorNodes.push(node);
    });
    byFloor.push(floorNodes);
  }

  for (let f = 0; f < byFloor.length - 1; f++) {
    const cur = byFloor[f];
    const next = byFloor[f + 1];
    for (const c of cur) {
      // Connect to all next-floor nodes for short readable map
      for (const n of next) {
        c.connections.push(n.id);
      }
    }
  }

  return nodes;
}

export function createNewRun(): RunState {
  return {
    screen: 'title',
    floor: 0,
    map: generateMap(),
    currentNodeId: null,
    player: makePlayer(),
    drawPile: [],
    discardPile: [],
    hand: [],
    exhaustPile: [],
    enemies: [],
    turn: 0,
    combatLog: [],
    rewardChoices: [],
    restMode: 'choose',
    upgradeChoices: [],
    treasureGold: 0,
    message: '',
    crown: 0,
    gambleResult: '',
    shopOffer: null,
    stallCost: 45,
    wagerStake: 25,
    titheCost: 12,
  };
}

function log(state: RunState, msg: string) {
  state.combatLog = [msg, ...state.combatLog].slice(0, 8);
}

function calcDamage(
  base: number,
  attackerStr: number,
  targetVulnerable: number,
  attackerWeak: number,
): number {
  let dmg = base + attackerStr;
  if (attackerWeak > 0) dmg = Math.floor(dmg * 0.75);
  if (targetVulnerable > 0) dmg = Math.floor(dmg * 1.5);
  return Math.max(0, dmg);
}

function applyDamageToPlayer(state: RunState, amount: number) {
  let dmg = amount;
  if (state.player.block > 0) {
    const blocked = Math.min(state.player.block, dmg);
    state.player.block -= blocked;
    dmg -= blocked;
  }
  state.player.hp = Math.max(0, state.player.hp - dmg);
}

function applyDamageToEnemy(enemy: CombatEnemy, amount: number): number {
  let dmg = amount;
  if (enemy.block > 0) {
    const blocked = Math.min(enemy.block, dmg);
    enemy.block -= blocked;
    dmg -= blocked;
  }
  enemy.hp = Math.max(0, enemy.hp - dmg);
  if (enemy.hp <= 0) enemy.dead = true;
  return amount;
}

function tickStatusStartOfTurn(statuses: StatusMap) {
  if (statuses.vulnerable > 0) statuses.vulnerable -= 1;
  if (statuses.weak > 0) statuses.weak -= 1;
}

function scaledIntent(pattern: IntentPattern, floor: number): IntentPattern {
  return {
    ...pattern,
    damage: pattern.damage != null ? scaleDamage(pattern.damage, floor) : undefined,
    block: pattern.block != null ? Math.round(pattern.block * (1 + floor * 0.05)) : undefined,
    label: pattern.label, // keep readable; numbers in combat UI use scaled values
  };
}

function intentDisplayLabel(intent: IntentPattern): string {
  const parts: string[] = [];
  if (intent.damage != null) {
    const hits = intent.hits ?? 1;
    parts.push(hits > 1 ? `Attack ${intent.damage}×${hits}` : `Attack ${intent.damage}`);
  }
  if (intent.block != null) parts.push(`Block ${intent.block}`);
  if (intent.strength != null) parts.push(`Strength +${intent.strength}`);
  if (intent.vulnerable != null) parts.push(`Vulnerable ${intent.vulnerable}`);
  return parts.join(' / ') || intent.label;
}

function spawnEnemy(defId: string, floor: number, crown = 0): CombatEnemy {
  const def = ENEMIES[defId];
  const scale = crownScaling(crown);
  const hp = Math.round(scaleHp(def.maxHp, floor, !!def.elite, !!def.boss) * scale.hpMult);
  const intentIndex = 0;
  const intent = scaledIntent(def.intents[intentIndex], floor);
  if (intent.damage != null) intent.damage = Math.round(intent.damage * scale.dmgMult);
  if (scale.intentBoost && intent.strength) intent.strength += scale.intentBoost;
  intent.label = intentDisplayLabel(intent);
  return {
    uid: uid('enemy'),
    defId,
    name: def.name,
    hp,
    maxHp: hp,
    block: 0,
    statuses: emptyStatuses(),
    intentIndex,
    intent,
    dead: false,
  };
}

function chooseEncounter(type: NodeType, floor: number, crown = 0): CombatEnemy[] {
  if (type === 'boss') return [spawnEnemy('ash_warden', floor, crown)];
  if (type === 'elite') return [spawnEnemy('slag_golem', floor, crown)];

  const count = floor <= 1 ? 1 : floor <= 4 ? (Math.random() < 0.5 ? 1 : 2) : Math.random() < 0.35 ? 2 : 1;
  const picks = pickRandom(NORMAL_ENEMY_IDS, count);
  return picks.map((id) => spawnEnemy(id, floor, crown));
}

function drawCards(state: RunState, n: number) {
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
      log(state, 'Shuffled discard into draw pile.');
    }
    const card = state.drawPile.pop();
    if (card) state.hand.push(card);
  }
}

function startPlayerTurn(state: RunState) {
  state.turn += 1;
  state.player.block = 0;
  tickStatusStartOfTurn(state.player.statuses);
  state.player.energy = state.player.maxEnergy;
  drawCards(state, 5);
  log(state, `— Your turn ${state.turn} —`);
}

export function startCombat(state: RunState, node: MapNode) {
  state.screen = 'combat';
  state.currentNodeId = node.id;
  state.floor = node.floor;
  state.enemies = chooseEncounter(node.type, node.floor, state.crown);
  state.hand = [];
  state.discardPile = [];
  state.exhaustPile = [];
  state.drawPile = shuffle(state.player.deck.map((c) => ({ ...c, uid: uid('card') })));
  state.turn = 0;
  state.combatLog = [];
  state.player.block = 0;
  state.player.statuses = emptyStatuses();
  state.player.energy = state.player.maxEnergy;
  log(state, `Combat begins against ${state.enemies.map((e) => e.name).join(', ')}!`);
  startPlayerTurn(state);
}

function advanceEnemyIntent(enemy: CombatEnemy, floor: number) {
  const def = ENEMIES[enemy.defId];
  enemy.intentIndex = (enemy.intentIndex + 1) % def.intents.length;
  enemy.intent = scaledIntent(def.intents[enemy.intentIndex], floor);
  enemy.intent.label = intentDisplayLabel(enemy.intent);
}

function enemyAct(state: RunState, enemy: CombatEnemy) {
  if (enemy.dead) return;
  const intent = enemy.intent;
  enemy.block = 0;
  tickStatusStartOfTurn(enemy.statuses);

  if (intent.block) {
    enemy.block += intent.block;
    log(state, `${enemy.name} gains ${intent.block} Block.`);
  }
  if (intent.strength) {
    enemy.statuses.strength += intent.strength;
    log(state, `${enemy.name} gains ${intent.strength} Strength.`);
  }
  if (intent.vulnerable) {
    state.player.statuses.vulnerable += intent.vulnerable;
    log(state, `${enemy.name} applies ${intent.vulnerable} Vulnerable.`);
  }
  if (intent.damage) {
    const hits = intent.hits ?? 1;
    for (let h = 0; h < hits; h++) {
      const dmg = calcDamage(
        intent.damage,
        enemy.statuses.strength,
        state.player.statuses.vulnerable,
        enemy.statuses.weak,
      );
      applyDamageToPlayer(state, dmg);
      log(state, `${enemy.name} hits you for ${dmg}.`);
    }
  }
}

function checkCombatEnd(state: RunState): boolean {
  if (state.player.hp <= 0) {
    state.screen = 'defeat';
    state.message = t('defeatBlurb');
    return true;
  }
  if (state.enemies.every((e) => e.dead)) {
    const node = state.map.find((n) => n.id === state.currentNodeId);
    if (node?.type === 'boss') {
      const unlocked = unlockNextCrown(state.crown);
      state.screen = 'victory';
      state.message = t('victoryBlurb') + (unlocked > state.crown ? (' · ' + t('diffLabel') + ' ' + unlocked + ' ✓') : '');
      return true;
    }
    openRewards(state);
    return true;
  }
  return false;
}

export function endTurn(state: RunState) {
  if (state.screen !== 'combat') return;
  // Discard hand
  state.discardPile.push(...state.hand);
  state.hand = [];
  log(state, '— Enemy turn —');

  for (const enemy of state.enemies) {
    if (!enemy.dead) enemyAct(state, enemy);
  }

  if (checkCombatEnd(state)) return;

  for (const enemy of state.enemies) {
    if (!enemy.dead) advanceEnemyIntent(enemy, state.floor);
  }

  startPlayerTurn(state);
}

function previewCardDamage(state: RunState, def: CardDef, target?: CombatEnemy): number {
  const base = def.damage ?? def.aoeDamage ?? 0;
  const vuln = target?.statuses.vulnerable ?? 0;
  return calcDamage(base, state.player.statuses.strength, vuln, state.player.statuses.weak);
}

export function getPlayableInfo(state: RunState, cardUid: string) {
  const card = state.hand.find((c) => c.uid === cardUid);
  if (!card) return null;
  const def = getCard(card.defId);
  return {
    card,
    def,
    canAfford: state.player.energy >= def.cost,
    needsTarget: cardNeedsTarget(def),
  };
}

export function playCard(state: RunState, cardUid: string, targetUid?: string): string | null {
  if (state.screen !== 'combat') return 'Not in combat.';
  const info = getPlayableInfo(state, cardUid);
  if (!info) return 'Card not in hand.';
  const { card, def } = info;
  if (def.curse) return 'Curses cannot be played.';
  if (state.player.energy < def.cost) return 'Not enough energy.';

  let target: CombatEnemy | undefined;
  if (cardNeedsTarget(def)) {
    if (!targetUid) return 'Select a target.';
    target = state.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) return 'Invalid target.';
  }

  state.player.energy -= def.cost;

  // Remove from hand
  state.hand = state.hand.filter((c) => c.uid !== cardUid);

  if (def.block) {
    state.player.block += def.block;
    log(state, `Gain ${def.block} Block.`);
  }
  if (def.strength) {
    state.player.statuses.strength += def.strength;
    log(state, `Gain ${def.strength} Strength.`);
  }
  if (def.heal) {
    const healed = Math.min(def.heal, state.player.maxHp - state.player.hp);
    state.player.hp += healed;
    log(state, `Heal ${healed} HP.`);
  }
  if (def.energyGain) {
    state.player.energy += def.energyGain;
    log(state, `Gain ${def.energyGain} Energy.`);
  }

  if (def.aoeDamage) {
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const dmg = calcDamage(
        def.aoeDamage,
        state.player.statuses.strength,
        enemy.statuses.vulnerable,
        state.player.statuses.weak,
      );
      applyDamageToEnemy(enemy, dmg);
      log(state, `${def.name} hits ${enemy.name} for ${dmg}.`);
      if (def.vulnerable) {
        enemy.statuses.vulnerable += def.vulnerable;
      }
    }
  } else if (def.damage && target) {
    const hits = def.hits ?? 1;
    for (let h = 0; h < hits; h++) {
      const dmg = previewCardDamage(state, def, target);
      applyDamageToEnemy(target, dmg);
      log(state, `${def.name} hits ${target.name} for ${dmg}.`);
    }
    if (def.vulnerable) {
      target.statuses.vulnerable += def.vulnerable;
      log(state, `Applied ${def.vulnerable} Vulnerable to ${target.name}.`);
    }
  }

  if (def.type === 'Power') {
    state.exhaustPile.push(card);
  } else {
    state.discardPile.push(card);
  }

  if (def.draw) drawCards(state, def.draw);

  checkCombatEnd(state);
  return null;
}

function openRewards(state: RunState) {
  const node = state.map.find((n) => n.id === state.currentNodeId);
  const goldGain = Math.round((node?.type === 'elite' ? 40 + state.floor * 5 : 15 + state.floor * 3) * crownScaling(state.crown).goldMult);
  state.player.gold += goldGain;
  log(state, `Victory! +${goldGain} gold.`);

  const pool = REWARD_POOL_IDS.filter((id) => CARDS[id]);
  state.rewardChoices = pickRandom(pool, 3).map((id) => getCard(id));
  state.screen = 'rewards';
}

export function pickReward(state: RunState, defId: string | null) {
  if (defId) {
    state.player.deck.push(makeCard(defId));
  }
  completeNode(state);
}

export function completeNode(state: RunState) {
  const node = state.map.find((n) => n.id === state.currentNodeId);
  if (node) {
    node.cleared = true;
    node.available = false;
    for (const n of state.map) {
      if (n.cleared) { n.available = false; continue; }
      n.available = state.map.some((c) => c.cleared && c.connections.includes(n.id));
    }
  }
  state.currentNodeId = null;
  state.screen = 'map';
}

export function enterNode(state: RunState, nodeId: string) {
  const node = state.map.find((n) => n.id === nodeId);
  if (!node || !node.available) return;
  state.currentNodeId = nodeId;
  state.gambleResult = '';
  switch (node.type) {
    case 'combat':
    case 'elite':
    case 'boss':
      startCombat(state, node);
      break;
    case 'rest':
      state.screen = 'rest';
      state.restMode = 'choose';
      break;
    case 'treasure':
      state.treasureGold = Math.round((25 + node.floor * 8 + Math.floor(Math.random() * 15)) * crownScaling(state.crown).goldMult);
      state.screen = 'treasure';
      break;
    case 'wager':
      openWager(state);
      break;
    case 'tithe':
      openTithe(state);
      break;
    case 'stall':
      openStall(state);
      break;
  }
}

export function restHeal(state: RunState) {
  const heal = Math.floor(state.player.maxHp * 0.3);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
  state.message = `Rested. Healed ${heal} HP.`;
  completeNode(state);
}

export function restBeginUpgrade(state: RunState) {
  const upgradable = state.player.deck.filter((c) => getUpgradeId(c.defId));
  if (upgradable.length === 0) {
    state.message = 'No cards to upgrade. Healing instead.';
    restHeal(state);
    return;
  }
  state.upgradeChoices = upgradable;
  state.restMode = 'upgrade';
  state.screen = 'upgrade';
}

export function restUpgradeCard(state: RunState, cardUid: string) {
  const card = state.player.deck.find((c) => c.uid === cardUid);
  if (!card) return;
  const upId = getUpgradeId(card.defId);
  if (!upId) return;
  card.defId = upId;
  state.message = `Upgraded to ${getCard(upId).name}.`;
  completeNode(state);
}

export function claimTreasure(state: RunState) {
  state.player.gold += state.treasureGold;
  // Also offer a random common card 50% of time as bonus — skip for simplicity, just gold
  completeNode(state);
}

export function startRun(state: RunState, crown = 0) {
  const fresh = createNewRun();
  Object.assign(state, fresh);
  state.crown = crown;
  state.screen = 'map';
  for (const n of state.map) n.available = n.floor === 0;
}

export function cardPreviewText(state: RunState, def: CardDef, target?: CombatEnemy): string {
  let text = def.description;
  if (def.damage && target) {
    const dmg = previewCardDamage(state, def, target);
    const hits = def.hits ?? 1;
    text += hits > 1 ? ` (${dmg}×${hits})` : ` (${dmg})`;
  } else if (def.damage) {
    const dmg = calcDamage(def.damage, state.player.statuses.strength, 0, state.player.statuses.weak);
    const hits = def.hits ?? 1;
    text += hits > 1 ? ` (~${dmg}×${hits})` : ` (~${dmg})`;
  } else if (def.aoeDamage) {
    const dmg = calcDamage(def.aoeDamage, state.player.statuses.strength, 0, state.player.statuses.weak);
    text += ` (~${dmg} each)`;
  }
  return text;
}

export { getCard, cardNeedsTarget, intentDisplayLabel };
