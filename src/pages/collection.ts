import { api } from "../api";
import { type Page } from "../app";
import { cardTile, type CardInfo } from "../cards";
import { h } from "../html";

interface Grade {
  status: string;
  displayScore?: string;
  grade?: string;
  breakdown?: Record<string, number>;
  metrics?: { stars: number; forks: number; activeMonths: number; contributors: number; releaseMonths: number };
  stale?: boolean;
}
interface CardRow {
  id: number;
  name: string;
  full_name: string;
  url: string;
  owner_login: string;
  description: string | null;
  source: string;
  status: string | null;
  card: CardInfo | null;
  grade: Grade | null;
  classification: { evidence?: string[]; concept?: string | null; generic?: boolean } | null;
  abilityText: string | null;
  reason: string | null;
  season_id?: number;
}

let cards: CardRow[] = [];
let detail: CardRow[] | null = null;

const STATUS: Record<string, string> = { ready: "사용 가능", pending: "분석 보류", error: "분석 실패" };
const SOURCE: Record<string, string> = {
  initial: "내 Repo",
  starter_pool: "공용 시작 카드",
  tutorial: "튜토리얼 보상",
  "matches:3": "정상 대전 3회 보상",
  "matches:7": "정상 대전 7회 보상",
  discovery: "발견",
};
const BREAKDOWN: [string, string, number][] = [
  ["stars", "Stars", 25],
  ["forks", "Forks", 15],
  ["activity", "최근 12개월 활동", 30],
  ["collaboration", "협업(기여자)", 15],
  ["releases", "릴리스", 15],
];

function detailView(versions: CardRow[]) {
  const v = versions[0]!;
  const g = v.grade;
  const breakdown =
    g?.breakdown && g.status === "graded"
      ? `<table><tr><th>항목</th><th>점수</th></tr>${BREAKDOWN.map(
          ([k, label, max]) => `<tr><td>${label}</td><td>${(g.breakdown![k] ?? 0).toFixed(1)} / ${max}</td></tr>`,
        ).join("")}<tr><th>합계</th><th>${h(g.displayScore)} / 100 → ${h(g.grade)}등급</th></tr></table>
        ${
          g.metrics
            ? `<p class="muted">Stars ${g.metrics.stars} · Forks ${g.metrics.forks} · 커밋 있는 달 ${g.metrics.activeMonths}/12 · 기여자 ${g.metrics.contributors}명 · 릴리스 있는 달 ${g.metrics.releaseMonths}</p>`
            : ""
        }`
      : "";
  const evidence = v.classification?.evidence?.length
    ? `<h3>역할을 정한 근거</h3><ul>${v.classification.evidence.map((e) => `<li>${h(e)}</li>`).join("")}</ul>`
    : v.classification?.generic
      ? `<p class="muted">정보가 부족해 범용 분류를 적용했습니다.</p>`
      : "";
  return `<section class="detail">
    <div class="row"><h2>${h(v.card?.name ?? v.name)}</h2><button data-action="close">닫기</button></div>
    <p><a href="${h(v.url)}" target="_blank" rel="noopener">${h(v.full_name)}</a> · 원작자 ${h(v.owner_login)}</p>
    ${v.description ? `<p>${h(v.description)}</p>` : ""}
    ${v.card ? cardTile({ ...v.card, abilityText: v.abilityText }) : ""}
    ${v.classification?.concept ? `<p class="muted">외형 콘셉트: ${h(v.classification.concept)}</p>` : ""}
    ${v.reason ? `<p class="warn">${h(v.reason)}</p>` : ""}
    <h3>등급 계산</h3>
    <p class="muted">등급은 코드 품질이 아니라 공개 지표로 정합니다. C 0~20 · B 20~40 · A 40~60 · S 60~80 · SS 80~100</p>
    ${breakdown || "<p>아직 계산되지 않았습니다.</p>"}
    ${evidence}
    ${versions.length > 1 ? `<p class="muted">시즌별 버전 ${versions.length}개</p>` : ""}
  </section>`;
}

export const collectionPage: Page = {
  title: "컬렉션",
  requiresLogin: true,
  local: ["close"],
  async load() {
    const r = await api<{ cards: CardRow[] }>("/collection");
    cards = r.cards;
  },
  view() {
    const usable = cards.filter((c) => c.status === "ready").length;
    const tiles = cards
      .map((c) => {
        const note = `${SOURCE[c.source] ?? c.source} · ${STATUS[c.status ?? ""] ?? "분석 대기"}`;
        if (!c.card) {
          return `<button type="button" class="card disabled" data-action="detail" data-id="${c.id}">
            <span class="card-name">${h(c.full_name)}</span>
            <span class="ability">${h(c.reason ?? "카드를 만드는 중입니다.")}</span>
            <span class="card-note">${h(note)}</span></button>`;
        }
        return cardTile(
          { ...c.card, abilityText: c.abilityText },
          { action: "detail", data: { id: c.id }, className: c.status === "ready" ? "playable" : "disabled", note: `${note} · 눌러서 상세` },
        );
      })
      .join("");
    return `${detail ? detailView(detail) : ""}<section>
      <h1>컬렉션</h1>
      <p>보유 ${cards.length}장 · 대전에 쓸 수 있는 카드 ${usable}장. 카드를 누르면 원본 Repo와 등급 계산을 볼 수 있습니다.</p>
      ${cards.length ? `<div class="cards">${tiles}</div>` : `<p>보유 카드가 없습니다. <a href="#/home">시작 화면</a>에서 카드 이용에 동의하세요.</p>`}
    </section>`;
  },
  actions: {
    detail: async (el) => {
      const r = await api<{ versions: CardRow[] }>(`/cards/${el.dataset.id}`);
      detail = r.versions;
      window.scrollTo({ top: 0 });
    },
    close: () => {
      detail = null;
    },
  },
};
