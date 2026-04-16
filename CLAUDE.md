# SpeedMIS v7 — Claude Code 가이드

## 프로젝트 개요
- **경로**: `C:\_webdir\clude_speedmis_v7\`
- **스택**: PHP 8.3 + Slim 4 + React 18 + Vite
- **DB**: MariaDB 10.11, Host: 175.207.12.157, DB: speedmis_v7
- **참고 v6**: `/mnt/c/_webdir/clude_speedmis_v6/` (http://localhost:8083/)
- **IIS**: speedmis_v7_ms 사이트, 포트 8087

---

## 절대 규칙
- URL은 `?act=` 또는 `?gubun=` 방식만 사용. `/api/list/314` 같은 슬래시 URL 금지
- 테이블명: `mis_` 접두어 + snake_case (v6 PascalCase → v7 snake_case)
- programs/{real_pid}.php 에 훅 함수만 정의, DataHandler가 호출

---

## URL 파라미터 (v6와 동일)

| 파라미터 | 설명 |
|---------|------|
| gubun | 메뉴 idx |
| idx | 레코드 idx |
| ActionFlag | list/view/modify/write |
| isMenuIn | Y/N/S |
| isPopup | Y/N |
| isPrint | Y/N |
| isAddURL | Y/N |
| recently | Y/N |
| recently_view | Y/N |
| orderby | 정렬 (- 접두어=DESC, 쉼표=복수) |
| page | 현재 페이지 |
| pageSize | 페이지당 건수 (기본 50) |
| psize | pageSize alias (999999=페이징숨김) |
| allFilter | JSON 필터 배열 |
| parent_idx | 마스터-디테일 상위 idx |
| tabid | 기본 탭 ID |

---

## allFilter 명세 (v6와 동일)

```json
[{"field":"MenuName","operator":"contains","value":"관리"}]
```

operator: eq, neq, contains, notContains, startsWith, endsWith,
gt, gte, lt, lte, between, in, isNull, isNotNull

field 앞에 toolbar_z 접두어 = 툴바 전용 (SQL 생성 시 제거)

---

## DB 테이블 매핑 (v6 → v7)

| v6 (PascalCase) | v7 (snake_case) | 설명 |
|-----------------|-----------------|------|
| MisMenuList | mis_menus | 메뉴 (라우터) |
| MisMenuList_Detail | mis_menu_fields | 컬럼 정의 |
| MisMenuList_Member | mis_menu_auth | 메뉴 권한 |
| MisUser | mis_users | 사용자 |
| MisGroup_Master | mis_groups | 권한 그룹 |
| MisGroup_Detail | mis_group_rules | 그룹 조건 |
| MisGroup_Member | mis_group_members | 그룹 멤버 |
| MisStation | mis_stations | 부서 |
| MisLog | mis_activity_logs | 활동 로그 |
| MisComments | mis_comments | 댓글 |
| MisFavoriteMenu | mis_favorite_menus | 즐겨찾기 |
| MisHelp | mis_help | 도움말 |
| MisReadList | mis_read_history | 읽음 기록 |
| MisShare | mis_shares | 공유 |
| MisCommonTable | mis_common_data | 공통 데이터 |
| MisCompanyMgt | mis_companies | 거래처 |

---

## 핵심 테이블 컬럼 매핑

### mis_menus (← MisMenuList)
| v6 | v7 | 타입 |
|----|-----|------|
| idx | idx | PK |
| RealPid | real_pid | varchar(14) |
| MenuName | menu_name | varchar(50) |
| briefTitle | brief_title | varchar(20) |
| isMenuHidden | is_menu_hidden | char(1) |
| AuthCode | auth_code | char(2) |
| gidx | gidx | int |
| MenuType | menu_type | char(2) |
| upRealPid | up_real_pid | varchar(14) |
| AddURL | add_url | varchar(500) |
| AutoGubun | auto_gubun | varchar(6) |
| SortG2/4/6 | sort_g2/4/6 | float |
| useflag | use_yn | char(1) |
| addLogic | add_logic | mediumtext |
| addLogic_treat | add_logic_treat | mediumtext |
| MisJoinPid | mis_join_pid | varchar(50) |
| depth | depth | int |
| wdate | wdate | datetime |
| lastupdate | last_update | datetime |
| g04 (읽기전용조건) | read_only_cond | text |
| g05 (간편추가쿼리) | brief_insert_sql | text |
| g08 (테이블명) | table_name | varchar(100) |
| g09 (기본필터) | base_filter | text |
| g10 (use조건) | use_condition | text |
| g11 (삭제쿼리) | delete_query | text |

### mis_menu_fields (← MisMenuList_Detail)
| v6 | v7 | 설명 |
|----|-----|------|
| RealPid | real_pid | 소유 메뉴 |
| SortElement | sort_order | 정렬 순서 |
| Grid_Select_Field | db_field | DB 컬럼명 |
| Grid_Select_Tname | db_table | DB 테이블명 |
| aliasName | alias_name | 필드 별칭 |
| Grid_Columns_Title | col_title | 헤더 제목 |
| Grid_Columns_Width | col_width | 컬럼 너비 |
| Grid_Schema_Type | schema_type | 입력 타입 |
| Grid_Items | items | select 항목 |
| Grid_Schema_Validation | schema_validation | 유효성 |
| Grid_MaxLength | max_length | 최대 길이 |
| Grid_Default | default_value | 기본값 |
| Grid_Pil | required | 필수 여부 |
| Grid_FormGroup | form_group | 폼 그룹 |
| Grid_GroupCompute | group_compute | text |
| Grid_PrimeKey | prime_key | text |
| useflag | use_yn | 사용 여부 |

### mis_users (← MisUser)
| v6 | v7 |
|----|-----|
| num | idx |
| UniqueNum | user_id |
| UserName | user_name |
| UserAlias | user_alias |
| positionNum | position_code |
| passwdDecrypt | password |
| Station_NewNum | station_idx |
| auth_version | auth_version |
| isStop | is_stop |
| wdate | wdate |

---

## 디렉토리 구조

```
clude_speedmis_v7/
├── index.php          # 프론트 컨트롤러 (SSR + React SPA)
├── api.php            # JSON API (?act= 방식)
├── router.php         # PHP 내장 서버 라우터
├── web.config         # IIS 설정
├── CLAUDE.md
├── composer.json
├── package.json
├── vite.config.js
├── .env
├── .env.example
├── .gitignore
│
├── migration/
│   └── v7_schema.sql  # DB 마이그레이션 (v6→v7 rename)
│
├── config/
│   └── constants.php
│
├── core/src/
│   ├── Config/Database.php
│   ├── Bootstrap.php
│   ├── DataHandler.php    # CRUD 핵심 엔진 + 훅 시스템
│   ├── MenuRouter.php     # mis_menus 기반 라우터
│   ├── QueryBuilder.php   # allFilter → SQL
│   ├── MisCache.php       # APCu/파일 캐시
│   ├── AuthMiddleware.php # JWT 검증
│   └── FileManager.php    # 파일 업로드/다운로드
│
├── programs/          # real_pid별 비즈니스 로직 (v6의 _mis_addLogic/)
├── layout/
│   └── base.php
├── logs/
├── uploads/
├── public/build/
└── src/               # React 소스
    ├── main.jsx
    ├── App.jsx
    ├── api.js
    └── components/
```

---

## api.php 엔드포인트 (?act= 방식)

```
act=list       → 목록 (mis_menus + mis_menu_fields 기반)
act=view       → 단건
act=save       → 등록/수정 (CSRF 필수)
act=delete     → 삭제 (CSRF 필수)
act=menu       → 메뉴 트리
act=menuItem   → 메뉴 단건
act=login      → 로그인
act=logout     → 로그아웃
act=refresh    → access token 갱신
act=me         → 현재 사용자
act=fileUpload → 파일 업로드
act=fileDown   → 파일 다운로드
act=fileDelete → 파일 삭제
act=treat      → addLogic_treat 훅
```

---

## PHP 전역 변수 (programs/*.php 에서 사용)

```php
$actionFlag            // list/view/modify/write/delete
$gubun                 // 메뉴 idx
$idx                   // 레코드 idx
$real_pid              // 'speedmis000314' 형태
$menu_name             // 메뉴명
$full_site             // 사이트 주소
$parent_idx            // 마스터-디테일 상위 idx
$allFilter             // JSON string
$orderby               // 정렬 string
$page, $pageSize
$isMenuIn              // Y/N/S
$misSessionUserId      // 로그인 사용자 ID
$misSessionIsAdmin     // Y or ''
$misSessionPositionCode // 직급 코드
$__pdo                 // PDO 인스턴스

// v6 호환 별칭 (참조로 연결, 동일 값)
$ActionFlag, $MisSession_UserID, $MisSession_IsAdmin, $MisSession_PositionCode
```

---

## 이벤트 훅 (programs/*.php 에서 정의)

```php
function list_query(&$selectQuery, &$countQuery)
function list_json_init()
function before_query($menu, $fields, $params)     // 쿼리 빌드 전 (list/view/save 공통)
function list_query(&$selectQuery, &$countQuery)    // 목록 SELECT/COUNT 쿼리 가로채기
function list_json_init()                           // 목록 로딩 전 초기화
function list_json_load(&$data)                     // 목록 각 행 데이터 변환
function view_query(&$viewSql)                      // 조회 SELECT 쿼리 가로채기
function view_load(&$row)                           // 조회/수정 데이터 로딩 후
function save_updateReady(&$saveList)               // 저장 전 원본 데이터 (검증용)
function save_updateBefore(&$updateList)            // UPDATE 직전 데이터 수정
function save_updateQueryBefore(&$sql, &$bindings)  // UPDATE 쿼리 가로채기
function save_updateAfter($idx, &$afterScript)      // UPDATE 완료 후
function save_writeBefore(&$updateList)             // INSERT 직전 데이터 수정
function save_writeQueryBefore(&$sql, &$bindings)   // INSERT 쿼리 가로채기
function save_writeAfter($newIdx, &$afterScript)    // INSERT 완료 후
function save_deleteBefore($idx, &$cancelDelete)    // 삭제 전 검증 ($cancelDelete=true → 취소)
function save_deleteAfter($idx, &$afterScript)      // 삭제 완료 후
function addLogic_treat(&$result)                   // treat 훅
function pageLoad()                                 // 프로그램 로드 시 1회 실행 (속성 선언용)
function view_templete(): string                    // 커스텀 뷰 템플릿
```

### 클라이언트 메시지 (훅 함수 내에서 사용)
```php
$GLOBALS['_client_alert'] = '메시지';                // alert() 표시
$GLOBALS['_client_toast'] = '메시지';                // 토스트 알림 표시
$GLOBALS['_client_confirm'] = '저장할까요?';          // 저장 전 확인 (Yes→저장, No→취소)
$GLOBALS['_client_openTab'] = [                      // 새 탭 열기
    'gubun' => 36, 'label' => '탭 제목',
    'idx' => 123, 'openFull' => true,
];
$GLOBALS['_client_redirect'] = [                     // 현재 탭 교체 (리다이렉트)
    'gubun' => 36, 'label' => '탭 제목',
];
$GLOBALS['_onlyList'] = true;                        // 리스트전용 (pageLoad에서 사용)
```

### 전역변수 (훅 함수 내에서 사용)
```php
$isFirstLoad      // bool — 프로그램 최초 로딩 여부 (재조회 시 false)
$isListEdit       // bool — 목록편집(인라인) 저장 여부
$listEditField    // array — 목록편집 시 변경된 필드명 배열
```

### SQL 실행 헬퍼
```php
// 단일 쿼리 (바인딩)
$result = execSql("INSERT INTO t (name) VALUES (?)", ['홍길동']);
// 멀티 쿼리 (세미콜론 구분)
$result = execSql("INSERT INTO a ...; UPDATE b ...; DELETE FROM c ...");
// 결과: ['resultCode'=>'success'|'fail', 'resultMessage', 'lastInsertId', 'rowCount']
```

### 목록 표시 전용 HTML (__html)
```php
function list_json_load(&$data) {
    // 원본 데이터 보존, 그리드 표시만 변경
    $data['__html']['필드명'] = '<a href="...">링크</a>';
}
```

### UI 커스터마이징 (훅에서 사용)
```php
// CSS 주입 (특정 요소 숨기기, 스타일 변경)
$GLOBALS['_client_css'] = '#mis-btn-write { display: none; }';

// 버튼 텍스트 변경
$GLOBALS['_client_buttonText'] = [
    'write' => '접수하기',    // +등록 → 접수하기
    'reset' => '전체보기',    // 초기화 → 전체보기
];

// 사용자 정의 버튼 추가
$GLOBALS['_client_buttons'] = [
    ['label' => '적용하기', 'action' => 'apply'],
    ['label' => '마감처리', 'action' => 'close'],
];
// → list_json_init에서 $customAction 변수로 감지
// if ($customAction === 'apply') { ... }
```

#### 주요 CSS ID/Class
| ID | 요소 |
|----|------|
| `#mis-program` | 프로그램 전체 영역 |
| `#mis-header` | 프로그램 헤더 바 |
| `#mis-title` | 프로그램 제목 |
| `#mis-header-actions` | 헤더 우측 버튼 영역 |
| `#mis-btn-write` | +등록 버튼 |
| `#mis-btn-reset` | 초기화 버튼 |
| `#mis-btn-custom-0` | 사용자 정의 버튼 (0번째) |

### 인쇄양식 템플릿
- 파일: `programs/{real_pid}_print.html`
- 조건: `mis_menus.is_use_print = 1`
- 문법: `{{alias}}`, `{{#each childAlias}}...{{/each}}`, `{{@index}}`, `{{@total}}`

### 프로그램 모드 (mis_menus.g01)
| g01 | 동작 |
|-----|------|
| (빈값) | 일반 (목록+등록+수정+삭제) |
| simple_list | 목록+수정만 (등록/삭제 없음) |
| only_one_list | 리스트 없이 최근 1건 수정 (0건이면 등록) |

---

## 보안
- CSRF: POST 요청 시 X-CSRF-Token 헤더
- JWT: access 1시간, refresh 30일 HttpOnly 쿠키
- 타장비 로그아웃: mis_users.auth_version 증가
- 로그인 실패: 5회 → 1시간 차단
- 비밀번호: password_hash() / password_verify()

---

## 성능
- initialData SSR: PHP가 첫 데이터 주입 → window.__INITIAL_DATA__
- 캐시: MisCache (APCu → 파일 폴백)
- 캐시 키: {real_pid}_{userid}_{md5(allFilter+orderby+page)}
- TanStack Query: 클라이언트 캐시

---

## 개발 명령어
```bash
composer install
npm install
npm run dev          # Vite HMR
npm run build        # 빌드
php -S 0.0.0.0:8082 router.php  # PHP 내장 서버
```

---

## Claude Code 체크리스트
- URL은 항상 ?act= / ?gubun= 방식
- 테이블명: mis_ + snake_case
- 컬럼명: snake_case (v6 필드명 참고해서 매핑)
- programs/*.php 는 훅 함수만 정의
- CSRF 토큰 검증 누락 금지
- 저장/삭제 후 cache->invalidateByRealPid() 호출

---

## 디자인 시스템

### 파일 구조
```
public/css/
├── design-system.css   # CSS 변수 전체 정의 (단일 소스)
├── layout.css          # topbar / sidebar / main 레이아웃
└── components.css      # 버튼, 인풋, 테이블, 카드, 뱃지, 스켈레톤 등
```

### 컨셉
- **Density with Clarity** — Retool 감성, 기업용 프로페셔널
- **라이트 기본 + 다크 지원** (사용자 토글)
- 폰트: Pretendard (CDN) → Inter → system-ui

### 다크/라이트 모드 대응 원칙

#### 구현 방식
- `design-system.css`: `:root` (라이트 기본) + `[data-theme="dark"]` 두 벌 정의
- JS로 `<html data-theme="dark">` 토글
- 테마 우선순위: `localStorage('mis_theme')` → `prefers-color-scheme` → 기본 라이트
- 서버 저장: `mis_users.theme` 컬럼 (VARCHAR 10, 기본 'light')
- 로그인 응답·`act=me`·`act=saveTheme` API에 `theme` 필드 포함

#### FOUC 방지
- `layout/base.php` `<head>` 최상단에 인라인 스크립트 삽입
- CSS 로드 전에 `data-theme` 적용 → 깜빡임 없음

#### CSS 규칙
- 모든 색상은 **CSS 변수만** 사용 (하드코딩 절대 금지)
- 텍스트 대비율: 라이트/다크 양쪽 WCAG AA (4.5:1) 이상 유지
- 이미지/SVG: `filter: var(--img-filter)` 자동 적용 (다크: brightness 0.9)
- 모드 전환 트랜지션: `color 0.15s, background-color 0.15s` (body 전역 적용)
- `.no-theme-transition` 클래스: 애니메이션 요소에 적용해 트랜지션 억제

#### 테마 토글 버튼
- 위치: topbar 우측 (로그아웃 버튼 좌측)
- 상태: 라이트=☀ SVG 아이콘, 다크=🌙 SVG 아이콘
- 클릭 시: `document.documentElement.toggleAttribute('data-theme')` + localStorage 저장 + `act=saveTheme` POST

### CSS 변수 (design-system.css)

| 변수 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| --color-bg | #F4F5F7 | #0F1117 | 앱 배경 |
| --color-surface | #FFFFFF | #1A1D27 | 카드/패널 배경 |
| --color-surface-2 | #F0F1F5 | #222536 | 테이블 헤더, 인풋 배경 |
| --color-border | #DDE0E8 | #2E3250 | 기본 보더 |
| --color-primary | #4F6EF7 | #4F6EF7 | 주요 액션 |
| --color-text-1 | #1A1D27 | #E8EAF0 | 본문 텍스트 |
| --color-text-2 | #4A5068 | #9CA3C4 | 보조 텍스트 |
| --color-text-3 | #8C93B0 | #5C6389 | 비활성/레이블 |
| --shadow-sm | rgba(0,0,0,0.08) | rgba(0,0,0,0.40) | 기본 그림자 |
| --topbar-height | 48px | — | 상단 바 |
| --sidebar-width | 240px | — | 사이드바 (펼침) |
| --sidebar-collapsed | 56px | — | 사이드바 (접힘) |
| --grid-row-height | 36px | — | 그리드 행 높이 |
| --btn-height | 32px | — | 버튼 기본 높이 |
| --input-height | 32px | — | 인풋 기본 높이 |
| --radius-md | 6px | — | 기본 border-radius |

### 레이아웃 구조
```
topbar        48px  고정
└─ body
   ├─ sidebar  240px (접힘 56px)
   └─ main
      ├─ breadcrumb  36px
      ├─ toolbar     48px
      ├─ content     flex (나머지)
      └─ pagination  40px
```

### Tailwind 토큰 체계 (tailwind.config.js 정의)

| 클래스 | CSS 변수 | 용도 |
|--------|----------|------|
| `text-primary` | `--color-text-1` | 실데이터·제목·컬럼 헤더 |
| `text-secondary` | `--color-text-2` | 보조 텍스트·레이블 |
| `text-muted` | `--color-text-3` | placeholder·빈값(-) 전용 |
| `text-link` | `--color-primary` | 링크·클릭 가능한 텍스트 |
| `bg-base` | `--color-bg` | 앱 전체 배경 |
| `bg-surface` | `--color-surface` | 카드·패널 |
| `bg-surface-2` | `--color-surface-2` | 테이블 헤더·인풋 배경 |
| `border-border-base` | `--color-border` | 기본 보더 |
| `border-border-light` | `--color-border-light` | 흐린 보더 |
| `text-danger` / `bg-danger-dim` | `--color-danger` | 에러·삭제 |
| `text-success` / `bg-success-dim` | `--color-success` | 성공 |
| `bg-accent` / `text-accent` | `--color-primary` | 주요 액션 버튼 |
| `h-row` | `--grid-row-height` | 그리드 행 높이 36px |
| `h-btn` / `h-btn-sm` | `--btn-height` | 버튼 높이 |
| `h-input` | `--input-height` | 인풋 높이 |
| `h-topbar` | `--topbar-height` | 탑바 높이 |
| `w-sidebar` | `--sidebar-width` | 사이드바 너비 |

### 컴포넌트 작성 금지 사항 (Claude Code 절대 준수)

- **`text-gray-*`, `text-slate-*`, `text-zinc-*` 등 Tailwind 기본 색상 클래스 사용 금지**
- **`opacity-*`, `text-opacity-*` 로 텍스트 흐리게 하는 것 금지**
- **하드코딩 `color`, hex 값 `style` 속성 금지** (예: `style={{ color: '#999' }}`)
- 위 토큰 외 임의 색상이 필요한 경우 반드시 먼저 확인 요청할 것

### 텍스트 색상 사용 규칙 (예외 없음)

| 상황 | 사용 클래스 | 금지 |
|------|------------|------|
| 그리드 셀 값 | `text-primary` | `text-gray-700`, `opacity-70` 등 |
| 컬럼 헤더 | `text-primary` | `text-gray-500` 등 |
| 페이지 제목 | `text-primary` | 하드코딩 color |
| 링크 텍스트 | `text-link` | `text-blue-500` 등 |
| 보조 설명·레이블 | `text-secondary` | — |
| placeholder·빈값(-) | `text-muted` | — (유일하게 흐린 색 허용) |

### CSS 작성 규칙
- 모든 색상/크기는 **Tailwind 토큰 또는 CSS 변수만 사용** (하드코딩 금지)
- 그리드 행 높이: `h-row` (= `var(--grid-row-height)` = 36px)
- border-radius 기본: `rounded` (= `var(--radius-md)` = 6px)
- 버튼·인풋 높이: `h-btn` / `h-input` (= 32px)
- 테이블 헤더: `bg-surface-2 text-xs uppercase text-muted font-bold`
- React 컴포넌트: 인라인 style 대신 Tailwind 클래스 사용 (레이아웃 계산값만 예외)

### UX 규칙
- **스켈레톤 로딩**: API 응답 전 반드시 `.skeleton` 클래스로 표시 (빈 화면 금지)
- **마이크로인터랙션**: 저장/삭제/로딩 시 단계별 피드백 (버튼 disabled + spinner → 완료 메시지)
- 저장 버튼: 저장 중 `disabled` + 인라인 스피너 표시 → 성공/실패 알림
- 삭제: confirm → 로딩 → 목록 갱신
