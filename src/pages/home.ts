import { api, post } from "../api";
import { notify, refreshMe, session, type Page } from "../app";
import { formatDate, h } from "../html";

interface Status {
  consent: boolean;
  allocated: boolean;
  owned: number;
  ready: number;
  starterMissing: number | null;
  poolReady: number;
  canPlayOwned: boolean;
  jobs: { id: number; kind: string; status: string; attempts: number; last_error: string | null; repo_id: number | null; updated_at: string }[];
}

let status: Status | null = null;

const JOB_LABEL: Record<string, string> = { collect: "Repo 수집", sync: "신규 Repo 동기화", card: "카드 분석" };
const JOB_STATUS: Record<string, string> = { queued: "대기", running: "진행 중", done: "완료", error: "실패" };

function loginView() {
  return `<section>
    <h1>Repo TCG</h1>
    <p>GitHub 공개 Repo를 카드로 만들어 1대1로 대전합니다.</p>
    <p>로그인하면 GitHub 계정 ID와 공개 프로필만 확인합니다. Repo 분석은 로그인 후 별도로 동의해야 시작합니다.</p>
    <a class="button" href="/api/auth/github/start">GitHub로 로그인</a>
  </section>`;
}

function consentView() {
  return `<section>
    <h2>카드 이용 동의</h2>
    <ul>
      <li>본인 소유 공개 Repo(Fork·빈 Repo·프로필 Repo 제외)의 공개 정보와 README를 분석해 카드로 만듭니다.</li>
      <li>카드에는 원작자와 원본 Repo 링크가 표시됩니다.</li>
      <li>Repo가 10개를 넘으면 11번째부터 공용 풀 후보로 등록될 수 있고, 다른 사용자에게 카드 사본이 발급될 수 있습니다.</li>
      <li>카드 사본이 발급되어도 GitHub Repo나 소유권은 이전되지 않습니다.</li>
    </ul>
    <button data-action="consent">동의하고 수집 시작</button>
  </section>`;
}

function statusView(s: Status) {
  const jobs = s.jobs.length
    ? `<table><thead><tr><th>작업</th><th>상태</th><th>시도</th><th>메시지</th><th>갱신</th></tr></thead><tbody>${s.jobs
        .map(
          (j) => `<tr><td>${h(JOB_LABEL[j.kind] ?? j.kind)}${j.repo_id ? ` #${j.repo_id}` : ""}</td>
          <td>${h(JOB_STATUS[j.status] ?? j.status)}</td><td>${j.attempts}</td>
          <td>${h(j.last_error ?? "")}</td><td>${h(formatDate(j.updated_at))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "<p>등록된 작업이 없습니다.</p>";
  return `<section>
    <h2>수집 상태</h2>
    <p>첫 배정: ${s.allocated ? "완료" : "진행 중 (잠시 후 새로고침)"} · 보유 카드 ${s.owned}장 · 분석 완료 ${s.ready}장 · 공용 풀 ${s.poolReady}장</p>
    ${s.starterMissing ? `<p>시작 카드가 ${s.starterMissing}장 부족합니다. 공용 카드가 준비되면 자동으로 채워집니다.</p>` : ""}
    ${s.canPlayOwned ? "<p>내 카드로 대전할 수 있습니다. <a href=\"#/deck\">덱 편집</a></p>" : "<p>카드 7장이 분석될 때까지 체험 덱으로 대전할 수 있습니다. <a href=\"#/play\">대전</a></p>"}
    <div class="row">
      <button data-action="refresh">새로고침</button>
      <button data-action="retry">실패한 수집·분석 다시 시도</button>
      <button data-action="sync" ${s.allocated ? "" : "disabled"}>새 Repo 동기화 (하루 1회)</button>
    </div>
    <h3>작업</h3>
    ${jobs}
  </section>`;
}

export const homePage: Page = {
  title: "시작",
  async load() {
    await refreshMe();
    status = session.me?.consentAt ? await api<Status>("/status") : null;
  },
  view() {
    const me = session.me;
    if (!me) return loginView();
    const params = new URLSearchParams(location.search);
    const loginMessage =
      params.get("login") === "denied"
        ? "<p class=\"error\">GitHub 로그인을 취소했습니다.</p>"
        : params.get("login") === "error"
          ? "<p class=\"error\">GitHub 로그인에 실패했습니다. 다시 시도하세요.</p>"
          : "";
    return `${loginMessage}<section>
      <h1>${h(me.name ?? me.login)}님</h1>
      <p>발견 토큰 ${me.tokens}개 · 외형 재화 ${me.cosmetics}개 · 정상 대전 ${me.normalMatches}회</p>
    </section>
    ${me.consentAt && status ? statusView(status) : consentView()}`;
  },
  actions: {
    consent: () => post("/consent"),
    refresh: () => undefined,
    retry: async () => {
      await post("/status/retry");
      notify("다시 시도하도록 등록했습니다.");
    },
    sync: async () => {
      await post("/repos/sync");
      notify("동기화 작업을 등록했습니다. 오늘 이미 등록했다면 기존 작업이 유지됩니다.");
    },
  },
};
