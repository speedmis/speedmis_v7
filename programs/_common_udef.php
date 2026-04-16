<?php
/**
 * 고객사 전용 공통 로직
 *
 * 이 파일은 SpeedMIS 업데이트 시 덮어쓰지 않습니다.
 * 고객사별 공통 로직을 여기에 작성하세요.
 *
 * 함수명 규칙: user_ + 훅이름
 *   user_pageLoad()           → common_pageLoad() 후, 개별 pageLoad() 전에 실행
 *   user_before_query()       → common_before_query() 후, 개별 before_query() 전에 실행
 *   user_save_updateAfter()   → common_save_updateAfter() 후, 개별 save_updateAfter() 전에 실행
 *   ... (모든 훅에 대해 user_ 접두어 사용 가능)
 *
 * 실행 순서: common_ → user_ → 개별
 *
 * 일반 헬퍼 함수도 자유롭게 정의 가능 (모든 프로그램에서 호출 가능)
 */

// ── 헬퍼 함수 예시 ──

// function getMyCompanyName() {
//     global $__pdo;
//     return $__pdo->query("SELECT company_name FROM my_config LIMIT 1")->fetchColumn() ?: '우리회사';
// }

// ── 훅 예시 ──

// function user_pageLoad() {
//     global $misSessionUserId;
//     // 고객사 공통: 모든 프로그램 접속 시 처리
// }

// function user_save_deleteBefore($idx, &$cancelDelete) {
//     global $misSessionIsAdmin;
//     // 고객사 정책: 관리자만 삭제 허용
//     // if ($misSessionIsAdmin !== 'Y') {
//     //     $cancelDelete = true;
//     //     $GLOBALS['_client_alert'] = '삭제 권한이 없습니다.';
//     // }
// }
