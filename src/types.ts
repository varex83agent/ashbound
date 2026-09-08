export type CardType = 'Attack' | 'Skill' | 'Power';
export type CardRarity = 'basic' | 'common' | 'uncommon' | 'rare';
export type IntentType = 'Attack' | 'Defend' | 'Buff' | 'Debuff' | 'AttackDefend';
export type NodeType = 'combat' | 'elite' | 'rest' | 'treasure' | 'boss' | 'wager' | 'tithe' | 'stall';
export type Screen =
  | 'title'
  | 'map'
  | 'combat'
  | 'rewards'
  | 'rest'
  | 'treasure'
  | 'upgrade'
  | 'victory'
  | 'defeat'
  | 'wager'
  | 'tithe'
  | 'stall';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  rarity: CardRarity;
  description: string;
  upgraded?: boolean;
  upgradeOf?: string;
  /** Deal damage to one target */
  damage?: number;
  /** Hit count for multi-hit */
  hits?: number;
  /** Damage to all enemies */
  aoeDamage?: number;
  block?: number;
  strength?: number;
  vulnerable?: number;
  draw?: number;
  heal?: number;
  energyGain?: number;
  curse?: boolean;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export interface StatusMap {
  strength: number;
  vulnerable: number;
  weak: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  intents: IntentPattern[];
  elite?: boolean;
  boss?: boolean;
}

export interface IntentPattern {
  type: IntentType;
  damage?: number;
  hits?: number;
  block?: number;
  strength?: number;
  vulnerable?: number;
  label: string;
}

export interface CombatEnemy {
  uid: string;
  defId: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: StatusMap;
  intentIndex: number;
  intent: IntentPattern;
  dead: boolean;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  maxEnergy: number;
  statuses: StatusMap;
  gold: number;
  deck: CardInstance[];
}

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number;
  row: number;
  col: number;
  connections: string[];
  cleared: boolean;
  available: boolean;
}

export interface RunState {
  screen: Screen;
  floor: number;
  map: MapNode[];
  currentNodeId: string | null;
  player: PlayerState;
  /** Combat-only */
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  hand: CardInstance[];
  exhaustPile: CardInstance[];
  enemies: CombatEnemy[];
  turn: number;
  combatLog: string[];
  rewardChoices: CardDef[];
  restMode: 'choose' | 'upgrade';
  upgradeChoices: CardInstance[];
  treasureGold: number;
  message: string;
  crown: number;
  gambleResult: string;
  shopOffer: CardDef | null;
  stallCost: number;
  wagerStake: number;
  titheCost: number;
}
