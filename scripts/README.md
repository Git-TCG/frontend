# 카드 폰트

프로젝트 루트(`git-tcg/`)에 `.woff2`, `.woff`, `.ttf`, `.otf` 파일을 넣고 `frontend`에서 `npm run build`를 실행하세요. 여러 파일이면 파일명 순서의 첫 파일을 사용합니다. 카드의 이름·능력·수치·안내에 적용됩니다.

Docker 배포 전에 호스트에서 `npm --prefix frontend run build`를 실행해야 루트 폰트가 `frontend/public/fonts/`로 복사됩니다. 이후 `docker compose -f backend/docker-compose.yml up -d --build`로 배포합니다. 폰트가 아직 없으면 기본 시스템 글꼴을 사용합니다.
