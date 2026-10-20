import { api, put } from "../api";
import { notify, type Page } from "../app";
import { cardTile, ROLE_LABEL, type CardInfo } from "../cards";
import { h } from "../html";

interface CardRow {
  id: number;
  full_name: string;
  status: string | null;
  card: CardInfo | null;
  abilityText: string | null;
}

const DECK_SIZE = 7;

let ready: CardRow[] = [];
let waiting: CardRow[] = [];
let saved: number[] = [];
let selected = new Set<number>();
let editing = false;
let trial: { cards: Record<string, CardInfo>; decks: string[][] } | null = null;

function summary(cards: CardInfo[]) {
  const costs = [1, 2, 3, 4, 5].map((c) => `${c}비용 ${cards.filter((x) => x.cost === c).length}`).join(" · ");
  const roles = Object.entries(ROLE_LABEL)
    .map(([k, label]) => [label, cards.filter((x) => x.role === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(" · ");
  const cheap = cards.filter((x) => x.cost <= 2).length;
  return `<p>${costs}</p><p>${roles || "-"}</p>${
    cards.length && cheap < 3
      ? `<p class="warn">1~2비용 카드가 ${cheap}장뿐입니다. 초반 1~2턴은 자원이 적어서 낼 카드가 없을 수 있습니다.</p>`
      : ""
  }`;
}

export const deckPage: Page = {
  title: "덱",
  requiresLogin: true,
  local: ["toggle", "reset"],
  leave() {
    editing = false;
  },
  async load() {
    const [col, deck, t] = await Promise.all([
      api<{ cards: CardRow[] }>("/collection"),
      api<{ repoIds: number[] }>("/deck"),
      trial ? Promise.resolve(trial) : api<{ cards: Record<string, CardInfo>; decks: string[][] }>("/trial"),
    ]);
    trial = t;
    ready = col.cards.filter((c) => c.status === "ready" && c.card);
    waiting = col.cards.filter((c) => !(c.status === "ready" && c.card));
    saved = deck.repoIds;
    if (!editing) selected = new Set(saved.filter((id) => ready.some((c) => c.id === id)));
  },
  view() {
    const chosen = ready.filter((c) => selected.has(c.id)).map((c) => ({ ...c.card!, abilityText: c.abilityText }));
    const full = selected.size === DECK_SIZE;
    const changed = editing && (saved.length !== selected.size || saved.some((id) => !selected.has(id)));
    const tiles = ready
      .map((c) => {
        const on = selected.has(c.id);
        return cardTile(
          { ...c.card!, abilityText: c.abilityText },
          {
            action: "toggle",
            data: { id: c.id },
            className: on ? "selected" : full ? "disabled-soft" : "playable",
            note: on ? "덱에 포함 (눌러서 빼기)" : full ? "7장이 찼습니다" : "눌러서 넣기",
          },
        );
      })
      .join("");

    const trialHtml = trial?.decks[0]
      ? `<section><h2>체험 덱 미리보기</h2>
          <p class="muted">대전 화면에서 '체험 덱'을 고르면 쓰는 가상 카드 7장입니다. 실제 Repo 카드가 아니며 소유하지 않아도 씁니다.</p>
          <div class="cards">${trial.decks[0].map((id) => (trial!.cards[id] ? cardTile(trial!.cards[id]!) : "")).join("")}</div>
        </section>`
      : "";

    return `<section>
      <h1>덱 편집</h1>
      <p>분석이 끝난 내 카드 중 <b>서로 다른 7장</b>을 골라 저장하세요. 대전에서 '내 덱'을 고르면 이 덱을 씁니다.</p>
      <div class="deck-bar ${full ? "full" : ""}">
        <b>${selected.size} / ${DECK_SIZE}장</b>
        <button class="primary" data-action="save" ${full && changed ? "" : "disabled"}>${
          full ? (changed ? "덱 저장" : "저장됨") : `${DECK_SIZE - selected.size}장 더 고르세요`
        }</button>
        ${editing ? `<button data-action="reset">되돌리기</button>` : ""}
        <a href="#/play">대전하러 가기</a>
      </div>
      ${chosen.length ? `<h3>고른 카드 구성</h3>${summary(chosen)}` : ""}
      ${
        ready.length
          ? `<div class="cards">${tiles}</div>`
          : `<p>분석이 끝난 카드가 아직 없습니다. 그동안 체험 덱으로 대전할 수 있습니다.</p>`
      }
      ${
        waiting.length
          ? `<p class="muted">아직 쓸 수 없는 카드 ${waiting.length}장: ${waiting
              .map((c) => h(c.full_name))
              .join(", ")} (분석 중이거나 실패. 시작 화면에서 확인)</p>`
          : ""
      }
    </section>${trialHtml}`;
  },
  actions: {
    toggle: (el) => {
      editing = true;
      const id = Number(el.dataset.id);
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < DECK_SIZE) selected.add(id);
    },
    reset: () => {
      editing = false;
    },
    save: async () => {
      if (selected.size !== DECK_SIZE) return;
      await put("/deck", { repoIds: [...selected] });
      editing = false;
      notify("덱을 저장했습니다. 대전 화면에서 '내 덱'을 고를 수 있습니다.");
    },
  },
};
