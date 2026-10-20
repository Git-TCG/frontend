import { h } from "./html";

export interface CardInfo {
  id?: string;
  name: string;
  grade: string;
  role: string;
  cost: number;
  attack: number;
  durability: number;
  ability?: { effect: string; amount: number } | null;
  abilityText?: string | null;
  source?: { fullName: string; url: string; owner: string };
  concept?: string;
}

export const ROLE_LABEL: Record<string, string> = {
  attack: "공격",
  defense: "방어",
  support: "지원",
  control: "제어",
  explore: "탐색",
};

export const ROLE_HINT: Record<string, string> = {
  attack: "공격력이 높고 내구도가 낮습니다.",
  defense: "내구도가 높아 오래 버팁니다.",
  support: "아군을 돕는 능력이 있습니다.",
  control: "상대 프로젝트를 방해합니다.",
  explore: "카드를 더 뽑거나 고릅니다.",
};

export const GRADE_HINT = "등급은 Stars·Forks·활동·협업·릴리스로 정합니다. 높을수록 비용과 능력이 큽니다.";

export interface TileOptions {
  /** 추가 CSS 클래스(selected, playable 등) */
  className?: string;
  /** data-action 속성. 누를 수 있는 카드일 때. */
  action?: string;
  data?: Record<string, string | number>;
  /** 카드 아래 작은 안내 문구 */
  note?: string;
  showSource?: boolean;
}

/** 카드 한 장. 비용·이름·공격/내구·능력이 한눈에 보이게 그린다. */
export function cardTile(card: CardInfo, opts: TileOptions = {}): string {
  const data = Object.entries(opts.data ?? {})
    .map(([k, v]) => ` data-${k}="${h(v)}"`)
    .join("");
  const tag = opts.action ? "button" : "div";
  const action = opts.action ? ` data-action="${opts.action}" type="button"` : "";
  const source =
    opts.showSource && card.source
      ? `<a class="card-source" href="${h(card.source.url)}" target="_blank" rel="noopener">${h(card.source.fullName)}</a>`
      : "";
  return `<${tag} class="card ${opts.className ?? ""}"${action}${data}>
    <span class="card-top"><span class="cost" title="배치 비용(자원)">${card.cost}</span>
      <span class="grade grade-${h(card.grade)}" title="${h(GRADE_HINT)}">${h(card.grade)}</span>
      <span class="role" title="${h(ROLE_HINT[card.role] ?? "")}">${h(ROLE_LABEL[card.role] ?? card.role)}</span></span>
    <span class="card-name">${h(card.name)}</span>
    <span class="stats"><span title="공격력">공격 ${card.attack}</span> · <span title="내구도">내구 ${card.durability}</span></span>
    <span class="ability">${h(card.abilityText ?? "능력 없음")}</span>
    ${source}
    ${opts.note ? `<span class="card-note">${h(opts.note)}</span>` : ""}
  </${tag}>`;
}
