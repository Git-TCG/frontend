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

/** 능력 이름(도움말의 능력 목록과 같다). */
export const ABILITY_NAME: Record<string, string> = {
  rush: "즉시 공격",
  strike: "타격",
  ping: "코어 공격",
  scout: "탐색",
  draw: "드로우",
  fortify: "코어 회복",
  freeze: "빙결",
  weaken: "약화",
  repair: "수리",
  overclock: "오버클럭",
  inspire: "응원",
  shield: "방어막",
  backup: "백업",
  explode: "폭발",
};

export const GRADE_HINT = "등급은 Stars·Forks·활동·협업·릴리스로 정합니다. 높을수록 비용과 능력이 큽니다.";
const GRADE_STARS: Record<string, number> = { C: 1, B: 2, A: 3, S: 4, SS: 5 };

export function cardImageUrl(card: CardInfo): string | null {
  return card.id ? `/api/card-images/${encodeURIComponent(card.id)}` : null;
}

export interface TileOptions {
  /** 추가 CSS 클래스(selected, playable, target 등) */
  className?: string;
  /** data-action 속성. 누를 수 있는 카드일 때. */
  action?: string;
  data?: Record<string, string | number>;
  /** 카드 아래 작은 안내 문구 */
  note?: string;
  /** 필드에 놓인 프로젝트: 현재 공격력·내구도를 보여 준다. */
  live?: { attack: number; durability: number; maxDurability: number };
  /** 필드용 작은 카드(능력 문구를 줄여 보여 준다). */
  compact?: boolean;
  /** 카드 아래에 덧붙일 HTML(상태 표시 등). 호출하는 쪽에서 이스케이프해야 한다. */
  extra?: string;
}

/**
 * 트레이딩 카드 한 장: 이름·비용 → 일러스트 → 종류 줄 → 능력·설명 → 공격/내구 → 출처.
 * 역할마다 테두리 색이 다르고, 등급은 별 개수와 S 이상의 반짝임으로 보여 준다.
 */
export function cardTile(card: CardInfo, opts: TileOptions = {}): string {
  const data = Object.entries(opts.data ?? {})
    .map(([k, v]) => ` data-${k}="${h(v)}"`)
    .join("");
  const tag = opts.action ? "button" : "div";
  const action = opts.action ? ` data-action="${opts.action}" type="button"` : "";
  const img = cardImageUrl(card);
  const stars = "★".repeat(GRADE_STARS[card.grade] ?? 1);
  const attack = opts.live?.attack ?? card.attack;
  const durability = opts.live ? `${opts.live.durability}/${opts.live.maxDurability}` : String(card.durability);
  const hurt = opts.live && opts.live.durability < opts.live.maxDurability;
  const abilityName = card.ability ? ABILITY_NAME[card.ability.effect] ?? card.ability.effect : null;
  const classes = [
    "tcg",
    `role-${h(card.role)}`,
    `grade-${h(card.grade)}`,
    opts.compact ? "compact" : "",
    opts.className ?? "",
  ].join(" ");

  return `<${tag} class="${classes}"${action}${data}>
    <span class="tcg-head">
      <span class="tcg-name">${h(card.name)}</span>
      <span class="tcg-cost" title="배치 비용(자원)">${card.cost}</span>
    </span>
    <span class="tcg-art">
      <span class="tcg-art-fallback" aria-hidden="true">${h([...card.name][0] ?? "?")}</span>
      ${img ? `<img src="${img}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <span class="tcg-rarity" title="${h(GRADE_HINT)}">${stars} ${h(card.grade)}</span>
    </span>
    <span class="tcg-type" title="${h(ROLE_HINT[card.role] ?? "")}">【${h(ROLE_LABEL[card.role] ?? card.role)} · ${h(card.grade)}등급】</span>
    <span class="tcg-text">
      ${abilityName ? `<b class="tcg-ability-name">${h(abilityName)}</b>` : ""}
      <span class="tcg-ability">${h(card.abilityText ?? "능력 없음")}</span>
      ${!opts.compact && card.concept ? `<i class="tcg-flavor">${h(card.concept)}</i>` : ""}
    </span>
    <span class="tcg-stats">
      <span class="tcg-atk" title="공격력">ATK ${attack}</span>
      <span class="tcg-def ${hurt ? "hurt" : ""}" title="내구도">DEF ${durability}</span>
    </span>
    ${!opts.compact && card.source ? `<span class="tcg-foot">${h(card.source.fullName)}</span>` : ""}
    ${opts.extra ?? ""}
    ${opts.note ? `<span class="tcg-note">${h(opts.note)}</span>` : ""}
  </${tag}>`;
}
