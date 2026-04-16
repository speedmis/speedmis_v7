<?php
/**
 * 공통 로직 — 모든 프로그램에 자동 적용
 *
 * 함수명 규칙: common_ + 훅이름
 *   common_pageLoad()         → 개별 pageLoad() 보다 먼저 실행
 *   common_before_query()     → 개별 before_query() 보다 먼저 실행
 *   common_list_json_init()   → 개별 list_json_init() 보다 먼저 실행
 *   common_list_json_load()   → 개별 list_json_load() 보다 먼저 실행
 *   common_save_updateReady() → 개별 save_updateReady() 보다 먼저 실행
 *   common_save_updateAfter() → 개별 save_updateAfter() 보다 먼저 실행
 *   common_save_writeAfter()  → 개별 save_writeAfter() 보다 먼저 실행
 *   ... (모든 훅에 대해 common_ 접두어 사용 가능)
 *
 * 실행 순서: common_훅 → 개별_훅
 * 파일 위치: programs/_common.php (이 파일)
 */

/**
 * 공통 pageLoad — 모든 프로그램 로드 시 실행
 */
function common_pageLoad() {
    global $misSessionUserId, $misSessionIsAdmin, $real_pid, $gubun;

    // 예: 접속 로그 기록
    // global $__pdo;
    // $__pdo->prepare("INSERT INTO mis_access_log (user_id, real_pid, gubun, wdate)
    //     VALUES (?, ?, ?, NOW())")->execute([$misSessionUserId, $real_pid, $gubun]);
}

/**
 * 공통 before_query — 모든 쿼리 빌드 전 실행
 */
// function common_before_query($menu, $fields, $params) {
//     global $misSessionUserId, $misSessionIsAdmin;
//     // 예: 관리자가 아니면 특정 조건 강제
// }

/**
 * 공통 list_json_init — 모든 목록 로딩 전 실행
 */
// function common_list_json_init() {
//     global $misSessionUserId, $isFirstLoad;
//     // 예: 최초 로딩 시 공통 알림
//     // if ($isFirstLoad) $GLOBALS['_client_toast'] = '환영합니다!';
// }

/**
 * 공통 save_updateAfter — 모든 UPDATE 완료 후 실행
 */
// function common_save_updateAfter($idx, &$afterScript) {
//     global $misSessionUserId, $gubun, $real_pid, $__pdo;
//     // 예: 모든 수정에 대한 히스토리 기록
//     // $__pdo->prepare("INSERT INTO mis_change_log (gubun, real_pid, record_idx, user_id, action, wdate)
//     //     VALUES (?, ?, ?, ?, 'update', NOW())")->execute([$gubun, $real_pid, $idx, $misSessionUserId]);
// }

/**
 * 공통 save_writeAfter — 모든 INSERT 완료 후 실행
 */
// function common_save_writeAfter($newIdx, &$afterScript) {
//     global $misSessionUserId, $gubun, $real_pid, $__pdo;
//     // 예: 신규 등록 알림
//     // $GLOBALS['_client_toast'] = "#{$newIdx} 등록 완료";
// }

/**
 * 공통 save_deleteBefore — 모든 삭제 전 검증
 */
// function common_save_deleteBefore($idx, &$cancelDelete) {
//     global $misSessionIsAdmin;
//     // 예: 관리자만 삭제 허용
//     // if ($misSessionIsAdmin !== 'Y') {
//     //     $cancelDelete = true;
//     //     $GLOBALS['_client_alert'] = '관리자만 삭제할 수 있습니다.';
//     // }
// }
