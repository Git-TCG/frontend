import "./style.css";
import { post } from "./api";
import { mount, refreshMe, run, session, show, type Page } from "./app";
import { h } from "./html";
import { adminPage } from "./pages/admin";
import { collectionPage } from "./pages/collection";
import { deckPage } from "./pages/deck";
import { discoveryPage } from "./pages/discovery";
import { helpPage } from "./pages/help";
import { homePage } from "./pages/home";
import { playPage } from "./pages/play";
import { settingsPage } from "./pages/settings";
import { tutorialPage } from "./pages/tutorial";

const PAGES: Record<string, Page> = {
  home: homePage,
  play: playPage,
  deck: deckPage,
  collection: collectionPage,
  discovery: discoveryPage,
  tutorial: tutorialPage,
  help: helpPage,
  settings: settingsPage,
  admin: adminPage,
};
/** 메뉴. 세 번째 값이 true면 로그인해야 보인다. */
const NAV: [string, string, boolean][] = [
  ["home", "시작", false],
  ["play", "대전", true],
  ["deck", "덱", true],
  ["collection", "컬렉션", true],
  ["discovery", "발견", true],
  ["tutorial", "튜토리얼", false],
  ["help", "도움말", false],
  ["settings", "설정", true],
];

function pageName() {
  const name = location.hash.replace(/^#\/?/, "") || "home";
  return PAGES[name] ? name : "home";
}

function navigation() {
  const me = session.me;
  const active = pageName();
  const items: [string, string, boolean][] = me?.isAdmin ? [...NAV, ["admin", "관리자", true]] : NAV;
  const links = items
    .filter(([, , needsLogin]) => !needsLogin || me)
    .map(([name, label]) => `<a href="#/${name}" class="${name === active ? "active" : ""}">${label}</a>`)
    .join("");
  const account = me
    ? `<span class="who">${me.avatarUrl ? `<img class="who-avatar" src="${h(me.avatarUrl)}" alt="" width="28" height="28"/>` : ""}<span>${h(me.login)} · 토큰 ${me.tokens}</span></span> <button id="logout">로그아웃</button>`
    : `<a class="button primary" href="/api/auth/github/start">GitHub로 로그인</a>`;
  return `<header><a class="brand" href="#/home"><img class="brand-logo" src="/logo-light.svg" width="36" height="36" alt=""/>Repo TCG</a><nav>${links}</nav><div class="account">${account}</div></header>`;
}

const root = document.querySelector<HTMLElement>("#app")!;
mount(root, navigation);

root.addEventListener("click", (ev) => {
  const target = ev.target as HTMLElement;
  // 같은 화면 안의 위치로 이동하는 링크(해시 라우팅과 겹치지 않게 data-scroll을 쓴다).
  const scroll = target.closest<HTMLElement>("[data-scroll]");
  if (scroll) {
    ev.preventDefault();
    document.getElementById(scroll.dataset.scroll!)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (target.id !== "logout") return;
  void run(async () => {
    await post("/logout");
    session.me = null;
    location.hash = "#/home";
  });
});

window.addEventListener("hashchange", () => void show(PAGES[pageName()]!));

void (async () => {
  await refreshMe().catch(() => undefined);
  await show(PAGES[pageName()]!);
  // OAuth 콜백이 붙인 ?login=... 은 한 번 보여 준 뒤 주소에서 지운다.
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
})();
