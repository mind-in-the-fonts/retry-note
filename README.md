# 다시풀다 · retry-note

직접 입력한 객관식 오답을 과목별로 보관하고 무작위 재시험을 보는 개인 학습 웹앱입니다.

- 아이디·비밀번호 회원가입·로그인 + 기존 GitHub 로그인 / 사용자별 데이터 분리
- 초대 링크·방 코드로 유튜브 함께 보기: 재생·일시정지·탐색·속도 공유, 채팅 없음
- 사용자별 과목 추가·이름 수정·삭제 및 저장한 과목만 선택
- 검색·키보드 조작을 지원하는 커스텀 과목 드롭다운
- 조직 폰트 카탈로그에서 등록번호 최신순 웹폰트 100개 미리보기·앱 전체 적용·계정별 저장
- 문제·보기·정답·책 페이지·문제 번호·최초 오답일·선택 해설
- 한국 시간 기준 최초 오답일 기본값, 날짜 직접 수정
- 선택 과목 전체 / 무작위 10·30·50문항 (한 시험 내 중복 없음)
- 제출 즉시 정오답 및 해설 표시, 서버 채점·중복 제출 방지
- 진행 중인 시험과 답안의 서버 저장·재개
- 재시험 제출 기록만으로 문제별 정답률·오답률 계산
- 문제를 보관 해제해도 기존 풀이 기록 유지
- JSON 내보내기 / 문제 가져오기 / 해설 JSON 일괄 저장
- 유료 AI API 없음. 해설 요청문을 복사해 기존 채팅에서 해설을 받은 뒤 가져오기

## 로컬 실행

Node.js 22.12 이상 권장.

```sh
npm ci
cp .env.example .env.local
# .env.local에 본인 Supabase 프로젝트의 URL과 publishable key 입력
npm run dev
```

`.env.local` 없이도 로그인 소개 화면을 볼 수 있습니다. 실제 로그인·데이터 저장은 Supabase 설정이 필요하며, 가짜 성공이나 브라우저 임시 저장으로 대체하지 않습니다.

## 무료 인프라 구성

현재 프로젝트는 서울 리전의 `retry-note` (`unrcmkioyoldyadrfkze`)이며, 최초 데이터베이스 마이그레이션을 적용했습니다. GitHub OAuth 앱과 Auth의 URL 설정은 별도로 완료해야 실제 로그인이 가능합니다. 공개 프런트엔드에는 publishable key만 사용합니다.

화면은 GitHub Pages, 인증·PostgreSQL 데이터는 Supabase Free를 사용합니다. 사용자 문제·답안·로그인 토큰은 이 저장소에 커밋하지 않습니다. Supabase 무료 서비스의 용량·휴면 정책은 제공자의 현재 정책을 따릅니다.

### 최초 Supabase 설정

1. Supabase에 로그인하고 무료 프로젝트를 생성합니다.
2. `supabase/migrations/202611210001_initial.sql`을 SQL Editor에서 실행합니다. 연결된 관리 도구가 있으면 마이그레이션 적용을 자동화할 수 있습니다.
3. Supabase **Authentication → URL Configuration**에서 Site URL을 `https://mind-in-the-fonts.github.io/retry-note/`로 지정합니다. Redirect URLs에도 같은 주소를 허용합니다. 개발용으로 `http://localhost:5173/`, `http://127.0.0.1:5173/`를 필요할 때 추가합니다.
4. GitHub OAuth App을 생성합니다. Homepage URL은 위 사이트 주소, Authorization callback URL은 Supabase GitHub provider 화면이 제공하는 `https://<project-ref>.supabase.co/auth/v1/callback` 주소를 그대로 사용합니다.
5. Supabase **Authentication → Sign In / Providers → GitHub**를 켜고 해당 OAuth App의 Client ID·Client Secret을 입력합니다. GitHub Client Secret은 GitHub 저장소와 프런트엔드에 넣지 않습니다.
6. 로컬 `.env.local`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`(publishable key 또는 legacy anon key)를 넣습니다. 이 파일은 Git에서 제외됩니다.
7. `npm run build:pages` 후 소스와 생성된 `docs/`를 commit·push합니다. Pages의 게시 소스는 `main` 브랜치의 `/docs`입니다.

`service_role` 또는 `sb_secret_...` 키는 프런트엔드 설정에 사용하지 않습니다. RLS와 서버 함수가 사용자별 접근과 채점을 제한합니다. GitHub OAuth 로그인은 사이트 로그인 용도이며 저장소 읽기·쓰기 권한을 요청하지 않습니다.

## 검증과 배포

### Cloudflare Pages

운영 주소: https://retry-note.pages.dev/ — Cloudflare Pages 직접 업로드로 게시했습니다. Pages 직접 업로드용 빌드는 사이트 루트(`/`)를 사용합니다. 기존 GitHub Pages용 `docs/` 빌드와 구분됩니다.

```sh
npx wrangler login
npx wrangler pages project create retry-note --production-branch main --force
npm run deploy:cloudflare
```

최초 프로젝트 생성은 한 번만 실행합니다. `--force`는 최초 생성 시에만 Wrangler의 Workers 전환 대신 Pages 프로젝트를 선택하는 옵션입니다. 생성 후 배포에는 필요하지 않습니다. 로그인 토큰과 `.env.local`은 저장소에 올리지 않습니다. 이후 배포에는 `npm run deploy:cloudflare`를 사용합니다. Supabase Auth의 Site URL은 `https://retry-note.pages.dev/`로 지정하고 Redirect URLs에도 같은 주소를 추가해야 로그인이 새 사이트로 돌아옵니다. GitHub OAuth 앱의 callback URL은 Supabase 주소이므로 변경하지 않습니다. 기존 GitHub Pages 주소는 별도로 유지됩니다.

### GitHub Pages

```sh
npm test
npm run build
```

핵심 입력 검증과 한국 날짜 계산, 실제 PostgreSQL 엔진(PGlite)에서 사용자별 RLS·서버 채점·중복 제출·스냅샷·해설 묶음의 원자성을 검사합니다. 브라우저의 실제 로그인 흐름은 Supabase 프로젝트와 OAuth를 연결한 뒤 검증해야 합니다.

`npm test`와 `npm run build:pages`를 실행한 뒤 생성된 `docs/`와 소스를 `main`에 push하면 GitHub Pages가 게시합니다. Actions 작성 권한이 없어도 배포할 수 있는 구성입니다. 선택적으로 사용할 Actions 워크플로 예제는 `deployment/github-pages-actions.yml`에 보관했습니다. 기본 주소: `https://mind-in-the-fonts.github.io/retry-note/`.

## 데이터와 통계

`questions`는 원문, `exams`는 시험 시작 시점의 문제·정답·해설 스냅샷, `attempts`는 제출 답안입니다. 최초 오답일은 메타데이터이며 `attempts`를 만들지 않습니다. 단순 상세 조회·수정·해설 가져오기도 정답률에 포함하지 않습니다.

답을 제출한 뒤 원문을 수정해도 이전 시험의 스냅샷과 채점은 바뀌지 않습니다. 보관 해제한 문제의 이전 풀이도 전체 기록에 남습니다.

문제 가져오기는 JSON의 `questions` 배열 또는 문제 배열을 받습니다. 같은 ID는 해당 사용자의 문제를 갱신합니다. 파일의 `attempts`는 답안으로 재등록하지 않습니다. 전체 기록 내보내기에는 문제·풀이·시험이 모두 들어가지만, UI의 가져오기는 문제만 복원합니다.

## 해설 도우미

1. 내 오답에서 해설이 필요한 문제를 최대 20개 선택합니다. 선택하지 않으면 해설 없는 문제 중 앞 20개를 사용합니다.
2. **해설 도우미 → 해설 요청문 복사**를 누릅니다.
3. 기존 채팅에 붙여넣고 해설 JSON을 받습니다.
4. 해설 도우미에 JSON을 붙여넣고 저장합니다. 유효하지 않은 문제 ID가 섞여 있으면 전체 저장을 취소합니다.

추가적인 AI API 결제나 API 키는 필요하지 않으며, 사용한 채팅 서비스의 일반 사용 한도가 적용됩니다. 해설은 수정할 수 있습니다.

## 사용자별 설정

설정 → 내 과목에서 등록한 과목만 오답 입력·필터·시험 선택에 나타납니다. 새 계정에 고정 과목은 자동으로 추가하지 않습니다. 기존 데이터가 있으면 실제 사용하던 과목을 이관합니다. 과목 이름 변경은 기존 문제(보관 해제 포함)에 반영되며 과거 시험·풀이 스냅샷은 보존됩니다. 사용 중인 과목을 삭제하려면 다른 등록 과목으로 문제를 옮겨야 합니다. 이 이동과 삭제는 같은 트랜잭션으로 처리합니다. 가져올 JSON의 과목도 먼저 설정에 등록해야 합니다.

설정 → 앱 글꼴은 https://github.com/mind-in-the-fonts/font-changer-data 의 자료에서 웹폰트 정의가 있는 중복 없는 100개를 사용합니다. 원본에 출시일이 없으므로 눈누 등록번호 내림차순을 사용합니다. `npm run fonts:update`로 카탈로그와 정제된 `@font-face` CSS를 다시 생성할 수 있습니다. 미리보기는 화면에 보이는 카드부터 불러오며 선택한 font ID만 사용자 설정에 저장합니다. 글꼴 파일은 원본 CDN에서 제공됩니다. 로딩에 실패하면 기본 폰트를 유지하고 재시도할 수 있습니다.

추가 마이그레이션: `user_subjects_and_font_preferences`. `user_categories`와 `user_settings` 모두 사용자별 RLS를 적용하며, 과목 삭제 함수는 호출자의 권한으로 실행됩니다. 전체 기록 내보내기에는 과목 목록과 폰트 설정도 포함됩니다.

## 유튜브 같이 보기

같이 보기 메뉴에서 사용자가 직접 고른 유튜브 URL로 방을 만들고 초대 링크 또는 UUID 방 코드를 공유합니다. 로그인한 친구가 참여하면 재생·일시정지·탐색·영상 변경이 함께 반영됩니다. 방을 만든 사람만 방을 종료할 수 있고 참여자는 나갈 수 있습니다. 볼륨·자막은 각 기기에만 적용됩니다. 처음 시청할 때 브라우저 자동재생 제한을 해제하기 위해 시청 시작 버튼을 눌러야 할 수 있습니다. 유튜브에서 외부 임베드를 금지한 영상은 재생할 수 없습니다. 광고, 버퍼링, 기기별 재생 제한 때문에 프레임 단위의 일치를 보장하지 않습니다.

유튜브 IFrame Player API를 사용하므로 별도의 YouTube Data API 키가 필요하지 않습니다. Supabase `watch_rooms`에 공유 재생 상태와 서버 시각·버전을 보관하고 Postgres Changes로 전달합니다. 재연결 및 늦은 입장 시 서버 시각 기준으로 위치를 보정하며, 5초 간격 상태 확인으로 실시간 연결 장애 시에도 복구합니다. 영상을 계속 재생하는 동안 주기적으로 쓰기를 하지는 않습니다. 상태 변경 요청은 행 잠금과 예상 버전으로 충돌을 처리하며 오래된 명령은 최신 상태를 덮어쓰지 않습니다.

방과 참여자 테이블은 RLS로 보호합니다. 초대 코드를 알고 명시적으로 참여한 계정과 방 소유자만 공유 상태를 읽고 수정할 수 있습니다. 권한이 필요한 함수는 외부에 노출되지 않은 `watch_private` 스키마에 두고, 공개 RPC는 호출자 권한으로 해당 함수에 위임합니다. 직접 테이블 삽입·수정은 차단합니다. `watch_rooms`만 Supabase Realtime publication에 추가되며 개인 오답·설정의 공유 범위는 바뀌지 않습니다. 채팅·마이크·카메라 기능은 없습니다.

사용한 공식 API 문서: https://developers.google.com/youtube/iframe_api_reference , https://supabase.com/docs/guides/realtime/postgres-changes . 플레이어 제어 테스트는 브라우저 클릭 없이 모의 플레이어 두 개로 수행하며 실제 DB에서도 참여·접근 권한·상태 변경을 검증합니다. 실제 두 브라우저에서 영상·오디오가 재생되는지는 별도의 수동 확인이 필요합니다.

## 아이디·비밀번호 회원가입

첫 화면에서 회원가입을 선택하고 아이디(한글·영문·숫자·밑줄 2~24자), 비밀번호(8자 이상), 비밀번호 확인만 입력하면 가입 후 로그인됩니다. 아이디는 대소문자와 NFKC를 정규화합니다. 기존 GitHub 로그인도 유지합니다. 별도 이메일·GitHub 계정·이메일 인증이 필요하지 않습니다.

내부적으로 정규화한 아이디의 SHA-256에서 60자리 해시를 사용한 예약 도메인 `accounts.retry-note.invalid` 식별자를 만들어 Supabase Auth 비밀번호 인증에 연결합니다. 실제 이메일 주소를 수집하거나 인증 메일을 발송하지 않습니다. 비밀번호를 별도 테이블에 저장하지 않고 Supabase Auth가 해시를 관리합니다.

`username-signup` Edge Function은 로그인 전 가입 요청을 처리하므로 JWT 확인 대신 프로젝트 publishable key를 Auth 설정 엔드포인트에서 검증합니다. 서버 환경에만 있는 secret/service key로 `auth.admin.createUser`에 대응하는 관리자 API를 호출하며, 클라이언트가 지정한 이메일·사용자 ID·권한·메타데이터는 받지 않습니다. 가입 시 정해진 일반 계정만 생성합니다. 서비스 키는 클라이언트에 전달하지 않습니다. 출처 제한, 본문 크기 제한, 중복 처리, IP별/전체 시간당 요청 제한을 적용합니다. IP는 서버 키로 HMAC 처리한 값만 제한 테이블에 저장합니다. 제한 테이블·함수는 서비스 역할로만 접근할 수 있습니다.

서버 함수 배포 파일: `supabase/functions/username-signup/`와 `_shared/account.ts`. 배포 시 `verify_jwt=false` 설정을 사용하며 함수 내부 API 키 검증을 유지해야 합니다. 사용자에게 원문 비밀번호, 토큰, 서버 키가 포함된 로그를 남기지 않습니다. 계정은 Supabase Auth 사용자이므로 기존 RLS·개인 과목·설정·같이 보기 권한을 그대로 적용합니다. 기존 GitHub 계정과 새 아이디 계정은 별개의 계정입니다.

실제 서버에서 임시 계정의 가입(201), 중복 거부(409), 잘못된 비밀번호 거부, 비밀번호 로그인, 개인 과목 저장 및 로그아웃을 확인하고 해당 임시 계정을 삭제했습니다.
