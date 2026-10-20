import { readdir, mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** 루트에 둔 폰트를 카드에 연결한다. ttf > otf > woff2 > woff 순. */
const root = resolve("..");
const rank = (name) => {
  const ext = name.split(".").at(-1).toLowerCase();
  return { ttf: 0, otf: 1, woff2: 2, woff: 3 }[ext] ?? 9;
};
const files = (await readdir(root)).filter((name) => /\.(woff2?|ttf|otf)$/i.test(name)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
if (!files.length) {
  console.log("루트에 폰트 파일이 없어 기본 글꼴을 씁니다.");
  process.exit(0);
}
const file = files[0];
const ext = file.split(".").at(-1).toLowerCase();
const format = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" }[ext];
await mkdir("public/fonts", { recursive: true });
await copyFile(resolve(root, file), `public/fonts/card-custom.${ext}`);
await writeFile(
  "public/card-font.css",
  `@font-face { font-family: 'CardCustom'; src: url('/fonts/card-custom.${ext}') format('${format}'); font-weight: 700; font-display: swap; }\n`,
);
console.log(`카드 폰트 적용: ${file}`);
