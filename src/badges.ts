import { h } from "./html";

/** GitHub README에 붙일 서버 상태·전적 SVG 주소와 마크다운. */
export function badgeUrls(login?: string | null) {
  const origin = location.origin;
  const status = `${origin}/api/badge/status.svg`;
  const user = login ? `${origin}/api/badge/users/${encodeURIComponent(login)}.svg` : null;
  const md = [`![Repo TCG](${status})`, user ? `![${login} Repo TCG](${user})` : ""].filter(Boolean).join("\n");
  return { status, user, md };
}

export function badgeSection(login?: string | null) {
  const b = badgeUrls(login);
  return `<section>
    <h2>README 배지</h2>
    <p class="muted">GitHub README에 붙여 서버 상태와 전적을 보여 줍니다. 로그인하지 않아도 열리는 그림입니다.</p>
    <div class="badge-row">
      <img src="${h(b.status)}" alt="Repo TCG 서버 상태" width="400"/>
      ${b.user ? `<img src="${h(b.user)}" alt="${h(login)} 전적" width="720"/>` : ""}
    </div>
    <pre class="badge-md">${h(b.md)}</pre>
    <button data-action="copyBadges">마크다운 복사</button>
    ${login ? `<p class="muted"><a href="#/settings">대표 카드 바꾸기</a></p>` : ""}
  </section>`;
}

export async function copyBadgeMarkdown(login?: string | null) {
  const { md } = badgeUrls(login);
  try {
    await navigator.clipboard.writeText(md);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = md;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
