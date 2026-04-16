<?php
/**
 * mis_menu_fields.alias_name 일괄 업데이트
 *
 * v6 MisCommonFunction.php::aliasN_update_all() 를 v7 스키마로 변환
 *
 * 실행: php migration/alias_update_all.php [--dry-run] [--real_pid=speedmis000314]
 *
 * alias_name 결정 규칙 (v6 동일):
 *  1. 현재 alias 가 "qq"로 시작 → 변경하지 않음 (수동 지정값)
 *  2. db_table == "table_m"      → db_field 그대로
 *  3. db_table != ""             → "{db_table}Qn{db_field}"  (uid 예외: "eX_{...}")
 *  4. db_field 에 공백/따옴표/+/( 없음 → db_field (. → Qm 치환)
 *  5. 위 모두 해당 없음          → col_title 기반 ('z' 접두어)
 *  ↓ aliasN() 통과: 특수문자 제거 + 한글 로마자 변환
 *  ↓ 중복 시 Q1, Q2... 접미어
 *  ↓ 50자 truncate
 */

defined('BASE_PATH') || define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/config/constants.php';

// .env 로드 (bootstrap 없이 직접 파싱)
$envFile = BASE_PATH . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v, " \t\r\n\"'");
    }
}

// ── CLI 인수 파싱 ────────────────────────────────────────────────────────────
$dryRun   = in_array('--dry-run', $argv, true);
$onlyPid  = null;
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--real_pid=')) {
        $onlyPid = substr($arg, 11);
    }
}

// ── DB 연결 ──────────────────────────────────────────────────────────────────
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=%s',
    $_ENV['DB_HOST'] ?? '175.207.12.157',
    $_ENV['DB_PORT'] ?? '3306',
    $_ENV['DB_NAME'] ?? 'speedmis_v7',
    $_ENV['DB_CHARSET'] ?? 'utf8mb4'
);
try {
    $pdo = new PDO($dsn, $_ENV['DB_USER'] ?? 'admin', $_ENV['DB_PASS'] ?? '', [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "DB 연결 실패: {$e->getMessage()}\n");
    exit(1);
}

// ── 대상 메뉴 목록 ───────────────────────────────────────────────────────────
$sql    = "SELECT real_pid FROM mis_menus WHERE use_yn = '1' AND menu_type = '01'" .
          ($onlyPid ? " AND real_pid = ?" : '') . " ORDER BY idx";
$stmt   = $pdo->prepare($sql);
$stmt->execute($onlyPid ? [$onlyPid] : []);
$menus  = $stmt->fetchAll();

$totalUpdated = 0;
$totalSkipped = 0;

echo ($dryRun ? "[DRY-RUN] " : "") . "대상 메뉴 수: " . count($menus) . "\n";

foreach ($menus as $menu) {
    $realPid = $menu['real_pid'];
    [$updated, $skipped] = processRealPid($pdo, $realPid, $dryRun);
    $totalUpdated += $updated;
    $totalSkipped += $skipped;
}

echo "\n완료: 업데이트 {$totalUpdated}건, 변경없음 {$totalSkipped}건\n";

// =============================================================================
// 메뉴 단위 처리
// =============================================================================
function processRealPid(PDO $pdo, string $realPid, bool $dryRun): array
{
    $stmt = $pdo->prepare(
        'SELECT idx, alias_name, db_table, db_field, col_title
           FROM mis_menu_fields
          WHERE real_pid = ?
          ORDER BY sort_order ASC, idx ASC'
    );
    $stmt->execute([$realPid]);
    $fields = $stmt->fetchAll();

    $aliasSeen = [];    // 중복 감지용: alias → count
    $updates   = [];    // [idx => new_alias]
    $updated   = 0;
    $skipped   = 0;

    foreach ($fields as $f) {
        $idx      = $f['idx'];
        $dbTable  = str_replace("\t", '', trim($f['db_table'] ?? ''));
        $dbField  = str_replace("\t", '', trim($f['db_field'] ?? ''));
        $colTitle = str_replace("\t", '', trim($f['col_title'] ?? ''));
        $curAlias = str_replace("\t", '', trim($f['alias_name'] ?? ''));

        // 규칙 1: "qq" 로 시작하는 수동 지정값 → 유지
        if (str_starts_with($curAlias, 'qq')) {
            $newAlias = $curAlias;
        }
        // 규칙 2: 주 테이블 필드 → db_field 그대로
        elseif ($dbTable === 'table_m') {
            $newAlias = $dbField;
        }
        // 규칙 3: JOIN 테이블 필드 → "{table}Qn{field}"
        elseif ($dbTable !== '') {
            if ($dbField === 'uid') {
                $newAlias = 'eX_' . $dbTable . 'Qn' . $dbField;
            } else {
                $newAlias = $dbTable . 'Qn' . $dbField;
            }
        }
        // 규칙 4: 단순 컬럼식 (공백/따옴표/+/( 없음) → db_field (. → Qm)
        elseif (
            $dbField !== '' &&
            !str_contains($dbField, ' ')  &&
            !str_contains($dbField, "'")  &&
            !str_contains($dbField, '+')  &&
            !str_contains($dbField, '(')
        ) {
            $newAlias = str_replace('.', 'Qm', $dbField);
        }
        // 규칙 5: 복잡한 표현식 → col_title 기반
        else {
            $title = str_contains($colTitle, ',')
                ? explode(',', $colTitle)[1]
                : $colTitle;
            $newAlias = 'z' . $title;
        }

        // aliasN() 정규화
        $newAlias = aliasN($newAlias);

        // db_field 가 비어있으면 alias 도 비움
        if ($dbField === '') {
            $newAlias = '';
        } else {
            // 중복 처리: Q1, Q2 ...
            $key   = $newAlias;
            $count = $aliasSeen[$key] ?? 0;
            $aliasSeen[$key] = $count + 1;
            if ($count > 0) {
                $newAlias = $newAlias . 'Q' . $count;
            }
        }

        // 50자 truncate
        $newAlias = mb_substr($newAlias, 0, 50, 'UTF-8');

        if ($newAlias === $curAlias) {
            $skipped++;
            continue;
        }

        $updates[$idx] = [$curAlias, $newAlias];
    }

    // UPDATE 실행
    $updateStmt = $pdo->prepare(
        'UPDATE mis_menu_fields SET alias_name = ? WHERE idx = ?'
    );
    foreach ($updates as $idx => [$old, $new]) {
        if (!$dryRun) {
            $updateStmt->execute([$new, $idx]);
        }
        echo "  [{$realPid}] idx={$idx}  '{$old}' → '{$new}'\n";
        $updated++;
    }

    return [$updated, $skipped];
}

// =============================================================================
// aliasN(): 특수문자 제거 + 다국어 로마자 변환
// (v6 MisCommonFunction.php::aliasN() 동일 로직)
// =============================================================================
function aliasN(string $han): string
{
    // 콤마가 있으면 두 번째 토큰 사용
    if (str_contains($han, ',')) {
        $parts = explode(',', $han);
        $han   = $parts[1] ?? '';
    }

    // 특수문자 제거
    $remove = [' ',',','*',"'",'-',':','[',']','+'  ,'(',')','/','|',
               '.','~','!','@','#','$','^','&','\\','=','`','}','{',
               '"',';','?','<','>'];
    $alias  = str_replace($remove, '', $han);

    // 숫자로 시작하면 "numQ" 접두어
    if ($alias !== '' && ctype_digit($alias[0])) {
        $alias = 'numQ' . $alias;
    }

    // 다국어 → 로마자 변환
    $alias = newAliasName($alias);

    // urlencode 잔여 % 제거
    $alias = str_replace('%', '', $alias);

    // 여전히 멀티바이트(한글 등)가 남아있으면 urlencode 후 % 제거
    if (mb_strlen($alias, 'UTF-8') !== strlen($alias)) {
        $alias = str_replace('%', '', urlencode($alias));
    }

    return $alias;
}

// =============================================================================
// newAliasName(): 멀티바이트 문자 → 로마자
// =============================================================================
function newAliasName(string $text): string
{
    $text   = mb_substr($text, 0, 50, 'UTF-8');
    if (trim($text) === '') return '';

    $result = '';
    $length = mb_strlen($text, 'UTF-8');

    for ($i = 0; $i < $length; $i++) {
        $char      = mb_substr($text, $i, 1, 'UTF-8');
        $codepoint = mb_ord($char, 'UTF-8');

        // ASCII → 그대로
        if ($codepoint < 128) { $result .= $char; continue; }

        // 한글 (가-힣)
        if ($codepoint >= 0xAC00 && $codepoint <= 0xD7A3) {
            $result .= romanizeKorean($char); continue;
        }
        // 히라가나
        if ($codepoint >= 0x3041 && $codepoint <= 0x3096) {
            $result .= romanizeHiragana($char); continue;
        }
        // 가타카나 → 히라가나 변환 후
        if ($codepoint >= 0x30A1 && $codepoint <= 0x30FA) {
            $result .= romanizeHiragana(mb_chr($codepoint - 0x60, 'UTF-8')); continue;
        }
        // CJK 한자
        if (($codepoint >= 0x4E00 && $codepoint <= 0x9FFF) ||
            ($codepoint >= 0x3400 && $codepoint <= 0x4DBF) ||
            ($codepoint >= 0xF900 && $codepoint <= 0xFAFF)) {
            $result .= 'z'; continue;  // 한자 폴백
        }
        // 그 외 미지원 문자는 건너뜀
    }

    return trim(preg_replace('/\s+/', ' ', $result));
}

function romanizeKorean(string $char): string
{
    $cp       = mb_ord($char, 'UTF-8');
    $syllable = $cp - 0xAC00;
    $ii = intdiv($syllable, 21 * 28);
    $mi = intdiv($syllable % (21 * 28), 28);
    $fi = $syllable % 28;

    $initials = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
    $medials  = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
    $finals   = ['','k','kk','ks','n','nj','nh','t','l','lk','lm','lb','ls','lt','lp','lh','m','p','ps','s','ss','ng','j','ch','k','t','p','h'];

    return ($initials[$ii] ?? '') . ($medials[$mi] ?? '') . ($finals[$fi] ?? '');
}

function romanizeHiragana(string $char): string
{
    static $map = [
        'あ'=>'a','い'=>'i','う'=>'u','え'=>'e','お'=>'o',
        'か'=>'ka','き'=>'ki','く'=>'ku','け'=>'ke','こ'=>'ko',
        'さ'=>'sa','し'=>'shi','す'=>'su','せ'=>'se','そ'=>'so',
        'た'=>'ta','ち'=>'chi','つ'=>'tsu','て'=>'te','と'=>'to',
        'な'=>'na','に'=>'ni','ぬ'=>'nu','ね'=>'ne','の'=>'no',
        'は'=>'ha','ひ'=>'hi','ふ'=>'fu','へ'=>'he','ほ'=>'ho',
        'ま'=>'ma','み'=>'mi','む'=>'mu','め'=>'me','も'=>'mo',
        'や'=>'ya','ゆ'=>'yu','よ'=>'yo',
        'ら'=>'ra','り'=>'ri','る'=>'ru','れ'=>'re','ろ'=>'ro',
        'わ'=>'wa','を'=>'wo','ん'=>'n',
        'が'=>'ga','ぎ'=>'gi','ぐ'=>'gu','げ'=>'ge','ご'=>'go',
        'ざ'=>'za','じ'=>'ji','ず'=>'zu','ぜ'=>'ze','ぞ'=>'zo',
        'だ'=>'da','で'=>'de','ど'=>'do',
        'ば'=>'ba','び'=>'bi','ぶ'=>'bu','べ'=>'be','ぼ'=>'bo',
        'ぱ'=>'pa','ぴ'=>'pi','ぷ'=>'pu','ぺ'=>'pe','ぽ'=>'po',
    ];
    return $map[$char] ?? '';
}
