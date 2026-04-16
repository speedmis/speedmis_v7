<?php


function pageLoad() {
    global $actionFlag, $gubun, $misSessionUserId, $misSessionIsAdmin;
    $GLOBALS['_client_css'] = '.mis-check-col { display: none !important; }';
/*
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  사용 가능한 전역변수 (global 선언 후 사용)                           │
 * ├──────────────────────────┬───────────────────────────────────────────┤
 * │ $actionFlag              │ 현재 액션 (list/view/modify/write/delete) │
 * │ $gubun                   │ 메뉴 idx (정수)                           │
 * │ $idx                     │ 레코드 idx (정수)                         │
 * │ $real_pid                │ 프로그램 real_pid (speedmis000036 형태)   │
 * │ $menu_name               │ 프로그램명                                │
 * │ $parent_idx              │ 마스터-디테일 상위 idx                    │
 * │ $misSessionUserId        │ 로그인 사용자 ID                         │
 * │ $misSessionIsAdmin       │ 관리자 여부 ('Y' 또는 '')                │
 * │ $misSessionPositionCode  │ 직급 코드                                │
 * │ $isFirstLoad             │ 프로그램 최초 로딩 여부 (bool)            │
 * │ $isListEdit              │ 목록편집(인라인) 저장 여부 (bool)         │
 * │ $listEditField           │ 목록편집 시 변경된 필드명 배열            │
 * │ $customAction            │ 사용자 정의 버튼 action 값               │
 * │ $allFilter               │ 필터 JSON 문자열                         │
 * │ $orderby                 │ 정렬 문자열                              │
 * │ $page                    │ 현재 페이지                              │
 * │ $pageSize                │ 페이지당 건수                            │
 * │ $__pdo                   │ PDO 인스턴스 (DB 직접 접근)              │
 * │ $full_site               │ 사이트 주소                              │
 * ├──────────────────────────┴───────────────────────────────────────────┤
 * │  클라이언트 제어 ($GLOBALS['...'] = 값)                              │
 * ├──────────────────────────┬───────────────────────────────────────────┤
 * │ _client_alert            │ alert() 팝업 표시                        │
 * │ _client_toast            │ 토스트 알림 표시                         │
 * │ _client_confirm          │ 저장 전 확인 (Yes→저장, No→취소)         │
 * │ _client_openTab          │ 새 탭 열기 {gubun, label, idx, openFull} │
 * │ _client_redirect         │ 현재 탭 교체 {gubun, label}              │
 * │ _client_css              │ CSS 주입 (문자열)                        │
 * │ _client_buttonText       │ 버튼 텍스트 변경 {write, reset}          │
 * │ _client_buttons          │ 사용자정의 버튼 [{label, action}]        │
 * │ _onlyList                │ 리스트전용 모드 (true)                   │
 * └──────────────────────────┴───────────────────────────────────────────┘
 *
 *  SQL 실행 헬퍼:
 *    $result = execSql("INSERT INTO t (name) VALUES (?)", ['홍길동']);
 *    $result = execSql("UPDATE a SET x=1; DELETE FROM b WHERE y=2");
 *    // 결과: resultCode, resultMessage, lastInsertId, rowCount
 */

    /*
     * ■ 리스트전용 프로그램 (조회만, 등록/수정 불가)
     * $GLOBALS['_onlyList'] = true;
     *
     * ■ 버튼 텍스트 변경
     * $GLOBALS['_client_buttonText'] = [
     *     'write' => '접수하기',     // +등록 → 접수하기
     *     'reset' => '전체보기',     // 초기화 → 전체보기
     * ];
     *
     * ■ 사용자 정의 버튼 추가 (list_json_init에서 $customAction으로 감지)
     * $GLOBALS['_client_buttons'] = [
     *     ['label' => '일괄적용', 'action' => 'apply'],
     *     ['label' => '마감처리', 'action' => 'close'],
     *     ['label' => '엑셀가져오기', 'action' => 'importExcel'],
     * ];
     *
     * ■ CSS 주입 (특정 요소 숨기기/스타일링)
     * $GLOBALS['_client_css'] = '
     *     #mis-btn-write { display: none; }
     *     #mis-btn-reset { background: #3182F6; color: #fff; }
     *     #mis-header { background: #f0f8ff; }
     * ';
     * // 주요 CSS ID: #mis-program, #mis-header, #mis-title,
     * //   #mis-header-actions, #mis-btn-write, #mis-btn-reset, #mis-btn-custom-0
     */

     $GLOBALS['_onlyList'] = true;

    // ── 뷰 디자이너가 팝업(iframe)으로 호출된 경우 ──────────────────────────
    $isPopup = ($_GET['isPopup'] ?? '') === 'Y';
    if ($isPopup) {
        // 1) 불필요 버튼 숨김 (초기화 / 메뉴삽입 / ⋯) — 기존 _client_css 에 append
        $GLOBALS['_client_css'] = (string)($GLOBALS['_client_css'] ?? '') . '
            #mis-btn-reset,
            #mis-menu-insert,
            #mis-panel-more { display: none !important; }
            #mis-designer-toolbar {
                display: flex; gap: 4px; align-items: center;
                padding: 6px 10px; border-bottom: 1px solid var(--color-border);
                background: var(--color-surface-2);
            }
            #mis-designer-toolbar button {
                height: 28px; padding: 0 10px;
                border: 1px solid var(--color-border); border-radius: 6px;
                background: var(--color-surface); color: var(--color-text-1);
                font-size: 12px; font-weight: 600; cursor: pointer;
                transition: background .12s, color .12s, border-color .12s;
            }
            #mis-designer-toolbar button:hover { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
            #mis-designer-toolbar button.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
            #mis-designer-toolbar .spacer { flex: 1; }
            #mis-designer-toolbar button.apply { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
            #mis-designer-toolbar button.apply:hover { filter: brightness(1.1); }
        ';

        // 2) XS / SM / MD / LG / 디자인적용 버튼 추가 + 부모창 view 폭 조정
        $GLOBALS['_client_js'] = <<<'JS'
(function () {
    if (document.getElementById('mis-designer-toolbar')) return;
    var host = document.getElementById('mis-program');
    if (!host) return;

    var bar = document.createElement('div');
    bar.id = 'mis-designer-toolbar';

    // Bootstrap 5 표준 브레이크포인트 — 콘텐츠 폭 기준
    // 래퍼(#mis-form-wrap) 폭 = 콘텐츠 목표 + CHROME (padding 32 + 스크롤바 ~15 보정)
    var CHROME = 50;
    var widths = [
        { label: 'XL(≥1200)', w: 1200 + CHROME },
        { label: 'LG(≥992)',  w:  992 + CHROME },
        { label: 'MD(≥768)',  w:  768 + CHROME },
        { label: 'SM(≥576)',  w:  576 + CHROME },
        { label: 'XS(<576)',  w:  420            }
    ];

    function applyWidth(px, btn) {
        try {
            var pwin = window.parent;
            var pdoc = pwin && pwin.document;
            if (!pdoc) return;
            var formWrap = pdoc.getElementById('mis-form-wrap');
            if (!formWrap) {
                alert('폼 영역이 열려있을 때만 사용할 수 있습니다.\n레코드를 먼저 선택하세요.');
                return;
            }

            // 활성 버튼 표시
            bar.querySelectorAll('button[data-w]').forEach(function (b) { b.classList.remove('active'); });
            if (btn) btn.classList.add('active');

            // '4'(full) 모드 가용 폭 = 폼 래퍼의 부모 폭
            var parentRow = formWrap.parentElement;
            var availableAtFull = parentRow ? parentRow.clientWidth : 0;

            // 요청 폭이 '4' 폭 이상 → '4' 버튼 클릭과 동일하게 처리
            if (availableAtFull && px >= availableAtFull) {
                if (typeof pwin.__misSetDesignerWidth === 'function') pwin.__misSetDesignerWidth(null);
                var btn4 = pdoc.getElementById('mis-panel-size-4');
                if (btn4) btn4.click();
                return;
            }

            // 부모 React state 로 경계선 이동 (인라인 !important 사용 안 함)
            if (typeof pwin.__misSetDesignerWidth === 'function') {
                pwin.__misSetDesignerWidth(px);
            }
        } catch (e) { console.error(e); }
    }

    widths.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = it.label;
        b.dataset.w = String(it.w);
        b.addEventListener('click', function () { applyWidth(it.w, b); });
        bar.appendChild(b);
    });

    var spacer = document.createElement('div');
    spacer.className = 'spacer';
    bar.appendChild(spacer);

    var applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'apply';
    applyBtn.textContent = '디자인적용';
    applyBtn.addEventListener('click', async function () {
        // 1) 대상 real_pid 추출 (URL allFilter에서)
        var rp = '';
        try {
            var af = JSON.parse(new URLSearchParams(window.location.search).get('allFilter') || '[]');
            af.forEach(function (x) {
                if (!rp && (x.field || '').indexOf('real_pid') >= 0) rp = x.value;
            });
        } catch (e) {}
        if (!rp) { alert('대상 real_pid를 찾을 수 없습니다.'); return; }

        // 2) CSRF 토큰 확보
        var m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
        var csrf = m ? decodeURIComponent(m[1]) : '';
        if (!csrf) {
            try {
                var rr = await fetch('/api.php?act=csrf', { credentials: 'include' });
                var dd = await rr.json();
                csrf = dd.csrf_token || '';
            } catch (e) {}
        }

        // 3) treat 호출
        try {
            applyBtn.disabled = true;
            applyBtn.textContent = '적용중...';
            var res = await fetch('/api.php?act=treat&gubun=1333', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({ action: 'applyDesign', real_pid: rp })
            });
            var data = await res.json();
            if (!data.success || !(data.data && data.data.ok)) {
                alert((data.message || (data.data && data.data.message)) || '디자인 적용 실패');
                return;
            }
            // 4) 부모창: 새로고침 대신 그리드/폼만 재로드
            try {
                if (typeof window.parent.__misRefreshProgram === 'function') {
                    window.parent.__misRefreshProgram();
                } else {
                    window.parent.location.reload();
                }
            } catch (e) {}
        } catch (e) {
            alert('오류: ' + e.message);
        } finally {
            applyBtn.disabled = false;
            applyBtn.textContent = '디자인적용';
        }
    });
    bar.appendChild(applyBtn);

    host.insertBefore(bar, host.firstChild);
})();
JS;
    }
}

/**
 * 디자인 적용: grid_view_class 가 비어있는 필드에 반응형 클래스 + 높이를 자동 설정
 *
 * Bootstrap 5 표준 BP 기준: XS<576 / SM≥576 / MD≥768 / LG≥992 / XL≥1200
 * grid_view_class 형식: "col-sm-N col-md-N col-lg-N col-xl-N row-N"
 *  - html(Quill):           col-sm-12 col-md-12 col-lg-12 col-xl-12 row-60  (52+9, max-height 9)
 *  - 첨부/이미지/textarea:  col-sm-12 col-md-12 col-lg-12 col-xl-12 row-4
 *  - 일반 입력:              col-sm-12 col-md-6  col-lg-4  col-xl-3  row-1
 */
function addLogic_treat(&$result) {
    global $__pdo;

    $action = $result['action'] ?? '';
    if ($action !== 'applyDesign') return;

    $realPid = trim((string)($result['real_pid'] ?? ''));
    if ($realPid === '') {
        $result['ok'] = false;
        $result['message'] = 'real_pid 필수';
        return;
    }

    try {
        // grid_view_class 가 비어있는 필드만 대상
        $stmt = $__pdo->prepare(
            "SELECT idx, grid_ctl_name, schema_type
               FROM mis_menu_fields
              WHERE real_pid = ?
                AND (grid_view_class IS NULL OR grid_view_class = '')
                AND use_yn = '1'"
        );
        $stmt->execute([$realPid]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $upd = $__pdo->prepare(
            "UPDATE mis_menu_fields
                SET grid_view_class = ?
              WHERE idx = ?"
        );

        $count = 0;
        foreach ($rows as $r) {
            $gridCtl  = (string)($r['grid_ctl_name'] ?? '');
            $schema   = (string)($r['schema_type']   ?? '');

            $isAttach   = ($gridCtl === 'attach' || $gridCtl === 'image');
            $isTextarea = ($gridCtl === 'textarea' || $schema === 'textarea');
            $isHtml     = ($gridCtl === 'html' || $schema === 'html');

            if ($isHtml) {
                $cls = 'col-sm-12 col-md-12 col-lg-12 col-xl-12 row-60';
            } elseif ($isAttach || $isTextarea) {
                $cls = 'col-sm-12 col-md-12 col-lg-12 col-xl-12 row-4';
            } else {
                $cls = 'col-sm-12 col-md-6 col-lg-4 col-xl-3 row-1';
            }

            $upd->execute([$cls, $r['idx']]);
            $count++;
        }

        // 캐시 무효화 (대상 프로그램의 목록/뷰 캐시)
        try {
            $cache = new \App\MisCache();
            $cache->invalidateByRealPid($realPid);
        } catch (\Throwable $e) {}

        $result['ok']      = true;
        $result['count']   = $count;
        $result['message'] = "{$count}건 적용됨";
    } catch (\Throwable $e) {
        $result['ok']      = false;
        $result['message'] = '예외: ' . $e->getMessage();
    }
}