<?php

namespace App;

use Psr\Log\LoggerInterface;

/**
 * CRUD 핵심 엔진
 * v6의 list_json.php + index.php 저장 로직을 PHP 8.3 + Slim 4 방식으로 재작성
 *
 * programs/{real_pid}.php 에서 정의된 훅 함수를 호출
 */
class DataHandler
{
    private array $loadedPrograms = [];

    public function __construct(
        private \PDO            $pdo,
        private QueryBuilder    $qb,
        private MisCache        $cache,
        private LoggerInterface $logger,
        private FileManager     $fileManager
    ) {}

    // =========================================================================
    // 목록 (act=list)
    // =========================================================================
    public function list(array $params, object $user): array
    {
        $gubun     = (int)($params['gubun']    ?? 0);
        $page      = (int)($params['page']     ?? 1);
        $pageSize  = (int)($params['pageSize'] ?? $params['psize'] ?? DEFAULT_PAGE_SIZE);
        $allFilter = $params['allFilter'] ?? '[]';
        $orderby   = $params['orderby']   ?? '';

        if ($pageSize === 999999) $pageSize = MAX_PAGE_SIZE;

        $menu   = $this->getMenu($gubun);
        $fields = $this->getFields($gubun, $menu, $user);

        $listFlag = ($params['actionFlag'] ?? '') ?: 'list';
        $GLOBALS['_onlyList'] = false;
        $GLOBALS['_client_viewPref'] = null; // 'list' 또는 'auto'
        $GLOBALS['_client_css'] = null;
        $GLOBALS['_client_js'] = null;
        $GLOBALS['_client_buttonText'] = null;
        $GLOBALS['_client_buttons'] = null;
        $GLOBALS['_client_fields'] = null;
        $this->setGlobals($params, $user, $menu, $listFlag);
        $this->loadProgram($menu['real_pid'] ?? '', $menu);

        // 쿼리 빌드 전 초기화 훅
        $this->callHook('before_query', $menu, $fields, $params);

        // mis_menus.table_name = 주 테이블명
        $mainTable = $this->resolveTable(trim($menu['table_name'] ?? ''));
        $userId    = (string)($user->uid ?? '');

        // fields → SELECT 컬럼 + JOIN 절 + fieldMap(WHERE/ORDER용) 빌드
        $selectColTitles = [];
        try {
            [$selectCols, $joinClauses, $fieldMap, $aliasToTable, $selectColTitles] = $this->buildSelectFromFields($fields, $userId, $mainTable);
        } catch (\Throwable $e) {
            $this->logger->warning('buildSelectFromFields failed', ['gubun' => $gubun, 'err' => $e->getMessage()]);
            [$selectCols, $joinClauses, $fieldMap, $aliasToTable] = [[], [], [], ['table_m' => $mainTable]];
        }

        $joinStr   = $joinClauses ? ' ' . implode(' ', $joinClauses) : '';
        $selectStr = $selectCols  ? implode(', ', $selectCols) : 'table_m.*';

        $where    = $this->qb->buildWhere($allFilter, '', $fieldMap);
        $bindings = $where['bindings'];

        // use_condition: 레코드 표시 조건
        // 비어있으면 mis_ 테이블만 기본값(table_m.use_yn='1') 적용, 외부 테이블은 1=1
        $useCond = trim($menu['use_condition'] ?? '');
        if ($useCond !== '') {
            $useCond = $this->resolveExpression($useCond, $aliasToTable);
        } else {
            $useCond = str_starts_with($mainTable, 'mis_') ? "table_m.use_yn = '1'" : '1=1';
        }
        $useCondSql = " AND ({$useCond})";

        // base_filter: 프로그램 기본 WHERE 조건
        // 값 자체에 "and"/"where" 가 앞에 붙어있는 경우 제거
        $baseFilter = trim($menu['base_filter'] ?? '');
        $baseFilter = (string)(preg_replace('/^\s*(and|where)\s+/i', '', $baseFilter) ?? $baseFilter);
        $baseFilter = $this->resolveBaseFilter($baseFilter, $aliasToTable);
        $baseFilterSql = $baseFilter !== '' ? " AND ({$baseFilter})" : '';

        // 마스터-디테일: parent_idx → FK 필드로 자동 필터
        // sort_order 기준 두 번째 필드가 FK (첫 번째가 PK — col_width=-1 숨김이어도 동일)
        $parentIdxRaw = trim($params['parent_idx'] ?? '');
        if ($parentIdxRaw !== '' && count($fields) >= 2) {
            $sorted = $fields;
            usort($sorted, fn($a, $b) => (int)($a['sort_order'] ?? 0) <=> (int)($b['sort_order'] ?? 0));
            $fkAlias = $sorted[1]['alias_name'] ?? '';
            if ($fkAlias !== '' && isset($fieldMap[$fkAlias])) {
                $baseFilterSql .= ' AND ' . $fieldMap[$fkAlias] . ' = ?';
                $bindings[]     = $parentIdxRaw;  // 항상 문자열 바인딩
            }
        }

        $fromSql = $mainTable ? "`{$mainTable}` table_m{$joinStr}" : '';
        $whereFull = ($where['sql'] ?: 'WHERE 1=1') . $useCondSql . $baseFilterSql;

        $selectSql = $fromSql ? "SELECT {$selectStr} FROM {$fromSql} {$whereFull}" : '';

        // COUNT 쿼리 최적화: WHERE 에서 참조하는 JOIN 만 포함
        if ($mainTable && $joinClauses) {
            $neededJoins = [];
            foreach ($joinClauses as $jc) {
                // "LEFT JOIN xxx alias ON ..." 에서 alias 추출
                if (preg_match('/JOIN\s+\S+\s+(\w+)\s+ON/i', $jc, $m)) {
                    $alias = $m[1];
                    // WHERE 절에서 이 alias 를 참조하는지 확인
                    if (str_contains($whereFull, "{$alias}.")) {
                        $neededJoins[] = $jc;
                    }
                }
            }
            $countJoinStr = $neededJoins ? ' ' . implode(' ', $neededJoins) : '';
            $countFromSql = "`{$mainTable}` table_m{$countJoinStr}";
        } else {
            $countFromSql = $fromSql;
        }
        $countSql = $countFromSql ? "SELECT COUNT(*) FROM {$countFromSql} {$whereFull}" : '';

        // list_query 훅: 쿼리 직접 교체 가능
        $this->callHook('list_query', $selectSql, $countSql);

        // 캐시 확인
        $recently  = $params['recently'] ?? '';
        $cacheKey = $this->cache->makeKey(
            $menu['real_pid'] ?? "g{$gubun}",
            (string)($user->uid ?? ''),
            $allFilter . $orderby . $page . $pageSize . $recently . $parentIdxRaw
        );
        // 개발자 모드에서는 캐시 bypass (SQL 디버그 정보 반환 위해)
        if (($params['dev_mode'] ?? '') !== '1') {
            if ($cached = $this->cache->get($cacheKey)) {
                $GLOBALS['_client_alert'] = null;
                $GLOBALS['_client_toast'] = null;
                $GLOBALS['_client_openTab'] = null;
                $GLOBALS['_client_redirect'] = null;
                // _client_css, _client_buttonText, _client_buttons 는 pageLoad()에서 이미 설정됨 → 보존
                $GLOBALS['_onlyList'] = false;
        $GLOBALS['_client_viewPref'] = null; // 'list' 또는 'auto'
                $this->callHook('list_json_init');
                if (function_exists('list_json_load') && !empty($cached['data'])) {
                    for ($__i = 0, $__len = count($cached['data']); $__i < $__len; $__i++) {
                        $cached['data'][$__i]['__html'] = [];
                        list_json_load($cached['data'][$__i]);
                        if (empty($cached['data'][$__i]['__html'])) {
                            unset($cached['data'][$__i]['__html']);
                        }
                    }
                }
                if ($GLOBALS['_client_alert'] !== null) $cached['_client_alert'] = $GLOBALS['_client_alert'];
                if ($GLOBALS['_client_toast'] !== null) $cached['_client_toast'] = $GLOBALS['_client_toast'];
                if ($GLOBALS['_client_openTab'] !== null) $cached['_client_openTab'] = $GLOBALS['_client_openTab'];
                if ($GLOBALS['_client_redirect'] !== null) $cached['_client_redirect'] = $GLOBALS['_client_redirect'];
                if (!empty($GLOBALS['_onlyList'])) $cached['_onlyList'] = true;
                if ($GLOBALS['_client_viewPref'] !== null) $cached['_client_viewPref'] = $GLOBALS['_client_viewPref'];
                if ($GLOBALS['_client_css'] !== null) $cached['_client_css'] = $GLOBALS['_client_css'];
                if ($GLOBALS['_client_js'] !== null) $cached['_client_js'] = $GLOBALS['_client_js'];
                if ($GLOBALS['_client_buttonText'] !== null) $cached['_client_buttonText'] = $GLOBALS['_client_buttonText'];
                if (!empty($GLOBALS['_client_buttons'])) $cached['_client_buttons'] = $GLOBALS['_client_buttons'];
                if (!empty($GLOBALS['_client_fieldTitle']) && is_array($GLOBALS['_client_fieldTitle'])) {
                    foreach ($cached['fields'] as &$_f) {
                        $alias = $_f['alias_name'] ?? '';
                        if (isset($GLOBALS['_client_fieldTitle'][$alias])) {
                            $_f['col_title'] = $GLOBALS['_client_fieldTitle'][$alias];
                        }
                    }
                    unset($_f);
                }
                return $cached;
            }
        }

        // 정렬: recently=Y → PK DESC 강제 / orderby → 사용자 지정 / 기본 정렬
        if ($recently === 'Y') {
            // 최근순: 첫 번째 필드(PK)의 db_table.db_field DESC
            $firstField = $fields[0] ?? null;
            $rt = ($firstField['db_table'] ?? '') ?: 'table_m';
            $rf = ($firstField['db_field'] ?? '') ?: 'idx';
            $effectiveOrderby = "__recently__{$rt}.{$rf}";
        } elseif ($orderby !== '') {
            $effectiveOrderby = $orderby;
        } else {
            $effectiveOrderby = $this->buildDefaultOrderBy($fields);
        }
        $orderSql = $this->qb->buildOrderBy($effectiveOrderby, $fieldMap);
        $limitSql = $this->qb->buildPagination($page, $pageSize);

        $total = 0;
        if ($countSql) {
            try {
                $stmt = $this->pdo->prepare($countSql);
                $stmt->execute($bindings);
                $total = (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {
                // JOIN/컬럼 오류 → 단순 COUNT fallback
                $this->logger->warning('count query failed, fallback', ['err' => $e->getMessage(), 'sql' => $countSql]);
                $fbCount = $mainTable ? "SELECT COUNT(*) FROM `{$mainTable}` table_m {$whereFull}" : '';
                if ($fbCount) {
                    try {
                        $stmt = $this->pdo->prepare($fbCount);
                        $stmt->execute($bindings);
                        $total = (int)$stmt->fetchColumn();
                    } catch (\Throwable $e2) {
                        $this->logger->warning('count fallback also failed', ['err' => $e2->getMessage()]);
                    }
                }
            }
        }

        $sqlError = null; // 개발자모드용 쿼리 에러 메시지
        $data = [];
        if ($selectSql) {
            try {
                $stmt = $this->pdo->prepare("{$selectSql} {$orderSql} {$limitSql}");
                $stmt->execute($bindings);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } catch (\Throwable $e) {
                // JOIN/컬럼 오류 → SELECT * fallback
                $sqlError = $e->getMessage();
                $this->logger->warning('select query failed, fallback to SELECT *', ['err' => $e->getMessage(), 'sql' => $selectSql]);
                if ($mainTable) {
                    // ORDER BY 가 JOIN 컬럼을 참조하면 fallback 에서도 실패 → table_m 컬럼만 허용
                    $fbOrderSql = preg_match('/ORDER BY\s+table_m\.\w+/i', $orderSql)
                        ? $orderSql
                        : (str_contains($orderSql, '.') ? 'ORDER BY table_m.idx DESC' : $orderSql);
                    $fbSelect = "SELECT table_m.* FROM `{$mainTable}` table_m {$whereFull} {$fbOrderSql} {$limitSql}";
                    try {
                        $stmt = $this->pdo->prepare($fbSelect);
                        $stmt->execute($bindings);
                        $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                        $sqlError = null; // fallback 성공 시 에러 해제
                    } catch (\Throwable $e2) {
                        $sqlError = $e2->getMessage();
                        $this->logger->warning('select fallback also failed', ['err' => $e2->getMessage()]);
                    }
                }
            }
        }

        // 캐시에는 훅 적용 전 원본 저장
        $result = [
            'success'  => true,
            'total'    => $total,
            'page'     => $page,
            'pageSize' => $pageSize,
            'data'     => $data,
            'fields'   => $fields,
        ];

        $this->cache->set($cacheKey, $result);

        // 훅 적용 (캐시 저장 후 — __html 등 표시 전용 데이터는 캐시에 포함 안 함)
        $GLOBALS['_client_alert'] = null;
        $GLOBALS['_client_toast'] = null;
        $GLOBALS['_client_openTab'] = null;
        $GLOBALS['_client_redirect'] = null;
        // _client_css, _client_buttonText, _client_buttons 는 pageLoad()에서 설정 가능 → 여기서 초기화 안 함

        $this->callHook('list_json_init');
        if (function_exists('list_json_load')) {
            $hasHtml = false;
            for ($__i = 0, $__len = count($result['data']); $__i < $__len; $__i++) {
                $result['data'][$__i]['__html'] = [];
                list_json_load($result['data'][$__i]);
                if (!empty($result['data'][$__i]['__html'])) {
                    $hasHtml = true;
                } else {
                    unset($result['data'][$__i]['__html']);
                }
            }
        }

        if ($GLOBALS['_client_alert'] !== null) $result['_client_alert'] = $GLOBALS['_client_alert'];
        if ($GLOBALS['_client_toast'] !== null) $result['_client_toast'] = $GLOBALS['_client_toast'];
        if ($GLOBALS['_client_openTab'] !== null) $result['_client_openTab'] = $GLOBALS['_client_openTab'];
        if ($GLOBALS['_client_redirect'] !== null) $result['_client_redirect'] = $GLOBALS['_client_redirect'];
        if (!empty($GLOBALS['_onlyList'])) $result['_onlyList'] = true;
        if ($GLOBALS['_client_viewPref'] !== null) $result['_client_viewPref'] = $GLOBALS['_client_viewPref'];
        if ($GLOBALS['_client_css'] !== null) $result['_client_css'] = $GLOBALS['_client_css'];
        if ($GLOBALS['_client_js'] !== null) $result['_client_js'] = $GLOBALS['_client_js'];
        if ($GLOBALS['_client_buttonText'] !== null) $result['_client_buttonText'] = $GLOBALS['_client_buttonText'];
        if (!empty($GLOBALS['_client_buttons'])) $result['_client_buttons'] = $GLOBALS['_client_buttons'];

        // 필드 속성 동적 변경 (pageLoad/list_json_init에서 설정)
        // $GLOBALS['_client_fields'] = ['alias명' => ['col_title'=>'비고', 'grid_list_edit'=>'Y', ...]]
        if (!empty($GLOBALS['_client_fields']) && is_array($GLOBALS['_client_fields'])) {
            foreach ($result['fields'] as &$_f) {
                $alias = $_f['alias_name'] ?? '';
                if (isset($GLOBALS['_client_fields'][$alias])) {
                    $_f = array_merge($_f, $GLOBALS['_client_fields'][$alias]);
                }
            }
            unset($_f);
        }

        // 개발자 모드: SQL 디버그 정보 (캐시에는 저장 안 함)
        if (($params['dev_mode'] ?? '') === '1') {
            // 메뉴명 + 컬럼명 주석이 포함된 가독성 높은 SELECT SQL 빌드
            $menuName = $menu['menu_name'] ?? '';
            if ($fromSql && $selectCols) {
                $annotatedParts = [];
                foreach ($selectCols as $i => $colExpr) {
                    $title = $selectColTitles[$i] ?? '';
                    $prefix = $i === 0 ? '  ' : ', ';
                    $annotatedParts[] = ($title !== '' ? "  -- {$title}\n{$prefix}" : $prefix) . $colExpr;
                }
                $displayFrom = "`{$mainTable}` table_m";
                if ($joinClauses) $displayFrom .= "\n" . implode("\n", $joinClauses);
                $annotatedSelect  = "-- {$menuName}\n\nSELECT\n" . implode("\n", $annotatedParts);
                $annotatedSelect .= "\nFROM {$displayFrom}\n{$whereFull}";
                $displaySql = trim("{$annotatedSelect}\n{$orderSql}\n{$limitSql}");
            } else {
                $displaySql = trim("{$selectSql} {$orderSql} {$limitSql}");
            }
            $result['_sql']       = $displaySql;
            $result['_count_sql'] = trim($countSql);
            $result['_bindings']  = $bindings;
            if ($sqlError !== null) $result['_sql_error'] = $sqlError;
        }

        if (!empty($GLOBALS['_execSql_log']) && ($params['dev_mode'] ?? '') === '1') {
            $result['_execSql'] = $GLOBALS['_execSql_log'];
        }

        return $result;
    }

    // =========================================================================
    // 필터 selectbox 동적 항목 (act=filterItems)
    // grid_is_handle='s' 이고 items 가 비어있는 필드의 distinct 값 조회
    // =========================================================================
    // =========================================================================
    // 폼 레이아웃 저장 (act=saveFormLayout) — 관리자 전용
    // =========================================================================
    public function saveFormLayout(array $params, array $body, object $user): array
    {
        if (($user->is_admin ?? '') !== 'Y') {
            return ['success' => false, 'message' => '관리자만 사용할 수 있습니다.'];
        }

        $gubun = (int)($params['gubun'] ?? 0);
        if (!$gubun) return ['success' => false, 'message' => 'gubun 필수'];

        $items = $body['items'] ?? [];
        if (!is_array($items) || !count($items)) {
            return ['success' => false, 'message' => 'items 필수'];
        }

        try {
            $stmt = $this->pdo->prepare(
                'UPDATE mis_menu_fields
                    SET grid_x = ?, grid_y = ?, grid_w = ?, grid_h = ?,
                        form_layout_responsive = ?
                  WHERE idx = ?'
            );
            $this->pdo->beginTransaction();
            foreach ($items as $item) {
                $lg = $item['lg'] ?? [];
                // 하위 브레이크포인트(sm, xs): null이면 lg 복사, 빈 배열이면 null 저장
                $responsive = [];
                foreach (['md', 'sm', 'xs'] as $bp) {
                    if (!empty($item[$bp])) $responsive[$bp] = $item[$bp];
                }
                $stmt->execute([
                    (int)($lg['x'] ?? -1),
                    (int)($lg['y'] ?? -1),
                    max(1, (int)($lg['w'] ?? 6)),
                    max(1, (int)($lg['h'] ?? 1)),
                    $responsive ? json_encode($responsive, JSON_UNESCAPED_UNICODE) : null,
                    (int)($item['idx'] ?? 0),
                ]);
            }
            $this->pdo->commit();

            // 캐시 무효화 (MIS Join이면 조인 대상 real_pid도 함께 무효화)
            $menu = $this->getMenu($gubun);
            if (!empty($menu['real_pid'])) {
                $this->cache->invalidateByRealPid($menu['real_pid']);
            }
            if (!empty($menu['_fields_real_pid'])) {
                $this->cache->invalidateByRealPid($menu['_fields_real_pid']);
            }

            return ['success' => true];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->logger->error('saveFormLayout failed', ['err' => $e->getMessage()]);
            return ['success' => false, 'message' => 'DB 오류'];
        }
    }

    public function dropdownItems(array $params, object $user): array
    {
        $gubun = (int)($params['gubun'] ?? 0);
        $alias = trim($params['alias'] ?? '');

        if (!$gubun || $alias === '') {
            return ['success' => false, 'message' => 'gubun, alias 필수'];
        }

        // items 값 조회
        $stmt = $this->pdo->prepare(
            'SELECT f.items FROM mis_menu_fields f
               JOIN mis_menus m ON m.real_pid = f.real_pid
              WHERE m.idx = ? AND f.alias_name = ? AND f.use_yn = \'1\'
              LIMIT 1'
        );
        $stmt->execute([$gubun, $alias]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) return ['success' => true, 'data' => []];

        $items = trim($row['items'] ?? '');
        if ($items === '') return ['success' => true, 'data' => []];

        // SQL 쿼리인 경우 실행
        if (preg_match('/^\s*select\s+/i', $items)) {
            try {
                $stmt2 = $this->pdo->query($items);
                $rows  = $stmt2->fetchAll(\PDO::FETCH_ASSOC);
                $data  = array_map(fn($r) => [
                    'value' => (string)($r['value'] ?? ''),
                    'text'  => (string)($r['text']  ?? $r['value'] ?? ''),
                ], $rows);
                return ['success' => true, 'data' => $data];
            } catch (\Throwable $e) {
                return ['success' => false, 'message' => $e->getMessage()];
            }
        }

        // JSON 배열인 경우 파싱
        $parsed = json_decode($items, true);
        if (is_array($parsed)) {
            $data = array_map(fn($o) => [
                'value' => (string)($o['value'] ?? ''),
                'text'  => (string)($o['text']  ?? $o['value'] ?? ''),
            ], $parsed);
            return ['success' => true, 'data' => $data];
        }

        // 쉼표 구분 문자열
        $data = array_map(fn($v) => ['value' => $v, 'text' => $v],
                          array_filter(array_map('trim', explode(',', $items))));
        return ['success' => true, 'data' => array_values($data)];
    }

    public function filterItems(array $params, object $user): array
    {
        $gubun = (int)($params['gubun'] ?? 0);
        $field = trim($params['field'] ?? '');

        if (!$gubun || $field === '') {
            return ['success' => false, 'message' => 'gubun, field 필수'];
        }

        $menu      = $this->getMenu($gubun);
        $fields    = $this->getFields($gubun, $menu, $user);
        $mainTable = $this->resolveTable(trim($menu['table_name'] ?? ''));
        $userId    = (string)($user->uid ?? '');

        [$selectCols, $joinClauses, $fieldMap, $aliasToTable] = $this->buildSelectFromFields($fields, $userId, $mainTable);

        $fieldExpr = $fieldMap[$field] ?? null;
        if (!$fieldExpr || !$mainTable) {
            return ['success' => true, 'data' => []];
        }

        $joinStr = $joinClauses ? ' ' . implode(' ', $joinClauses) : '';

        $baseFilter    = preg_replace('/^\s*(and|where)\s+/i', '', trim($menu['base_filter'] ?? ''));
        $baseFilter    = $this->resolveBaseFilter($baseFilter, $aliasToTable);
        $baseFilterSql = $baseFilter !== '' ? " AND ({$baseFilter})" : '';

        $useCond    = trim($menu['use_condition'] ?? '');
        $useCond    = $useCond !== '' ? $useCond : "table_m.use_yn = '1'";
        $useCondSql = " AND ({$useCond})";

        $sql = "SELECT DISTINCT {$fieldExpr} AS v"
             . " FROM `{$mainTable}` table_m{$joinStr}"
             . " WHERE 1=1{$useCondSql}{$baseFilterSql}"
             . " ORDER BY v LIMIT 300";

        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([]);
            $items = array_filter(
                array_column($stmt->fetchAll(\PDO::FETCH_ASSOC), 'v'),
                fn($v) => $v !== null && $v !== ''
            );
            return ['success' => true, 'data' => array_values($items)];
        } catch (\Throwable $e) {
            return ['success' => true, 'data' => []];
        }
    }

    // =========================================================================
    // prime_key 드롭다운 항목 (act=primeKeyItems)
    // prime_key 포맷: 표시필드#테이블명#정렬#값필드#추가조건
    // 표시필드는 단순 컬럼명 또는 concat(a,' ',b) 같은 복합 표현식 가능
    // 추가조건에서 @outer_tbname 은 실제 테이블 별칭으로 치환됨
    // =========================================================================
    public function primeKeyItems(array $params, object $user): array
    {
        $gubun = (int)($params['gubun'] ?? 0);
        $field = trim($params['field'] ?? '');  // alias_name

        if (!$gubun || $field === '') {
            return ['success' => false, 'message' => 'gubun, field 필수'];
        }

        // prime_key 조회 (mis_menu_fields는 real_pid 기반)
        $stmt = $this->pdo->prepare(
            'SELECT f.prime_key, f.alias_name FROM mis_menu_fields f
               JOIN mis_menus m ON m.real_pid = f.real_pid
              WHERE m.idx = ? AND f.alias_name = ? AND f.use_yn = \'1\'
              LIMIT 1'
        );
        $stmt->execute([$gubun, $field]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$row || empty($row['prime_key'])) {
            return ['success' => true, 'data' => []];
        }

        $primeKey = trim($row['prime_key']);
        $parts    = array_map('trim', explode('#', $primeKey));

        // parts: [displayField, tableName, sortOrder, valueField, condition?]
        if (count($parts) < 4) {
            return ['success' => true, 'data' => []];
        }

        $rawDisplayField = $parts[0];
        $tableName       = $this->resolveTable($parts[1]);  // v6 PascalCase → v7 snake_case
        $rawSortOrder    = $parts[2] !== '' ? $parts[2] : '1';
        $rawValueField   = $parts[3];
        $rawCondition    = $parts[4] ?? '';

        $alias = $row['alias_name'];

        // 테이블 별칭: table_ + alias_name
        // alias_name이 snake_case면 PascalCase 변환, camelCase면 그대로 유지
        $tblAlias = 'table_' . (str_contains($alias, '_')
            ? str_replace(' ', '', ucwords(str_replace('_', ' ', $alias)))
            : $alias);

        // aliasToTable 맵 (resolveExpression 에서 컬럼명 v6→v7 변환에 사용)
        $aliasToTable = [$tblAlias => $tableName];

        // valueField: v6 컬럼명 → v7
        $valueField = $this->resolveColumn($tableName, $rawValueField);

        // sortOrder: 숫자면 그대로, 컬럼명이면 v6→v7 변환
        $sortOrder = is_numeric($rawSortOrder)
            ? $rawSortOrder
            : $this->resolveColumn($tableName, $rawSortOrder);

        // displayField 표현식: @outer_tbname 치환 후 v6→v7 컬럼명 변환
        $displayExpr = str_replace('@outer_tbname', $tblAlias, $rawDisplayField);
        $displayExpr = $this->resolveExpression($displayExpr, $aliasToTable);

        // 조건: @outer_tbname 치환 후 v6→v7 컬럼명 변환
        $condSql = '';
        if ($rawCondition !== '') {
            $cond    = str_replace('@outer_tbname', $tblAlias, $rawCondition);
            $cond    = $this->resolveExpression($cond, $aliasToTable);
            $condSql = " AND ({$cond})";
        }

        // 표시값 AS 별칭: tblAlias + 'Qn' + displayField의 마지막 단순 식별자(PascalCase)
        // concat(a,' ',menuname) → 마지막 식별자 menuname → resolveColumn → menu_name → MenuName
        preg_match_all('/\b([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/', $rawDisplayField, $idMatches);
        $lastRawId      = end($idMatches[1]) ?: $rawDisplayField;
        $lastV7Col      = $this->resolveColumn($tableName, $lastRawId);
        $displaySuffix  = str_replace(' ', '', ucwords(str_replace('_', ' ', $lastV7Col)));
        $displayAlias   = $tblAlias . 'Qn' . $displaySuffix;

        $sql = "SELECT {$tblAlias}.{$valueField} AS `{$alias}`, {$displayExpr} AS `{$displayAlias}`"
             . " FROM `{$tableName}` {$tblAlias}"
             . " WHERE 111=111{$condSql}"
             . " ORDER BY {$sortOrder}";

        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([]);
            $rows  = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $items = array_map(fn($r) => [
                'value' => (string)($r[$alias]        ?? ''),
                'text'  => (string)($r[$displayAlias] ?? ''),
            ], $rows);
            $result = ['success' => true, 'data' => $items];
            if (($params['debug'] ?? '') === '1') $result['_sql'] = $sql;
            return $result;
        } catch (\Throwable $e) {
            $this->logger->warning('primeKeyItems query failed', [
                'gubun' => $gubun,
                'field' => $field,
                'sql'   => $sql,
                'err'   => $e->getMessage(),
            ]);
            return ['success' => false, 'data' => [], '_sql' => $sql, 'message' => $e->getMessage()];
        }
    }

    // =========================================================================
    // 단건 (act=view)
    // =========================================================================
    public function view(array $params, object $user): array
    {
        $gubun    = (int)($params['gubun'] ?? 0);
        $idxParam = trim((string)($params['idx'] ?? ''));

        $menu   = $this->getMenu($gubun);
        $fields = $this->getFields($gubun, $menu, $user);
        $actionFlag = ($params['actionFlag'] ?? '') === 'modify' ? 'modify' : 'view';
        $this->setGlobals($params, $user, $menu, $actionFlag);
        $this->loadProgram($menu['real_pid'] ?? '', $menu);

        // 쿼리 빌드 전 초기화 훅
        $this->callHook('before_query', $menu, $fields, $params);

        $table = $this->resolveTable(trim($menu['table_name'] ?? ''));
        if (!$table || $idxParam === '') {
            return ['success' => false, 'data' => null, 'message' => '잘못된 요청입니다.'];
        }

        $userId = (string)($user->uid ?? '');
        [$selectCols, $joinClauses, , $aliasToTable, $selectColTitles] = $this->buildSelectFromFields($fields, $userId, $table);

        $joinStr   = $joinClauses ? ' ' . implode(' ', $joinClauses) : '';
        $selectStr = $selectCols  ? implode(', ', $selectCols) : 'table_m.*';

        // 정수 idx → 기본 PK 조회 / 비정수 → 첫 번째 visible 필드로 조회
        $isNumeric = ctype_digit($idxParam);
        if ($isNumeric) {
            $whereClause = 'table_m.idx = ?';
            $whereValue  = (int)$idxParam;
        } else {
            // 첫 번째 visible 필드(col_width ∉ {0,-1,-2})로 조회
            $firstVisible = null;
            foreach ($fields as $f) {
                $w = (int)($f['col_width'] ?? 0);
                if ($w !== 0 && $w !== -1 && $w !== -2) { $firstVisible = $f; break; }
            }
            if (!$firstVisible) {
                return ['success' => false, 'data' => null, 'message' => '잘못된 요청입니다.'];
            }
            $fvAlias   = $firstVisible['db_table'] ?? 'table_m';
            $fvDbField = $firstVisible['db_field']  ?? '';
            $v7t       = $aliasToTable[$fvAlias] ?? $table;
            $fvCol     = $this->resolveColumn($v7t, $fvDbField);
            $whereClause = "`{$fvAlias}`.`{$fvCol}` = ?";
            $whereValue  = $idxParam;
        }

        $viewSqlError = null;
        try {
            $viewSql = "SELECT {$selectStr} FROM `{$table}` table_m{$joinStr} WHERE {$whereClause} LIMIT 1";
            $this->callHook('view_query', $viewSql);
            $stmt = $this->pdo->prepare($viewSql);
            $stmt->execute([$whereValue]);
            $row = $stmt->fetch();
        } catch (\Throwable $e) {
            $viewSqlError = $e->getMessage();
            $this->logger->warning('view query failed, fallback', ['err' => $viewSqlError, 'gubun' => $gubun]);
            $fb = $isNumeric ? "SELECT * FROM `{$table}` WHERE idx = ? LIMIT 1" : '';
            $row = false;
            if ($fb) {
                try {
                    $stmt = $this->pdo->prepare($fb);
                    $stmt->execute([(int)$idxParam]);
                    $row = $stmt->fetch();
                } catch (\Throwable) {}
            }
        }

        $template = function_exists('view_templete') ? view_templete() : null;

        // 인쇄양식: is_use_print=1 이고 템플릿 파일이 있으면 렌더링
        $printHtml = null;
        if (($menu['is_use_print'] ?? '') == '1' && $row) {
            $printFile = PROGRAMS_PATH . '/' . ($menu['real_pid'] ?? '') . '_print.html';
            if (file_exists($printFile)) {
                try {
                    $tplContent = file_get_contents($printFile);
                    $renderer = new \App\PrintRenderer($this->pdo);
                    $printHtml = $renderer->render($tplContent, $row, $fields, $row['idx'] ?? 0);
                } catch (\Throwable $e) {
                    $printHtml = '<p style="color:red">인쇄양식 오류: ' . htmlspecialchars($e->getMessage()) . '</p>';
                }
            }
        }

        // 첨부파일 필드의 _midx 컬럼 보강 (form 에 노출된 attach 필드만)
        // → FileAttach 가 midx 로 기존 파일 목록을 로드할 수 있게 함
        if ($row && is_array($row)) {
            $attachMidxCols = [];
            foreach ($fields as $f) {
                $ctl = $f['grid_ctl_name'] ?? '';
                if ($ctl !== 'attach' && $ctl !== 'image') continue;
                $aa = trim($f['alias_name'] ?? '');
                if ($aa === '' || array_key_exists($aa . '_midx', $row)) continue;
                $fCol = $this->resolveColumn($table, trim($f['db_field'] ?? $aa));
                $midxCol = $fCol . '_midx';
                $attachMidxCols[$aa . '_midx'] = $midxCol;
            }
            if (!empty($attachMidxCols)) {
                try {
                    $cols = implode(',', array_map(fn($c) => "`{$c}`", array_values($attachMidxCols)));
                    $pkCol = $this->resolveColumn($table, 'idx');
                    $stmt = $this->pdo->prepare("SELECT {$cols} FROM `{$table}` WHERE `{$pkCol}` = ? LIMIT 1");
                    $stmt->execute([(int)($row['idx'] ?? 0)]);
                    $extra = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
                    foreach ($attachMidxCols as $alias => $col) {
                        $row[$alias] = (int)($extra[$col] ?? 0);
                    }
                } catch (\Throwable) {}
            }
        }

        // 클라이언트 메시지 초기화
        $GLOBALS['_client_alert'] = null;
        $GLOBALS['_client_toast'] = null;
        $GLOBALS['_client_openTab'] = null;
        $this->callHook('view_load', $row);

        $viewResult = ['success' => true, 'data' => $row ?: null, 'template' => $template, 'printHtml' => $printHtml];
        if ($GLOBALS['_client_alert'] !== null) $viewResult['_client_alert'] = $GLOBALS['_client_alert'];
        if ($GLOBALS['_client_toast'] !== null) $viewResult['_client_toast'] = $GLOBALS['_client_toast'];
        if ($GLOBALS['_client_openTab'] !== null) $viewResult['_client_openTab'] = $GLOBALS['_client_openTab'];
        if (($params['dev_mode'] ?? '') === '1') {
            $menuName = $menu['menu_name'] ?? '';
            $fromSql  = "`{$table}` table_m{$joinStr}";
            if ($selectCols) {
                $annotatedParts = [];
                foreach ($selectCols as $i => $colExpr) {
                    $title  = $selectColTitles[$i] ?? '';
                    $prefix = $i === 0 ? '  ' : ', ';
                    $annotatedParts[] = ($title !== '' ? "  -- {$title}\n{$prefix}" : $prefix) . $colExpr;
                }
                $displayFrom = "`{$table}` table_m";
                if ($joinClauses) $displayFrom .= "\n" . implode("\n", $joinClauses);
                $annotatedSelect = "-- {$menuName}\n\nSELECT\n" . implode("\n", $annotatedParts);
                $annotatedSelect .= "\nFROM {$displayFrom}\nWHERE {$whereClause}";
                $viewResult['_sql'] = $annotatedSelect;
            } else {
                $viewResult['_sql'] = "SELECT {$selectStr} FROM {$fromSql} WHERE {$whereClause}";
            }
            $viewResult['_bindings'] = [$whereValue];
            if ($viewSqlError !== null) $viewResult['_sql_error'] = $viewSqlError;
        }
        if (!empty($GLOBALS['_execSql_log']) && ($params['dev_mode'] ?? '') === '1') {
            $viewResult['_execSql'] = $GLOBALS['_execSql_log'];
        }
        return $viewResult;
    }

    // =========================================================================
    // 저장 (act=save)
    // =========================================================================
    public function save(array $params, array $body, object $user): array
    {
        $gubun  = (int)($params['gubun'] ?? $body['gubun'] ?? 0);
        $idxRaw = trim($params['idx'] ?? $body['idx'] ?? '');

        $menu   = $this->getMenu($gubun);
        $fields = $this->getFields($gubun, $menu, $user);

        // sort_order=1 필드 → PK 컬럼 결정 (WHERE 조건)
        usort($fields, fn($a, $b) => (int)($a['sort_order'] ?? 0) <=> (int)($b['sort_order'] ?? 0));
        $pkField   = $fields[0] ?? [];
        $pkAlias   = trim($pkField['alias_name'] ?? 'idx');
        $pkDbField = trim($pkField['db_field']  ?? 'idx');
        $pk0cw     = (int)($pkField['col_width'] ?? 0);

        // PK 값 결정: col_width=-1(숨김 PK)이면 body에서 실제 식별 필드로 기존 레코드 조회
        $isUpdate = false;
        $pkVal    = null;
        if ($idxRaw !== '' && $idxRaw !== '0') {
            if (ctype_digit($idxRaw)) {
                // 숫자 → 일반 idx PK
                $pkVal    = (int)$idxRaw;
                $isUpdate = true;
            } elseif ($pk0cw === -1 || $pk0cw === -2) {
                // 문자열 idx + 숨김 PK → 두 번째 필드(visible key)로 기존 레코드의 실제 PK 조회
                $table = $this->resolveTable(trim($menu['table_name'] ?? ''));
                if ($table) {
                    $visibleKey = $fields[1]['alias_name'] ?? '';
                    $visibleDbField = trim($fields[1]['db_field'] ?? '');
                    $visibleCol = $visibleDbField ? $this->resolveColumn($table, $visibleDbField) : '';
                    if ($visibleCol !== '') {
                        $lookupPkCol = $this->resolveColumn($table, $pkDbField ?: 'idx');
                        $lookStmt = $this->pdo->prepare("SELECT `{$lookupPkCol}` FROM `{$table}` WHERE `{$visibleCol}` = ? LIMIT 1");
                        $lookStmt->execute([$idxRaw]);
                        $foundPk = $lookStmt->fetchColumn();
                        if ($foundPk !== false) {
                            $pkVal    = $foundPk;
                            $isUpdate = true;
                        }
                    }
                }
            }
        }
        if ($pkVal === null) $pkVal = 0;
        $idx = is_int($pkVal) ? $pkVal : $pkVal;

        $GLOBALS['isListEdit'] = !empty($body['_listEdit']);
        $GLOBALS['listEditField'] = $GLOBALS['isListEdit']
            ? array_keys(array_diff_key($body, array_flip(['_listEdit','_confirmed','idx','gubun','act','_csrf'])))
            : [];
        $this->setGlobals($params, $user, $menu, $isUpdate ? 'modify' : 'write');
        $this->loadProgram($menu['real_pid'] ?? '', $menu);

        // 쿼리 빌드 전 초기화 훅
        $this->callHook('before_query', $menu, $fields, $params);

        $table = $this->resolveTable(trim($menu['table_name'] ?? ''));
        if (!$table) return ['success' => false, 'message' => '테이블 정보가 없습니다.'];

        $pkCol = $this->resolveColumn($table, $pkDbField ?: 'idx');

        // 첨부파일(grid_ctl_name=attach/image) 필드 추출:
        //   - body['_tempAttach'] = { field_alias: [token1, token2, ...] }
        //   - filterData 전에 attach 컬럼 본체를 body 에서 제거 (post-insert 에서 UPDATE)
        $attachFields = [];
        foreach ($fields as $f) {
            $ctl = $f['grid_ctl_name'] ?? '';
            if ($ctl === 'attach' || $ctl === 'image') {
                $aa = trim($f['alias_name'] ?? '');
                if ($aa !== '') $attachFields[$aa] = $f;
            }
        }
        $tempAttach = $body['_tempAttach'] ?? [];
        if (!is_array($tempAttach)) $tempAttach = [];
        unset($body['_tempAttach']);
        foreach ($attachFields as $aa => $f) {
            // attach 본체 / _midx 컬럼은 finalize 시 서버에서 설정
            unset($body[$aa], $body[$aa . '_midx']);
        }

        $saveList   = $this->filterData($body, $fields, $table, $pkAlias);
        $updateList = $saveList;
        $afterScript = '';

        $GLOBALS['_client_confirm'] = null;
        $this->callHook('save_updateReady', $saveList);

        // confirm 요청: 저장 중단 + 확인 메시지 반환 (_confirmed 플래그 없을 때만)
        if ($GLOBALS['_client_confirm'] !== null && empty($body['_confirmed'])) {
            return ['success' => false, '_confirm' => $GLOBALS['_client_confirm']];
        }

        if ($isUpdate) {
            $this->callHook('save_updateBefore', $updateList);
            [$sql, $binds] = $this->buildUpdate($table, $updateList, $pkCol, $pkVal);
            $this->callHook('save_updateQueryBefore', $sql, $binds);
            $this->pdo->prepare($sql)->execute($binds);
            $this->callHook('save_updateAfter', $idx, $afterScript);
        } else {
            $this->callHook('save_writeBefore', $updateList);
            [$sql, $binds] = $this->buildInsert($table, $updateList);
            $this->callHook('save_writeQueryBefore', $sql, $binds);
            $this->pdo->prepare($sql)->execute($binds);
            $idx = (int)$this->pdo->lastInsertId();
            $GLOBALS['newIdx'] = $idx;
            $this->callHook('save_writeAfter', $idx, $afterScript);
        }

        // ── 첨부파일 finalize ────────────────────────────────────────────────
        // INSERT/UPDATE 후 $idx 가 확정된 시점에 temp → final 이동 + mis_attach_list 등록
        // 이후 UPDATE {table} SET {field}='names', {field}_midx=N WHERE pk=idx
        if (!empty($attachFields) && $idx > 0) {
            $uid = (string)($user->uid ?? '');
            foreach ($attachFields as $aa => $f) {
                $tokens = $tempAttach[$aa] ?? null;
                if (!is_array($tokens) || empty($tokens)) continue;

                $fDbField = trim($f['db_field'] ?? $aa);
                $fCol     = $this->resolveColumn($table, $fDbField);
                $midxCol  = $fCol . '_midx';

                // UPDATE 인 경우 기존 midx 를 가져와서 같은 그룹에 합류
                $existingMidx = 0;
                if ($isUpdate) {
                    try {
                        $stmt = $this->pdo->prepare("SELECT `{$midxCol}` FROM `{$table}` WHERE `{$pkCol}` = ? LIMIT 1");
                        $stmt->execute([$pkVal]);
                        $existingMidx = (int)($stmt->fetchColumn() ?: 0);
                    } catch (\Throwable) {}
                }

                // 커스텀 경로: default_value 가 있으면 경로 템플릿으로 사용
                $customPath = null;
                $defaultVal = trim($f['default_value'] ?? '');
                if ($defaultVal !== '') {
                    // {alias} → 레코드 값 치환
                    $allVals = array_merge($body, $updateList);
                    // idx 는 방금 확정된 값
                    $allVals['idx'] = $idx;
                    $customPath = preg_replace_callback('/\{(\w+)\}/', function ($m) use ($allVals) {
                        return $allVals[$m[1]] ?? $m[0];
                    }, $defaultVal);
                }

                $fin = $this->fileManager->finalize($uid, $table, $fCol, $pkCol, $idx, $tokens, $existingMidx, $customPath);
                if (!empty($fin['success']) && $fin['count'] > 0) {
                    $upSql = "UPDATE `{$table}` SET `{$fCol}` = ?, `{$midxCol}` = ? WHERE `{$pkCol}` = ?";
                    try {
                        $this->pdo->prepare($upSql)->execute([$fin['file_names'], $fin['midx'], $idx]);
                    } catch (\Throwable $e) {
                        $this->logger->warning('attach field update failed', ['field' => $fCol, 'err' => $e->getMessage()]);
                    }
                }
            }
        }

        $this->cache->invalidateByRealPid($menu['real_pid'] ?? "g{$gubun}");
        $this->log('save', $gubun, $idx, $user);

        $result = ['success' => true, 'idx' => $idx, 'afterScript' => $afterScript, 'message' => '저장되었습니다.'];
        if (!empty($GLOBALS['_client_alert'])) $result['_client_alert'] = $GLOBALS['_client_alert'];
        if (!empty($GLOBALS['_client_toast'])) $result['_client_toast'] = $GLOBALS['_client_toast'];
        if (!empty($GLOBALS['_client_openTab'])) $result['_client_openTab'] = $GLOBALS['_client_openTab'];

        if (($params['dev_mode'] ?? '') === '1') {
            $result['_sql']      = $sql;
            $result['_bindings'] = $binds;
            if (!empty($GLOBALS['_execSql_log'])) {
                $result['_execSql'] = $GLOBALS['_execSql_log'];
            }
        }

        return $result;
    }

    // =========================================================================
    // 삭제 (act=delete)
    // =========================================================================
    // =========================================================================
    // 간편추가 (act=briefInsert)
    // =========================================================================
    public function briefInsert(array $params, array $body, object $user): array
    {
        $gubun = (int)($params['gubun'] ?? $body['gubun'] ?? 0);
        $count = max(1, min(50, (int)($body['count'] ?? 1)));

        $menu = $this->getMenu($gubun);
        $table = $this->resolveTable(trim($menu['table_name'] ?? ''));
        $tpl = trim($menu['brief_insert_sql'] ?? '');
        if (!$table || !$tpl) return ['success' => false, 'message' => '간편추가 설정이 없습니다.'];

        $userId = (string)($user->uid ?? '');
        $parentIdx = trim($body['parent_idx'] ?? $params['parent_idx'] ?? '');

        // 변수 치환
        $tpl = str_replace('@misSessionUserId', $userId, $tpl);
        $tpl = str_replace('@MisSession_UserID', $userId, $tpl);
        $tpl = str_replace('@parentIdx', $parentIdx, $tpl);
        $tpl = str_replace('@parent_idx', $parentIdx, $tpl);

        // rep_ 접두어 처리: rep_XXX → $body['XXX'] 또는 $parentIdx
        $tpl = preg_replace_callback('/rep_(\w+)/i', function($m) use ($body, $parentIdx) {
            return $body[$m[1]] ?? $parentIdx;
        }, $tpl);

        // Rep_RealCid 등 특수 치환
        $tpl = str_replace('Rep_RealCid', $parentIdx, $tpl);

        $sql = "INSERT INTO `{$table}` {$tpl}";
        $insertedIds = [];

        try {
            $this->pdo->beginTransaction();
            $stmt = $this->pdo->prepare($sql);
            for ($i = 0; $i < $count; $i++) {
                $stmt->execute();
                $insertedIds[] = (int)$this->pdo->lastInsertId();
            }
            $this->pdo->commit();

            $this->cache->invalidateByRealPid($menu['real_pid'] ?? "g{$gubun}");

            // 삽입된 데이터 조회 (idx ASC)
            if (!empty($insertedIds)) {
                $placeholders = implode(',', array_fill(0, count($insertedIds), '?'));

                // 필드 정의로 SELECT 빌드
                $fields = $this->getFields($gubun, $menu, $user);
                $selectParts = [];
                foreach ($fields as $f) {
                    $alias = $f['alias_name'] ?? '';
                    $dbTable = trim($f['db_table'] ?? '');
                    $dbField = trim($f['db_field'] ?? '');
                    if ($alias && $dbTable === 'table_m' && $dbField) {
                        $col = $this->resolveColumn($table, $dbField);
                        $selectParts[] = "`{$col}` AS `{$alias}`";
                    }
                }
                $selectStr = !empty($selectParts) ? implode(', ', $selectParts) : '*';

                $dataSql = "SELECT {$selectStr} FROM `{$table}` WHERE idx IN ({$placeholders}) ORDER BY idx ASC";
                $dataStmt = $this->pdo->prepare($dataSql);
                $dataStmt->execute($insertedIds);
                $rows = $dataStmt->fetchAll(\PDO::FETCH_ASSOC);
            } else {
                $rows = [];
            }

            return [
                'success' => true,
                'message' => "{$count}건 추가 완료",
                'count'   => $count,
                'ids'     => $insertedIds,
                'data'    => $rows,
                'fields'  => $fields ?? [],
                '_sql'    => $sql,
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            return ['success' => false, 'message' => '간편추가 실패: ' . $e->getMessage(), '_sql' => $sql];
        }
    }

    public function delete(array $params, object $user): array
    {
        $gubun = (int)($params['gubun'] ?? 0);
        $idx   = (int)($params['idx']   ?? 0);

        if ($idx <= 0) return ['success' => false, 'message' => '삭제할 항목을 선택해주세요.'];

        $menu = $this->getMenu($gubun);
        $this->setGlobals($params, $user, $menu, 'delete');
        $this->loadProgram($menu['real_pid'] ?? '', $menu);

        $table = $this->resolveTable(trim($menu['table_name'] ?? ''));
        if (!$table) return ['success' => false, 'message' => '테이블 정보가 없습니다.'];

        $cancelDelete = false;
        $afterScript  = '';

        $this->callHook('save_deleteBefore', $idx, $cancelDelete);
        if ($cancelDelete) return ['success' => false, 'message' => '삭제가 취소되었습니다.'];

        $deleteQuery = trim($menu['delete_query'] ?? '');
        if ($deleteQuery !== '') {
            // 삭제쿼리가 있으면 UPDATE 처리 (예: useflag=0, delchk='D')
            $this->pdo->prepare("UPDATE `{$table}` SET {$deleteQuery} WHERE idx = ?")->execute([$idx]);
        } else {
            $this->pdo->prepare("DELETE FROM `{$table}` WHERE idx = ?")->execute([$idx]);
        }

        $this->callHook('save_deleteAfter', $idx, $afterScript);
        $this->cache->invalidateByRealPid($menu['real_pid'] ?? "g{$gubun}");
        $this->log('delete', $gubun, $idx, $user);

        return ['success' => true, 'afterScript' => $afterScript, 'message' => '삭제되었습니다.'];
    }

    // =========================================================================
    // 일괄 삭제 (act=bulkDelete)
    // =========================================================================
    public function bulkDelete(array $params, array $body, object $user): array
    {
        $gubun   = (int)($params['gubun'] ?? 0);
        $idxList = $body['idxList'] ?? [];
        if (!is_array($idxList) || empty($idxList)) {
            return ['success' => false, 'message' => '삭제할 항목을 선택해주세요.'];
        }
        $idxList = array_map('intval', $idxList);
        $idxList = array_filter($idxList, fn($v) => $v > 0);
        if (empty($idxList)) return ['success' => false, 'message' => '유효한 항목이 없습니다.'];

        $menu = $this->getMenu($gubun);
        $this->setGlobals($params, $user, $menu, 'delete');
        $this->loadProgram($menu['real_pid'] ?? '', $menu);

        $table = $this->resolveTable(trim($menu['table_name'] ?? ''));
        if (!$table) return ['success' => false, 'message' => '테이블 정보가 없습니다.'];

        // save_bulkDeleteBefore 훅: 전체 idxList를 검증/수정 가능
        $cancelDelete = false;
        $this->callHook('save_bulkDeleteBefore', $idxList, $cancelDelete);
        if ($cancelDelete) {
            return [
                'success' => false,
                'message' => $GLOBALS['_client_alert'] ?? '삭제가 취소되었습니다.',
                '_client_alert' => $GLOBALS['_client_alert'] ?? null,
                '_client_toast' => $GLOBALS['_client_toast'] ?? null,
            ];
        }

        $deleted = 0;
        $afterScript = '';
        foreach ($idxList as $idx) {
            // 개별 deleteBefore 훅도 호출
            $cancelOne = false;
            $this->callHook('save_deleteBefore', $idx, $cancelOne);
            if ($cancelOne) continue;

            $deleteQuery = trim($menu['delete_query'] ?? '');
            if ($deleteQuery !== '') {
                $this->pdo->prepare("UPDATE `{$table}` SET {$deleteQuery} WHERE idx = ?")->execute([$idx]);
            } else {
                $this->pdo->prepare("DELETE FROM `{$table}` WHERE idx = ?")->execute([$idx]);
            }
            $this->callHook('save_deleteAfter', $idx, $afterScript);
            $this->log('delete', $gubun, $idx, $user);
            $deleted++;
        }

        // save_bulkDeleteAfter 훅: 삭제 완료 후 후처리
        $this->callHook('save_bulkDeleteAfter', $idxList, $deleted);

        $this->cache->invalidateByRealPid($menu['real_pid'] ?? "g{$gubun}");

        return [
            'success'       => true,
            'deleted'       => $deleted,
            'total'         => count($idxList),
            'message'       => "{$deleted}건 삭제 완료",
            'afterScript'   => $afterScript,
            '_client_alert' => $GLOBALS['_client_alert'] ?? null,
            '_client_toast' => $GLOBALS['_client_toast'] ?? null,
        ];
    }

    // =========================================================================
    // treat 훅 (act=treat)
    // =========================================================================
    public function treat(array $params, array $body, object $user): array
    {
        $gubun = (int)($params['gubun'] ?? 0);
        $menu  = $this->getMenu($gubun);
        $this->setGlobals($params, $user, $menu, 'treat');
        $this->loadProgram($menu['real_pid'] ?? '', $menu);

        $result = array_merge($params, $body);
        $this->callHook('addLogic_treat', $result);

        return ['success' => true, 'data' => $result];
    }

    // =========================================================================
    // 내부 헬퍼
    // =========================================================================

    private function getMenu(int $gubun): array
    {
        if ($gubun <= 0) return [];
        try {
            $stmt = $this->pdo->prepare(
                'SELECT idx, real_pid, menu_name, menu_type, mis_join_pid,
                        up_real_pid, auth_code, add_logic,
                        table_name, base_filter, use_condition, delete_query,
                        read_only_cond, brief_insert_sql,
                        is_use_print, g01, g02, g03, g07
                   FROM mis_menus
                  WHERE idx = ? LIMIT 1'
            );
            $stmt->execute([$gubun]);
            $menu = $stmt->fetch() ?: [];

            // menu_type='06' (MIS Join): mis_join_pid 메뉴에서 필드/프로그램 상속
            if ($menu && ($menu['menu_type'] ?? '') === '06') {
                $joinRealPid = trim($menu['mis_join_pid'] ?? '');
                if ($joinRealPid !== '') {
                    $menu['_fields_real_pid'] = $joinRealPid; // getFields/loadProgram 대상
                    // table_name 이 비어있으면 조인 메뉴에서 상속
                    if (trim($menu['table_name'] ?? '') === '') {
                        $js = $this->pdo->prepare('SELECT table_name, base_filter FROM mis_menus WHERE real_pid = ? LIMIT 1');
                        $js->execute([$joinRealPid]);
                        $joinMenu = $js->fetch() ?: [];
                        if (!empty(trim($joinMenu['table_name'] ?? ''))) {
                            $menu['table_name'] = $joinMenu['table_name'];
                        }
                        // base_filter 도 비어있으면 상속
                        if (trim($menu['base_filter'] ?? '') === '' && !empty(trim($joinMenu['base_filter'] ?? ''))) {
                            $menu['base_filter'] = $joinMenu['base_filter'];
                        }
                    }
                }
            }

            return $menu;
        } catch (\Throwable $e) {
            $this->logger->warning('getMenu failed', ['gubun' => $gubun, 'err' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * 필드 목록 조회
     * menu_type='06' 이면 $menu['_fields_real_pid'] 가 세팅되어 있으므로 그 real_pid 사용
     */
    private function getFields(int $gubun, array $menu = [], ?object $user = null): array
    {
        try {
            $realPid = trim($menu['_fields_real_pid'] ?? '');
            if ($realPid !== '') {
                // MIS Join: real_pid 직접 사용
                $stmt = $this->pdo->prepare(
                    'SELECT f.alias_name, f.col_title, f.col_width, f.db_table, f.db_field,
                            f.group_compute, f.grid_orderby, f.sort_order,
                            f.schema_type, f.items, f.default_value, f.required,
                            f.form_group, f.max_length, f.grid_align, f.grid_is_handle,
                            f.grid_list_edit, f.grid_ctl_name, f.prime_key,
                            f.schema_validation, f.grid_templete, f.use_yn,
                            f.grid_view_class, f.grid_view_hight, f.grid_enter,
                            f.grid_view_sm, f.grid_view_md, f.grid_view_lg, f.grid_view_xl,
                            f.grid_view_fixed,
                            f.grid_alim, f.idx, f.real_pid AS field_real_pid
                       FROM mis_menu_fields f
                      WHERE f.real_pid = ? AND f.use_yn = \'1\'
                      ORDER BY f.sort_order ASC'
                );
                $stmt->execute([$realPid]);
            } else {
                $stmt = $this->pdo->prepare(
                    'SELECT f.alias_name, f.col_title, f.col_width, f.db_table, f.db_field,
                            f.group_compute, f.grid_orderby, f.sort_order,
                            f.schema_type, f.items, f.default_value, f.required,
                            f.form_group, f.max_length, f.grid_align, f.grid_is_handle,
                            f.grid_list_edit, f.grid_ctl_name, f.prime_key,
                            f.schema_validation, f.grid_templete, f.use_yn,
                            f.grid_view_class, f.grid_view_hight, f.grid_enter,
                            f.grid_view_sm, f.grid_view_md, f.grid_view_lg, f.grid_view_xl,
                            f.grid_view_fixed,
                            f.grid_alim, f.idx, f.real_pid AS field_real_pid
                       FROM mis_menu_fields f
                       JOIN mis_menus m ON m.real_pid = f.real_pid
                      WHERE m.idx = ? AND f.use_yn = \'1\'
                      ORDER BY f.sort_order ASC'
                );
                $stmt->execute([$gubun]);
            }
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // default_value 에 포함된 @ 세션/프로그램 플레이스홀더 서버 측 치환
            foreach ($rows as &$r) {
                if (!empty($r['default_value']) && str_contains((string)$r['default_value'], '@')) {
                    $r['default_value'] = $this->resolveSessionPlaceholders((string)$r['default_value'], $menu, $user);
                }
            }
            unset($r);

            return $rows;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @session/@realPid 등 서버 측 플레이스홀더 치환
     * base_filter, default_value, prime_key extra 등 다양한 곳에서 공통 사용
     */
    private function resolveSessionPlaceholders(string $s, array $menu = [], ?object $user = null): string
    {
        if ($s === '' || !str_contains($s, '@')) return $s;

        $uid      = $user->uid            ?? ($GLOBALS['misSessionUserId']       ?? '');
        $isAdmin  = (($user->is_admin    ?? ($GLOBALS['misSessionIsAdmin']       ?? '')) === 'Y') ? 'Y' : '';
        $posCode  = $user->position_code  ?? ($GLOBALS['misSessionPositionCode'] ?? '');
        $stationN = $user->station_idx    ?? ($GLOBALS['misSessionStationNum']   ?? '');
        $realPid  = $menu['real_pid']     ?? ($GLOBALS['real_pid']               ?? '');
        $parentRp = $GLOBALS['parentRealPid'] ?? '';

        return str_replace([
            '@misSessionUserId', '@misSessionIsAdmin', '@misSessionPositionCode',
            '@misSessionStationNum', '@realPid', '@parentRealPid',
            // v6 호환
            '@MisSession_UserID', '@MisSession_IsAdmin', '@MisSession_PositionCode',
            '@MisSession_StationNum', '@RealPid', '@parent_RealPid',
        ], [
            $uid, $isAdmin, $posCode, $stationN, $realPid, $parentRp,
            $uid, $isAdmin, $posCode, $stationN, $realPid, $parentRp,
        ], $s);
    }

    /**
     * 프로그램 훅 파일 로드
     * menu_type='06'이면 mis_join_pid real_pid 우선, 없으면 자신의 real_pid
     */
    private function loadProgram(string $real_pid, array $menu = []): void
    {
        $target = trim($menu['_fields_real_pid'] ?? '') ?: $real_pid;
        if ($target === '' || isset($this->loadedPrograms[$target])) return;
        $this->loadedPrograms[$target] = true;

        // ── 공통로직 로드 (최초 1회) ──
        if (!isset($this->loadedPrograms['__common'])) {
            $this->loadedPrograms['__common'] = true;
            // 1순위: SpeedMIS 기본 공통
            $commonPath = PROGRAMS_PATH . '/_common.php';
            if (file_exists($commonPath)) { ob_start(); include_once $commonPath; ob_end_clean(); }
            // 2순위: 고객사 전용 공통
            $userPath = PROGRAMS_PATH . '/_common_udef.php';
            if (file_exists($userPath)) { ob_start(); include_once $userPath; ob_end_clean(); }
        }

        $path = PROGRAMS_PATH . "/{$target}.php";
        if (file_exists($path)) {
            ob_start();
            include_once $path;
            ob_end_clean();
        } elseif (!empty(trim($menu['add_logic'] ?? ''))) {
            // 파일이 없으면 DB add_logic → 임시 파일 생성 후 로드
            $tmpPath = PROGRAMS_PATH . "/{$target}.php";
            $code = $menu['add_logic'];
            if (stripos(ltrim($code), '<?php') !== 0) $code = "<?php\n" . $code;
            @file_put_contents($tmpPath, $code);
            if (file_exists($tmpPath)) {
                ob_start();
                include_once $tmpPath;
                ob_end_clean();
            }
        }

        if (function_exists('common_pageLoad') || function_exists('user_pageLoad') || function_exists('pageLoad')) {
            ob_start();
            if (function_exists('common_pageLoad')) common_pageLoad();
            if (function_exists('user_pageLoad')) user_pageLoad();
            if (function_exists('pageLoad')) pageLoad();
            ob_end_clean();
        }
    }

    /**
     * 공통훅(common_) + 개별훅 순서로 호출
     * 예: callHook('before_query', $menu, $fields, $params)
     *   → common_before_query($menu, $fields, $params) + before_query($menu, $fields, $params)
     */
    /**
     * 공통(common_) → 고객사(user_) → 개별 순서로 훅 호출
     */
    private function callHook(string $name, mixed &...$args): void
    {
        $common = 'common_' . $name;
        $user   = 'user_' . $name;
        if (function_exists($common)) $common(...$args);
        if (function_exists($user))   $user(...$args);
        if (function_exists($name))   $name(...$args);
    }

    private function setGlobals(array $params, object $user, array $menu, string $flag): void
    {
        $GLOBALS['actionFlag']              = $flag;
        $GLOBALS['gubun']                   = (int)($params['gubun'] ?? 0);
        $GLOBALS['idx']                     = (int)($params['idx']   ?? 0);
        $GLOBALS['real_pid']                = $menu['real_pid']  ?? '';
        $GLOBALS['menu_name']               = $menu['menu_name'] ?? '';
        $GLOBALS['full_site']               = rtrim($_ENV['APP_URL'] ?? '', '/');
        $GLOBALS['parent_idx']              = (int)($params['parent_idx'] ?? 0);
        $GLOBALS['allFilter']               = $params['allFilter']  ?? '[]';
        $GLOBALS['orderby']                 = $params['orderby']    ?? '';
        $GLOBALS['page']                    = (int)($params['page'] ?? 1);
        $GLOBALS['pageSize']                = (int)($params['pageSize'] ?? DEFAULT_PAGE_SIZE);
        $GLOBALS['isMenuIn']                = $params['isMenuIn']   ?? 'Y';
        $GLOBALS['isFirstLoad']             = ($params['first_load'] ?? '') === '1';
        $GLOBALS['customAction']            = $params['customAction'] ?? '';
        $GLOBALS['misSessionUserId']        = $user->uid            ?? '';
        $GLOBALS['misSessionIsAdmin']       = ($user->is_admin ?? '') === 'Y' ? 'Y' : '';
        $GLOBALS['misSessionPositionCode']  = $user->position_code  ?? '';
        $GLOBALS['__pdo']                   = $this->pdo;
        // v6 호환 별칭
        $GLOBALS['ActionFlag']              = &$GLOBALS['actionFlag'];
        $GLOBALS['MisSession_UserID']       = &$GLOBALS['misSessionUserId'];
        $GLOBALS['MisSession_IsAdmin']      = &$GLOBALS['misSessionIsAdmin'];
        $GLOBALS['MisSession_PositionCode'] = &$GLOBALS['misSessionPositionCode'];
    }

    /**
     * body → 실제 DB 컬럼명 매핑 (저장 가능한 필드만)
     *
     * 저장 제외 조건:
     * - db_table != 'table_m'  (JOIN 테이블, Qn display, 빈 값)
     * - db_field 가 단순 컬럼명이 아님 (subquery, CASE WHEN, 빈 문자열 등)
     * - PK 컬럼 (pkAlias)
     * - 시스템 자동값: wdate/wdater, last_update/last_updater (buildInsert/buildUpdate 에서 자동 처리)
     */
    private function filterData(array $body, array $fields, string $mainTable = '', string $pkAlias = ''): array
    {
        if (empty($fields)) {
            $data = $body;
            unset($data['idx'], $data['gubun'], $data['act'], $data['_csrf'], $data['_listEdit'], $data['_confirmed']);
            return $data;
        }

        // 시스템 자동 컬럼 — buildInsert/buildUpdate 에서 별도 처리
        $systemCols = ['wdate', 'lastupdate', 'last_update', 'wdater', 'lastupdater', 'last_updater'];

        $out = [];
        foreach ($fields as $f) {
            $alias   = trim($f['alias_name'] ?? '');
            $dbTable = $f['db_table'] ?? '';
            $dbField = trim($f['db_field'] ?? '');

            // ① 메인 테이블 필드만
            if ($dbTable !== 'table_m') continue;

            // ② 단순 컬럼명이어야 함 (subquery, 빈 문자열 '' 리터럴, CASE WHEN 등 제외)
            // 공백·괄호·따옴표가 포함되어 있거나 비어있으면 skip
            if ($dbField === '' || preg_match('/[\s(\'"]/', $dbField)) continue;

            // ③ 시스템 자동값 skip
            if (in_array(strtolower($dbField), $systemCols, true)) continue;

            // ④ PK 컬럼 skip
            if ($alias === $pkAlias) continue;

            // ⑤ body 에 해당 alias 가 없으면 skip
            if ($alias === '' || !array_key_exists($alias, $body)) continue;

            // ⑥ v6→v7 컬럼명 변환
            $col = $mainTable !== '' ? $this->resolveColumn($mainTable, $dbField) : $dbField;

            $out[$col] = $body[$alias];
        }
        return $out;
    }

    private function buildInsert(string $table, array $data): array
    {
        $userId = $GLOBALS['misSessionUserId'] ?? '';
        $cols = $this->getTableColumnSet($table);
        $sysCols = [];
        $sysPh   = [];
        $sysVals = [];
        if (isset($cols['wdater'])) { $sysCols[] = 'wdater'; $sysPh[] = '?'; $sysVals[] = $userId; }
        if (isset($cols['wdate']))  { $sysCols[] = 'wdate';  $sysPh[] = 'NOW()'; }

        // bit 컬럼은 SQL 리터럴로 직접 삽입
        $bitCols = [];
        foreach ($data as $col => $val) {
            if (isset($cols[$col]) && str_starts_with($cols[$col], 'bit')) {
                $bitCols[$col] = (int)$val;
            }
        }
        $dataNoBit = array_diff_key($data, $bitCols);

        if (empty($dataNoBit) && empty($bitCols) && empty($sysCols)) return ["INSERT INTO `{$table}` () VALUES ()", []];
        $allCols = array_merge(
            array_map(fn($c) => "`{$c}`", array_keys($dataNoBit)),
            array_map(fn($c) => "`{$c}`", array_keys($bitCols)),
            $sysCols
        );
        $allPh = array_merge(
            array_fill(0, count($dataNoBit), '?'),
            array_map(fn($v) => (string)$v, array_values($bitCols)),
            $sysPh
        );
        return [
            "INSERT INTO `{$table}` (" . implode(', ', $allCols) . ") VALUES (" . implode(', ', $allPh) . ")",
            [...array_values($dataNoBit), ...$sysVals],
        ];
    }

    /**
     * @param string $pkCol  WHERE 조건 컬럼명 (sort_order=1 db_field → v7 변환)
     * @param mixed  $pkVal  WHERE 값
     */
    private function buildUpdate(string $table, array $data, string $pkCol, mixed $pkVal): array
    {
        $userId = $GLOBALS['misSessionUserId'] ?? '';
        $cols = $this->getTableColumnSet($table);
        $sysSets = [];
        $sysVals = [];
        if (isset($cols['last_updater'])) { $sysSets[] = 'last_updater=?';  $sysVals[] = $userId; }
        if (isset($cols['last_update']))  { $sysSets[] = 'last_update=NOW()'; }

        // bit 컬럼은 바인딩이 아닌 SQL 리터럴로 직접 삽입 (PDO bit(1) 바인딩 버그 회피)
        $bitCols = [];
        foreach ($data as $col => $val) {
            if (isset($cols[$col]) && str_starts_with($cols[$col], 'bit')) {
                $bitCols[$col] = (int)$val;
            }
        }
        $dataNoBit = array_diff_key($data, $bitCols);

        $setParts = array_map(fn($c) => "`{$c}` = ?", array_keys($dataNoBit));
        foreach ($bitCols as $col => $v) {
            $setParts[] = "`{$col}` = {$v}";
        }
        $sets = implode(', ', array_merge($setParts, $sysSets));
        if ($sets === '') $sets = '`' . $pkCol . '`=`' . $pkCol . '`';
        return [
            "UPDATE `{$table}` SET {$sets} WHERE `{$pkCol}`=?",
            [...array_values($dataNoBit), ...$sysVals, $pkVal],
        ];
    }

    /** 테이블 컬럼명 set (캐시) — 시스템 컬럼 존재 여부 + 타입 확인용 */
    private array $tableColumnCache = [];
    private function getTableColumnSet(string $table): array
    {
        if (isset($this->tableColumnCache[$table])) return $this->tableColumnCache[$table];
        $stmt = $this->pdo->query("SHOW COLUMNS FROM `{$table}`");
        $set = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $set[$row['Field']] = $row['Type'];
        }
        return $this->tableColumnCache[$table] = $set;
    }

    /**
     * grid_orderby 값으로 기본 ORDER BY 문자열 생성
     * 1a=1순위 ASC, 1d=1순위 DESC, 2a=2순위 ASC, 2d=2순위 DESC
     * 없으면 첫 번째 alias DESC
     */
    private function buildDefaultOrderBy(array $fields): string
    {
        $slots = ['1a' => '', '1d' => '', '2a' => '', '2d' => ''];
        foreach ($fields as $f) {
            $ob    = $f['grid_orderby'] ?? '';
            $alias = $f['alias_name']    ?? '';
            if ($ob !== '' && $alias !== '' && isset($slots[$ob]) && $slots[$ob] === '') {
                $slots[$ob] = $alias;
            }
        }

        $parts = [];
        foreach (['1a', '1d', '2a', '2d'] as $key) {
            if ($slots[$key] === '') continue;
            $parts[] = str_ends_with($key, 'd') ? "-{$slots[$key]}" : $slots[$key];
            if (count($parts) >= 2) break;
        }

        if (!empty($parts)) return implode(',', $parts);

        // fallback: 첫 alias DESC
        foreach ($fields as $f) {
            $alias = $f['alias_name'] ?? '';
            if ($alias !== '') return "-{$alias}";
        }
        return '';
    }

    /**
     * v6 PascalCase 테이블명 → v7 snake_case 매핑
     * 매핑에 없으면 원본 반환 (애플리케이션 테이블은 그대로 사용)
     */
    private function resolveTable(string $tableName): string
    {
        static $map = [
            'MisMenuList'        => 'mis_menus',
            'MisMenuList_Detail' => 'mis_menu_fields',
            'MisMenuList_Member' => 'mis_menu_auth',
            'MisUser'            => 'mis_users',
            'MisGroup_Master'    => 'mis_groups',
            'MisGroup_Detail'    => 'mis_group_rules',
            'MisGroup_Member'    => 'mis_group_members',
            'MisStation'         => 'mis_stations',
            'MisLog'             => 'mis_activity_logs',
            'MisComments'        => 'mis_comments',
            'MisFavoriteMenu'    => 'mis_favorite_menus',
            'MisHelp'            => 'mis_help',
            'MisReadList'        => 'mis_read_history',
            'MisShare'           => 'mis_shares',
            'MisCommonTable'       => 'mis_common_data',
            'MisCompanyMgt'        => 'mis_companies',
            'MisMenuList_UserAuth' => 'mis_menu_user_auth',
        ];
        return $map[$tableName] ?? $tableName;
    }

    /**
     * v6 컬럼명 → v7 snake_case 매핑 (케이스-인센시티브)
     * 매핑에 없으면 원본 반환 (애플리케이션 테이블 컬럼은 그대로)
     */
    private function resolveColumn(string $v7table, string $col): string
    {
        // 공통 (테이블 무관) — lowercase 키
        static $common = [
            'lastupdate'      => 'last_update',
            'lastupdater'     => 'last_updater',
            'useflag'         => 'use_yn',
            'filelastupdate'  => 'file_last_update',
            'filelastupdater' => 'file_last_updater',
        ];
        // 테이블별 — lowercase 키
        static $byTable = [
            'mis_users' => [
                'num'             => 'idx',
                'uniquenum'       => 'user_id',
                'username'        => 'user_name',
                'useralias'       => 'user_alias',
                'positionnum'     => 'position_code',
                'passwddecrypt'   => 'password',
                'station_newnum'  => 'station_idx',
                'handphone'       => 'hand_phone',
                'isstop'          => 'is_stop',
                'isrest'          => 'is_rest',
                'usrphone'        => 'usr_phone',
                'intraphone'      => 'intra_phone',
                'zipcode'         => 'zip_code',
                'usraddress'      => 'usr_address',
                'lastaddress'     => 'last_address',
                'lastcollege'     => 'last_college',
                'collegesubject'  => 'college_subject',
                'bankname'        => 'bank_name',
                'bankbooknum'     => 'bank_book_num',
                'bankinsertman'   => 'bank_insert_man',
            ],
            'mis_menu_auth' => [
                'realpid'        => 'real_pid',
                'authoritylevel' => 'authority_level',
            ],
            'mis_stations' => [
                'num'         => 'idx',
                'stationname' => 'station_name',
                'autogubun'   => 'auto_gubun',
                'sortg2'      => 'sort_g2',
                'sortg4'      => 'sort_g4',
                'sortg6'      => 'sort_g6',
                'sortg8'      => 'sort_g8',
                'sortg10'     => 'sort_g10',
            ],
            'mis_menus' => [
                'realpid'           => 'real_pid',
                'menuname'          => 'menu_name',
                'brieftitle'        => 'brief_title',
                'ismenuhidden'      => 'is_menu_hidden',
                'authcode'          => 'auth_code',
                'menutype'          => 'menu_type',
                'uprealpid'         => 'up_real_pid',
                'addurl'            => 'add_url',
                'autogubun'         => 'auto_gubun',
                'sortg2'            => 'sort_g2',
                'sortg4'            => 'sort_g4',
                'sortg6'            => 'sort_g6',
                'misjoinpid'        => 'mis_join_pid',
                'misjoinlist'       => 'mis_join_list',
                'iscoreprogram'     => 'is_core_program',
                'useflag'           => 'use_yn',
                'lastupdate'        => 'last_update',
                'lastupdater'       => 'last_updater',
                // g0x → 실제 컬럼명
                'g04'               => 'read_only_cond',
                'g05'               => 'brief_insert_sql',
                'g08'               => 'table_name',
                'g09'               => 'base_filter',
                'g10'               => 'use_condition',
                'g11'               => 'delete_query',
                // 기타 v6 PascalCase → v7 snake_case
                'addlogic'          => 'add_logic',
                'addlogic_treat'    => 'add_logic_treat',
                'addlogic_print'    => 'add_logic_print',
                'isuseprint'        => 'is_use_print',
                'isuseform'         => 'is_use_form',
                'newgidx'           => 'new_gidx',
                'filelastupdate'    => 'file_last_update',
                'filelastupdater'   => 'file_last_updater',
                'compileddate'      => 'compile_date',
                'helpupdatedeny'    => 'help_update_deny',
                'helptitle'         => 'help_title',
                'helpcontents'      => 'help_contents',
                'exceldata'         => 'excel_data',
            ],
            'mis_menu_fields' => [
                'realpid'                   => 'real_pid',
                'sortelement'               => 'sort_order',
                'grid_select_field'         => 'db_field',
                'grid_select_tname'         => 'db_table',
                'aliasname'                 => 'alias_name',
                'grid_columns_title'        => 'col_title',
                'grid_columns_width'        => 'col_width',
                'grid_schema_type'          => 'schema_type',
                'grid_items'                => 'items',
                'grid_schema_validation'    => 'schema_validation',
                'grid_maxlength'            => 'max_length',
                'grid_default'              => 'default_value',
                'grid_pil'                  => 'required',
                'grid_formgroup'            => 'form_group',
                'grid_groupcompute'         => 'group_compute',
                'grid_primekey'             => 'prime_key',
                'grid_align'                => 'grid_align',
                'grid_orderby'              => 'grid_orderby',
                'grid_ctlname'              => 'grid_ctl_name',
                'grid_listedit'             => 'grid_list_edit',
                'grid_view_fixed'           => 'grid_view_fixed',
                'grid_view_sm'              => 'grid_view_sm',
                'grid_view_md'              => 'grid_view_md',
                'grid_view_lg'              => 'grid_view_lg',
                'grid_view_xl'              => 'grid_view_xl',
                'grid_view_hight'           => 'grid_view_hight',
                'grid_view_class'           => 'grid_view_class',
                'grid_enter'                => 'grid_enter',
                'grid_ishandle'             => 'grid_is_handle',
                'grid_templete'             => 'grid_templete',
                'grid_alim'                 => 'grid_alim',
                'useflag'                   => 'use_yn',
                'lastupdate'                => 'last_update',
                'lastupdater'               => 'last_updater',
            ],
            'mis_common_data' => [
                'num'     => 'idx',
                'realcid' => 'real_cid',
                'kname'   => 'kname',    // same
                'kname2'  => 'kname2',   // same
                'docitem' => 'doc_item',
            ],
            'mis_groups' => [
                'num'       => 'idx',
                'groupname' => 'group_name',
            ],
            'mis_group_members' => [
                'gidx'      => 'group_idx',
                'uniquenum' => 'user_id',
                'userid'    => 'user_id',
                'isadmins'  => 'is_admin_s',
            ],
            'mis_group_rules' => [
                'gidx'          => 'group_idx',
                'fieldname'     => 'field_name',
                'fieldvalue'    => 'field_value',
                'setnewstation' => 'set_new_station',
                'setposition'   => 'set_position',
                'wherecode2'    => 'where_code2',
                'setuserid'     => 'set_userid',
                'isadmins'      => 'is_admin_s',
            ],
            'mis_shares' => [
                'realpid'    => 'real_pid',
                'menuidx'    => 'menu_idx',
                'uniquenum'  => 'user_id',
                'shareuniq'  => 'share_uniq',
            ],
            'mis_activity_logs' => [
                'logtype'    => 'log_type',
                'menuidx'    => 'menu_idx',
                'linkresult' => 'link_result',
            ],
            'mis_comments' => [
                'menuidx'   => 'menu_idx',
                'parentidx' => 'parent_idx',
                'contents'  => 'contents',
                'uniquenum' => 'user_id',
                'realpid'   => 'real_pid',
            ],
            'mis_favorite_menus' => [
                'realpid'         => 'real_pid',
                'ispublic'        => 'is_public',
                'ismain'          => 'is_main',
                'isnotrecently'   => 'is_not_recently',
                'issendmail'      => 'is_send_mail',
                'addurl'          => 'add_url',
            ],
            'mis_read_history' => [
                'realpid'         => 'real_pid',
                'readdate'        => 'read_date',
                'push_devicenums' => 'push_device_nums',
                'userid'          => 'userid',   // already snake_case in v7
            ],
            'mis_menu_user_auth' => [
                'userid'       => 'user_i_d',      // v6 userID → v7 user_i_d (migration artifact)
                'realpid'      => 'real_pid',
                'menuauthcode' => 'menu_auth_code',
                'useflag'      => 'use_yn',
                'lastupdate'   => 'last_update',
                'lastupdater'  => 'last_updater',
            ],
        ];
        $lc = strtolower($col);
        return $byTable[$v7table][$lc] ?? $common[$lc] ?? $col;
    }

    /**
     * SQL 표현식/ON 절 안의 v6 참조를 v7 으로 치환
     *
     * ① table alias 참조: "alias.col" → "alias.resolved_col"  (aliasToTable 기반)
     * ② 독립 테이블 참조: "MisMenuList m" → "mis_menus m" 등
     */
    private function resolveExpression(string $expr, array $aliasToTable): string
    {
        if ($expr === '') return $expr;

        // ⓪ T-SQL CONVERT(char(n), expr) → MySQL CONVERT(expr, CHAR(n))
        // SQL Server 스타일: convert(char(2), value) → MariaDB: CONVERT(value, CHAR(2))
        $expr = preg_replace_callback(
            '/\bconvert\s*\(\s*char\s*\((\d+)\)\s*,\s*([^)]+)\)/i',
            fn($m) => "CONVERT(" . trim($m[2]) . ", CHAR({$m[1]}))",
            $expr
        ) ?? $expr;

        // ① 서브쿼리 인라인 alias 프리스캔: "FROM|JOIN v6Table table_alias" 형태 수집
        //    예) "from MisUser table_Station_NewNum" → table_Station_NewNum → mis_users
        preg_replace_callback(
            '/(?:FROM|JOIN)\s+(\S+)\s+(table_\w+)/i',
            function (array $m) use (&$aliasToTable): string {
                $resolved = $this->resolveTable($m[1]);
                if ($resolved !== '') $aliasToTable[$m[2]] = $resolved;
                return $m[0];
            },
            $expr
        );

        // ② "alias.col" 패턴 — alias 가 aliasToTable 에 있을 때만 변환
        $expr = preg_replace_callback(
            '/\b(table_\w+)\.([A-Za-z_][A-Za-z0-9_]*)/',
            function (array $m) use ($aliasToTable): string {
                $alias   = $m[1];
                $col     = $m[2];
                $v7table = $aliasToTable[$alias] ?? '';
                if ($v7table === '') return $m[0];
                return "{$alias}." . $this->resolveColumn($v7table, $col);
            },
            $expr
        ) ?? $expr;

        // ② 독립 테이블명 (FROM/JOIN 절 안) — 단어 경계 치환
        static $tableMap = [
            'MisMenuList'        => 'mis_menus',
            'MisMenuList_Detail' => 'mis_menu_fields',
            'MisMenuList_Member' => 'mis_menu_auth',
            'MisUser'            => 'mis_users',
            'MisGroup_Master'    => 'mis_groups',
            'MisGroup_Detail'    => 'mis_group_rules',
            'MisGroup_Member'    => 'mis_group_members',
            'MisStation'         => 'mis_stations',
            'MisLog'             => 'mis_activity_logs',
            'MisComments'        => 'mis_comments',
            'MisFavoriteMenu'    => 'mis_favorite_menus',
            'MisHelp'            => 'mis_help',
            'MisReadList'        => 'mis_read_history',
            'MisShare'           => 'mis_shares',
            'MisCommonTable'     => 'mis_common_data',
            'MisCompanyMgt'      => 'mis_companies',
        ];
        foreach ($tableMap as $v6 => $v7) {
            $expr = preg_replace('/\b' . preg_quote($v6, '/') . '\b/', $v7, $expr);
        }

        // ③ 단순 별칭(1~4글자).col 참조 — 예: "m.AutoGubun", "m.useflag" in subquery
        static $globalCommon = [
            'autogubun'      => 'auto_gubun',
            'menuname'       => 'menu_name',
            'useflag'        => 'use_yn',
            'lastupdate'     => 'last_update',
            'lastupdater'    => 'last_updater',
            'realpid'        => 'real_pid',
            'misjoinpid'     => 'mis_join_pid',
            'misjoinlist'    => 'mis_join_list',
            'menutype'       => 'menu_type',
            'uprealpid'      => 'up_real_pid',
            'realcid'        => 'real_cid',
            'uniquenum'      => 'user_id',
            'docitem'        => 'doc_item',
            'stationname'    => 'station_name',
            'groupname'      => 'group_name',
            'sortg2'         => 'sort_g2',
            'sortg4'         => 'sort_g4',
            'sortg6'         => 'sort_g6',
            'addlogic'       => 'add_logic',
            'addlogic_treat' => 'add_logic_treat',
            'addlogic_print' => 'add_logic_print',
            'isuseprint'     => 'is_use_print',
            'isuseform'      => 'is_use_form',
            'iscoreprogram'  => 'is_core_program',
            'ismenuhidden'   => 'is_menu_hidden',
            'authcode'       => 'auth_code',
            'addurl'         => 'add_url',
            'newgidx'        => 'new_gidx',
            'filelastupdate'  => 'file_last_update',
            'filelastupdater' => 'file_last_updater',
            'username'        => 'user_name',
            'setnewstation'   => 'set_new_station',
            'setposition'     => 'set_position',
            'wherecode2'      => 'where_code2',
            'setuserid'       => 'set_userid',
            'isadmins'        => 'is_admin_s',
            'groupidx'        => 'group_idx',
            'fieldname'       => 'field_name',
            'fieldvalue'      => 'field_value',
            'shareuniq'       => 'share_uniq',
            'ispublic'        => 'is_public',
            'ismain'          => 'is_main',
            'isnotrecently'   => 'is_not_recently',
            'ismenuin'        => 'is_menu_in',
            'readdate'        => 'read_date',
        ];
        $expr = preg_replace_callback(
            '/\b([a-zA-Z]\w{0,3})\.([A-Za-z_][A-Za-z0-9_]*)/',
            function (array $m) use ($globalCommon): string {
                if (str_starts_with($m[1], 'table_')) return $m[0];
                $resolved = $globalCommon[strtolower($m[2])] ?? $m[2];
                return "{$m[1]}.{$resolved}";
            },
            $expr
        ) ?? $expr;

        // ④ bare identifier (alias 없음) — 서브쿼리의 SELECT/WHERE 안 v6 컬럼명
        // SQL 키워드와 충돌 없도록 globalCommon 매핑에 있는 것만 치환
        $expr = preg_replace_callback(
            '/(?<![.\w])([A-Za-z][A-Za-z0-9_]*)(?![.\w(])/',
            function (array $m) use ($globalCommon): string {
                return $globalCommon[strtolower($m[1])] ?? $m[1];
            },
            $expr
        ) ?? $expr;

        return $expr;
    }

    /**
     * base_filter 문자열 안의 v6 컬럼명을 v7 snake_case 로 치환
     * aliasToTable: buildSelectFromFields 가 반환한 전체 alias→v7table 맵
     */
    private function resolveBaseFilter(string $filter, array $aliasToTable): string
    {
        if ($filter === '') return $filter;

        // @세션변수 → 실제 값 치환
        $filter = $this->resolveSessionPlaceholders($filter);
        return $this->resolveExpression($filter, $aliasToTable);
    }

    /**
     * mis_menu_fields 배열 → SELECT 컬럼 목록 + LEFT JOIN 절 목록 + fieldMap 반환
     *
     * fieldMap: alias_name → 'table_alias.db_field' (WHERE/ORDER BY 에서 사용)
     *
     * group_compute 컬럼 포맷:
     *   "RealTableName alias ON condition..."  (alias는 임의 식별자, table_ 접두어 불필요)
     */
    private function buildSelectFromFields(array $fields, string $userId, string $mainTable = ''): array
    {
        $selectCols      = [];
        $selectColTitles = [];
        $joinClauses     = [];
        $joinedAliases = [];
        $fieldMap      = [];
        // JOIN alias → 실제 v7 테이블명 (resolveColumn 에 사용)
        $aliasToTable  = ['table_m' => $mainTable];

        // ── Pass 1: aliasToTable 선행 수집 ─────────────────────────────────
        // display 필드가 FK 필드보다 sort_order 상 앞에 오기 때문에,
        // 단일 패스에서는 display 필드 처리 시 aliasToTable 미등록 상태가 됨.
        // 먼저 모든 group_compute + prime_key 를 스캔해 별칭→테이블 매핑 수집.
        $prevDbTableScan = '';
        foreach ($fields as $f) {
            $rawDbTable   = $f['db_table'];
            $dbTable      = $rawDbTable !== null ? trim($rawDbTable) : '';
            // null db_table + 단순 식별자 → table_m 기본, null + 복합 표현식 → '' 유지
            if ($rawDbTable === null) {
                $tmpField = trim($f['db_field'] ?? '');
                if ($tmpField !== '' && !str_contains($tmpField, ' ') && !str_contains($tmpField, '(')) {
                    $dbTable = 'table_m';
                }
            }
            $groupCompute = trim($f['group_compute'] ?? '');
            $primeKey     = trim($f['prime_key']     ?? '');

            if ($groupCompute !== '') {
                $gc = preg_replace('/\bdbo\./i', '', $groupCompute);
                if (preg_match('/^(\S+)\s+(\w+)\s+on\s+/is', trim($gc), $m)) {
                    $aliasToTable[$m[2]] = $this->resolveTable($m[1]);
                }
            }
            if ($primeKey !== '' && $prevDbTableScan !== '' && $prevDbTableScan !== 'table_m') {
                $parts = explode('#', $primeKey);
                if (count($parts) >= 4) {
                    $aliasToTable[$prevDbTableScan] = $this->resolveTable(trim($parts[1]));
                }
            }
            $prevDbTableScan = $dbTable;
        }

        // ── Pass 2: SELECT / JOIN 생성 ─────────────────────────────────────
        $prevDbTable = '';
        $prevDbField = '';

        foreach ($fields as $f) {
            $alias        = $f['alias_name']     ?? '';
            $rawDbTable   = $f['db_table'];
            $dbTable      = $rawDbTable !== null ? trim($rawDbTable) : '';
            $dbField      = trim($f['db_field']  ?? '');
            // null db_table + 단순 식별자 → table_m 기본, null + 복합 표현식 → '' (raw SQL)
            if ($rawDbTable === null && $dbField !== ''
                && !str_contains($dbField, ' ') && !str_contains($dbField, '(')) {
                $dbTable = 'table_m';
            }
            $groupCompute = trim($f['group_compute'] ?? '');
            $primeKey     = trim($f['prime_key']     ?? '');

            // ── JOIN 수집: group_compute ──────────────────────────────────
            // alias가 없는 숨김 필드(col_width<0)라도 group_compute JOIN은 반드시 반영
            if ($groupCompute !== '') {
                $join = $this->parseJoinDef($groupCompute, $userId, $aliasToTable);
                if ($join && !isset($joinedAliases[$join['alias']])) {
                    $joinClauses[]                 = "LEFT JOIN {$join['table']} {$join['alias']} ON {$join['on']}";
                    $joinedAliases[$join['alias']] = true;
                }
            }

            if ($alias === '') { $prevDbTable = $dbTable; $prevDbField = $dbField; continue; }

            // ── JOIN 수집: prime_key ────────────────────────────────────────
            if ($primeKey !== '' && $prevDbTable !== '' && $prevDbTable !== 'table_m') {
                // FK 필드의 컬럼명 v7 변환 (ON 절에 사용)
                $v7curTable     = $aliasToTable[$dbTable] ?? '';
                $resolvedCurCol = $v7curTable !== '' ? $this->resolveColumn($v7curTable, $dbField) : $dbField;
                $join = $this->parsePrimeKeyJoin($primeKey, $prevDbTable, $dbTable, $resolvedCurCol, $userId, $aliasToTable);
                if ($join && !isset($joinedAliases[$join['alias']])) {
                    $joinClauses[]                 = "LEFT JOIN {$join['table']} {$join['alias']} ON {$join['on']}";
                    $joinedAliases[$join['alias']] = true;
                }
            }

            // ── SELECT 표현식 생성 ──────────────────────────────────────────
            if ($dbTable === 'virtual_field') {
                // 가상 필드: DB 컬럼 없이 빈 문자열로 SELECT
                $selectCols[]       = "'' AS `{$alias}`";
                $selectColTitles[]  = $f['col_title'] ?? $alias;
                $fieldMap[$alias]   = "''";
            } elseif ($dbTable !== '' && $dbField !== '') {
                // v6 컬럼명 → v7 변환
                $v7table  = $aliasToTable[$dbTable] ?? '';
                $resolved = $v7table !== '' ? $this->resolveColumn($v7table, $dbField) : $dbField;
                $expr             = "{$dbTable}.{$resolved}";
                $selectCols[]       = "{$expr} AS `{$alias}`";
                $selectColTitles[]  = $f['col_title'] ?? $alias;
                $fieldMap[$alias] = $expr;
            } elseif ($dbField !== '') {
                // 순수 SQL 표현식 (CASE WHEN, subquery, concat 등) — 내부 참조도 치환
                $resolvedExpr     = $this->resolveExpression($dbField, $aliasToTable);
                $selectCols[]       = "({$resolvedExpr}) AS `{$alias}`";
                $selectColTitles[]  = $f['col_title'] ?? $alias;
                $fieldMap[$alias] = "({$resolvedExpr})";
            }

            // virtual_field는 실제 DB 테이블이 아니므로 prevDbTable 체인 초기화
            $prevDbTable = ($dbTable === 'virtual_field') ? '' : $dbTable;
            $prevDbField = $dbField;
        }

        return [$selectCols, $joinClauses, $fieldMap, $aliasToTable, $selectColTitles];
    }

    /**
     * prime_key JOIN 생성
     *
     * prime_key 포맷: display#RealTable#codeField#joinField[#extra[#extra2...]]
     *
     * 결과: LEFT JOIN {RealTable} {joinAlias} ON {joinAlias}.{parts[3]} = {curDbTable}.{curDbField}
     *        [AND {joinAlias}.{extra} | AND ({extra_with_@outer_tbname})]
     *
     * @param string $joinAlias   직전 필드의 db_table (JOIN 별칭)
     * @param string $curDbTable  현재 FK 필드의 db_table
     * @param string $curDbField  현재 FK 필드의 db_field
     */
    private function parsePrimeKeyJoin(
        string $primeKey,
        string $joinAlias,
        string $curDbTable,
        string $curDbField,
        string $userId,
        array  $aliasToTable = []
    ): ?array {
        $parts = explode('#', $primeKey);
        if (count($parts) < 4) return null;

        $tableName = $this->resolveTable(trim($parts[1]));
        $joinField = $this->resolveColumn($tableName, trim($parts[3]));   // 조인 테이블 측 키 컬럼 (v6→v7 매핑)

        $safeId = preg_replace('/[^a-zA-Z0-9_\-@.]/', '', $userId);

        // aliasToTable 에 joinAlias → tableName 추가 (extra 조건 resolveExpression 용)
        $localAliasMap = array_merge($aliasToTable, [$joinAlias => $tableName]);

        $on = "{$joinAlias}.{$joinField} = {$curDbTable}.{$curDbField}";

        // parts[4], parts[5] ... 추가 조건
        for ($i = 4; $i < count($parts); $i++) {
            $extra = trim($parts[$i]);
            if ($extra === '') continue;

            $extra = str_replace('@outer_tbname', $joinAlias, $extra);
            $extra = str_replace(['@misSessionUserId', '@MisSession_UserID'], $safeId, $extra);

            // v6 컬럼명 치환 (table_ 접두어 있는 참조)
            $extra = $this->resolveExpression($extra, $localAliasMap);

            if (str_starts_with($extra, '(')) {
                $on .= " AND {$extra}";
            } elseif (str_contains($extra, '=') || str_contains($extra, '<') || str_contains($extra, '>')) {
                // 점(.) 없는 bare 컬럼 참조 → joinAlias 로 자격 부여 (ambiguous 방지)
                if (!str_contains($extra, '.')) {
                    $extra = preg_replace('/\b([A-Za-z_]\w*)(?=\s*[=<>!])/', "{$joinAlias}.$1", $extra) ?? $extra;
                }
                $on .= " AND ({$extra})";
            } else {
                $on .= " AND {$joinAlias}.{$extra}";
            }
        }

        return ['table' => $tableName, 'alias' => $joinAlias, 'on' => $on];
    }

    /**
     * group_compute → JOIN 파싱
     * 포맷: "[dbo.]RealTableName alias ON condition"  (alias는 임의 식별자)
     * @MisSession_UserID 치환
     */
    private function parseJoinDef(string $groupCompute, string $userId, array $aliasToTable = []): ?array
    {
        $safeId = preg_replace('/[^a-zA-Z0-9_\-@.]/', '', $userId);

        // dbo. 스키마 접두어 제거 (MS SQL → MariaDB)
        $gc = preg_replace('/\bdbo\./i', '', $groupCompute);
        $gc = str_replace(['@misSessionUserId', '@MisSession_UserID'], $safeId, $gc);

        // 포맷: TableName alias ON condition  (alias는 임의 식별자 허용)
        if (!preg_match('/^(\S+)\s+(\w+)\s+on\s+(.+)$/is', trim($gc), $m)) {
            return null;
        }

        $v7table = $this->resolveTable($m[1]);
        $alias   = $m[2];

        // ON 절의 v6 컬럼명 치환
        $localAliasMap = array_merge($aliasToTable, [$alias => $v7table]);
        $onCond = $this->resolveExpression(trim($m[3]), $localAliasMap);

        return ['table' => $v7table, 'alias' => $alias, 'on' => $onCond];
    }

    private function log(string $action, int $gubun, ?int $idx, object $user): void
    {
        try {
            $this->pdo->prepare(
                'INSERT INTO mis_activity_logs (log_type, menu_idx, link_result, ip, wdate)
                 VALUES (?,?,?,?,NOW())'
            )->execute([$action, $gubun, (string)$idx, $_SERVER['REMOTE_ADDR'] ?? '']);
        } catch (\Throwable) {}
    }
}
