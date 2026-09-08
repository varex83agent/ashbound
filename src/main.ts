import './style.css';
import './polish.css';
import { getCard, cardNeedsTarget } from './cards';
import {
  createNewRun, startRun, enterNode, playCard, endTurn, pickReward,
  restHeal, restBeginUpgrade, restUpgradeCard, completeNode, cardPreviewText,
} from './game';
import { resolveWager, resolveTithe, buySafe, cursedDeal, resolveTreasureGamble } from './gamble';
import { getMaxUnlockedCrown, MAX_CROWN } from './difficulty';
import {
  loadLocale, toggleLocale, t, cardName, cardDesc, enemyName, crownLabelI18n, nodeLabel, getLocale,
} from './i18n';
import {
  loadMutePreference, unlockAudio, toggleMute, isMuted, setAmbient,
  sfxClick, sfxCardPlay, sfxAttack, sfxBlock, sfxDraw, sfxMap, sfxReward,
  sfxVictory, sfxDefeat, sfxHitBig, sfxHeal,
} from './audio';
import type { RunState, CombatEnemy, CardInstance } from './types';

loadLocale();
loadMutePreference();

const app = document.querySelector<HTMLDivElement>('#app')!;
const state: RunState = createNewRun();
let selectedCardUid: string | null = null;
let targeting = false;
let selectedCrown = 0;
let flashMsg = '';
let flashTimer: number | undefined;

function ensureEmbers() {
  if (document.querySelector('.embers-layer')) return;
  const layer = document.createElement('div');
  layer.className = 'embers-layer';
  for (let i = 0; i < 28; i++) {
    const e = document.createElement('div');
    e.className = 'ember';
    e.style.left = Math.random() * 100 + '%';
    e.style.animationDuration = 6 + Math.random() * 10 + 's';
    e.style.animationDelay = Math.random() * 8 + 's';
    e.style.width = e.style.height = 2 + Math.random() * 3 + 'px';
    layer.append(e);
  }
  document.body.prepend(layer);
}

function muteBtn() {
  const b = el('button', 'mute-btn', isMuted() ? '🔇' : '🔊');
  b.title = isMuted() ? t('unmute') : t('mute');
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    await unlockAudio();
    toggleMute();
    render();
  });
  return b;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function flash(msg: string) {
  flashMsg = msg;
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { flashMsg = ''; render(); }, 1600);
}

function shake(big = false) {
  app.classList.remove('screen-shake');
  void app.offsetWidth;
  app.classList.add('screen-shake');
  if (big) sfxHitBig();
}

function floatDmg(parent: HTMLElement, amount: number, kind: 'dmg' | 'block' | 'heal' = 'dmg') {
  const f = el('div', 'dmg-float' + (kind !== 'dmg' ? ' ' + kind : ''), kind === 'heal' ? '+' + amount : String(amount));
  parent.style.position = 'relative';
  parent.append(f);
  setTimeout(() => f.remove(), 900);
}

function statusBadges(statuses: { strength: number; vulnerable: number; weak: number }) {
  const wrap = el('div', 'status-row');
  if (statuses.strength > 0) wrap.append(el('span', 'status strength', t('str') + ' ' + statuses.strength));
  if (statuses.vulnerable > 0) wrap.append(el('span', 'status vulnerable', t('vuln') + ' ' + statuses.vulnerable));
  if (statuses.weak > 0) wrap.append(el('span', 'status weak', 'WEAK ' + statuses.weak));
  return wrap;
}

function nodeIcon(type: string) {
  return ({ combat: '⚔', elite: '☠', rest: '🔥', treasure: '◆', boss: '♛', wager: '🎲', tithe: '🩸', stall: '🏪' } as Record<string, string>)[type] || '?';
}

function enemySvg(defId: string, boss = false): string {
  const fill = boss ? '#d4a84b' : '#c45a30';
  const shapes: Record<string, string> = {
    ember_imp: '<circle cx="40" cy="42" r="22" fill="'+fill+'"/><circle cx="32" cy="36" r="3" fill="#1a0800"/><circle cx="48" cy="36" r="3" fill="#1a0800"/><path d="M28 52 Q40 60 52 52" stroke="#1a0800" fill="none"/>',
    ash_skeleton: '<rect x="30" y="20" width="20" height="28" rx="4" fill="'+fill+'"/><circle cx="40" cy="16" r="10" fill="#e8d0b0"/><rect x="22" y="30" width="8" height="24" fill="'+fill+'"/><rect x="50" y="30" width="8" height="24" fill="'+fill+'"/>',
    cinder_beast: '<ellipse cx="40" cy="48" rx="28" ry="16" fill="'+fill+'"/><circle cx="58" cy="40" r="12" fill="'+fill+'"/><circle cx="62" cy="36" r="2" fill="#1a0800"/>',
    rune_cultist: '<path d="M40 12 L55 70 L25 70 Z" fill="'+fill+'"/><circle cx="40" cy="22" r="8" fill="#e8d0b0"/>',
    flame_wretch: '<ellipse cx="40" cy="50" rx="18" ry="22" fill="'+fill+'"/><circle cx="40" cy="24" r="11" fill="#e8d0b0"/>',
    slag_golem: '<rect x="18" y="18" width="44" height="50" rx="6" fill="'+fill+'"/><rect x="28" y="28" width="8" height="8" fill="#ffb347"/><rect x="44" y="28" width="8" height="8" fill="#ffb347"/>',
    ash_warden: '<path d="M40 8 L68 30 L58 72 L22 72 L12 30 Z" fill="'+fill+'" stroke="#ffe0a0" stroke-width="2"/><circle cx="40" cy="36" r="10" fill="#1a0800"/><circle cx="40" cy="36" r="5" fill="#ff6a1a"/>',
  };
  return '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">' + (shapes[defId] || shapes.ember_imp) + '</svg>';
}

function renderCard(card: CardInstance, opts: { inHand?: boolean; onClick?: () => void; dimmed?: boolean; selected?: boolean } = {}) {
  const def = getCard(card.defId);
  const cardEl = el('div', 'card type-' + def.type.toLowerCase() + ' rarity-' + def.rarity + (def.curse ? ' curse' : ''));
  if (opts.selected) cardEl.classList.add('selected');
  if (opts.dimmed) cardEl.classList.add('dimmed');
  if (opts.inHand) cardEl.classList.add('in-hand', 'glow-pulse');
  const typeLabel = def.type === 'Attack' ? t('attack') : def.type === 'Skill' ? t('skill') : t('power');
  cardEl.append(
    el('div', 'card-cost', String(def.cost)),
    el('div', 'card-rune', 'ᚠ'),
    el('div', 'card-name', cardName(def.id)),
    el('div', 'card-type', typeLabel),
    el('div', 'card-desc', opts.inHand ? cardPreviewText(state, { ...def, description: cardDesc(def.id, def.description) }) : cardDesc(def.id, def.description)),
  );
  if (opts.onClick) {
    cardEl.classList.add('clickable');
    cardEl.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick?.(); });
  }
  return cardEl;
}

function renderTitle() {
  setAmbient('title');
  const max = getMaxUnlockedCrown();
  if (selectedCrown > max) selectedCrown = max;
  const screen = el('div', 'screen title-screen');
  const panel = el('div', 'title-panel');
  panel.append(el('div', 'title-ember', '✦'), el('h1', 'game-title', t('title')), el('p', 'subtitle', t('tagline')), el('p', 'flavor', t('blurb')));
  const diff = el('div', 'diff-row');
  diff.append(el('span', 'hud-stat', t('diffLabel') + ':'));
  for (let i = 0; i <= MAX_CROWN; i++) {
    const b = el('button', 'btn' + (i === selectedCrown ? ' primary' : ' ghost') + (i > max ? ' locked' : ''), crownLabelI18n(i));
    b.disabled = i > max;
    b.addEventListener('click', async () => { await unlockAudio(); sfxClick(); selectedCrown = i; render(); });
    diff.append(b);
  }
  panel.append(diff);
  const begin = el('button', 'btn primary large', t('begin'));
  begin.addEventListener('click', async () => {
    await unlockAudio(); sfxClick(); sfxMap();
    startRun(state, selectedCrown);
    selectedCardUid = null; targeting = false; render();
  });
  const lang = el('button', 'btn ghost', t('langToggle') + ' / ' + (getLocale() === 'uk' ? 'UA' : 'EN'));
  lang.addEventListener('click', async () => { await unlockAudio(); sfxClick(); toggleLocale(); render(); });
  panel.append(begin, lang, el('p', 'hint', 'Space / E — ' + t('endTurn')));
  screen.append(panel);
  return screen;
}

function renderMap() {
  setAmbient('title');
  const screen = el('div', 'screen map-screen');
  const header = el('div', 'hud-bar');
  header.append(
    el('div', 'hud-brand', t('title')),
    el('div', 'hud-stat', crownLabelI18n(state.crown)),
    el('div', 'hud-stat', t('hp') + ' ' + state.player.hp + '/' + state.player.maxHp),
    el('div', 'hud-stat', t('gold') + ' ' + state.player.gold),
    el('div', 'hud-stat', t('deck') + ' ' + state.player.deck.length),
  );
  screen.append(header);
  if (state.message) { screen.append(el('div', 'banner', state.message)); state.message = ''; }
  if (state.gambleResult) { screen.append(el('div', 'banner', state.gambleResult)); state.gambleResult = ''; }
  screen.append(el('h2', 'screen-heading', t('mapTitle')), el('p', 'hint', t('mapHint')));
  const mapWrap = el('div', 'map-wrap');
  const maxFloor = Math.max(...state.map.map((n) => n.floor));
  for (let f = maxFloor; f >= 0; f--) {
    const row = el('div', 'map-row');
    for (const n of state.map.filter((x) => x.floor === f)) {
      const btn = el('button', 'map-node type-' + n.type + (n.cleared ? ' cleared' : '') + (n.available ? ' available' : ' locked'));
      btn.innerHTML = '<span class="node-icon">' + nodeIcon(n.type) + '</span><span class="node-label">' + nodeLabel(n.type) + '</span>';
      btn.disabled = !n.available;
      btn.addEventListener('click', async () => { await unlockAudio(); sfxMap(); enterNode(state, n.id); selectedCardUid = null; targeting = false; render(); });
      row.append(btn);
    }
    mapWrap.append(row);
    if (f > 0) mapWrap.append(el('div', 'map-connector', '⋮'));
  }
  screen.append(mapWrap);
  const deckBtn = el('button', 'btn ghost', t('viewDeck'));
  const deckPanel = el('div', 'deck-panel hidden');
  for (const c of state.player.deck) deckPanel.append(renderCard(c));
  deckBtn.addEventListener('click', () => { sfxClick(); deckPanel.classList.toggle('hidden'); });
  screen.append(deckBtn, deckPanel);
  return screen;
}

function renderEnemy(enemy: CombatEnemy) {
  const box = el('div', 'enemy' + (enemy.dead ? ' dead' : '') + (targeting && !enemy.dead ? ' targetable' : '') + (enemy.defId === 'ash_warden' ? ' boss-enemy' : '') + (enemy.defId === 'slag_golem' ? ' elite-enemy' : ''));
  const intent = el('div', 'intent');
  intent.textContent = '⚔ ' + enemy.intent.label;
  const art = el('div', 'enemy-art');
  art.innerHTML = enemySvg(enemy.defId, enemy.defId === 'ash_warden');
  const name = el('div', 'enemy-name', enemyName(enemy.defId, enemy.name));
  const hp = el('div', 'hp-bar');
  const pct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
  hp.innerHTML = '<div class="hp-fill" style="width:' + pct + '%"></div><span class="hp-text">' + enemy.hp + '/' + enemy.maxHp + '</span>';
  box.append(intent, art, name, hp);
  if (enemy.block > 0) box.append(el('div', 'block-badge', t('block') + ' ' + enemy.block));
  box.append(statusBadges(enemy.statuses));
  if (targeting && !enemy.dead) {
    box.addEventListener('click', () => {
      if (!selectedCardUid) return;
      const before = enemy.hp;
      const err = playCard(state, selectedCardUid, enemy.uid);
      if (err) flash(err);
      else {
        sfxCardPlay(); sfxAttack();
        const dealt = before - enemy.hp;
        if (dealt > 0) { floatDmg(box, dealt); if (dealt >= 12) shake(true); else shake(false); }
        box.classList.add('hit-flash');
      }
      selectedCardUid = null; targeting = false; render();
    });
  }
  return box;
}

function renderCombat() {
  setAmbient('combat');
  const screen = el('div', 'screen combat-screen');
  const top = el('div', 'combat-top');
  const enemiesRow = el('div', 'enemies-row');
  for (const e of state.enemies) enemiesRow.append(renderEnemy(e));
  const log = el('div', 'combat-log');
  for (const line of state.combatLog) log.append(el('div', 'log-line', line));
  top.append(enemiesRow, log);
  screen.append(top);
  if (flashMsg) screen.append(el('div', 'flash', flashMsg));
  if (targeting) screen.append(el('div', 'banner warn', t('selectTarget')));

  const player = el('div', 'player-panel');
  const pInfo = el('div', 'player-info');
  pInfo.append(el('div', 'player-name', t('player')));
  const php = el('div', 'hp-bar player');
  php.innerHTML = '<div class="hp-fill" style="width:' + Math.max(0, (state.player.hp / state.player.maxHp) * 100) + '%"></div><span class="hp-text">' + t('hp') + ' ' + state.player.hp + '/' + state.player.maxHp + '</span>';
  pInfo.append(php);
  if (state.player.block > 0) pInfo.append(el('div', 'block-badge', t('block') + ' ' + state.player.block));
  pInfo.append(statusBadges(state.player.statuses));
  const energy = el('div', 'energy', state.player.energy + '/' + state.player.maxEnergy);
  const piles = el('div', 'piles');
  piles.append(el('span', 'pile', t('draw') + ' ' + state.drawPile.length), el('span', 'pile', t('discard') + ' ' + state.discardPile.length));
  const endBtn = el('button', 'btn primary end-turn', t('endTurn'));
  endBtn.addEventListener('click', () => { sfxClick(); selectedCardUid = null; targeting = false; endTurn(state); if (state.screen === 'defeat') sfxDefeat(); render(); });
  player.append(pInfo, energy, piles, endBtn);
  screen.append(player);

  const hand = el('div', 'hand');
  for (const c of state.hand) {
    const def = getCard(c.defId);
    hand.append(renderCard(c, {
      inHand: true,
      selected: selectedCardUid === c.uid,
      dimmed: state.player.energy < def.cost || !!def.curse,
      onClick: () => {
        if (def.curse) { flash(getLocale() === 'uk' ? 'Прокляття не зіграти' : 'Curses cannot be played'); return; }
        if (state.player.energy < def.cost) { flash(getLocale() === 'uk' ? 'Немає енергії' : 'Not enough energy'); return; }
        if (cardNeedsTarget(def)) { selectedCardUid = c.uid; targeting = true; render(); return; }
        const hadBlock = state.player.block;
        const err = playCard(state, c.uid);
        if (err) flash(err);
        else {
          sfxCardPlay();
          if (def.block) { sfxBlock(); player.classList.add('block-flash'); }
          if (def.heal) sfxHeal();
          if (def.aoeDamage) { sfxAttack(); shake(def.aoeDamage >= 8); }
          if (def.draw) sfxDraw();
          if (state.player.block > hadBlock) { /* ok */ }
        }
        selectedCardUid = null; targeting = false; render();
      },
    }));
  }
  screen.append(hand);
  return screen;
}

function renderRewards() {
  const screen = el('div', 'screen rewards-screen');
  screen.append(el('h2', 'screen-heading', t('rewardsTitle')), el('p', 'hint', t('rewardsHint')));
  const row = el('div', 'reward-row');
  for (const def of state.rewardChoices) {
    const wrap = el('div', 'reward-slot');
    wrap.append(renderCard({ uid: def.id, defId: def.id }));
    const btn = el('button', 'btn primary', t('take'));
    btn.addEventListener('click', () => { sfxReward(); pickReward(state, def.id); render(); });
    wrap.append(btn); row.append(wrap);
  }
  screen.append(row);
  const skip = el('button', 'btn ghost', t('skip'));
  skip.addEventListener('click', () => { sfxClick(); pickReward(state, null); render(); });
  screen.append(skip);
  return screen;
}

function renderRest() {
  const screen = el('div', 'screen rest-screen');
  screen.append(el('h2', 'screen-heading', t('restTitle')), el('p', 'hint', t('restHint')));
  const row = el('div', 'rest-options');
  const healAmt = Math.floor(state.player.maxHp * 0.3);
  const healBtn = el('button', 'btn primary large', t('heal') + ' ' + healAmt + ' ' + t('hp'));
  healBtn.addEventListener('click', () => { sfxHeal(); restHeal(state); render(); });
  const upBtn = el('button', 'btn secondary large', t('upgrade'));
  upBtn.addEventListener('click', () => { sfxClick(); restBeginUpgrade(state); render(); });
  row.append(healBtn, upBtn); screen.append(row);
  return screen;
}

function renderUpgrade() {
  const screen = el('div', 'screen upgrade-screen');
  screen.append(el('h2', 'screen-heading', t('upgradeTitle')), el('p', 'hint', t('upgradeHint')));
  const row = el('div', 'upgrade-row');
  for (const c of state.upgradeChoices) {
    const wrap = el('div', 'reward-slot');
    wrap.append(renderCard(c));
    const btn = el('button', 'btn primary', t('upgrade'));
    btn.addEventListener('click', () => { sfxReward(); restUpgradeCard(state, c.uid); render(); });
    wrap.append(btn); row.append(wrap);
  }
  screen.append(row);
  return screen;
}

function renderTreasure() {
  const screen = el('div', 'screen treasure-screen');
  screen.append(el('h2', 'screen-heading', t('treasureTitle')), el('p', 'hint', t('treasureHint')));
  screen.append(el('p', 'treasure-gold', '+' + state.treasureGold + ' ' + t('gold')));
  if (state.gambleResult) screen.append(el('div', 'banner', state.gambleResult));
  const safe = el('button', 'btn primary large', t('claimSafe'));
  safe.addEventListener('click', () => { sfxReward(); resolveTreasureGamble(state, false); completeNode(state); render(); });
  const risk = el('button', 'btn secondary large', t('doubleOrNothing'));
  risk.addEventListener('click', () => {
    resolveTreasureGamble(state, true);
    if (state.gambleResult.includes('Double') || state.gambleResult.includes('Подвій') || state.gambleResult.includes('+')) sfxReward();
    else sfxDefeat();
    completeNode(state); render();
  });
  screen.append(safe, risk);
  return screen;
}

function renderGamble(kind: 'wager' | 'tithe' | 'stall') {
  const screen = el('div', 'screen treasure-screen');
  const titles = { wager: t('wagerTitle'), tithe: t('titheTitle'), stall: t('stallTitle') };
  const hints = { wager: t('wagerHint'), tithe: t('titheHint'), stall: t('stallHint') };
  screen.append(el('h2', 'screen-heading', titles[kind]), el('p', 'hint', hints[kind]));
  screen.append(el('p', 'hud-stat', t('gold') + ': ' + state.player.gold + ' · ' + t('hp') + ': ' + state.player.hp));
  if (state.gambleResult) screen.append(el('div', 'banner', state.gambleResult));

  if (kind === 'wager') {
    screen.append(el('p', 'treasure-gold', state.wagerStake + ' ' + t('gold')));
    const play = el('button', 'btn primary large', t('wagerPlay'));
    play.addEventListener('click', () => {
      resolveWager(state, true);
      if (state.gambleResult.includes('Bust') || state.gambleResult.includes('згоріле') || state.gambleResult.includes('Bust') || state.gambleResult.includes('embers')) sfxDefeat();
      else sfxReward();
      render();
    });
    const skip = el('button', 'btn ghost', t('wagerSkip'));
    skip.addEventListener('click', () => { resolveWager(state, false); completeNode(state); render(); });
    const leave = el('button', 'btn secondary', t('leave'));
    leave.addEventListener('click', () => { sfxClick(); completeNode(state); render(); });
    screen.append(play, skip, leave);
  } else if (kind === 'tithe') {
    screen.append(el('p', 'treasure-gold', '-' + state.titheCost + ' ' + t('hp')));
    const play = el('button', 'btn primary large', t('tithePlay'));
    play.addEventListener('click', () => {
      resolveTithe(state, true);
      if (state.gambleResult.includes('nothing') || state.gambleResult.includes('нічого') || state.gambleResult.includes('дарма')) sfxDefeat();
      else sfxReward();
      render();
    });
    const skip = el('button', 'btn ghost', t('titheSkip'));
    skip.addEventListener('click', () => { resolveTithe(state, false); completeNode(state); render(); });
    const leave = el('button', 'btn secondary', t('leave'));
    leave.addEventListener('click', () => { completeNode(state); render(); });
    screen.append(play, skip, leave);
  } else {
    if (state.shopOffer) {
      screen.append(renderCard({ uid: 'offer', defId: state.shopOffer.id }));
      screen.append(el('p', 'hint', t('buySafe') + ': ' + Math.round(state.stallCost * 0.7) + ' · ' + t('cursedDeal') + ': ' + state.stallCost));
    }
    const buy = el('button', 'btn primary large', t('buySafe'));
    buy.addEventListener('click', () => { buySafe(state); sfxReward(); render(); });
    const cursed = el('button', 'btn secondary large', t('cursedDeal'));
    cursed.addEventListener('click', () => {
      cursedDeal(state);
      if (state.gambleResult.includes('curse') || state.gambleResult.includes('Smoke') || state.gambleResult.includes('Проклят') || state.gambleResult.includes('нічого') || state.gambleResult.includes('Smoke')) sfxDefeat();
      else sfxReward();
      render();
    });
    const leave = el('button', 'btn ghost', t('leave'));
    leave.addEventListener('click', () => { completeNode(state); render(); });
    screen.append(buy, cursed, leave);
  }
  return screen;
}

function renderEnd(kind: 'victory' | 'defeat') {
  if (kind === 'victory') { sfxVictory(); setAmbient('title'); } else { sfxDefeat(); setAmbient('none'); }
  const screen = el('div', 'screen end-screen ' + kind);
  screen.append(el('h1', 'game-title', kind === 'victory' ? t('victoryTitle') : t('defeatTitle')));
  screen.append(el('p', 'flavor', state.message || (kind === 'victory' ? t('victoryBlurb') : t('defeatBlurb'))));
  screen.append(el('p', 'hud-stat', crownLabelI18n(state.crown) + ' · ' + t('gold') + ' ' + state.player.gold));
  const btn = el('button', 'btn primary large', t('restart'));
  btn.addEventListener('click', () => { sfxClick(); startRun(state, selectedCrown); render(); });
  const titleBtn = el('button', 'btn ghost', t('titleScreen'));
  titleBtn.addEventListener('click', () => { Object.assign(state, createNewRun()); render(); });
  screen.append(btn, titleBtn);
  return screen;
}

function render() {
  ensureEmbers();
  app.innerHTML = '';
  let view: HTMLElement;
  switch (state.screen) {
    case 'title': view = renderTitle(); break;
    case 'map': view = renderMap(); break;
    case 'combat': view = renderCombat(); break;
    case 'rewards': view = renderRewards(); break;
    case 'rest': view = renderRest(); break;
    case 'upgrade': view = renderUpgrade(); break;
    case 'treasure': view = renderTreasure(); break;
    case 'wager': view = renderGamble('wager'); break;
    case 'tithe': view = renderGamble('tithe'); break;
    case 'stall': view = renderGamble('stall'); break;
    case 'victory': view = renderEnd('victory'); break;
    case 'defeat': view = renderEnd('defeat'); break;
    default: view = renderTitle();
  }
  app.append(view, muteBtn());
}

window.addEventListener('keydown', async (e) => {
  await unlockAudio();
  if (e.key === 'Escape' && targeting) { targeting = false; selectedCardUid = null; render(); return; }
  if ((e.key === ' ' || e.key === 'e' || e.key === 'E') && state.screen === 'combat') {
    e.preventDefault(); selectedCardUid = null; targeting = false; endTurn(state); render();
  }
});
document.addEventListener('pointerdown', () => { unlockAudio(); }, { once: true });

render();
