import { api, put } from "../api";
import { notify, type Page } from "../app";
import { h } from "../html";

interface CardRow {
  id: number;
  name: string;
  status: string | null;
  card: { name: string; grade: string; role: string; cost: number } | null;
}

let cards: CardRow[] = [];
let selected = new Set<number>();
let editing = false;

export const deckPage: Page = {
  title: "덱",
  requiresLogin: true,
  leave() {
    editing = false;
  },
  async load() {
    const [col, deck] = await Promise.all([
      api<{ cards: CardRow[] }>("/collection"),
      api<{ repoIds: number[] }>("/deck"),
    ]);
    cards = col.cards.filter((c) => c.status === "ready" && c.card);
    if (!editing) selected = new Set(deck.repoIds);
  },
  view() {
    const rows = cards.length
      ? cards
          .map((c) => {
            const on = selected.has(c.id);
            return `<div class="row">
              <button data-action="toggle" data-id="${c.id}">${on ? "✓" : "○"}</button>
              ${h(c.card!.name)} · ${h(c.card!.grade)} · 비용 ${c.card!.cost} · ${h(c.card!.role)}
            </div>`;
          })
          .join("")
      : "<p>준비된 카드가 없습니다.</p>";
    return `<section>
      <h1>덱 편집</h1>
      <p>서로 다른 카드 7장을 선택하세요. (${selected.size}/7)</p>
      ${rows}
      <div class="row" style="margin-top:1rem">
        <button class="primary" data-action="save" ${selected.size === 7 ? "" : "disabled"}>저장</button>
        <a href="#/play">대전으로</a>
      </div>
      <p>체험 덱으로도 대전할 수 있습니다. 체험 덱은 실제 Repo 카드가 아닙니다.</p>
    </section>`;
  },
  actions: {
    toggle: (el) => {
      editing = true;
      const id = Number(el.dataset.id);
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < 7) selected.add(id);
    },
    save: async () => {
      if (selected.size !== 7) return;
      await put("/deck", { repoIds: [...selected] });
      editing = false;
      notify("덱을 저장했습니다.");
    },
  },
};
