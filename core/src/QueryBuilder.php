<?php

namespace App;

/**
 * allFilter JSON → SQL WHERE / ORDER BY / LIMIT 변환
 * v6와 동일한 파라미터 방식 유지
 */
class QueryBuilder
{
    private const OPERATORS = [
        'eq', 'neq', 'contains', 'notContains', 'startsWith', 'endsWith',
        'gt', 'gte', 'lt', 'lte', 'between', 'in', 'isNull', 'isNotNull',
    ];

    /**
     * @param string|array $allFilter  JSON 문자열 또는 배열
     * @param string       $tableAlias 단순 단일 테이블용 prefix (JOIN 시엔 fieldMap 사용)
     * @param array        $fieldMap   alias_name → 'table_alias.field' 매핑 (JOIN 모드)
     */
    public function buildWhere(string|array $allFilter, string $tableAlias = '', array $fieldMap = []): array
    {
        $filters = is_string($allFilter) ? (json_decode($allFilter, true) ?: []) : $allFilter;

        if (empty($filters)) {
            return ['sql' => '', 'bindings' => []];
        }

        $clauses  = [];
        $bindings = [];

        foreach ($filters as $cond) {
            if (empty($cond['field']) || empty($cond['operator'])) continue;
            if (!in_array($cond['operator'], self::OPERATORS, true)) continue;

            $rawField = $cond['field'];

            // toolbar_ 접두어 제거 (toolbar_zsomefield → zsomefield)
            if (str_starts_with($rawField, 'toolbar_')) {
                $rawField = substr($rawField, 8);
            }

            // fieldMap 우선 (JOIN 모드): alias → 'table.field'
            if (isset($fieldMap[$rawField])) {
                $colExpr = $fieldMap[$rawField];
            } else {
                $field = $this->sanitizeField($rawField);
                if ($field === '') continue;
                $prefix  = $tableAlias ? "`{$tableAlias}`." : '';
                $colExpr = $prefix . "`{$field}`";
            }

            [$clause, $vals] = $this->parseOp($colExpr, $cond['operator'], $cond['value'] ?? null);
            $clauses[]  = $clause;
            $bindings   = array_merge($bindings, $vals);
        }

        if (empty($clauses)) return ['sql' => '', 'bindings' => []];

        return ['sql' => 'WHERE ' . implode(' AND ', $clauses), 'bindings' => $bindings];
    }

    public function buildOrderBy(string $orderby, array $fieldMap = []): string
    {
        if ($orderby === '') return '';
        if (str_starts_with($orderby, '__recently__')) {
            $col = substr($orderby, 12); // __recently__ 이후 db_table.db_field
            return $col !== '' ? "ORDER BY {$col} DESC" : 'ORDER BY table_m.idx DESC';
        }

        $parts = [];
        foreach (explode(',', $orderby) as $token) {
            $token = trim($token);
            if ($token === '') continue;

            if (str_starts_with($token, '-')) {
                $raw = substr($token, 1);
                $dir = 'DESC';
            } else {
                $raw = $token;
                $dir = 'ASC';
            }

            if (isset($fieldMap[$raw])) {
                $parts[] = "{$fieldMap[$raw]} {$dir}";
            } else {
                $col = $this->sanitizeField($raw);
                if ($col !== '') $parts[] = "`{$col}` {$dir}";
            }
        }

        return empty($parts) ? '' : 'ORDER BY ' . implode(', ', $parts);
    }

    public function buildPagination(int $page, int $pageSize): string
    {
        $pageSize = min(max(1, $pageSize), MAX_PAGE_SIZE);
        $offset   = (max(1, $page) - 1) * $pageSize;
        return "LIMIT {$pageSize} OFFSET {$offset}";
    }

    // -------------------------------------------------------------------------

    private function parseOp(string $col, string $op, mixed $val): array
    {
        return match ($op) {
            'eq'          => ["{$col} = ?",         [$val]],
            'neq'         => ["{$col} != ?",        [$val]],
            'contains'    => ["{$col} LIKE ?",       ["%{$val}%"]],
            'notContains' => ["{$col} NOT LIKE ?",   ["%{$val}%"]],
            'startsWith'  => ["{$col} LIKE ?",       ["{$val}%"]],
            'endsWith'    => ["{$col} LIKE ?",       ["%{$val}"]],
            'gt'          => ["{$col} > ?",          [$val]],
            'gte'         => ["{$col} >= ?",         [$val]],
            'lt'          => ["{$col} < ?",          [$val]],
            'lte'         => ["{$col} <= ?",         [$val]],
            'isNull'      => ["{$col} IS NULL",      []],
            'isNotNull'   => ["{$col} IS NOT NULL",  []],
            'between'     => $this->parseBetween($col, $val),
            'in'          => $this->parseIn($col, $val),
            default       => ['1=1', []],
        };
    }

    private function parseBetween(string $col, mixed $val): array
    {
        $parts = is_array($val) ? array_values($val) : explode(',,', (string)$val, 2);
        if (count($parts) < 2) return ['1=1', []];
        return ["{$col} BETWEEN ? AND ?", [$parts[0], $parts[1]]];
    }

    private function parseIn(string $col, mixed $val): array
    {
        $items = is_array($val)
            ? array_values($val)
            : array_filter(explode(',,', (string)$val), fn($v) => $v !== '');
        if (empty($items)) return ['1=1', []];
        $ph = implode(',', array_fill(0, count($items), '?'));
        return ["{$col} IN ({$ph})", array_values($items)];
    }

    public function sanitizeField(string $field): string
    {
        return preg_replace('/[^a-zA-Z0-9_]/', '', $field) ?? '';
    }
}
