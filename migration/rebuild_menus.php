<?php
/**
 * migration/rebuild_menus.php
 *
 * 역할
 *   1. mis_menus       생성 (mis_menus_0404 스키마 복제)
 *   2. mis_menu_fields 생성 (mis_menu_fields_0404 스키마 복제)
 *   3. MisMenuList       → mis_menus       INSERT (v6→v7 컬럼 매핑)
 *   4. MisMenuList_Detail → mis_menu_fields INSERT (v6→v7 컬럼 매핑)
 *   5. alias_name camelCase/PascalCase → snake_case 일괄 변환
 *
 * 실행:  php migration/rebuild_menus.php [--dry-run]
 *   --dry-run : CREATE/INSERT/UPDATE 없이 매핑 결과와 SQL만 출력
 *
 * 전제조건:
 *   - mis_menus_0404, mis_menu_fields_0404  (백업 테이블, 동일 DB)
 *   - MisMenuList, MisMenuList_Detail       (v6 원본, 동일 DB)
 *   - mis_menus, mis_menu_fields 가 존재하지 않아야 함
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
    $user, $pass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

echo "=== SpeedMIS v7 메뉴 테이블 재구성 ===\n";
echo "DB: {$dbname} @ {$host}\n";
echo $dryRun ? "[DRY RUN 모드 — DB 변경 없음]\n" : "[실행 모드]\n";
echo str_repeat('-', 60) . "\n\n";


// ─── 헬퍼: 테이블의 컬럼 목록 반환 ────────────────────────────────────────────
function getColumns(PDO $pdo, string $table): array
{
    $rows = $pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll();
    return array_column($rows, 'Field');
}

// ─── 헬퍼: 대소문자 무시 컬럼 맵 ─────────────────────────────────────────────
function lowerMap(array $cols): array
{
    $m = [];
    foreach ($cols as $c) $m[strtolower($c)] = $c;
    return $m;
}

// ─── camelCase/PascalCase → snake_case ────────────────────────────────────────
function toSnakeCase(string $s): string
{
    $s = preg_replace('/([A-Z]+)([A-Z][a-z])/', '$1_$2', $s);
    $s = preg_replace('/([a-z\d])([A-Z])/', '$1_$2', $s);
    return strtolower($s);
}

// ─── INSERT SELECT 빌더 ───────────────────────────────────────────────────────
/**
 * @param array $explicitMap   v7컬럼 => v6컬럼 (null 이면 NULL 리터럴 삽입)
 * @param array $alwaysNull    항상 NULL 로 삽입할 v7 컬럼 목록
 */
function buildInsertSelect(
    PDO    $pdo,
    string $targetTable,
    string $sourceTable,
    array  $explicitMap,
    array  $alwaysNull = []
): array {
    $targetCols  = getColumns($pdo, $targetTable);
    $sourceCols  = getColumns($pdo, $sourceTable);
    $srcLower    = lowerMap($sourceCols);

    $insertCols  = [];
    $selectParts = [];
    $unmapped    = [];
    $mapped      = [];

    foreach ($targetCols as $col) {

        // 1) v7-전용(항상 NULL)
        if (in_array($col, $alwaysNull, true)) {
            $insertCols[]  = "`{$col}`";
            $selectParts[] = 'NULL';
            $mapped[]      = "{$col} ← NULL (v7 전용)";
            continue;
        }

        // 2) 명시 매핑
        if (array_key_exists($col, $explicitMap)) {
            $v6 = $explicitMap[$col];
            if ($v6 === null) {
                $insertCols[]  = "`{$col}`";
                $selectParts[] = 'NULL';
                $mapped[]      = "{$col} ← NULL (명시)";
            } elseif (isset($srcLower[strtolower($v6)])) {
                $actual        = $srcLower[strtolower($v6)];
                $insertCols[]  = "`{$col}`";
                $selectParts[] = "`{$actual}`";
                $mapped[]      = "{$col} ← {$actual}";
            } else {
                // 명시된 v6 컬럼이 소스에 없음 → NULL
                $insertCols[]  = "`{$col}`";
                $selectParts[] = 'NULL';
                $unmapped[]    = "{$col} (명시={$v6} 이지만 소스에 없음)";
            }
            continue;
        }

        // 3) 동일 이름 (대소문자 무시)
        if (isset($srcLower[strtolower($col)])) {
            $actual        = $srcLower[strtolower($col)];
            $insertCols[]  = "`{$col}`";
            $selectParts[] = "`{$actual}`";
            $mapped[]      = "{$col} ← {$actual} (동일명)";
            continue;
        }

        // 4) 매핑 불가 → NULL
        $insertCols[]  = "`{$col}`";
        $selectParts[] = 'NULL';
        $unmapped[]    = "{$col} (매핑 없음 → NULL)";
    }

    return [
        'sql'      => sprintf(
            "INSERT INTO `%s` (%s)\nSELECT %s\nFROM `%s`",
            $targetTable,
            implode(', ', $insertCols),
            implode(', ', $selectParts),
            $sourceTable
        ),
        'mapped'   => $mapped,
        'unmapped' => $unmapped,
    ];
}


// ══════════════════════════════════════════════════════════════════════════════
// 1) 전제 테이블 존재 확인
// ══════════════════════════════════════════════════════════════════════════════
echo "■ 전제 테이블 확인\n";

$required = ['mis_menus_0404', 'mis_menu_fields_0404', 'MisMenuList', 'MisMenuList_Detail'];
foreach ($required as $tbl) {
    $exists = $pdo->query("SHOW TABLES LIKE '{$tbl}'")->rowCount() > 0;
    echo "  {$tbl}: " . ($exists ? "OK\n" : "없음 — 중단!\n");
    if (!$exists) exit(1);
}

// mis_menus, mis_menu_fields 가 이미 있으면 중단
foreach (['mis_menus', 'mis_menu_fields'] as $tbl) {
    if ($pdo->query("SHOW TABLES LIKE '{$tbl}'")->rowCount() > 0) {
        echo "  [오류] {$tbl} 가 이미 존재합니다. 먼저 DROP 하거나 --dry-run 으로 확인하세요.\n";
        exit(1);
    }
}
echo "\n";


// ══════════════════════════════════════════════════════════════════════════════
// 2) mis_menus_0404 소스 컬럼 목록 출력 (참고용)
// ══════════════════════════════════════════════════════════════════════════════
echo "■ 소스/타겟 컬럼 목록\n";
$backup0404Cols = getColumns($pdo, 'mis_menus_0404');
echo "  mis_menus_0404 (" . count($backup0404Cols) . "개): " . implode(', ', $backup0404Cols) . "\n";
$backupFieldsCols = getColumns($pdo, 'mis_menu_fields_0404');
echo "  mis_menu_fields_0404 (" . count($backupFieldsCols) . "개): " . implode(', ', $backupFieldsCols) . "\n";
$v6MenuCols = getColumns($pdo, 'MisMenuList');
echo "  MisMenuList (" . count($v6MenuCols) . "개): " . implode(', ', $v6MenuCols) . "\n";
$v6FieldCols = getColumns($pdo, 'MisMenuList_Detail');
echo "  MisMenuList_Detail (" . count($v6FieldCols) . "개): " . implode(', ', $v6FieldCols) . "\n\n";


// ══════════════════════════════════════════════════════════════════════════════
// 3) CREATE TABLE LIKE 백업
// ══════════════════════════════════════════════════════════════════════════════
echo "■ 테이블 생성 (LIKE 백업)\n";

if (!$dryRun) {
    $pdo->exec('CREATE TABLE `mis_menus` LIKE `mis_menus_0404`');
    echo "  mis_menus 생성 완료\n";
    $pdo->exec('CREATE TABLE `mis_menu_fields` LIKE `mis_menu_fields_0404`');
    echo "  mis_menu_fields 생성 완료\n";
} else {
    echo "  [DRY] CREATE TABLE mis_menus LIKE mis_menus_0404\n";
    echo "  [DRY] CREATE TABLE mis_menu_fields LIKE mis_menu_fields_0404\n";
}
echo "\n";


// ══════════════════════════════════════════════════════════════════════════════
// 4) mis_menus INSERT (MisMenuList → mis_menus)
// ══════════════════════════════════════════════════════════════════════════════
echo "■ mis_menus 컬럼 매핑\n";

// v7 컬럼명 → v6(MisMenuList) 컬럼명 명시 매핑
$menusExplicit = [
    'real_pid'          => 'RealPid',
    'menu_name'         => 'MenuName',
    'brief_title'       => 'briefTitle',
    'is_menu_hidden'    => 'isMenuHidden',
    'auth_code'         => 'AuthCode',
    'all_list_member'   => 'AllListMember',
    'w_all_list_member' => 'wAllListMember',
    'menu_type'         => 'MenuType',
    'up_real_pid'       => 'upRealPid',
    'add_url'           => 'AddURL',
    'auto_gubun'        => 'AutoGubun',
    'sort_g2'           => 'SortG2',
    'sort_g4'           => 'SortG4',
    'sort_g6'           => 'SortG6',
    'use_yn'            => 'useflag',
    'last_update'       => 'lastupdate',
    'last_updater'      => 'lastupdater',
    'file_last_update'  => 'filelastupdate',
    'file_last_updater' => 'filelastupdater',
    'compile_date'      => 'compiledate',
    'add_logic'         => 'addLogic',
    'add_logic_treat'   => 'addLogic_treat',
    'is_use_print'      => 'isUsePrint',
    'is_use_form'       => 'isUseForm',
    'add_logic_print'   => 'addLogic_print',
    'language_code'     => 'LanguageCode',
    'mis_join_pid'      => 'MisJoinPid',
    'mis_join_list'     => 'MisJoinList',
    'trans_id'          => 'transID',
    'is_core_program'   => 'isCoreProgram',
    'excel_data'        => 'excelData',
    'excel_data_midx'   => 'excelData_midx',
    'spreadsheet_id'    => 'SPREADSHEET_ID',
    'hit'               => 'HIT',
    'ip'                => 'IP',
    // g0x 컬럼 → 실제 의미있는 v7 컬럼명으로 재매핑
    'read_only_cond'    => 'g04',
    'brief_insert_sql'  => 'g05',
    'table_name'        => 'g08',
    'base_filter'       => 'g09',
    'use_condition'     => 'g10',
    'delete_query'      => 'g11',
    // 나머지 g0x 는 동일명으로 처리됨 (g01,g02,g03,g06,g07 등)
];

// CREATE 후에 컬럼 목록 얻어야 하므로 dry-run 시에는 _0404 기준으로
$menusTarget = $dryRun ? 'mis_menus_0404' : 'mis_menus';

$menusResult = buildInsertSelect($pdo, $menusTarget, 'MisMenuList', $menusExplicit);

foreach ($menusResult['mapped'] as $m)   echo "  [OK] {$m}\n";
foreach ($menusResult['unmapped'] as $u) echo "  [??] {$u}\n";
echo "\n";

if (!$dryRun) {
    $cnt = $pdo->exec($menusResult['sql']);
    echo "  → mis_menus INSERT 완료: {$cnt}건\n\n";
} else {
    echo "  [DRY] 생성될 SQL:\n" . $menusResult['sql'] . "\n\n";
}


// ══════════════════════════════════════════════════════════════════════════════
// 5) mis_menu_fields INSERT (MisMenuList_Detail → mis_menu_fields)
// ══════════════════════════════════════════════════════════════════════════════
echo "■ mis_menu_fields 컬럼 매핑\n";

// v7-전용 컬럼 (항상 NULL)
$fieldsAlwaysNull = ['grid_x', 'grid_y', 'grid_w', 'grid_h', 'form_layout_responsive'];

// v7 컬럼명 → v6(MisMenuList_Detail) 컬럼명 명시 매핑
// grid__ 접두어 있는 것, 없는 것 양쪽 다 커버
$fieldsExplicit = [
    'real_pid'            => 'RealPid',
    'sort_order'          => 'SortElement',
    'db_field'            => 'Grid_Select_Field',
    'db_table'            => 'Grid_Select_Tname',
    'alias_name'          => 'aliasName',
    'real_pid_alias_name' => 'RealPidAliasName',
    'col_title'           => 'Grid_Columns_Title',
    'col_width'           => 'Grid_Columns_Width',
    // Fixed/Enter/Responsive — 두 가지 이름 모두 처리
    'col_fixed'           => 'Grid_View_Fixed',
    'col_enter'           => 'Grid_Enter',
    'col_xs'              => 'Grid_View_XS',
    'col_sm'              => 'Grid_View_SM',
    'col_md'              => 'Grid_View_MD',
    'col_lg'              => 'Grid_View_LG',
    'col_height'          => 'Grid_View_Hight',
    'col_class'           => 'Grid_View_Class',
    'is_visible_mobile'   => 'Grid_IsVisibleMobile',
    'schema_type'         => 'Grid_Schema_Type',
    'items'               => 'Grid_Items',
    'schema_validation'   => 'Grid_Schema_Validation',
    'align'               => 'Grid_Align',
    'orderby'             => 'Grid_Orderby',
    'relation'            => 'Grid_Relation',
    'max_length'          => 'Grid_MaxLength',
    'default_value'       => 'Grid_Default',
    'group_compute'       => 'Grid_GroupCompute',
    'ctl_name'            => 'Grid_CtlName',
    'is_handle'           => 'Grid_IsHandle',
    'list_edit'           => 'Grid_ListEdit',
    'template'            => 'Grid_Templete',
    'prime_key'           => 'Grid_PrimeKey',
    'alim'                => 'Grid_Alim',
    'required'            => 'Grid_Pil',
    'form_group'          => 'Grid_FormGroup',
    'use_yn'              => 'useflag',
    'last_update'         => 'lastupdate',
    'last_updater'        => 'lastupdater',
    'trans_id'            => 'transID',
    'hit'                 => 'HIT',
    'ip'                  => 'IP',
    // grid__ 접두어 버전 (실제 v7 DB 컬럼이 이 이름일 경우 대비)
    'grid__ctl_name'      => 'Grid_CtlName',
    'grid__align'         => 'Grid_Align',
    'grid__orderby'       => 'Grid_Orderby',
    'grid__is_handle'     => 'Grid_IsHandle',
    'grid__list_edit'     => 'Grid_ListEdit',
    'grid__templete'      => 'Grid_Templete',
    'grid__view__class'   => 'Grid_View_Class',
    'grid__view__hight'   => 'Grid_View_Hight',
    'grid__enter'         => 'Grid_Enter',
    'grid__relation'      => 'Grid_Relation',
    // dry-run 에서 발견된 누락 매핑
    'grid__view__fixed'       => 'Grid_View_Fixed',
    'grid__view__x_s'         => 'Grid_View_XS',
    'grid__view__s_m'         => 'Grid_View_SM',
    'grid__view__m_d'         => 'Grid_View_MD',
    'grid__view__l_g'         => 'Grid_View_LG',
    'grid__is_visible_mobile' => 'Grid_IsVisibleMobile',
    'grid__alim'              => 'Grid_Alim',
];

$fieldsTarget = $dryRun ? 'mis_menu_fields_0404' : 'mis_menu_fields';

$fieldsResult = buildInsertSelect(
    $pdo,
    $fieldsTarget,
    'MisMenuList_Detail',
    $fieldsExplicit,
    $fieldsAlwaysNull
);

foreach ($fieldsResult['mapped'] as $m)   echo "  [OK] {$m}\n";
foreach ($fieldsResult['unmapped'] as $u) echo "  [??] {$u}\n";
echo "\n";

if (!$dryRun) {
    $cnt = $pdo->exec($fieldsResult['sql']);
    echo "  → mis_menu_fields INSERT 완료: {$cnt}건\n\n";
} else {
    echo "  [DRY] 생성될 SQL:\n" . $fieldsResult['sql'] . "\n\n";
}


// ══════════════════════════════════════════════════════════════════════════════
// 6) alias_name snake_case 변환
// ══════════════════════════════════════════════════════════════════════════════
echo "■ alias_name snake_case 변환\n";

if (!$dryRun) {
    $rows = $pdo->query(
        "SELECT idx, real_pid, alias_name FROM mis_menu_fields WHERE alias_name IS NOT NULL ORDER BY idx"
    )->fetchAll();

    // real_pid 별 그룹화 → 충돌 감지
    $byRealPid = [];
    foreach ($rows as $r) {
        $byRealPid[$r['real_pid']][] = $r;
    }

    $conflictSuffix = [];
    foreach ($byRealPid as $realPid => $group) {
        $seen = [];
        foreach ($group as $r) {
            $old = $r['alias_name'];
            $new = toSnakeCase($old);
            if ($old === $new) continue;
            if (isset($seen[$new]) && $seen[$new] !== $old) {
                $conflictSuffix[$r['idx']] = $new . '_2';
            } else {
                $seen[$new] = $old;
            }
        }
    }

    $stmt     = $pdo->prepare("UPDATE mis_menu_fields SET alias_name = ? WHERE idx = ?");
    $changed  = 0;
    $skipped  = 0;

    $pdo->beginTransaction();
    foreach ($rows as $r) {
        $old = $r['alias_name'];
        $new = $conflictSuffix[$r['idx']] ?? toSnakeCase($old);
        if ($old === $new) { $skipped++; continue; }
        $stmt->execute([$new, $r['idx']]);
        $changed++;
    }
    $pdo->commit();

    echo "  변환 완료: {$changed}개 변환, {$skipped}개 이미 snake_case\n";
    if ($conflictSuffix) {
        echo "  충돌로 인해 _2 suffix 적용: " . count($conflictSuffix) . "건\n";
    }
} else {
    echo "  [DRY] 실행 시 alias_name camelCase→snake_case 변환 수행\n";
}
echo "\n";


// ══════════════════════════════════════════════════════════════════════════════
// 7) 최종 건수 확인
// ══════════════════════════════════════════════════════════════════════════════
if (!$dryRun) {
    echo "■ 최종 확인\n";
    $v6MenuCnt   = $pdo->query("SELECT COUNT(*) FROM MisMenuList")->fetchColumn();
    $v7MenuCnt   = $pdo->query("SELECT COUNT(*) FROM mis_menus")->fetchColumn();
    $v6FieldCnt  = $pdo->query("SELECT COUNT(*) FROM MisMenuList_Detail")->fetchColumn();
    $v7FieldCnt  = $pdo->query("SELECT COUNT(*) FROM mis_menu_fields")->fetchColumn();

    echo "  MisMenuList       : {$v6MenuCnt}건\n";
    echo "  mis_menus         : {$v7MenuCnt}건 " . ($v6MenuCnt == $v7MenuCnt ? "✔" : "⚠ 불일치!") . "\n";
    echo "  MisMenuList_Detail: {$v6FieldCnt}건\n";
    echo "  mis_menu_fields   : {$v7FieldCnt}건 " . ($v6FieldCnt == $v7FieldCnt ? "✔" : "⚠ 불일치!") . "\n\n";

    if ($v6MenuCnt != $v7MenuCnt || $v6FieldCnt != $v7FieldCnt) {
        echo "⚠ 건수 불일치! 매핑 결과를 확인하고 백업에서 복원하세요.\n";
        echo "   RENAME TABLE mis_menus TO mis_menus_err;\n";
        echo "   RENAME TABLE mis_menus_0404 TO mis_menus;\n";
    } else {
        echo "✔ 마이그레이션 완료. 사이트 새로고침 후 정상 동작을 확인하세요.\n";
        echo "\n※ 이상 없으면 나중에 아래 명령으로 백업 테이블을 정리할 수 있습니다:\n";
        echo "   DROP TABLE mis_menus_0404;\n";
        echo "   DROP TABLE mis_menu_fields_0404;\n";
        echo "   DROP TABLE MisMenuList;\n";
        echo "   DROP TABLE MisMenuList_Detail;\n";
    }
}

echo "\n=== 완료 ===\n";
