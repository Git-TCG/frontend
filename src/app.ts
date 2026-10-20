import { api, setCsrfToken } from "./api";
import { h } from "./html";

export interface Me {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  consentAt: string | null;
  allocatedAt: string | null;
  tokens: number;
  cosmetics: number;
  normalMatches: number;
  isAdmin: boolean;
}

/**
 * 화면 하나. load에서 데이터를 받고 view가 HTML을 만든다.
 * data-action="이름" 요소를 누르면 actions[이름]이 실행되고, 끝나면 다시 load·render한다.
 */
export interface Page {
  title: string;
  requiresLogin?: boolean;
  load?: () => Promise<void>;
  view: () => string;
  actions?: Record<string, (el: HTMLElement) => Promise<unknown> | unknown>;
  /**
   * 서버를 부르지 않고 화면 상태만 바꾸는 동작(카드 선택 등). 바로 다시 그리고,
   * 다른 작업이 진행 중이어도 무시하지 않는다.
   */
  local?: string[];
  /** 화면을 떠날 때 정리(타이머·소켓 등). */
  leave?: () => void;
}

export const session: { me: Me | null } = { me: null };

const ui = { busy: false, error: "", notice: "" };
let current: Page | null = null;
let root: HTMLElement;
let nav: () => string = () => "";

export async function refreshMe() {
  const r = await api<{ user: Me | null; csrfToken?: string }>("/me");
  session.me = r.user;
  setCsrfToken(r.csrfToken ?? "");
}

export function notify(message: string) {
  ui.notice = message;
}

export function render() {
  if (!current) return;
  const banner = [
    ui.error ? `<div class="error" role="alert">${h(ui.error)}</div>` : "",
    ui.notice ? `<div class="notice" role="status">${h(ui.notice)}</div>` : "",
    ui.busy ? `<div class="busy">처리 중…</div>` : "",
  ].join("");
  let body: string;
  try {
    body = current.view();
  } catch (err) {
    body = `<div class="error">화면 오류: ${h((err as Error).message)}</div>`;
  }
  // 입력 중인 값이 지워지지 않도록 포커스된 입력의 값을 보존한다.
  const focused = document.activeElement as HTMLInputElement | null;
  const focusKey = focused?.dataset?.keep;
  const focusValue = focused?.value;
  root.innerHTML = `${nav()}<main>${banner}${body}</main>`;
  if (focusKey) {
    const el = root.querySelector<HTMLInputElement>(`[data-keep="${focusKey}"]`);
    if (el) {
      el.value = focusValue ?? "";
      el.focus();
    }
  }
}

/** 오류를 화면에 보여 주는 공통 실행기. 끝나면 현재 화면을 다시 불러온다. */
export async function run(task: () => Promise<unknown> | unknown, reload = true) {
  if (ui.busy) return;
  ui.busy = true;
  ui.error = "";
  ui.notice = "";
  render();
  try {
    await task();
    if (reload) await current?.load?.();
  } catch (err) {
    ui.error = err instanceof Error ? err.message : String(err);
  } finally {
    ui.busy = false;
    render();
  }
}

export async function show(page: Page) {
  if (current !== page) current?.leave?.();
  current = page;
  ui.error = "";
  document.title = `${page.title} · Repo TCG`;
  if (page.requiresLogin && !session.me) {
    root.innerHTML = `${nav()}<main><section><p>로그인이 필요합니다.</p><a class="button" href="/api/auth/github/start">GitHub로 로그인</a></section></main>`;
    return;
  }
  render();
  await run(async () => page.load?.(), false);
}

export function mount(el: HTMLElement, navigation: () => string) {
  root = el;
  nav = navigation;
  root.addEventListener("click", (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target || !current?.actions) return;
    const name = target.dataset.action!;
    const action = current.actions[name];
    if (!action) return;
    ev.preventDefault();
    if (current.local?.includes(name)) {
      action(target);
      render();
      return;
    }
    void run(() => action(target));
  });
  root.addEventListener("submit", (ev) => {
    const form = ev.target as HTMLFormElement;
    const action = form.dataset.submit && current?.actions?.[form.dataset.submit];
    if (!action) return;
    ev.preventDefault();
    void run(() => action(form));
  });
}

/** 화면을 다시 그리기만 한다(데이터는 그대로). 체크박스 같은 로컬 상태 변경에 쓴다. */
export function bindChange(handler: (el: HTMLInputElement | HTMLSelectElement) => void) {
  root.addEventListener("change", (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.change) handler(el);
  });
}
