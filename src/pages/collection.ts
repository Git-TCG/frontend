import { api } from "../api";
import { type Page } from "../app";
import { h } from "../html";

interface CardRow {
  id: number;
  name: string;
  full_name: string;
  url: string;
  owner_login: string;
  description: string | null;
  source: string;
  status: string | null;
  card: {
    name: string;
    grade: string;
    role: string;
    cost: number;
    attack: number;
    durability: number;
  } | null;
  abilityText: string | null;
  reason: string | null;
}

let cards: CardRow[] = [];
let detailId: number | null = null;
let detail: { versions: CardRow[] } | null = null;

const STATUS: Record<string, string> = { ready: "준비됨", pending: "분석 중", error: "실패" };
const ROLE: Record<string, string> = {
  attack: "공격",
  defense: "방어",
  support: "지원",
  control: "제어",
  explore: "탐색",
};

export const collectionPage: Page = {
  title: "컬렉션",
  requiresLogin: true,
  async load() {
    const r = await api<{ cards: CardRow[] }>("/collection");
    cards = r.cards;
    if (detailId !== null) {
      detail = await api(`/cards/${detailId}`);
    }
  },
  view() {
    const list = cards.length
      ? `<table><thead><tr><th>카드</th><th>등급</th><th>역할</th><th>비용</th><th>상태</th><th></th></tr></thead><tbody>${cards
          .map((c) => {
            const card = c.card;
            return `<tr>
              <td>${h(card?.name ?? c.name)}<br><small>${h(c.full_name)}</small></td>
              <td>${h(card?.grade ?? "-")}</td>
              <td>${h(card ? (ROLE[card.role] ?? card.role) : "-")}</td>
              <td>${card?.cost ?? "-"}</td>
              <td>${h(STATUS[c.status ?? ""] ?? c.status ?? "대기")}</td>
              <td><button data-action="detail" data-id="${c.id}">상세</button></td>
            </tr>`;
          })
          .join("")}</tbody></table>`
      : "<p>보유 카드가 없습니다. 시작 화면에서 수집을 완료하세요.</p>";

    let detailHtml = "";
    if (detail && detail.versions[0]) {
      const v = detail.versions[0];
      const card = v.card;
      detailHtml = `<section>
        <h2>${h(card?.name ?? v.name)}</h2>
        <p><a href="${h(v.url)}" target="_blank" rel="noopener">${h(v.full_name)}</a> · ${h(v.owner_login)}</p>
        <p>${h(v.description ?? "")}</p>
        ${card ? `<p>등급 ${h(card.grade)} · ${h(ROLE[card.role] ?? card.role)} · 비용 ${card.cost} · 공격 ${card.attack} · 내구 ${card.durability}</p>
        <p>${h(v.abilityText ?? "")}</p>` : ""}
        ${v.reason ? `<p class="error">${h(v.reason)}</p>` : ""}
        <button data-action="close">닫기</button>
      </section>`;
    }

    return `<section><h1>컬렉션</h1><p>보유 ${cards.length}장</p>${list}</section>${detailHtml}`;
  },
  actions: {
    detail: async (el) => {
      detailId = Number(el.dataset.id);
      detail = await api(`/cards/${detailId}`);
    },
    close: () => {
      detailId = null;
      detail = null;
    },
  },
};
