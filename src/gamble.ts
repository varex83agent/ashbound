import { REWARD_POOL_IDS, getCard } from "./cards";
import { crownScaling } from "./difficulty";
import { getLocale, cardName } from "./i18n";
import type { RunState, CardInstance } from "./types";

function uid(){ return "c_"+Math.random().toString(36).slice(2,9); }
function makeCard(defId: string): CardInstance { return { uid: uid(), defId }; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)]; }
function m(uk: string, en: string){ return getLocale()==="uk" ? uk : en; }

export function openWager(state: RunState) {
  const scale = crownScaling(state.crown);
  state.wagerStake = Math.max(15, Math.round(25 * scale.goldMult));
  state.gambleResult = "";
  state.screen = "wager";
}

export function resolveWager(state: RunState, play: boolean): void {
  if (!play) { state.gambleResult = m("Ти йдеш геть.","You walk away."); return; }
  if (state.player.gold < state.wagerStake) { state.gambleResult = m("Недостатньо золота.","Not enough gold."); return; }
  state.player.gold -= state.wagerStake;
  const roll = Math.random();
  if (roll < 0.35) {
    const id = pick(REWARD_POOL_IDS); state.player.deck.push(makeCard(id));
    state.gambleResult = m("Виграш: ","Won: ") + cardName(id) + "!";
  } else if (roll < 0.55) {
    const jack = state.wagerStake * 3; state.player.gold += jack;
    state.gambleResult = m("Джекпот! +","Jackpot! +") + jack + m(" золота."," gold.");
  } else if (roll < 0.7) {
    state.player.gold += Math.floor(state.wagerStake * 1.5);
    state.gambleResult = m("Малий виграш — ставка з відсотком.","Small win — stake returned with interest.");
  } else {
    state.gambleResult = m("Програш. Жаринки забрали золото.","Bust. The embers take your gold.");
  }
}

export function openTithe(state: RunState) {
  state.titheCost = Math.max(8, Math.round(state.player.maxHp * 0.15));
  state.gambleResult = "";
  state.screen = "tithe";
}

export function resolveTithe(state: RunState, play: boolean): void {
  if (!play) { state.gambleResult = m("Ти відмовляєшся від десятини.","You refuse the tithe."); return; }
  if (state.player.hp <= state.titheCost) { state.gambleResult = m("Занадто поранений.","Too wounded to tithe."); return; }
  state.player.hp -= state.titheCost;
  const roll = Math.random();
  if (roll < 0.4) {
    const rares = REWARD_POOL_IDS.filter(id => { const c=getCard(id); return c.rarity==="rare"||c.rarity==="uncommon"; });
    const id = pick(rares.length?rares:REWARD_POOL_IDS); state.player.deck.push(makeCard(id));
    state.gambleResult = m("Кров прийнято. Отримано ","Blood accepted. Gained ") + cardName(id) + ".";
  } else if (roll < 0.65) {
    state.player.maxHp += 5; state.player.hp += 5;
    state.gambleResult = m("Полум'я шрамить — +5 макс. HP.","The flame scars you — +5 Max HP.");
  } else {
    state.gambleResult = m("Полум'я взяло кров і нічого не дало.","The flame takes blood and gives nothing.");
  }
}

export function openStall(state: RunState) {
  const scale = crownScaling(state.crown);
  state.stallCost = Math.round(40 * scale.goldMult);
  const pool = REWARD_POOL_IDS.filter(id => getCard(id).rarity !== "basic");
  state.shopOffer = getCard(pick(pool));
  state.gambleResult = "";
  state.screen = "stall";
}

export function buySafe(state: RunState): void {
  const cost = Math.round(state.stallCost * 0.7);
  if (!state.shopOffer) return;
  if (state.player.gold < cost) { state.gambleResult = m("Недостатньо золота.","Not enough gold."); return; }
  state.player.gold -= cost;
  state.player.deck.push(makeCard(state.shopOffer.id));
  state.gambleResult = m("Куплено ","Purchased ") + cardName(state.shopOffer.id) + ".";
}

export function cursedDeal(state: RunState): void {
  if (state.player.gold < state.stallCost) { state.gambleResult = m("Недостатньо золота.","Not enough gold."); return; }
  state.player.gold -= state.stallCost;
  const roll = Math.random();
  if (roll < 0.45) {
    const rares = ["rune_of_wrath","inferno","phoenix_guard","soulfire","ignite"];
    const id = pick(rares); state.player.deck.push(makeCard(id));
    state.gambleResult = m("Проклята угода вдалася — ","Cursed deal pays — ") + cardName(id) + "!";
  } else if (roll < 0.7) {
    state.player.deck.push(makeCard("ash_curse"));
    state.gambleResult = m("Прокляття чіпляється до колоди…","A curse sticks to your deck...");
  } else {
    state.gambleResult = m("Дим і нічого. Золото змарновано.","Smoke and nothing. Gold wasted.");
  }
}

export function resolveTreasureGamble(state: RunState, risk: boolean): void {
  if (!risk) {
    state.player.gold += state.treasureGold;
    state.gambleResult = m("Забрано ","Claimed ") + state.treasureGold + m(" золота."," gold.");
    return;
  }
  if (Math.random() < 0.5) {
    const win = state.treasureGold * 2; state.player.gold += win;
    state.gambleResult = m("Подвій! +","Double! +") + win + m(" золота."," gold.");
  } else {
    state.gambleResult = m("Проклята скриня — золото стало сажею.","Cursed chest — gold turns to soot.");
  }
}
