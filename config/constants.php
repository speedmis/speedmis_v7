<?php
define('BASE_PATH',     dirname(__DIR__));
define('PROGRAMS_PATH', BASE_PATH . '/programs');
define('UPLOADS_PATH',  BASE_PATH . '/uploads'); // legacy
define('UPLOAD_FILES_PATH', BASE_PATH . '/uploadFiles'); // 신규 — /uploadFiles/{table}/{field}/{idx}/
define('UPLOAD_TEMP_PATH',  UPLOAD_FILES_PATH . '/_temp');
define('LOGS_PATH',     BASE_PATH . '/logs');
define('CACHE_PATH',    BASE_PATH . '/logs/cache');
define('PUBLIC_PATH',   BASE_PATH . '/public');

define('JWT_ACCESS_TTL',  3600);       // 1시간
define('JWT_REFRESH_TTL', 2592000);    // 30일
define('JWT_ALGO',        'HS256');

define('DEFAULT_PAGE_SIZE', (int)($_ENV['DEFAULT_PAGE_SIZE'] ?? 25));
define('MAX_PAGE_SIZE',     99999);

define('LOGIN_MAX_FAIL',    5);
define('LOGIN_LOCK_MINUTE', 60);

define('CACHE_TTL', 300);

/**
 * SQL 실행 헬퍼 — programs/*.php 훅에서 사용
 * 세미콜론(;)으로 구분된 여러 쿼리도 순차 실행
 *
 * @param  string $sql      실행할 SQL (복수 쿼리 가능)
 * @param  array  $bindings 바인딩 값 (단일 쿼리용)
 * @return array  ['resultCode'=>'success'|'fail', 'resultMessage'=>'', 'resultQuery'=>$sql, 'lastInsertId'=>'']
 */
function execSql(string $sql, array $bindings = []): array
{
    global $__pdo;
    $sql = trim($sql);
    if ($sql === '') {
        return ['resultCode' => 'fail', 'resultMessage' => '쿼리가 비어있습니다.', 'resultQuery' => ''];
    }

    // 실행 로그 수집 (개발자모드용)
    if (!isset($GLOBALS['_execSql_log'])) $GLOBALS['_execSql_log'] = [];

    try {
        // 바인딩이 있으면 단일 쿼리 prepare/execute
        if (!empty($bindings)) {
            $stmt = $__pdo->prepare($sql);
            $stmt->execute($bindings);
            $result = [
                'resultCode'    => 'success',
                'resultMessage' => '',
                'resultQuery'   => $sql,
                'lastInsertId'  => $__pdo->lastInsertId(),
                'rowCount'      => $stmt->rowCount(),
            ];
            $GLOBALS['_execSql_log'][] = ['sql' => $sql, 'bindings' => $bindings, 'result' => 'success', 'rowCount' => $result['rowCount']];
            return $result;
        }

        // 바인딩 없음 → 세미콜론 분리하여 멀티 쿼리 실행
        $queries = array_filter(array_map('trim', explode(';', $sql)), fn($q) => $q !== '');
        $lastId  = '';
        $totalRows = 0;
        foreach ($queries as $q) {
            $stmt = $__pdo->prepare($q);
            $stmt->execute();
            $lastId    = $__pdo->lastInsertId() ?: $lastId;
            $rows = $stmt->rowCount();
            $totalRows += $rows;
            $GLOBALS['_execSql_log'][] = ['sql' => $q, 'bindings' => [], 'result' => 'success', 'rowCount' => $rows];
        }
        return [
            'resultCode'    => 'success',
            'resultMessage' => '',
            'resultQuery'   => $sql,
            'lastInsertId'  => $lastId,
            'rowCount'      => $totalRows,
        ];
    } catch (\Throwable $e) {
        $GLOBALS['_execSql_log'][] = ['sql' => $sql, 'bindings' => $bindings, 'result' => 'fail', 'error' => $e->getMessage()];
        return [
            'resultCode'    => 'fail',
            'resultMessage' => $e->getMessage(),
            'resultQuery'   => $sql,
        ];
    }
}

/**
 * 그리드 셀 내 탭 열기 버튼 HTML 생성
 *
 * @param string $label   버튼 텍스트
 * @param array  $options 옵션 {gubun, real_pid, idx, link_val, label(탭제목), open_full, class}
 * @return string HTML
 *
 * 사용법:
 *   openTabBtn('상세', ['real_pid'=>'speedmis000314', 'idx'=>$data['idx']])
 *   openTabBtn('보기', ['gubun'=>36, 'idx'=>100, 'label'=>'그룹관리'])
 *   openTabBtn('삭제', ['real_pid'=>'speedmis000100', 'class'=>'btn-danger'])
 *   openTabBtn('OK',   ['gubun'=>36, 'class'=>'btn-success btn-sm'])
 */
function openTabBtn(string $label, array $opts = []): string
{
    $detail = [];
    if (!empty($opts['gubun']))    $detail[] = 'gubun:' . (int)$opts['gubun'];
    if (!empty($opts['real_pid'])) $detail[] = "realPid:'" . addslashes($opts['real_pid']) . "'";
    if (isset($opts['idx']))       $detail[] = 'idx:' . json_encode($opts['idx']);
    if (!empty($opts['link_val'])) $detail[] = 'linkVal:' . json_encode($opts['link_val']);
    if (!empty($opts['label']))    $detail[] = "label:'" . addslashes($opts['label']) . "'";
    if (!empty($opts['open_full'])) $detail[] = 'openFull:true';

    $cls = $opts['class'] ?? 'btn-open';

    // data-opentab용 JSON 빌드
    $detailMap = [];
    if (!empty($opts['gubun']))    $detailMap['gubun']   = (int)$opts['gubun'];
    if (!empty($opts['real_pid'])) $detailMap['realPid'] = $opts['real_pid'];
    if (isset($opts['idx']))       $detailMap['idx']     = $opts['idx'];
    if (!empty($opts['link_val'])) $detailMap['linkVal'] = $opts['link_val'];
    if (!empty($opts['label']))    $detailMap['label']   = $opts['label'];
    if (!empty($opts['open_full'])) $detailMap['openFull'] = true;
    $json = json_encode($detailMap, JSON_UNESCAPED_UNICODE);

    return '<button class="' . $cls . '" data-opentab="' . htmlspecialchars($json, ENT_QUOTES, 'UTF-8') . '">' . htmlspecialchars($label) . '</button>';
}
