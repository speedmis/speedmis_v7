<?php
/**
 * 웹소스관리(업무용MIS) — 266번 프로그램 훅
 * add_logic       → programs/{real_pid}.php        (서버로직)
 * add_logic_print → programs/{real_pid}_print.html  (인쇄양식)
 */
  function list_json_load(&$data) {
      // realPid로 탭 열기
      $data['__html']['table_m_qmidx'] = openTabBtn('연결', [
              'real_pid' => $data['real_pid']
          ]). $data['table_m_qmidx'];

  }


function view_load(&$row) {
    $realPid = trim($row['real_pid'] ?? '');
    if ($realPid === '') return;

    // 서버로직: 파일 우선
    $logicFile = PROGRAMS_PATH . "/{$realPid}.php";
    if (file_exists($logicFile)) {
        $row['add_logic'] = file_get_contents($logicFile);
    }

    // 인쇄양식: 파일 우선
    $printFile = PROGRAMS_PATH . "/{$realPid}_print.html";
    if (file_exists($printFile)) {
        $row['add_logic_print'] = file_get_contents($printFile);
    }
}

function save_updateAfter($idx, &$afterScript) {
    $pdo = $GLOBALS['__pdo'] ?? null;
    if (!$pdo) return;

    $stmt = $pdo->prepare('SELECT real_pid, add_logic, add_logic_print FROM mis_menus WHERE idx = ? LIMIT 1');
    $stmt->execute([$idx]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row || empty(trim($row['real_pid'] ?? ''))) return;

    $realPid = trim($row['real_pid']);

    // ── 서버로직 파일 동기화 ──
    _syncFile(PROGRAMS_PATH . "/{$realPid}.php", trim($row['add_logic'] ?? ''), true);

    // ── 인쇄양식 파일 동기화 ──
    _syncFile(PROGRAMS_PATH . "/{$realPid}_print.html", trim($row['add_logic_print'] ?? ''), false);
}

function _syncFile(string $filePath, string $code, bool $phpTag): void {
    if ($code === '') {
        if (file_exists($filePath)) @unlink($filePath);
        return;
    }
    if ($phpTag && stripos(ltrim($code), '<?php') !== 0) {
        $code = "<?php\n" . $code;
    }
    @file_put_contents($filePath, $code);
}