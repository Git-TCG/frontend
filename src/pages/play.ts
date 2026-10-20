import { api, del, post } from "../api";
import { notify, render, type Page } from "../app";
import { cardTile, type CardInfo } from "../cards";
import { h } from "../html";
import { uuidV4 } from "../uuid";

type Lane = 0 | 1 | 2;
interface Unit {
  cardId: string;
  attack: number;
  durability: number;
  maxDurability: number;
  canAttack: boolean;
  frozen: boolean;
  deployedTurn: number;
}
interface Side {
  core: number;
  resource: number;
  maxResource: number;
  field: (Unit | null)[];
  deckCount: number;
  discard: string[];
}
interface MatchView {
  id: string;
  mode: "pvp" | "bot";
  deadline: string;
  view: {
    you: 0 | 1;
    turn: number;
    active: 0 | 1;
    phase: "mulligan" | "deploy" | "combat" | "ended";
    result: { kind: "win" | "draw"; winner?: number; reason: string } | null;
    seq: number;
    pending: { kind: "scout"; options: string[] } | null;
    me: Side & { hand: string[]; mulliganDone: boolean; scrappedThisTurn: boolean };
    opponent: Side & { handCount: number; mulliganDone: boolean };
  };
  cards: Record<string, CardInfo>;
  legal: Action[];
}
type Target = { kind: "unit"; lane: Lane } | { kind: "core" };
type Action =
  | { type: "mulligan"; cardIds: string[] }
  | { type: "deploy"; cardId: string; lane: Lane; targetLane?: Lane }
  | { type: "scrap"; lane: Lane }
  | { type: "beginCombat" }
  | { type: "attack"; lane: Lane; target: Target }
  | { type: "choose"; cardId: string }
  | { type: "endTurn" }
  | { type: "concede" };

/** 화면에서 고른 것. 카드 → 칸 → (필요하면) 능력 대상 순서로 진행한다. */
type Selection =
  | null
  | { kind: "hand"; cardId: string }
  | { kind: "deployTarget"; cardId: string; lane: Lane }
  | { kind: "unit"; lane: Lane };

const LANES: Lane[] = [0, 1, 2];
const CORE_MAX = 15;
const RESULT_REASON: Record<string, string> = {
  core: "코어가 파괴되었습니다",
  concede: "항복으로 끝났습니다",
  simultaneous: "양쪽 코어가 동시에 파괴되었습니다",
  turnLimit: "40턴 제한에 도달했습니다",
};

let queue: { waiting: boolean; matchId: string | null } | null = null;
let match: MatchView | null = null;
let deckKind: "owned" | "trial" = "trial";
let ownedDeckReady = false;
let sel: Selection = null;
let mulliganPick = new Set<string>();
let lastSeq = -1;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let waitingSince = 0;

function stopTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  pollTimer = clockTimer = null;
}

function startTimers() {
  if (!pollTimer) {
    pollTimer = setInterval(() => void poll(), 2000);
  }
  if (!clockTimer) {
    clockTimer = setInterval(updateClock, 1000);
  }
}

function secondsLeft(): number {
  if (!match) return 0;
  return Math.max(0, Math.ceil((new Date(match.deadline).getTime() - Date.now()) / 1000));
}

/** 남은 시간만 바꾼다. 화면 전체를 다시 그리면 선택이 깜빡이므로. */
function updateClock() {
  const el = document.getElementById("turn-clock");
  if (el && match && !match.view.result) el.textContent = `${secondsLeft()}초`;
  const wait = document.getElementById("wait-clock");
  if (wait && queue?.waiting) wait.textContent = `${Math.floor((Date.now() - waitingSince) / 1000)}초째 기다리는 중`;
}

function setMatch(next: MatchView | null) {
  match = next;
  if (!next || next.view.seq !== lastSeq) {
    sel = null;
    lastSeq = next?.view.seq ?? -1;
  }
}

async function poll() {
  try {
    if (match && !match.view.result) {
      setMatch(await api<MatchView>(`/matches/${match.id}`));
      render();
    } else if (queue?.waiting) {
      const q = await api<{ waiting: boolean; matchId: string | null }>("/queue");
      queue = q;
      if (q.matchId) {
        setMatch(await api<MatchView>(`/matches/${q.matchId}`));
        notify("상대를 찾았습니다. 대전을 시작합니다.");
      }
      render();
    }
  } catch {
    /* 일시적인 오류는 다음 주기에 다시 시도한다 */
  }
}

// ---------------------------------------------------------------------------
// 합법 행동 조회

const legal = () => match?.legal ?? [];
const deploys = (cardId: string) =>
  legal().filter((a): a is Extract<Action, { type: "deploy" }> => a.type === "deploy" && a.cardId === cardId);
const attacks = (lane: Lane) =>
  legal().filter((a): a is Extract<Action, { type: "attack" }> => a.type === "attack" && a.lane === lane);
const canDo = (type: Action["type"]) => legal().some((a) => a.type === type);
const scrapOf = (lane: Lane) => legal().find((a) => a.type === "scrap" && a.lane === lane);

function card(id: string): CardInfo {
  return match?.cards[id] ?? { name: id, grade: "?", role: "", cost: 0, attack: 0, durability: 0 };
}

async function send(action: Action) {
  if (!match) return;
  const next = await post<MatchView>(`/matches/${match.id}/actions`, {
    commandId: uuidV4(),
    expectedSeq: match.view.seq,
    action,
  });
  setMatch(next);
  sel = null;
}

/** 손패 카드를 낼 수 없는 이유. 낼 수 있으면 null. */
function whyNotDeploy(cardId: string): string | null {
  if (!match) return null;
  const v = match.view;
  if (deploys(cardId).length) return null;
  if (v.active !== v.you) return "상대 턴";
  if (v.phase === "combat") return "전투 단계에는 배치 불가";
  if (v.phase !== "deploy") return "지금은 배치 불가";
  if (card(cardId).cost > v.me.resource) return `자원 부족 (${card(cardId).cost} 필요)`;
  if (v.me.field.every(Boolean)) return "빈 칸 없음";
  return "지금은 배치 불가";
}

// ---------------------------------------------------------------------------
// 보드 그리기

function pips(current: number, max: number) {
  return `<span class="pips" title="자원 ${current}/${max}">${"●".repeat(Math.max(0, current))}${"○".repeat(
    Math.max(0, max - current),
  )}</span>`;
}

function coreBar(value: number, label: string, targetable: boolean) {
  const pct = Math.max(0, Math.min(100, (value / CORE_MAX) * 100));
  const inner = `<span class="core-label">${label} 코어 ${value}/${CORE_MAX}</span>
    <span class="bar"><span style="width:${pct}%"></span></span>`;
  return targetable
    ? `<button class="core target" data-action="attackCore" type="button">${inner}<span class="hint">여기를 눌러 코어 공격</span></button>`
    : `<div class="core">${inner}</div>`;
}

function unitTile(unit: Unit, lane: Lane, mine: boolean): string {
  const c = card(unit.cardId);
  const v = match!.view;
  const tags: string[] = [];
  if (mine && unit.canAttack && v.active === v.you) tags.push("공격 가능");
  if (unit.deployedTurn === v.turn) tags.push("이번 턴 배치");
  if (unit.frozen) tags.push("빙결: 다음 턴 공격 불가");
  if (mine && v.active === v.you && !unit.canAttack && unit.deployedTurn !== v.turn && !unit.frozen) {
    tags.push("이번 턴 공격 끝");
  }
  const tagHtml = tags.length ? `<span class="tags">${tags.map((t) => `<span>${h(t)}</span>`).join("")}</span>` : "";
  const tile = (className: string, action?: string, hint?: string) =>
    cardTile(c, {
      compact: true,
      live: { attack: unit.attack, durability: unit.durability, maxDurability: unit.maxDurability },
      className: `unit ${className}`,
      action,
      data: action ? { lane } : undefined,
      extra: tagHtml + (hint ? `<span class="hint">${h(hint)}</span>` : ""),
    });

  // 내 프로젝트: 공격자로 고를 수 있으면 버튼
  if (mine) {
    const selectable = attacks(lane).length > 0 || !!scrapOf(lane);
    const selected = sel?.kind === "unit" && sel.lane === lane;
    return selectable ? tile(selected ? "selected" : "playable", "pickUnit") : tile("");
  }
  // 상대 프로젝트: 공격 대상이거나 능력 대상이면 버튼
  if (isEnemyTarget(lane)) {
    return tile("target", "hitLane", sel?.kind === "deployTarget" ? "능력 대상으로 선택" : "여기를 공격");
  }
  return tile("");
}

function isEnemyTarget(lane: Lane): boolean {
  if (sel?.kind === "unit") return attacks(sel.lane).some((a) => a.target.kind === "unit" && a.target.lane === lane);
  if (sel?.kind === "deployTarget") {
    const { cardId, lane: myLane } = sel;
    return deploys(cardId).some((a) => a.lane === myLane && a.targetLane === lane);
  }
  return false;
}

function laneSlot(side: Side, lane: Lane, mine: boolean): string {
  const unit = side.field[lane];
  if (unit) return `<div class="slot">${unitTile(unit, lane, mine)}</div>`;
  if (mine && sel?.kind === "hand" && deploys(sel.cardId).some((a) => a.lane === lane)) {
    return `<div class="slot"><button type="button" class="empty-slot target" data-action="placeLane" data-lane="${lane}">${
      lane + 1
    }번 칸에 배치</button></div>`;
  }
  return `<div class="slot"><div class="empty-slot">${lane + 1}번 칸 · 비어 있음</div></div>`;
}

/** 지금 무엇을 해야 하는지 한 줄로 알려 준다. */
function guide(): string {
  const v = match!.view;
  if (v.result) return "";
  if (v.phase === "mulligan") {
    return v.me.mulliganDone
      ? "상대가 시작 손패를 정하는 중입니다."
      : "시작 손패 3장입니다. 마음에 들지 않는 카드를 눌러 표시한 뒤 [교환하고 시작]을 누르세요. 그대로 시작해도 됩니다.";
  }
  if (v.pending) return "덱 위 카드 2장 중 손으로 가져올 1장을 고르세요. 나머지는 덱 맨 아래로 갑니다.";
  if (v.active !== v.you) return "상대 턴입니다. 상대의 행동이 끝나면 자동으로 내 턴이 됩니다.";
  if (sel?.kind === "hand") return "초록색으로 표시된 내 빈 칸을 눌러 배치하세요. 다른 카드를 누르면 바꿀 수 있습니다.";
  if (sel?.kind === "deployTarget") return "이 카드의 능력이 영향을 줄 상대 프로젝트를 고르세요.";
  if (sel?.kind === "unit") {
    const hasCore = attacks(sel.lane).some((a) => a.target.kind === "core");
    return hasCore
      ? "상대 필드가 비었습니다. 상대 코어를 눌러 공격하세요."
      : "빨간색으로 표시된 상대 프로젝트를 눌러 공격하세요. 맞은편에 적이 있으면 그 적만 공격할 수 있습니다.";
  }
  const canDeploy = v.me.hand.some((id) => deploys(id).length > 0);
  const canAttack = LANES.some((l) => attacks(l).length > 0);
  if (v.phase === "deploy") {
    if (canDeploy) {
      return "① 배치 단계: 손패 카드를 눌러 빈 칸에 내세요(자원 사용). 다 냈으면 [배치 끝내고 전투 단계로] 또는 공격할 내 프로젝트를 누르세요.";
    }
    return canAttack
      ? "① 배치 단계: 지금 낼 수 있는 카드가 없습니다. '공격 가능' 표시가 있는 내 프로젝트를 눌러 공격하세요."
      : "지금 낼 카드도, 공격할 프로젝트도 없습니다. [턴 종료]를 누르세요. (배치한 턴에는 공격할 수 없습니다)";
  }
  return canAttack
    ? "② 전투 단계: '공격 가능' 표시가 있는 내 프로젝트를 눌러 공격하세요. 끝나면 [턴 종료]를 누르세요."
    : "② 전투 단계: 이번 턴에 공격할 수 있는 프로젝트를 모두 썼습니다. [턴 종료]를 누르세요.";
}

function matchView(): string {
  const m = match!;
  const v = m.view;
  const myTurn = v.active === v.you;

  if (v.result) {
    const outcome = v.result.kind === "draw" ? "무승부" : v.result.winner === v.you ? "승리" : "패배";
    return `<section class="result ${outcome === "승리" ? "win" : outcome === "패배" ? "lose" : ""}">
      <h1>${outcome}</h1>
      <p>${h(RESULT_REASON[v.result.reason] ?? v.result.reason)} · 총 ${v.turn}턴</p>
      ${
        m.mode === "bot"
          ? "<p>연습 대전에서 4턴 이상 직접 플레이하면 튜토리얼 완료 보상을 한 번 받습니다(카드 1장, 받을 카드가 없으면 외형 재화).</p>"
          : "<p>양쪽 모두 행동하고 4턴 이상 진행한 경기는 정상 대전으로 기록되어 보상이 쌓입니다.</p>"
      }
      <div class="row"><button class="primary" data-action="leave">대전 화면으로 돌아가기</button></div>
    </section>`;
  }

  const phaseLabel =
    v.phase === "mulligan" ? "시작 손패 정하기" : v.phase === "deploy" ? "① 배치 단계" : "② 전투 단계";
  const banner = `<div class="turn-banner ${myTurn || v.phase === "mulligan" ? "mine" : "theirs"}">
    <strong>${v.phase === "mulligan" ? "경기 준비" : myTurn ? "내 턴" : "상대 턴"}</strong>
    <span>${v.turn ? `${v.turn}턴 · ` : ""}${phaseLabel}</span>
    <span>남은 시간 <b id="turn-clock">${secondsLeft()}초</b></span>
    <a href="#/help" class="help-link">규칙 보기</a>
  </div>`;

  const opponent = `<div class="side opponent">
    <div class="side-head">
      <strong>${m.mode === "bot" ? "연습 상대(봇)" : "상대"}</strong>
      ${coreBar(v.opponent.core, "상대", sel?.kind === "unit" && attacks(sel.lane).some((a) => a.target.kind === "core"))}
      <span>자원 ${pips(v.opponent.resource, v.opponent.maxResource)}</span>
      <span>손패 ${v.opponent.handCount}장 · 덱 ${v.opponent.deckCount}장</span>
    </div>
    <div class="lanes">${LANES.map((l) => laneSlot(v.opponent, l, false)).join("")}</div>
  </div>`;

  const mine = `<div class="side mine">
    <div class="lanes">${LANES.map((l) => laneSlot(v.me, l, true)).join("")}</div>
    <div class="side-head">
      <strong>나</strong>
      ${coreBar(v.me.core, "내", false)}
      <span>자원 ${pips(v.me.resource, v.me.maxResource)} <small>(카드 비용만큼 씁니다)</small></span>
      <span>덱 ${v.me.deckCount}장 · 버린 카드 ${v.me.discard.length}장</span>
    </div>
  </div>`;

  let hand: string;
  if (v.pending) {
    hand = `<div class="hand"><h3>카드 고르기</h3><div class="cards">${v.pending.options
      .map((id) => cardTile(card(id), { action: "choose", data: { id }, className: "playable" }))
      .join("")}</div></div>`;
  } else if (v.phase === "mulligan" && !v.me.mulliganDone) {
    hand = `<div class="hand"><h3>시작 손패 (교환할 카드 선택: ${mulliganPick.size}장)</h3><div class="cards">${v.me.hand
      .map((id) =>
        cardTile(card(id), {
          action: "toggleMulligan",
          data: { id },
          className: mulliganPick.has(id) ? "selected" : "playable",
          note: mulliganPick.has(id) ? "교환" : "유지",
        }),
      )
      .join("")}</div>
      <div class="row"><button class="primary" data-action="mulligan">${
        mulliganPick.size ? `${mulliganPick.size}장 교환하고 시작` : "그대로 시작"
      }</button></div></div>`;
  } else {
    hand = `<div class="hand"><h3>내 손패 ${v.me.hand.length}장 <small>(최대 7장)</small></h3><div class="cards">${
      v.me.hand
        .map((id) => {
          const why = whyNotDeploy(id);
          const selected = (sel?.kind === "hand" || sel?.kind === "deployTarget") && sel.cardId === id;
          return why
            ? cardTile(card(id), { className: "disabled", note: why })
            : cardTile(card(id), {
                action: "pickHand",
                data: { id },
                className: selected ? "selected" : "playable",
                note: selected ? "놓을 칸을 고르세요" : "눌러서 배치",
              });
        })
        .join("") || "<p class=\"muted\">손패가 없습니다.</p>"
    }</div></div>`;
  }

  const controls: string[] = [];
  if (sel) controls.push(`<button data-action="cancelSel">선택 취소</button>`);
  if (sel?.kind === "unit" && scrapOf(sel.lane)) {
    controls.push(
      `<button data-action="scrap" title="턴당 1번. 자원은 돌려받지 못하고 파괴 시 능력도 발동하지 않습니다.">이 프로젝트 폐기(칸 비우기)</button>`,
    );
  }
  if (canDo("beginCombat")) controls.push(`<button data-action="beginCombat">배치 끝내고 전투 단계로</button>`);
  if (canDo("endTurn")) controls.push(`<button class="primary" data-action="endTurn">턴 종료</button>`);
  controls.push(`<button class="danger" data-action="concede">항복</button>`);

  return `<section class="match">
    ${banner}
    <p class="guide">${h(guide())}</p>
    ${opponent}
    <div class="divider">— 아래가 내 필드 · 같은 번호 칸끼리 맞은편입니다 —</div>
    ${mine}
    ${hand}
    <div class="row controls">${controls.join("")}</div>
  </section>`;
}

function lobbyView(): string {
  if (queue?.waiting) {
    return `<section>
      <h1>상대를 찾는 중</h1>
      <p id="wait-clock">${Math.floor((Date.now() - waitingSince) / 1000)}초째 기다리는 중</p>
      <p class="muted">다른 플레이어가 대기열에 들어오면 자동으로 시작합니다. 이 화면을 열어 두세요.</p>
      <div class="row"><button data-action="cancel">대기 취소</button><button data-action="bot">기다리지 않고 연습 상대와 하기</button></div>
    </section>`;
  }
  return `<section>
    <h1>대전</h1>
    <h2>1. 덱 고르기</h2>
    <div class="choices">
      <label class="choice ${deckKind === "trial" ? "on" : ""}">
        <input type="radio" name="deck" data-action="deck" data-kind="trial" ${deckKind === "trial" ? "checked" : ""}>
        <b>체험 덱</b><br><small>미리 만든 가상 카드 7장. 처음이라면 이걸로 시작하세요.</small>
      </label>
      <label class="choice ${deckKind === "owned" ? "on" : ""} ${ownedDeckReady ? "" : "off"}">
        <input type="radio" name="deck" data-action="deck" data-kind="owned" ${deckKind === "owned" ? "checked" : ""} ${ownedDeckReady ? "" : "disabled"}>
        <b>내 덱</b><br><small>${ownedDeckReady ? "덱 화면에서 저장한 내 Repo 카드 7장." : "아직 저장한 덱이 없습니다. <a href=\"#/deck\">덱 만들기</a>"}</small>
      </label>
    </div>
    <h2>2. 상대 고르기</h2>
    <div class="choices">
      <button class="choice primary-choice" data-action="bot"><b>연습 상대(봇)</b><br><small>바로 시작. 4턴 이상 플레이하면 튜토리얼 보상.</small></button>
      <button class="choice" data-action="queue"><b>다른 플레이어</b><br><small>대기열에서 상대를 기다립니다. 정상 대전 보상이 쌓입니다.</small></button>
    </div>
    <p class="muted">처음이라면 <a href="#/tutorial">튜토리얼</a>을 먼저 읽어 보세요. 한 턴은 45초이고, 2턴 연속 아무것도 하지 않으면 패배합니다.</p>
  </section>`;
}

export const playPage: Page = {
  title: "대전",
  requiresLogin: true,
  local: ["deck", "cancelSel", "pickHand", "pickUnit", "toggleMulligan"],
  leave() {
    stopTimers();
  },
  async load() {
    const [q, deck] = await Promise.all([
      api<{ waiting: boolean; matchId: string | null }>("/queue"),
      api<{ repoIds: number[] }>("/deck").catch(() => ({ repoIds: [] })),
    ]);
    ownedDeckReady = deck.repoIds.length === 7;
    if (!ownedDeckReady) deckKind = "trial";
    queue = q;
    if (q.waiting && !waitingSince) waitingSince = Date.now();
    if (!q.waiting) waitingSince = 0;
    if (q.matchId) setMatch(await api<MatchView>(`/matches/${q.matchId}`));
    else if (match?.view.result) {
      /* 끝난 경기 결과는 사용자가 닫을 때까지 보여 준다 */
    } else setMatch(null);
    startTimers();
  },
  view() {
    return match ? matchView() : lobbyView();
  },
  actions: {
    deck: (el) => {
      deckKind = el.dataset.kind === "owned" && ownedDeckReady ? "owned" : "trial";
    },
    queue: async () => {
      const r = await post<{ waiting?: boolean; matchId?: string }>("/queue", { deck: deckKind, opponent: "queue" });
      if (r.matchId) {
        queue = { waiting: false, matchId: r.matchId };
        notify("상대를 찾았습니다.");
      } else {
        queue = { waiting: true, matchId: null };
        waitingSince = Date.now();
      }
    },
    bot: async () => {
      if (queue?.waiting) await del("/queue");
      const r = await post<{ matchId?: string }>("/queue", { deck: deckKind, opponent: "bot" });
      if (!r.matchId) throw new Error("연습 대전을 만들지 못했습니다");
      queue = { waiting: false, matchId: r.matchId };
      mulliganPick = new Set();
    },
    cancel: async () => {
      await del("/queue");
      queue = { waiting: false, matchId: null };
      waitingSince = 0;
    },
    leave: () => {
      setMatch(null);
      mulliganPick = new Set();
    },
    cancelSel: () => {
      sel = null;
    },
    pickHand: (el) => {
      const id = el.dataset.id!;
      sel = sel && "cardId" in sel && sel.cardId === id ? null : { kind: "hand", cardId: id };
    },
    placeLane: async (el) => {
      if (sel?.kind !== "hand") return;
      const lane = Number(el.dataset.lane) as Lane;
      const options = deploys(sel.cardId).filter((a) => a.lane === lane);
      if (!options.length) return;
      if (options.some((a) => a.targetLane !== undefined)) {
        sel = { kind: "deployTarget", cardId: sel.cardId, lane };
        return;
      }
      await send(options[0]!);
    },
    pickUnit: (el) => {
      const lane = Number(el.dataset.lane) as Lane;
      sel = sel?.kind === "unit" && sel.lane === lane ? null : { kind: "unit", lane };
    },
    hitLane: async (el) => {
      const lane = Number(el.dataset.lane) as Lane;
      if (sel?.kind === "unit") {
        const a = attacks(sel.lane).find((x) => x.target.kind === "unit" && x.target.lane === lane);
        if (a) await send(a);
      } else if (sel?.kind === "deployTarget") {
        const { cardId, lane: myLane } = sel;
        const a = deploys(cardId).find((x) => x.lane === myLane && x.targetLane === lane);
        if (a) await send(a);
      }
    },
    attackCore: async () => {
      if (sel?.kind !== "unit") return;
      const a = attacks(sel.lane).find((x) => x.target.kind === "core");
      if (a) await send(a);
    },
    scrap: async () => {
      if (sel?.kind !== "unit") return;
      const a = scrapOf(sel.lane);
      if (a && confirm("이 프로젝트를 폐기할까요? 자원은 돌려받지 못합니다.")) await send(a);
    },
    toggleMulligan: (el) => {
      const id = el.dataset.id!;
      if (mulliganPick.has(id)) mulliganPick.delete(id);
      else mulliganPick.add(id);
    },
    mulligan: async () => {
      await send({ type: "mulligan", cardIds: [...mulliganPick] });
      mulliganPick = new Set();
    },
    choose: async (el) => {
      await send({ type: "choose", cardId: el.dataset.id! });
    },
    beginCombat: () => send({ type: "beginCombat" }),
    endTurn: async () => {
      const v = match?.view;
      const idle = v && v.me.hand.some((id) => !whyNotDeploy(id));
      if (idle && !confirm("아직 낼 수 있는 카드가 있습니다. 턴을 끝낼까요?")) return;
      await send({ type: "endTurn" });
    },
    concede: async () => {
      if (confirm("정말 항복할까요? 이 경기는 패배로 끝납니다.")) await send({ type: "concede" });
    },
  },
};
