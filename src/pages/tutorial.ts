import { post } from "../api";
import { session, type Page } from "../app";
import { cardTile } from "../cards";

interface Step {
  title: string;
  body: string;
}

/** 실제 대전 화면과 같은 모양의 작은 그림. */
const miniBoard = (opp: string[], mine: string[], note = "") => `<div class="mini-board">
  <div class="mini-row">${opp.map((x) => `<span class="${x ? "u" : ""}">${x || "빈 칸"}</span>`).join("")}</div>
  <div class="mini-mid">상대 ↑ · 같은 번호 칸끼리 맞은편 · 나 ↓</div>
  <div class="mini-row">${mine.map((x) => `<span class="${x ? "u mine" : ""}">${x || "빈 칸"}</span>`).join("")}</div>
  ${note ? `<p class="muted">${note}</p>` : ""}
</div>`;

const STEPS: Step[] = [
  {
    title: "1. 목표",
    body: `<p>내 GitHub Repo가 <b>카드</b>가 됩니다. 카드를 필드에 내서 상대 <b>코어</b>(체력 15)를 0으로 만들면 이깁니다.</p>
      <p>덱은 서로 다른 카드 <b>7장</b>, 필드는 <b>3칸</b>입니다. 한 경기는 5~8분 정도 걸립니다.</p>`,
  },
  {
    title: "2. 카드 읽는 법",
    body: `<div class="demo">${cardTile({
      id: "sample-04",
      name: "기록 보관소",
      grade: "B",
      role: "support",
      cost: 2,
      attack: 1,
      durability: 3,
      ability: { effect: "repair", amount: 1 },
      abilityText: "내 턴 종료 시: 인접 아군 중 가장 많이 손상된 하나의 내구도를 1 회복한다.",
    })}</div>
      <ul>
        <li><b>오른쪽 위 동그라미 숫자</b>: 배치 비용. 이만큼 자원을 씁니다.</li>
        <li><b>별과 등급(C~SS)</b>: Repo의 Stars·Forks·활동으로 정해집니다. 높을수록 비싸고 강합니다. 테두리 색은 역할(공격·방어·지원·제어·탐색)입니다.</li>
        <li><b>ATK</b>(공격력): 공격할 때 주는 피해. <b>DEF</b>(내구도): 받을 수 있는 피해. 0이 되면 파괴됩니다.</li>
        <li><b>능력</b>: 카드마다 하나. 언제 발동하는지(배치 시, 턴 종료 시 등)가 앞에 적혀 있습니다.</li>
      </ul>`,
  },
  {
    title: "3. 턴의 흐름",
    body: `<ol>
        <li><b>턴 시작</b>: 자원 최대치가 1 늘고(최대 5) 가득 찹니다. 카드 1장을 뽑습니다.</li>
        <li><b>① 배치 단계</b>: 손패 카드를 눌러 빈 칸에 냅니다. 자원이 남는 만큼 여러 장 낼 수 있습니다.</li>
        <li><b>② 전투 단계</b>: 프로젝트마다 한 번씩 공격합니다. 전투 단계로 넘어가면 배치 단계로 돌아갈 수 없습니다.</li>
        <li><b>턴 종료</b>: [턴 종료]를 누르면 상대 턴이 됩니다. 남은 자원은 사라집니다.</li>
      </ol>
      <p>한 턴은 <b>45초</b>입니다. 시간이 지나면 자동으로 턴이 끝나고, 2턴 연속 아무것도 하지 않으면 패배합니다.</p>`,
  },
  {
    title: "4. 배치하기",
    body: `<p>손패에서 낼 카드를 누르면, 놓을 수 있는 내 빈 칸이 초록색으로 표시됩니다. 칸을 누르면 배치됩니다.</p>
      ${miniBoard(["", "방화벽", ""], ["검색 드론", "▶ 여기", ""], "능력 대상이 필요한 카드는 칸을 고른 뒤 상대 프로젝트를 한 번 더 고릅니다.")}
      <p><b>배치한 턴에는 공격할 수 없습니다.</b> ('배치한 턴부터 공격 가능' 능력은 예외)</p>`,
  },
  {
    title: "5. 공격하기",
    body: `<p>'공격 가능' 표시가 있는 내 프로젝트를 누르면 공격할 수 있는 대상이 빨간색으로 표시됩니다.</p>
      <ul>
        <li><b>맞은편에 적이 있으면</b> 그 적만 공격할 수 있습니다.</li>
        <li>맞은편이 비었으면 <b>다른 칸의 적</b> 중에서 고릅니다.</li>
        <li>상대 필드가 <b>완전히 비었을 때만 코어</b>를 공격합니다.</li>
      </ul>
      ${miniBoard(["방화벽 1/2", "", ""], ["검색 드론 2/2", "작업 로봇 3/3", ""], "드론이 방화벽을 먼저 부수면 상대 필드가 비어 로봇이 코어를 칠 수 있습니다. 공격 순서가 중요합니다.")}
      <p>프로젝트끼리 싸우면 <b>서로 동시에</b> 피해를 줍니다. 코어는 반격하지 않습니다.</p>`,
  },
  {
    title: "6. 덱이 떨어지면",
    body: `<p>뽑을 카드가 없으면 버린 카드를 섞어 덱을 다시 만들고, <b>내 코어가 2 피해</b>를 받습니다. 덱이 7장뿐이라 길게 끌면 불리합니다.</p>
      <p>손패는 최대 7장입니다. 넘치면 뽑은 카드는 버려집니다. 필요 없는 프로젝트는 턴당 1번 <b>폐기</b>해 칸을 비울 수 있습니다.</p>`,
  },
  {
    title: "7. 카드 모으기",
    body: `<ul>
        <li>처음에 내 Repo 중 7장을 받습니다. Repo가 적으면 공용 카드로 채워집니다.</li>
        <li>연습 대전에서 4턴 이상 플레이하면 <b>튜토리얼 보상</b>으로 카드 1장을 받습니다.</li>
        <li>다른 플레이어와 정상 대전 3회, 7회를 채우면 카드를 1장씩 받습니다.</li>
        <li>매일 첫 정상 대전에서 <b>발견 토큰</b> 1개를 받고, 3개를 모으면 후보 3장 중 1장을 고릅니다.</li>
      </ul>
      <p>준비가 끝났습니다. 체험 덱으로 연습 상대와 한 판 해 보세요.</p>`,
  },
];

let step = 0;

export const tutorialPage: Page = {
  title: "튜토리얼",
  local: ["go", "prev", "next"],
  view() {
    const s = STEPS[step]!;
    const dots = STEPS.map(
      (x, i) => `<button class="dot ${i === step ? "on" : ""}" data-action="go" data-i="${i}" title="${x.title}">${i + 1}</button>`,
    ).join("");
    const last = step === STEPS.length - 1;
    return `<section class="tutorial">
      <h1>튜토리얼</h1>
      <div class="row">${dots}</div>
      <h2>${s.title}</h2>
      ${s.body}
      <div class="row nav-row">
        <button data-action="prev" ${step === 0 ? "disabled" : ""}>이전</button>
        ${
          last
            ? session.me
              ? `<button class="primary" data-action="practice">체험 덱으로 연습 대전 시작</button>`
              : `<a class="button primary" href="/api/auth/github/start">GitHub로 로그인하고 시작</a>`
            : `<button class="primary" data-action="next">다음</button>`
        }
      </div>
      <p class="muted">규칙 전체는 <a href="#/help">도움말</a>에서 다시 볼 수 있습니다.</p>
    </section>`;
  },
  actions: {
    go: (el) => {
      step = Number(el.dataset.i);
    },
    prev: () => {
      step = Math.max(0, step - 1);
    },
    next: () => {
      step = Math.min(STEPS.length - 1, step + 1);
    },
    practice: async () => {
      await post("/queue", { deck: "trial", opponent: "bot" });
      step = 0;
      location.hash = "#/play";
    },
  },
};
