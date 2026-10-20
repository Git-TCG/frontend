import { api, put } from "../api";
import { notify, type Page } from "../app";
import { cardTile, type CardInfo } from "../cards";
import { h } from "../html";

interface CardRow {
  id: number;
  full_name: string;
  status: string | null;
  card: CardInfo | null;
  abilityText: string | null;
}

const MAX = 3;

let ready: CardRow[] = [];
let saved: number[] | null = null;
let preview: number[] = [];
let selected = new Set<number>();
let auto = true;
let editing = false;

function currentIds(): number[] {
  return auto ? preview : [...selected];
}

export const settingsPage: Page = {
  title: "설정",
  requiresLogin: true,
  local: ["toggle", "auto"],
  leave() {
    editing = false;
  },
  async load() {
    const [col, s] = await Promise.all([
      api<{ cards: CardRow[] }>("/collection"),
      api<{ badgeCardIds: number[] | null; previewIds: number[] }>("/settings"),
    ]);
    ready = col.cards.filter((c) => c.status === "ready" && c.card);
    saved = s.badgeCardIds;
    preview = s.previewIds;
    auto = s.badgeCardIds == null;
    if (!editing) selected = new Set((s.badgeCardIds ?? s.previewIds).filter((id) => ready.some((c) => c.id === id)));
  },
  view() {
    const ids = currentIds();
    const full = !auto && selected.size >= MAX;
    const tiles = ready
      .map((c) => {
        const on = ids.includes(c.id);
        return cardTile(
          { ...c.card!, abilityText: c.abilityText },
          {
            action: "toggle",
            data: { id: c.id },
            className: on ? "selected" : full ? "disabled-soft" : "playable",
            note: on ? "대표 카드 (눌러서 빼기)" : full ? "3장이 찼습니다" : "눌러서 넣기",
          },
        );
      })
      .join("");
    const changed =
      editing &&
      (auto
        ? saved != null
        : saved == null || saved.length !== selected.size || saved.some((id) => !selected.has(id)));
    return `<section>
      <h1>설정</h1>
      <p>GitHub README 전적 배지에 보여줄 대표 카드 최대 ${MAX}장입니다. 고르지 않으면 등급이 높은 카드부터 넣습니다.</p>
      <div class="deck-bar">
        <b>${auto ? "자동" : `${selected.size} / ${MAX}장`}</b>
        <button data-action="auto" class="${auto ? "primary" : ""}">자동으로 고르기</button>
        <button class="primary" data-action="save" ${changed ? "" : "disabled"}>저장</button>
      </div>
      ${
        ready.length
          ? `<div class="cards">${tiles}</div>`
          : `<p>사용 가능한 카드가 없습니다. 카드 분석이 끝나면 여기서 고를 수 있습니다.</p>`
      }
    </section>`;
  },
  actions: {
    toggle: (el) => {
      editing = true;
      auto = false;
      const id = Number(el.dataset.id);
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < MAX) selected.add(id);
    },
    auto: () => {
      editing = true;
      auto = true;
      selected = new Set(preview);
    },
    save: async () => {
      const badgeCardIds = auto ? null : [...selected];
      const r = await put<{ badgeCardIds: number[] | null; previewIds: number[] }>("/settings", { badgeCardIds });
      saved = r.badgeCardIds;
      preview = r.previewIds;
      auto = r.badgeCardIds == null;
      selected = new Set(r.previewIds);
      editing = false;
      notify(auto ? "대표 카드를 자동으로 고르도록 저장했습니다." : "대표 카드를 저장했습니다.");
    },
  },
};
