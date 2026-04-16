<?php
/**
 * mis_menu_fields.alias_name 을 camelCase/PascalCase → snake_case 로 일괄 변환
 *
 * 실행: php migration/alias_name_to_snake_case.php [--dry-run]
 *   --dry-run : DB를 변경하지 않고 변환 결과만 출력
 */

$dryRun = in_array('--dry-run', $argv ?? [], true);

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host    = $_ENV['DB_HOST']    ?? '127.0.0.1';
$port    = $_ENV['DB_PORT']    ?? '3306';
$dbname  = $_ENV['DB_NAME']    ?? 'speedmis_v7';
$user    = $_ENV['DB_USER']    ?? 'root';
$pass    = $_ENV['DB_PASS']    ?? '';
$charset = $_ENV['DB_CHARSET'] ?? 'utf8mb4';

$pdo = new PDO(
    "mysql:host={$host};port={$port};dbname={$dbname};charset={$charset}",
    $user,
    $pass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

/**
 * camelCase / PascalCase → snake_case 변환
 * 예) SetUserid       → set_userid
 *     MenuName        → menu_name
 *     table_SetUseridQnusername → table_set_userid_qnusername
 *     isMenuHidden    → is_menu_hidden
 *     AddURL          → add_url
 *     AutoGubun       → auto_gubun
 */
function toSnakeCase(string $s): string
{
    // 연속 대문자 뒤에 대문자+소문자가 오는 경우 분리 (e.g. "URLPath" → "URL_Path")
    $s = preg_replace('/([A-Z]+)([A-Z][a-z])/', '$1_$2', $s);
    // 소문자/숫자 뒤에 대문자가 오는 경우 분리 (e.g. "camelCase" → "camel_Case")
    $s = preg_replace('/([a-z\d])([A-Z])/', '$1_$2', $s);
    return strtolower($s);
}

// 전체 레코드 조회 (idx 포함, alias_name이 NULL인 레코드는 제외)
$rows = $pdo->query("SELECT idx, alias_name FROM mis_menu_fields WHERE alias_name IS NOT NULL ORDER BY idx")->fetchAll(PDO::FETCH_ASSOC);

$changed  = 0;
$skipped  = 0;
$conflicts = [];

// 변환 전 중복 체크용: (real_pid, sort_order) 별로 새 alias를 수집
// 같은 real_pid 안에서 변환 후 값이 충돌하는지 확인
$realPidRows = $pdo->query("SELECT idx, real_pid, alias_name FROM mis_menu_fields WHERE alias_name IS NOT NULL ORDER BY idx")->fetchAll(PDO::FETCH_ASSOC);
$byRealPid = [];
foreach ($realPidRows as $r) {
    $byRealPid[$r['real_pid']][] = ['idx' => $r['idx'], 'alias_name' => $r['alias_name']];
}

// 충돌 감지: 두 가지 다른 alias_name 이 같은 snake_case 로 변환되는 경우만 검사
// (이미 중복된 동일 alias_name은 변환 대상이 아니므로 무시)
foreach ($byRealPid as $realPid => $rFields) {
    // old→new 변환이 실제로 발생하는 레코드만 대상
    $newSeen = []; // newAlias → old alias_name
    foreach ($rFields as $r) {
        $old = $r['alias_name'];
        $new = toSnakeCase($old);
        if ($old === $new) continue; // 변환 없는 건 스킵
        if (isset($newSeen[$new]) && $newSeen[$new] !== $old) {
            $conflicts[] = "real_pid={$realPid} idx={$r['idx']} '{$old}' → '{$new}' conflicts with '{$newSeen[$new]}'";
        }
        $newSeen[$new] = $old;
    }
}

if ($conflicts) {
    echo "⚠️  충돌 감지 (변환 후 동일한 alias가 생기는 케이스 — 뒤에 오는 항목은 _2 suffix 추가):\n";
    foreach ($conflicts as $c) {
        echo "  - $c\n";
    }
    echo "\n";
}

// 충돌 idx 목록 수집: 두 다른 old 값이 같은 new 값으로 변환되는 경우, 나중 것에 _2 suffix
$conflictIdxSuffix = [];
foreach ($byRealPid as $realPid => $rFields) {
    $newSeen = []; // newAlias → first old value
    foreach ($rFields as $r) {
        $old = $r['alias_name'];
        $new = toSnakeCase($old);
        if ($old === $new) continue; // 변환 없는 건 스킵
        if (isset($newSeen[$new]) && $newSeen[$new] !== $old) {
            // 두 번째 등장 → _2 suffix
            $conflictIdxSuffix[$r['idx']] = $new . '_2';
        } else {
            $newSeen[$new] = $old;
        }
    }
}

if (!$dryRun) {
    $pdo->beginTransaction();
}

$stmt = $pdo->prepare("UPDATE mis_menu_fields SET alias_name = ? WHERE idx = ?");

foreach ($rows as $row) {
    $old = $row['alias_name'];
    $new = isset($conflictIdxSuffix[$row['idx']])
        ? $conflictIdxSuffix[$row['idx']]
        : toSnakeCase($old);

    if ($old === $new) {
        $skipped++;
        continue;
    }

    if ($dryRun) {
        $suffix = isset($conflictIdxSuffix[$row['idx']]) ? ' [충돌→suffix]' : '';
        echo "{$old}  →  {$new}{$suffix}\n";
    } else {
        $stmt->execute([$new, $row['idx']]);
    }
    $changed++;
}

if (!$dryRun) {
    $pdo->commit();
    echo "완료: {$changed}개 변환, {$skipped}개 이미 snake_case\n";
} else {
    echo "\n[DRY RUN] 변환 대상: {$changed}개, 변환 불필요: {$skipped}개\n";
}
