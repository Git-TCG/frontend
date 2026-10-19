import "./style.css";
import { post } from "./api";
import { mount, refreshMe, run, session, show, type Page } from "./app";
import { h } from "./html";
import { homePage } from "./pages/home";

const PAGES: Record<string, Page> = {
  home: homePage,
};
const NAV: [string, string][] = [["home", "시작"]];

function pageName() {
  const name = location.hash.replace(/^#\/?/, "") || "home";
  return PAGES[name] ? name : "home";
}

function navigation() {
  const me = session.me;
  const active = pageName();
  const links = NAV.filter(([name]) => name !== "admin" || me?.isAdmin)
    .map(([name, label]) => `<a href="#/${name}" class="${name === active ? "active" : ""}">${label}</a>`)
    .join("");
  const account = me
    ? `<span>${h(me.login)}</span> <button id="logout">로그아웃</button>`
    : `<a class="button" href="/api/auth/github/start">GitHub로 로그인</a>`;
  return `<header><strong>Repo TCG</strong><nav>${links}</nav><div class="account">${account}</div></header>`;
}

const root = document.querySelector<HTMLElement>("#app")!;
mount(root, navigation);

root.addEventListener("click", (ev) => {
  if ((ev.target as HTMLElement).id !== "logout") return;
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
