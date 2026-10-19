import { api, post } from "../api";
import { notify, type Page } from "../app";
import { h } from "../html";

interface DiscoveryState {
  tokens: number;
  cosmetics: number;
  open: { id: number; options: number[] } | null;
  cosmetic?: boolean;
}

let state: DiscoveryState | null = null;
let optionCards: Record<number, { name: string; full_name: string; card: { name: string; grade: string } | null }> =
  {};

export const discoveryPage: Page = {
  title: "발견",
  requiresLogin: true,
  async load() {
    state = await api("/discovery");
    optionCards = {};
    if (state?.open) {
      for (const id of state.open.options) {
        try {
          const detail = await api<{ versions: { name: string; full_name: string; card: { name: string; grade: string } | null }[] }>(
            `/cards/${id}`,
          );
          optionCards[id] = detail.versions[0] ?? { name: String(id), full_name: String(id), card: null };
        } catch {
          optionCards[id] = { name: String(id), full_name: String(id), card: null };
        }
      }
    }
  },
  view() {
    if (!state) return "<p>불러오는 중…</p>";
    const open = state.open
      ? `<div>
          <h2>후보 선택</h2>
          <p>토큰을 소모해 뽑은 후보 중 하나를 고르세요.</p>
          ${state.open.options
            .map((id) => {
              const c = optionCards[id];
              const title = c?.card?.name ?? c?.name ?? String(id);
              return `<div class="row">
                <button data-action="choose" data-id="${id}">${h(title)} (${h(c?.card?.grade ?? "?")})</button>
                <small>${h(c?.full_name ?? "")}</small>
              </div>`;
            })
            .join("")}
        </div>`
      : `<p>열린 발견이 없습니다. 토큰 3개로 공용·개인 해금 후보를 뽑을 수 있습니다.</p>
         <button class="primary" data-action="draw" ${state.tokens >= 3 ? "" : "disabled"}>발견 (토큰 3)</button>`;

    return `<section>
      <h1>발견</h1>
      <p>발견 토큰 ${state.tokens}개 · 외형 재화 ${state.cosmetics}개</p>
      ${open}
    </section>`;
  },
  actions: {
    draw: async () => {
      const r = await post<DiscoveryState>("/discovery");
      state = { ...state!, ...r, tokens: r.tokens ?? state!.tokens, cosmetics: r.cosmetics ?? state!.cosmetics };
      if (r.cosmetic) notify("새 카드가 없어 외형 재화 1개를 받았습니다.");
      else notify("후보를 뽑았습니다.");
    },
    choose: async (el) => {
      if (!state?.open) return;
      const repoId = Number(el.dataset.id);
      await post(`/discovery/${state.open.id}/choose`, { repoId });
      notify("카드를 획득했습니다.");
      state.open = null;
    },
  },
};
