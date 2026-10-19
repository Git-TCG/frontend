import { api, post } from "../api";
import { notify, type Page } from "../app";
import { h } from "../html";

interface PoolRow {
  id: number;
  name: string;
  full_name: string;
  url: string;
  pool: string;
  active: boolean;
  weight: number;
  source: string;
  status: string | null;
  reason: string | null;
}

let pool: PoolRow[] = [];
let urlInput = "";

export const adminPage: Page = {
  title: "관리자",
  requiresLogin: true,
  async load() {
    const r = await api<{ pool: PoolRow[] }>("/admin/pool");
    pool = r.pool;
  },
  view() {
    const rows = pool.length
      ? `<table><thead><tr><th>Repo</th><th>상태</th><th>게시</th><th>출처</th><th></th></tr></thead><tbody>${pool
          .map(
            (p) => `<tr>
              <td><a href="${h(p.url)}" target="_blank" rel="noopener">${h(p.full_name)}</a></td>
              <td>${h(p.status ?? "-")}${p.reason ? `<br><small>${h(p.reason)}</small>` : ""}</td>
              <td>${p.active ? "게시됨" : "미게시"}</td>
              <td>${h(p.source)}</td>
              <td>${
                !p.active && p.status === "ready"
                  ? `<button data-action="publish" data-id="${p.id}">게시</button>`
                  : ""
              }</td>
            </tr>`,
          )
          .join("")}</tbody></table>`
      : "<p>등록된 공용 후보가 없습니다.</p>";

    return `<section>
      <h1>관리자</h1>
      <h2>Repo 등록</h2>
      <form data-submit="register">
        <input name="url" data-keep="admin-url" placeholder="https://github.com/owner/repo" value="${h(urlInput)}" size="50"/>
        <button type="submit">등록·분석</button>
      </form>
      <h2>시즌</h2>
      <div class="row">
        <button data-action="prepare">다음 시즌 준비</button>
        <button data-action="activate">시즌 게시</button>
      </div>
      <h2>공용 풀</h2>
      ${rows}
    </section>`;
  },
  actions: {
    register: async (el) => {
      const form = el as HTMLFormElement;
      const url = new FormData(form).get("url");
      if (typeof url !== "string" || !url.trim()) return;
      urlInput = url.trim();
      await post("/admin/repositories", { url: urlInput });
      notify("등록하고 분석을 시작했습니다.");
      urlInput = "";
    },
    publish: async (el) => {
      await post(`/admin/pool/${el.dataset.id}/publish`);
      notify("게시했습니다.");
    },
    prepare: async () => {
      const r = await post<{ season: number }>("/admin/season/prepare");
      notify(`시즌 ${r.season} 준비를 시작했습니다.`);
    },
    activate: async () => {
      const r = await post<{ season: number }>("/admin/season");
      notify(`시즌 ${r.season}을 게시했습니다.`);
    },
  },
};
