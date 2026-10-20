import { api, post } from "../api";
import { notify, refreshMe, render, session, type Page } from "../app";
import { formatDate, h } from "../html";

interface Status {
  consent: boolean;
  allocated: boolean;
  owned: number;
  ready: number;
  starterMissing: number | null;
  poolReady: number;
  canPlayOwned: boolean;
  tutorialDone: boolean;
  jobs: {
    id: number;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
    repo_id: number | null;
    updated_at: string;
  }[];
}

let status: Status | null = null;
let deckSaved = false;
/** 자동 새로고침 때 펼친 진행 상황이 접히지 않도록 기억한다. */
let jobsOpen = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const JOB_LABEL: Record<string, string> = { collect: "Repo 수집", sync: "새 Repo 동기화", card: "카드 분석" };
const JOB_STATUS: Record<string, string> = { queued: "대기", running: "진행 중", done: "완료", error: "실패" };

function loginView() {
  return `<section class="hero">
    <h1>Repo TCG</h1>
    <p>내 GitHub 공개 Repo가 카드가 됩니다. 카드 7장으로 덱을 만들어 1대1로 대전하세요.</p>
    <div class="row">
      <a class="button primary" href="/api/auth/github/start">GitHub로 로그인</a>
      <a class="button" href="#/tutorial">규칙 먼저 보기</a>
    </div>
    <p class="muted">로그인하면 GitHub 계정 ID와 공개 프로필만 확인합니다. Repo 분석은 로그인한 뒤 따로 동의해야 시작합니다.</p>
  </section>`;
}

interface Step {
  done: boolean;
  title: string;
  detail: string;
  action?: string;
}

function steps(s: Status | null): Step[] {
  const me = session.me!;
  const consent = !!me.consentAt;
  const collecting = consent && !s?.allocated;
  const analyzing = !!s && s.allocated && s.ready < Math.min(7, s.owned);
  return [
    { done: true, title: "GitHub 로그인", detail: `${me.login} 계정으로 로그인했습니다.` },
    {
      done: consent,
      title: "카드 이용 동의",
      detail: consent ? "동의했습니다." : "내 공개 Repo를 카드로 만들려면 아래 안내를 읽고 동의하세요.",
      action: consent ? undefined : `<a class="button primary" href="#/home" data-scroll="consent">동의하러 가기</a>`,
    },
    {
      done: !!s?.allocated && !analyzing,
      title: "내 카드 만들기",
      detail: !consent
        ? "동의하면 자동으로 시작합니다."
        : collecting
          ? "Repo 목록을 모으는 중입니다. 몇 분 걸릴 수 있습니다."
          : analyzing
            ? `카드 ${s!.owned}장 중 ${s!.ready}장 분석을 마쳤습니다. 기다리는 동안 연습 대전을 해 보세요.`
            : `카드 ${s?.owned ?? 0}장을 받았습니다.${s?.starterMissing ? ` 시작 카드가 ${s.starterMissing}장 모자랍니다. 공용 카드가 준비되면 자동으로 채워집니다.` : ""}`,
      action: consent ? `<a class="button" href="#/collection">컬렉션 보기</a>` : undefined,
    },
    {
      done: !!s?.tutorialDone,
      title: "튜토리얼 · 연습 대전",
      detail: s?.tutorialDone
        ? "튜토리얼 보상을 받았습니다."
        : "규칙을 읽고 체험 덱으로 연습 상대와 4턴 이상 플레이하면 카드 1장을 받습니다.",
      action: `<a class="button ${s?.tutorialDone ? "" : "primary"}" href="#/tutorial">튜토리얼</a>`,
    },
    {
      done: deckSaved,
      title: "내 덱 저장",
      detail: deckSaved
        ? "덱을 저장했습니다."
        : s?.canPlayOwned
          ? "분석이 끝난 카드 중 7장을 골라 덱을 저장하세요."
          : "분석이 끝난 카드가 7장이 되면 덱을 만들 수 있습니다.",
      action: s?.canPlayOwned ? `<a class="button" href="#/deck">덱 편집</a>` : undefined,
    },
    {
      done: me.normalMatches > 0,
      title: "다른 플레이어와 대전",
      detail: `정상 대전 ${me.normalMatches}회. 3회·7회를 채우면 카드를 받고, 매일 첫 대전에서 발견 토큰을 받습니다.`,
      action: `<a class="button" href="#/play">대전하기</a>`,
    },
  ];
}

function checklist(s: Status | null) {
  const list = steps(s);
  const next = list.findIndex((x) => !x.done);
  return `<section>
    <h2>다음에 할 일</h2>
    <ol class="steps">${list
      .map(
        (x, i) => `<li class="${x.done ? "done" : i === next ? "next" : ""}">
          <span class="mark">${x.done ? "완료" : i === next ? "지금" : "예정"}</span>
          <div><b>${h(x.title)}</b><p>${h(x.detail)}</p></div>
          <div>${x.action ?? ""}</div>
        </li>`,
      )
      .join("")}</ol>
  </section>`;
}

function consentView() {
  return `<section id="consent">
    <h2>카드 이용 동의</h2>
    <ul>
      <li>본인 소유 공개 Repo(Fork·빈 Repo·프로필 Repo 제외)의 공개 정보와 README를 분석해 카드로 만듭니다.</li>
      <li>카드에는 원작자와 원본 Repo 링크가 표시됩니다.</li>
      <li>Repo가 10개를 넘으면 11번째부터 공용 풀 후보로 등록될 수 있고, 다른 사용자에게 카드 사본이 발급될 수 있습니다.</li>
      <li>카드 사본이 발급되어도 GitHub Repo나 소유권은 이전되지 않습니다.</li>
    </ul>
    <button class="primary" data-action="consent">동의하고 내 카드 만들기 시작</button>
  </section>`;
}

function jobsView(s: Status) {
  const failed = s.jobs.filter((j) => j.status === "error").length;
  const rows = s.jobs
    .map(
      (j) => `<tr><td>${h(JOB_LABEL[j.kind] ?? j.kind)}${j.repo_id ? ` #${j.repo_id}` : ""}</td>
        <td>${h(JOB_STATUS[j.status] ?? j.status)}</td><td>${j.attempts}</td>
        <td>${h(j.last_error ?? "")}</td><td>${h(formatDate(j.updated_at))}</td></tr>`,
    )
    .join("");
  return `<section>
    <details id="jobs" ${failed || jobsOpen ? "open" : ""}>
      <summary>카드 만들기 진행 상황 (작업 ${s.jobs.length}개${failed ? `, 실패 ${failed}개` : ""})</summary>
      ${s.jobs.length ? `<table><thead><tr><th>작업</th><th>상태</th><th>시도</th><th>메시지</th><th>갱신</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>등록된 작업이 없습니다.</p>"}
      <div class="row">
        <button data-action="retry" ${failed ? "" : "disabled"} title="실패한 수집·분석을 다시 시도합니다">실패한 작업 다시 시도</button>
        <button data-action="sync" ${s.allocated ? "" : "disabled"} title="GitHub에 새로 만든 Repo를 가져옵니다. 하루 1번.">새 Repo 가져오기</button>
      </div>
      <p class="muted">새 Repo는 개인 한도(10개) 안이면 보상으로 받을 수 있는 후보가 되고, 넘으면 공용 후보가 됩니다. 바로 카드로 지급되지는 않습니다.</p>
    </details>
  </section>`;
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  const s = status;
  const busy = s && s.jobs.some((j) => j.status === "queued" || j.status === "running");
  const onHome = ["", "home"].includes(location.hash.replace(/^#\/?/, ""));
  if (busy && onHome) {
    refreshTimer = setTimeout(async () => {
      try {
        jobsOpen = (document.getElementById("jobs") as HTMLDetailsElement | null)?.open ?? jobsOpen;
        await homePage.load?.();
        render();
      } catch {
        /* 다음 주기 */
      }
    }, 5000);
  }
}

export const homePage: Page = {
  title: "시작",
  leave() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  },
  async load() {
    await refreshMe();
    if (session.me?.consentAt) {
      const [s, deck] = await Promise.all([api<Status>("/status"), api<{ repoIds: number[] }>("/deck")]);
      status = s;
      deckSaved = deck.repoIds.length === 7;
    } else {
      status = null;
    }
    scheduleRefresh();
  },
  view() {
    const me = session.me;
    if (!me) return loginView();
    const params = new URLSearchParams(location.search);
    const loginMessage =
      params.get("login") === "denied"
        ? `<div class="error">GitHub 로그인을 취소했습니다.</div>`
        : params.get("login") === "error"
          ? `<div class="error">GitHub 로그인에 실패했습니다. 다시 시도하세요.</div>`
          : "";
    return `${loginMessage}<section>
      <h1>${h(me.name ?? me.login)}님, 안녕하세요</h1>
      <p>발견 토큰 <b>${me.tokens}</b>개 · 정상 대전 <b>${me.normalMatches}</b>회 · 외형 재화 ${me.cosmetics}개</p>
      <div class="row"><a class="button primary" href="#/play">바로 대전하기</a><a class="button" href="#/help">도움말</a></div>
    </section>
    ${checklist(status)}
    ${me.consentAt ? (status ? jobsView(status) : "") : consentView()}`;
  },
  actions: {
    consent: async () => {
      await post("/consent");
      notify("동의했습니다. 내 Repo를 모아 카드로 만드는 중입니다. 이 화면이 자동으로 새로고침됩니다.");
    },
    retry: async () => {
      await post("/status/retry");
      notify("실패한 작업을 다시 시도합니다.");
    },
    sync: async () => {
      await post("/repos/sync");
      notify("새 Repo를 가져오는 작업을 등록했습니다. 하루에 한 번만 실행됩니다.");
    },
  },
};
