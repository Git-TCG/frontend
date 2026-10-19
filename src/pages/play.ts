import { api, del, post } from "../api";
import { notify, render, type Page } from "../app";
import { h } from "../html";
import { uuidV4 } from "../uuid";

interface MatchView {
  id: string;
  deadline: string;
  view: {
    you: 0 | 1;
    turn: number;
    active: 0 | 1;
    phase: string;
    result: { kind: string; winner?: number; reason?: string } | null;
    seq: number;
    me: {
      core: number;
      resource: number;
      maxResource: number;
      hand: string[];
      field: ({ cardId: string; attack: number; durability: number; canAttack: boolean } | null)[];
      deckCount: number;
    };
    opponent: {
      core: number;
      resource: number;
      maxResource: number;
      handCount: number;
      field: ({ cardId: string; attack: number; durability: number } | null)[];
      deckCount: number;
    };
  };
  cards: Record<string, { name: string; cost: number; attack: number; durability: number }>;
  legal: { type: string; [k: string]: unknown }[];
}

let queue: { waiting: boolean; matchId: string | null } | null = null;
let match: MatchView | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let deckKind: "owned" | "trial" = "trial";

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startPoll(reload: () => Promise<void>) {
  stopPoll();
  pollTimer = setInterval(() => void reload(), 3000);
}

function cardName(id: string) {
  return match?.cards[id]?.name ?? id;
}

function actionLabel(a: { type: string; [k: string]: unknown }): string {
  switch (a.type) {
    case "mulligan":
      return (a.cardIds as string[])?.length ? "손패 전부 다시 뽑기" : "멀리건 유지";
    case "deploy":
      return `배치 ${cardName(String(a.cardId))} → 칸 ${Number(a.lane) + 1}`;
    case "scrap":
      return `폐기 칸 ${Number(a.lane) + 1}`;
    case "beginCombat":
      return "전투 시작";
    case "attack": {
      const t = a.target as { kind: string; lane?: number };
      return `공격 칸 ${Number(a.lane) + 1} → ${t.kind === "core" ? "코어" : `상대 칸 ${(t.lane ?? 0) + 1}`}`;
    }
    case "choose":
      return `선택 ${cardName(String(a.cardId))}`;
    case "endTurn":
      return "턴 종료";
    case "concede":
      return "항복";
    default:
      return a.type;
  }
}

function fieldHtml(
  field: ({ cardId: string; attack: number; durability: number; canAttack?: boolean } | null)[],
  mine: boolean,
) {
  return field
    .map((u, i) => {
      if (!u) return `<div class="lane empty">칸 ${i + 1}</div>`;
      return `<div class="lane">${h(cardName(u.cardId))}<br>${u.attack}/${u.durability}${
        mine && u.canAttack ? " ★" : ""
      }</div>`;
    })
    .join("");
}

export const playPage: Page = {
  title: "대전",
  requiresLogin: true,
  leave() {
    stopPoll();
  },
  async load() {
    const q = await api<{ waiting: boolean; matchId: string | null }>("/queue");
    queue = q;
    if (q.matchId) {
      const matchId = q.matchId;
      match = await api(`/matches/${matchId}`);
      startPoll(async () => {
        if (!queue?.matchId) return;
        try {
          match = await api(`/matches/${queue.matchId}`);
          render();
        } catch {
          /* 일시 오류는 다음 주기에 재시도 */
        }
      });
    } else {
      match = null;
      stopPoll();
    }
  },
  view() {
    if (match) {
      const v = match.view;
      const result = v.result
        ? `<p><strong>결과:</strong> ${
            v.result.kind === "draw"
              ? "무승부"
              : v.result.winner === v.you
                ? "승리"
                : "패배"
          } (${h(v.result.reason ?? "")})</p>`
        : "";
      const legal = [...match.legal, { type: "concede" }];
      const actions = legal
        .map(
          (a, i) =>
            `<button data-action="act" data-i="${i}">${h(actionLabel(a))}</button>`,
        )
        .join(" ");
      // legal + concede를 액션에서 쓰기 위해 보관
      (playPage as unknown as { _legal: typeof legal })._legal = legal;
      return `<section>
        <h1>대전</h1>
        <p>턴 ${v.turn} · 단계 ${h(v.phase)} · ${v.active === v.you ? "내 턴" : "상대 턴"} · 마감 ${h(new Date(match.deadline).toLocaleTimeString())}</p>
        ${result}
        <div class="match">
          <div>
            <h3>상대 (코어 ${v.opponent.core} · 자원 ${v.opponent.resource}/${v.opponent.maxResource} · 손패 ${v.opponent.handCount} · 덱 ${v.opponent.deckCount})</h3>
            <div class="field">${fieldHtml(v.opponent.field, false)}</div>
          </div>
          <div>
            <h3>나 (코어 ${v.me.core} · 자원 ${v.me.resource}/${v.me.maxResource} · 덱 ${v.me.deckCount})</h3>
            <div class="field">${fieldHtml(v.me.field, true)}</div>
            <p>손패: ${v.me.hand.map((id) => h(cardName(id))).join(", ") || "(없음)"}</p>
          </div>
        </div>
        <div class="row">${actions}</div>
        <div class="row" style="margin-top:0.5rem">
          <button data-action="refresh">새로고침</button>
          ${v.result ? `<a href="#/play">대기열로</a>` : ""}
        </div>
      </section>`;
    }

    return `<section>
      <h1>대전</h1>
      <p>덱 종류</p>
      <div class="row">
        <button data-action="deck" data-kind="owned" class="${deckKind === "owned" ? "primary" : ""}">내 카드</button>
        <button data-action="deck" data-kind="trial" class="${deckKind === "trial" ? "primary" : ""}">체험 덱</button>
      </div>
      <p style="margin-top:1rem">${queue?.waiting ? "상대를 기다리는 중…" : "대기열에 들어가거나 연습 상대와 대전하세요."}</p>
      <div class="row">
        <button class="primary" data-action="queue" ${queue?.waiting ? "disabled" : ""}>대기열</button>
        <button data-action="bot">연습 상대</button>
        <button data-action="cancel" ${queue?.waiting ? "" : "disabled"}>대기 취소</button>
        <button data-action="refresh">새로고침</button>
      </div>
      <p><a href="#/deck">덱 편집</a></p>
    </section>`;
  },
  actions: {
    deck: (el) => {
      deckKind = el.dataset.kind === "owned" ? "owned" : "trial";
    },
    queue: async () => {
      const r = await post<{ waiting?: boolean; matchId?: string }>("/queue", {
        deck: deckKind,
        opponent: "queue",
      });
      if (r.matchId) {
        queue = { waiting: false, matchId: r.matchId };
        match = await api(`/matches/${r.matchId}`);
        notify("매칭되었습니다.");
      } else {
        queue = { waiting: true, matchId: null };
        notify("대기열에 등록했습니다.");
      }
    },
    bot: async () => {
      const r = await post<{ matchId?: string }>("/queue", { deck: deckKind, opponent: "bot" });
      if (!r.matchId) throw new Error("연습 대전을 만들지 못했습니다");
      queue = { waiting: false, matchId: r.matchId };
      match = await api(`/matches/${r.matchId}`);
      notify("연습 대전을 시작합니다.");
    },
    cancel: async () => {
      await del("/queue");
      queue = { waiting: false, matchId: null };
      notify("대기를 취소했습니다.");
    },
    refresh: () => undefined,
    act: async (el) => {
      const current = match;
      if (!current) return;
      const legal = (playPage as unknown as { _legal: { type: string; [k: string]: unknown }[] })._legal;
      const action = legal[Number(el.dataset.i)];
      if (!action) return;
      const next = await post<MatchView>(`/matches/${current.id}/actions`, {
        commandId: uuidV4(),
        expectedSeq: current.view.seq,
        action,
      });
      match = next;
      queue = { waiting: false, matchId: next.id };
    },
  },
};
