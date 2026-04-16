<?php
/**
 * 웹소스관리 디테일 — 267번 프로그램 훅
 * INFORMATION_SCHEMA.COLUMNS JOIN에 TABLE_SCHEMA 조건 추가
 */

function _addTableSchema(string &$sql): void {
    $dbName = $_ENV['DB_NAME'] ?? 'speedmis_v7';
    if (!str_contains($sql, 'TABLE_SCHEMA')) {
        $sql = str_replace(
            'table_COLUMNS.TABLE_NAME=',
            "table_COLUMNS.TABLE_SCHEMA='{$dbName}' AND table_COLUMNS.TABLE_NAME=",
            $sql
        );
    }
}

function list_query(&$selectQuery, &$countQuery) {
    _addTableSchema($selectQuery);
    _addTableSchema($countQuery);
}

function view_query(&$viewSql) {
    _addTableSchema($viewSql);
}
