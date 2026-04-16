import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../api';
import { showToast } from './Toast';
import SearchableSelect, { SEARCHABLE_THRESHOLD } from './SearchableSelect';

/** SQL 가독성 포맷: 주요 절 앞에 줄바꿈 (서버 포맷 SQL은 그대로 반환) */
function formatSQL(sql) {
  if (!sql) return sql;
  // 서버에서 이미 포맷된 SQL (줄바꿈 있음)
  if (sql.includes('\n')) return sql.trim();
  // 서버 어노테이션 SQL (-- 주석 포함, 줄바꿈은 없는 경우): 키워드·주석 앞에 줄바꿈 복원
  if (sql.trimStart().startsWith('--')) {
    return sql
      .replace(/[ \t]+(-- )/g,           '\n$1')       // 공백 뒤의 --를 줄바꿈으로
      .replace(/[ \t]+\bSELECT\b/gi,     '\n\nSELECT')
      .replace(/[ \t]+\bFROM\b/gi,       '\nFROM')
      .replace(/[ \t]+\bLEFT\s+JOIN\b/gi,'\nLEFT JOIN')
      .replace(/[ \t]+\bINNER\s+JOIN\b/gi,'\nINNER JOIN')
      .replace(/[ \t]+\bWHERE\b/gi,      '\nWHERE')
      .replace(/[ \t]+\bAND\b/gi,        '\n  AND')
      .replace(/[ \t]+\bGROUP\s+BY\b/gi, '\nGROUP BY')
      .replace(/[ \t]+\bORDER\s+BY\b/gi, '\nORDER BY')
      .replace(/[ \t]+\bLIMIT\b/gi,      '\nLIMIT')
      .trim();
  }
  // 일반 단일행 SQL: 키워드 앞에 줄바꿈 삽입
  let s = sql.replace(/\s+/g, ' ').trim();
  s = s
    .replace(/\bFROM\b/gi,         '\nFROM')
    .replace(/\bLEFT\s+JOIN\b/gi,  '\nLEFT JOIN')
    .replace(/\bRIGHT\s+JOIN\b/gi, '\nRIGHT JOIN')
    .replace(/\bINNER\s+JOIN\b/gi, '\nINNER JOIN')
    .replace(/\bCROSS\s+JOIN\b/gi, '\nCROSS JOIN')
    .replace(/\bWHERE\b/gi,        '\nWHERE')
    .replace(/\bAND\b/gi,          '\n  AND')
    .replace(/\bOR\b/gi,           '\n  OR')
    .replace(/\bGROUP\s+BY\b/gi,   '\nGROUP BY')
    .replace(/\bORDER\s+BY\b/gi,   '\nORDER BY')
    .replace(/\bHAVING\b/gi,       '\nHAVING')
    .replace(/\bLIMIT\b/gi,        '\nLIMIT')
    .replace(/\bOFFSET\b/gi,       '\nOFFSET');
  return s.trim();
}

/** 바인딩 값을 SQL ? 에 대입해 완성된 쿼리 반환 */
function buildCompleteSQL(sql, bindings) {
  if (!bindings?.length) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = bindings[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  });
}

/** 복사용 텍스트: -- 1. SELECT / -- 2. COUNT 형식 (완성 쿼리 + 포맷) */
function buildCopyText(devSql) {
  const parts = ['-- 1. SELECT', formatSQL(buildCompleteSQL(devSql.sql, devSql.bindings)) + ';'];
  if (devSql.count_sql) {
    parts.push('\n-- 2. COUNT', formatSQL(buildCompleteSQL(devSql.count_sql, devSql.bindings)) + ';');
  }
  return parts.join('\n');
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}

function legacyCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(el);
}

const cfg = window.__APP_CONFIG__ ?? {};
const PAGE_SIZE = cfg.defaultPageSize ?? 25;

/**
 * col_title 파싱: "상위,상위계정코드" → { r1:'상위', r2:'상위계정코드' }
 *                 ",상위계정명"       → { r1:'',    r2:'상위계정명' }
 *                 "비고"              → { r1:null,  r2:'비고' }  (콤마 없음=standalone)
 */
function parseColTitle(colTitle) {
  const s = colTitle ?? '';
  const ci = s.indexOf(',');
  if (ci === -1) return { r1: null, r2: s };
  return { r1: s.slice(0, ci), r2: s.slice(ci + 1) };
}

/**
 * URL orderby 문자열 정규화: "field desc,field2 asc" → "-field,field2"
 */
function normalizeOrderby(ob) {
  if (!ob) return '';
  return ob.split(',').map(t => {
    t = t.trim();
    const lc = t.toLowerCase();
    if (lc.endsWith(' desc')) return '-' + t.slice(0, -5).trim();
    if (lc.endsWith(' asc'))  return t.slice(0, -4).trim();
    return t;
  }).filter(Boolean).join(',');
}

/**
 * URL allFilter JSON → filterValues 초기값 추출
 * toolbar_ 접두어 제거, between → {from,to}
 */
function parseUrlFilter(afStr) {
  try {
    const filters = JSON.parse(afStr);
    const vals = {};
    (filters ?? []).forEach(f => {
      let field = f.field ?? '';
      if (field.startsWith('toolbar_')) field = field.slice(8);
      if (!field || f.value === undefined) return;
      if (f.operator === 'between' && Array.isArray(f.value)) {
        vals[field] = { from: f.value[0] ?? '', to: f.value[1] ?? '' };
      } else {
        vals[field] = f.value;
      }
    });
    return vals;
  } catch {
    return {};
  }
}

/**
 * listFields → 2행 헤더 그룹 계산
 */
function computeHeaderGroups(listFields) {
  const parsed = listFields.map(f => ({
    ...parseColTitle(f.col_title ?? f.alias_name ?? ''),
    field: f,
  }));

  const groups = [];
  parsed.forEach((p, i) => {
    if (p.r1 === null) {
      groups.push({ r1: null, colspan: 1, startIdx: i });
    } else if (p.r1 !== '') {
      groups.push({ r1: p.r1, colspan: 1, startIdx: i });
    } else {
      if (groups.length > 0 && groups[groups.length - 1].r1 !== null) {
        groups[groups.length - 1].colspan++;
      } else {
        groups.push({ r1: '', colspan: 1, startIdx: i });
      }
    }
  });

  return { parsed, groups };
}

/** items 문자열 → [{value, text}] */
function parseItems(items) {
  try {
    const parsed = JSON.parse(items ?? '[]');
    if (Array.isArray(parsed)) {
      return parsed.map(o => (typeof o === 'object' ? o : { value: o, text: o }));
    }
  } catch {}
  return (items ?? '').split(',').filter(Boolean).map(v => ({ value: v.trim(), text: v.trim() }));
}

/** mis_menu_fields grid_orderby ('1a','2d'...) → orderby 문자열 */
function buildDefaultOrderby(fields) {
  return fields
    .filter(f => f.grid_orderby)
    .map(f => {
      const raw  = String(f.grid_orderby);
      const rank = parseInt(raw, 10);
      const desc = raw.endsWith('d');
      return { alias: f.alias_name ?? '', rank, desc };
    })
    .filter(item => item.rank > 0 && item.alias)
    .sort((a, b) => a.rank - b.rank)
    .map(item => item.desc ? `-${item.alias}` : item.alias)
    .join(',');
}

/** filterValues → allFilter JSON */
function buildAllFilter(filterValues, filterFields) {
  const filters = [];
  filterFields.forEach(f => {
    const alias  = f.alias_name ?? '';
    const handle = f.grid_is_handle ?? '';
    const val    = filterValues[alias];
    if (handle === 't' && val) {
      filters.push({ field: alias, operator: 'contains', value: val });
    } else if (handle === 's' && val) {
      filters.push({ field: alias, operator: 'eq', value: val });
    } else if (handle === 'w') {
      const from = val?.from ?? '';
      const to   = val?.to   ?? '';
      if (from || to) filters.push({ field: alias, operator: 'between', value: [from, to] });
    }
  });
  return JSON.stringify(filters);
}

/** 필터 객체 → 입력 문자열 (URL 복원용) */
function filterToInputStr(f) {
  const v = Array.isArray(f.value) ? f.value.join(',,') : String(f.value ?? '');
  switch (f.operator) {
    case 'eq':         return `=${v}`;
    case 'neq':        return `<>${v}`;
    case 'lt':         return `<${v}`;
    case 'lte':        return `<=${v}`;
    case 'gt':         return `>${v}`;
    case 'gte':        return `>=${v}`;
    case 'startsWith': return `${v}%`;
    case 'endsWith':   return `%${v}`;
    case 'isNull':     return ',,';
    default:           return v; // contains / in
  }
}

/** URL allFilter 에서 toolbar_ 가 아닌 항목만 추출 → 입력값 맵 */
function parseUrlColFilters(afStr) {
  try {
    const vals = {};
    (JSON.parse(afStr) ?? []).forEach(f => {
      const field = f.field ?? '';
      if (!field || field.startsWith('toolbar_')) return;
      vals[field] = filterToInputStr(f);
    });
    return vals;
  } catch { return {}; }
}

/** URL allFilter 에서 toolbar_ 항목만 남긴 JSON (초기 load용) */
function toolbarOnlyAf(afStr) {
  try {
    return JSON.stringify((JSON.parse(afStr) ?? []).filter(f => (f.field ?? '').startsWith('toolbar_')));
  } catch { return '[]'; }
}

/**
 * 컬럼 헤더 필터 문법 파싱
 * "관리"      → contains   "=관리" → eq      "관리%" → startsWith  "%관리" → endsWith
 * "<관리"     → lt         "<=관리"→ lte     ">관리" → gt          ">=관리"→ gte
 * "<>관리"    → neq        ",,"    → isNull  "a,,b,,c" → in
 */
function parseColFilter(alias, raw) {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (v === ',,') return { field: alias, operator: 'isNull', value: '' };
  if (v.includes(',,')) {
    return { field: alias, operator: 'in', value: v.split(',,').map(s => s.trim()) };
  }
  if (v.startsWith('<>')) return { field: alias, operator: 'neq',        value: v.slice(2) };
  if (v.startsWith('<=')) return { field: alias, operator: 'lte',        value: v.slice(2) };
  if (v.startsWith('>=')) return { field: alias, operator: 'gte',        value: v.slice(2) };
  if (v.startsWith('<'))  return { field: alias, operator: 'lt',         value: v.slice(1) };
  if (v.startsWith('>'))  return { field: alias, operator: 'gt',         value: v.slice(1) };
  if (v.startsWith('='))  return { field: alias, operator: 'eq',         value: v.slice(1) };
  if (v.startsWith('%'))  return { field: alias, operator: 'endsWith',   value: v.slice(1) };
  if (v.endsWith('%'))    return { field: alias, operator: 'startsWith', value: v.slice(0, -1) };
  // suffix 비교 연산자: "3>" → gt 3, "3>=" → gte 3, "3<" → lt 3, "3<=" → lte 3
  if (v.endsWith('>='))   return { field: alias, operator: 'gte', value: v.slice(0, -2) };
  if (v.endsWith('<='))   return { field: alias, operator: 'lte', value: v.slice(0, -2) };
  if (v.endsWith('<>'))   return { field: alias, operator: 'neq', value: v.slice(0, -2) };
  if (v.endsWith('>'))    return { field: alias, operator: 'gt',  value: v.slice(0, -1) };
  if (v.endsWith('<'))    return { field: alias, operator: 'lt',  value: v.slice(0, -1) };
  return { field: alias, operator: 'contains', value: v };
}

/**
 * 범용 데이터 그리드
 */
const DataGrid = forwardRef(function DataGrid({ gubun, user, menu, onToggleView, onModify,
                                   panelOpen, panelSize, onPanelSizeClick, onPanelClose, currentIdx, onOpenTab,
                                   parentIdx: parentIdxProp, onSqlBtn,
                                   devMode: devModeProp, noAutoOpen = false, noPanelBtn = false, onOnlyList, onClientMeta }, ref) {
  // URL params (한 번만 파싱) + menu.add_url 파라미터 병합 (URL이 우선)
  const urlParams = useRef(null);
  if (!urlParams.current) {
    const real = new URLSearchParams(window.location.search);
    const addUrl = (menu?.add_url ?? '').trim();
    if (addUrl) {
      const add = new URLSearchParams(addUrl.startsWith('&') ? addUrl.slice(1) : addUrl);
      for (const [k, v] of add) {
        if (!real.has(k)) real.set(k, v);
      }
    }
    urlParams.current = real;
  }
  const [colWidths, setColWidths] = useState({});
  const resizeDrag = useRef(null); // { alias, startX, startWidth }

  // 다중 선택 체크박스 (simple_list 아닌 경우)
  const isSimpleList = menu?.g01 === 'simple_list';
  const [checkedRows, setCheckedRows] = useState(new Set());

  // 셀 선택
  const [selAnchor, setSelAnchor] = useState(null); // {ri, ci}
  const [selFocus,  setSelFocus]  = useState(null);
  const [copyDone,  setCopyDone]  = useState(false);
  const isDragging = useRef(false);

  // 컬럼 헤더 인라인 필터 — URL allFilter 의 non-toolbar_ 항목에서 복원
  const [colFilters, setColFilters] = useState(() =>
    parseUrlColFilters(urlParams.current.get('allFilter') ?? '[]')
  );
  const colFiltersRef = useRef({});
  colFiltersRef.current = colFilters;

  // 필터행 표시 여부 (localStorage 영속)
  const FILTER_ROW_KEY = 'mis_filter_row';
  const [showFilterRow, setShowFilterRow] = useState(() => localStorage.getItem(FILTER_ROW_KEY) !== 'N');
  const toggleFilterRow = () => { setShowFilterRow(v => { const next = !v; localStorage.setItem(FILTER_ROW_KEY, next ? 'Y' : 'N'); return next; }); };

  // 조회/수정 클릭 모드 (localStorage 영속)
  const CLICK_MODE_KEY = 'mis_click_mode';
  const [clickMode, setClickModeRaw] = useState(() => localStorage.getItem(CLICK_MODE_KEY) || 'view');
  const clickModeRef = useRef(clickMode);
  clickModeRef.current = clickMode;
  const setClickMode = (m) => { setClickModeRaw(m); localStorage.setItem(CLICK_MODE_KEY, m); };

  const [rows, setRows]       = useState([]);
  const [onlyListMode, setOnlyListMode] = useState(false);
  const [fields, setFields]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const ps = parseInt(urlParams.current.get('psize') ?? urlParams.current.get('pageSize') ?? '0', 10);
    return ps > 0 ? ps : PAGE_SIZE;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // ── 인라인 편집 (list_edit=Y) ──
  const [editCell, setEditCell] = useState(null); // { ri, alias, saveAlias, displayAlias, idx, fkField }
  const [savedRowIdx, setSavedRowIdx] = useState(null);
  const [editVal, setEditVal]   = useState('');
  const [editSaving, setEditSaving] = useState(false);



  // display 필드 → FK 필드 매핑 빌드 (fields 변경 시 한 번만)
  const fkMapRef = useRef({});
  useEffect(() => {
    const map = {}; // displayAlias → fkField
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.grid_list_edit === 'Y' && f.prime_key) {
        // 이 FK 필드의 다음(sort_order+1) display 필드 찾기
        // display 필드: 같은 db_table prefix가 아닌, sort_order 직전 필드
        // 실제로는 직전 필드가 display (sort_order 기준 i-1)
        if (i > 0) {
          const prev = fields[i - 1];
          const pw = parseInt(prev.col_width ?? '0', 10);
          if (pw > 0 && prev.db_table !== 'table_m') {
            map[prev.alias_name] = f;
          }
        }
      }
    }
    fkMapRef.current = map;
  }, [fields]);

  const startEdit = useCallback((ri, alias, val, rowIdx, row) => {
    const fkField = fkMapRef.current[alias];
    if (fkField) {
      // display 필드 클릭 → FK 필드의 값으로 편집
      setEditCell({ ri, alias, saveAlias: fkField.alias_name, displayAlias: alias, idx: rowIdx, fkField });
      setEditVal(row[fkField.alias_name] ?? '');
    } else {
      setEditCell({ ri, alias, saveAlias: alias, displayAlias: alias, idx: rowIdx, fkField: null });
      setEditVal(val ?? '');
    }
  }, []);

  const cancelEdit = useCallback(() => { setEditCell(null); setEditVal(''); }, []);

  // 편집 셀 이동 (Enter → 아래, Shift+Enter → 위)
  const moveEdit = useCallback((direction) => {
    if (!editCell) return;
    const nextRi = direction === 'down' ? editCell.ri + 1 : editCell.ri - 1;
    if (nextRi < 0 || nextRi >= rows.length) { setEditCell(null); setEditVal(''); return; }
    const nextRow = rows[nextRi];
    startEdit(nextRi, editCell.alias, nextRow?.[editCell.alias] ?? '', nextRow?.idx, nextRow);
  }, [editCell, rows, startEdit]);

  // 체크박스: 첫 클릭 → 활성화(선택 상태), 재클릭 → 토글 저장
  const [checkActive, setCheckActive] = useState(null); // { ri, alias }
  const checkActiveTimer = useRef(null);

  const handleCheckClick = useCallback(async (ri, alias, currentVal, rowIdx) => {
    // 이미 활성화된 셀 → 토글 저장
    if (checkActive && checkActive.ri === ri && checkActive.alias === alias) {
      const newVal = (currentVal === 'Y' || currentVal === '1') ? '' : 'Y';
      setCheckActive(null);
      if (checkActiveTimer.current) clearTimeout(checkActiveTimer.current);
      try {
        const res = await api.save(gubun, { [alias]: newVal, _listEdit: true }, rowIdx);
        if (res._client_toast) showToast(res._client_toast);
        setRows(prev => prev.map((r, i) => i === ri ? { ...r, [alias]: newVal } : r));
      } catch (e) {
        showToast(e.message || '저장 실패');
      }
      return;
    }
    // 첫 클릭 → 활성화 (3초 후 자동 해제)
    setCheckActive({ ri, alias });
    if (checkActiveTimer.current) clearTimeout(checkActiveTimer.current);
    checkActiveTimer.current = setTimeout(() => setCheckActive(null), 3000);
  }, [gubun, checkActive]);

  const saveEdit = useCallback(async (direction, overrideValue) => {
    if (!editCell) return;
    const effectiveVal = overrideValue !== undefined && overrideValue !== null ? overrideValue : editVal;
    const prevVal = editCell.fkField
      ? rows[editCell.ri]?.[editCell.saveAlias]
      : rows[editCell.ri]?.[editCell.alias];
    if (String(effectiveVal) === String(prevVal ?? '')) {
      // 값 변경 없어도 방향키로 이동
      if (direction === 'down' || direction === 'up') {
        moveEdit(direction);
      } else {
        setEditCell(null);
        setEditVal('');
      }
      return;
    }
    setEditSaving(true);
    try {
      const saveBody = { [editCell.saveAlias]: effectiveVal, _listEdit: true };
      let res = await api.save(gubun, saveBody, editCell.idx, devModeRef.current);

      if (res._confirm) {
        setEditSaving(false);
        if (!window.confirm(res._confirm)) return;
        setEditSaving(true);
        res = await api.save(gubun, { ...saveBody, _confirmed: true }, editCell.idx, devModeRef.current);
      }

      if (res._client_toast) showToast(res._client_toast);

      // 개발자모드: 저장쿼리 표시
      if (res._sql || res._execSql) {
        setDevSql({ sql: res._sql, count_sql: null, bindings: res._bindings ?? [], error: res._sql_error ?? null, execSql: res._execSql ?? null });
        setShowSqlBtn(true);
        sqlBtnDuration.current = 8000;
      }

      // 저장 완료 행 깜빡임
      const savedIdx = editCell.idx;
      setSavedRowIdx(savedIdx);
      setTimeout(() => setSavedRowIdx(prev => prev === savedIdx ? null : prev), 1200);

      // 방향 이동 (Enter/Shift+Enter)
      if (direction === 'down' || direction === 'up') {
        const nextRi = direction === 'down' ? editCell.ri + 1 : editCell.ri - 1;
        // rows 로컬 업데이트 먼저
        setRows(prev => prev.map((r, i) => i === editCell.ri ? { ...r, [editCell.saveAlias]: effectiveVal } : r));
        if (nextRi >= 0 && nextRi < rows.length) {
          const nextRow = rows[nextRi];
          startEdit(nextRi, editCell.alias, nextRow?.[editCell.alias] ?? '', nextRow?.idx, nextRow);
        } else {
          setEditCell(null);
          setEditVal('');
        }
        setEditSaving(false);
        return;
      }

      // input-text는 편집 상태 유지 (Ctrl+Z 지원), select/FK는 닫기
      if (editCell.fkField) {
        setEditCell(null);
        setEditVal('');
        setTimeout(() => loadRef.current?.(), 50);
      } else {
        // rows 로컬 업데이트만 (input 유지)
        setRows(prev => prev.map((r, i) => i === editCell.ri ? { ...r, [editCell.saveAlias]: effectiveVal } : r));
      }
    } catch (e) {
      showToast(e.message || '저장 실패');
    } finally {
      setEditSaving(false);
    }
  }, [editCell, editVal, gubun]);

  // URL orderby 정규화해서 초기값으로
  const [orderby, setOrderby] = useState(() =>
    normalizeOrderby(urlParams.current.get('orderby') ?? ''));

  // URL allFilter → filterValues 초기값
  const [filterValues, setFilterValues] = useState(() =>
    parseUrlFilter(urlParams.current.get('allFilter') ?? '[]'));
  // 항상 최신 filterValues 참조 (blur 핸들러에서 stale 방지)
  const filterValuesRef = useRef({});
  filterValuesRef.current = filterValues;

  const [dynamicOptions, setDynamicOptions] = useState({});

  // recently: URL > g03 기본값. 버튼은 항상 활성
  const [recently, setRecently] = useState(() => {
    const urlR = urlParams.current.get('recently');
    if (urlR !== null) return urlR === 'Y';
    return menu?.g03 !== 'Y'; // g03=Y → 기본 OFF, 아니면 기본 ON
  });

  // 개발자 모드 (prop 우선, 없으면 localStorage)
  const devMode = devModeProp ?? (localStorage.getItem('mis_dev_mode') === '1');
  const devModeRef = useRef(devMode);
  devModeRef.current = devMode;

  const [devSql,       setDevSql]       = useState(null); // { sql, count_sql, bindings }
  const [showSqlBtn,   setShowSqlBtn]   = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const isFirstLoad       = useRef(true);
  const sqlBtnDuration    = useRef(8000);
  const onToggleViewRef      = useRef(onToggleView);
  onToggleViewRef.current    = onToggleView;
  const onPanelSizeClickRef  = useRef(onPanelSizeClick);
  onPanelSizeClickRef.current = onPanelSizeClick;
  const panelOpenRef         = useRef(panelOpen);
  panelOpenRef.current       = panelOpen;
  // 페이지 이동으로 인한 로드 여부 (load 완료 후 첫 행 자동선택 트리거)
  const pageChangePending    = useRef(false);

  // 컬럼 필터 blur 검색용 — native focusout으로 처리
  const filterRowRef         = useRef(null);
  const colFilterSearchRef   = useRef(null); // 매 렌더마다 최신 함수로 갱신

  // 컨테이너 폭 추적 (좁은 화면 대응)
  const gridContainerRef = useRef(null);
  const tableScrollRef = useRef(null);
  const serverViewPrefRef = useRef(null); // 서버 _client_viewPref
  const [gridW, setGridW] = useState(800);
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    setGridW(el.offsetWidth);
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setGridW(e.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 모바일 여부 (767px 이하)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // parent_idx: prop 우선, 없으면 URL 파라미터
  const urlParentIdx = urlParams.current.get('parent_idx') ?? '';
  const effectiveParentIdx = parentIdxProp !== undefined ? String(parentIdxProp) : urlParentIdx;
  // ref로 항상 최신값 유지 → load 클로저 내에서 stale 값 없음
  const parentIdxRef = useRef(effectiveParentIdx);
  parentIdxRef.current = effectiveParentIdx;

  const load = useCallback(async (pg = 1, ob = '', af = '[]', rec, ps) => {
    setLoading(true);
    setError('');
    const effectivePs = ps ?? pageSize;
    // 컬럼 헤더 필터 병합
    const colParts = Object.entries(colFiltersRef.current)
      .map(([alias, raw]) => parseColFilter(alias, raw)).filter(Boolean);
    const finalAf = colParts.length > 0
      ? JSON.stringify([...(JSON.parse(af || '[]')), ...colParts])
      : af;
    try {
      const listParams = {
        page: pg, pageSize: effectivePs, orderby: ob, allFilter: finalAf,
        recently: rec ? 'Y' : 'N',
      };
      // 팝업 플래그: iframe 내에서 URL의 isPopup=Y를 그대로 전달
      const _popupFlag = new URLSearchParams(window.location.search).get('isPopup');
      if (_popupFlag === 'Y') listParams.isPopup = 'Y';
      // 사용자 정의 버튼 action 전달
      const capturedAction = window.__mis_custom_action || '';
      if (capturedAction) {
        listParams.customAction = capturedAction;
        window.__mis_custom_action = ''; // 전달 후 즉시 리셋
      }
      if (parentIdxRef.current !== '') listParams.parent_idx = parentIdxRef.current;
      if (devModeRef.current) listParams.dev_mode = '1';
      if (isFirstLoad.current) listParams.first_load = '1';
      const data = await api.list(gubun, listParams);
      if (data._sql) {
        sqlBtnDuration.current = isFirstLoad.current ? 8000 : 5000;
        isFirstLoad.current = false;
        setDevSql({ sql: data._sql, count_sql: data._count_sql, bindings: data._bindings, error: data._sql_error ?? null, execSql: data._execSql ?? null });
        setShowSqlBtn(true);
      }
      // 서버 훅에서 전달한 클라이언트 메시지 처리
      if (data._client_alert) alert(data._client_alert);
      if (data._client_toast) showToast(data._client_toast);
      if (data._client_openTab) {
        const t = data._client_openTab;
        window.dispatchEvent(new CustomEvent('mis:openTab', { detail: { gubun: t.gubun, label: t.label ?? '', idx: t.idx ?? 0, linkVal: t.linkVal ?? t.idx ?? 0, openFull: !!t.openFull } }));
      }
      if (data._client_redirect) {
        const t = data._client_redirect;
        window.dispatchEvent(new CustomEvent('mis:redirectTab', { detail: { gubun: t.gubun, label: t.label ?? '', idx: t.idx ?? null, linkVal: t.linkVal ?? null } }));
        return;
      }
      const newRows   = data.data   ?? [];
      const newFields = data.fields ?? [];
      if (data._onlyList) { setOnlyListMode(true); onOnlyList?.(true); }
      if (data._client_viewPref) serverViewPrefRef.current = data._client_viewPref;
      if (data._client_css || data._client_js || data._client_buttonText || data._client_buttons) {
        onClientMeta?.({ css: data._client_css, js: data._client_js, buttonText: data._client_buttonText, buttons: data._client_buttons });
      }
      setRows(newRows);
      setFields(newFields);
      setTotal(data.total ?? 0);
      setCheckedRows(new Set());
      setPage(data.page   ?? pg);

      // 페이지 이동 + 패널 열려있음 → 첫 행 자동선택
      if (pageChangePending.current && newRows.length > 0 && newFields.length > 0) {
        pageChangePending.current = false;
        const _pk0cw        = parseInt(newFields[0]?.col_width ?? '0', 10);
        const _pkAlias      = newFields[0]?.alias_name ?? 'idx';
        const _usePkForLink = _pk0cw !== -1 && _pk0cw !== -2;
        const _listFields   = newFields.filter(f => { const w = parseInt(f.col_width ?? '0', 10); return w !== 0 && w !== -1 && w !== -2; });
        const _firstAlias   = _listFields[0]?.alias_name ?? '';
        const firstRow      = newRows[0];
        const rowPk      = _usePkForLink ? (firstRow[_pkAlias] ?? firstRow.idx) : (firstRow[_firstAlias] ?? firstRow[_pkAlias] ?? firstRow.idx);
        const rowLinkVal = _usePkForLink ? (firstRow[_pkAlias] ?? firstRow.idx) : (firstRow[_firstAlias] ?? firstRow[_pkAlias] ?? firstRow.idx);
        onToggleViewRef.current?.(rowPk, rowLinkVal, true);
      } else {
        pageChangePending.current = false;
      }
      // recently=OFF이고 orderby 없으면 fields의 기본 정렬을 클라이언트 state에 반영
      // recently=ON이면 서버가 wdate DESC 사용 → 기본 정렬 표시 안 함
      if (ob === '' && !rec) {
        const defaultOb = buildDefaultOrderby(newFields);
        if (defaultOb) setOrderby(defaultOb);
      }
      // URL 디코딩: 인코딩된 주소를 사람이 읽을 수 있게 교체
      const decoded = decodeURIComponent(window.location.search);
      if (decoded !== window.location.search) {
        history.replaceState(null, '', window.location.pathname + decoded);
      }
    } catch (e) {
      if (e._sqlData) {
        setDevSql(e._sqlData);
        setShowSqlBtn(true);
      }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [gubun, pageSize]);

  // 인라인 편집 저장 후 재조회용 ref
  const loadRef = useRef(null);
  loadRef.current = () => {
    const af = buildAllFilter(filterValues, fields.filter(f => ['s','t','w'].includes(f.grid_is_handle ?? '')));
    load(page, orderby, af, recently);
  };

  // SQL 버튼 상태 변경 시 부모에게 알림 + 자동 숨김 (에러 시 유지)
  useEffect(() => {
    onSqlBtn?.(showSqlBtn, () => setSqlModalOpen(true), !!(devSql?.error));
    if (!showSqlBtn) return;
    if (devSql?.error) return; // 에러 시 자동 숨김 안 함
    const t = setTimeout(() => setShowSqlBtn(false), sqlBtnDuration.current);
    return () => clearTimeout(t);
  }, [showSqlBtn, onSqlBtn]);

  // 언마운트 시 버튼 숨김 알림
  useEffect(() => () => { onSqlBtn?.(false, null); }, [onSqlBtn]);

  // 부모에 메서드 노출
  useImperativeHandle(ref, () => ({
    downloadExcel: handleExcel,
    print:         handlePrint,
    getCurrentUrl: buildCurrentUrl,
    clearDevSql:   () => setDevSql(null),
    reset: () => {
      const initR = menu?.g03 !== 'Y';
      setFilterValues({});
      setColFilters({});
      colFiltersRef.current = {};
      setOrderby('');
      setRecently(initR);
      setPageSize(PAGE_SIZE);
      const p = new URLSearchParams(window.location.search);
      p.delete('allFilter');
      p.delete('orderby');
      p.delete('recently');
      p.delete('psize');
      p.delete('pageSize');
      p.delete('colF');
      history.replaceState(null, '', '?' + decodeURIComponent(p.toString()));
      load(1, '', '[]', initR, PAGE_SIZE);
    },
    bulkDelete: handleBulkDelete,
    getCheckedCount: () => checkedRows.size,
  })); // deps 없음 — 최신 클로저는 매 렌더마다 갱신

  // 최초 로드: toolbar_ 필터만 af로 전달 (컬럼 필터는 colFiltersRef에서 load 내부 병합)
  useEffect(() => {
    const urlAF = urlParams.current.get('allFilter') ?? '[]';
    const urlOb = normalizeOrderby(urlParams.current.get('orderby') ?? '');
    load(1, urlOb, toolbarOnlyAf(urlAF), recently);
  }, [gubun]);

  // parentIdx prop 변경 시 재조회 (초기 마운트 제외)
  const prevParentIdxProp = useRef(parentIdxProp);
  useEffect(() => {
    if (prevParentIdxProp.current === parentIdxProp) return;
    prevParentIdxProp.current = parentIdxProp;
    const af = buildAllFilter(filterValues, filterFields);
    load(1, orderby, af, recently);
  }, [parentIdxProp]); // eslint-disable-line react-hooks/exhaustive-deps

  // s 타입 필터 중 items 가 없는 것은 서버에서 distinct 값 로드
  useEffect(() => {
    if (fields.length === 0) return;
    fields
      .filter(f => f.grid_is_handle === 's' && !f.items)
      .forEach(f => {
        api.filterItems(gubun, f.alias_name)
          .then(data => setDynamicOptions(prev => ({
            ...prev, [f.alias_name]: data.data ?? [],
          })))
          .catch(() => {});
      });
  }, [fields, gubun]);

  // 드래그 선택 중 mouseup 처리 (document 레벨)
  useEffect(() => {
    const stop = () => { isDragging.current = false; };
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  // 최초 로드 1회만 자동열기 허용
  const autoOpenDone = useRef(false);

  // 로드 완료 시 (loading: true→false) 첫 번째 행 자동 내용보기 — 최초 1회만
  useEffect(() => {
    if (noAutoOpen || urlParams.current?.get('noAutoOpen') === '1') return; // child 또는 URL 지정
    // 조회설정: 서버(B) > 프로그램별(A) > 전역 순서로 판단
    const serverPref = serverViewPrefRef.current;
    const globalPref = localStorage.getItem('mis_view_pref') || 'auto';
    const perProgPref = localStorage.getItem(`mis_view_pref_${gubun}`);
    const effectivePref = serverPref || (globalPref === 'custom' ? (perProgPref || 'auto') : globalPref);
    if (effectivePref === 'list') return;
    if (window.innerWidth <= 767) return;               // 모바일에서는 자동열기 비활성
    if (autoOpenDone.current) return;                   // 필터/페이지 이동 후 재조회 시 비활성
    if (panelOpen) { autoOpenDone.current = true; return; } // 패널이 이미 열려있으면 건너뜀 (저장 후 리로드 등)
    if (loading) return;                                // 아직 로딩 중이면 무시
    if (rows.length === 0 || fields.length === 0) return;
    if (!onToggleViewRef.current) return;
    autoOpenDone.current = true;
    const _pk0cw        = parseInt(fields[0]?.col_width ?? '0', 10);
    const _pkAlias      = fields[0]?.alias_name ?? 'idx';
    const _usePkForLink = _pk0cw !== -1 && _pk0cw !== -2;
    const _listFields   = fields.filter(f => { const w = parseInt(f.col_width ?? '0', 10); return w !== 0 && w !== -1 && w !== -2; });
    const _firstAlias   = _listFields[0]?.alias_name ?? '';
    const firstRow      = rows[0];
    const rowPk      = _usePkForLink ? (firstRow[_pkAlias] ?? firstRow.idx) : (firstRow[_firstAlias] ?? firstRow[_pkAlias] ?? firstRow.idx);
    const rowLinkVal = _usePkForLink ? (firstRow[_pkAlias] ?? firstRow.idx) : (firstRow[_firstAlias] ?? firstRow[_pkAlias] ?? firstRow.idx);
    if (clickModeRef.current === 'modify') {
      onModify?.(firstRow.idx, getLinkVal(firstRow));
    } else {
      // panelSize=4(전체화면)이면 3으로 축소
      if (panelSize === 4 && onPanelSizeClickRef.current) {
        onPanelSizeClickRef.current(3, rowPk, rowLinkVal);
      }
      onToggleViewRef.current(rowPk, rowLinkVal, true); // forceOpen=true: 항상 열기 (토글 방지)
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps


  async function handleDelete(idx) {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      await api.delete(gubun, idx);
      const af = buildAllFilter(filterValues, filterFields);
      load(page, orderby, af, recently);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleBulkDelete() {
    if (checkedRows.size === 0) return;
    if (!window.confirm(`${checkedRows.size}건을 삭제하시겠습니까?`)) return;
    try {
      const res = await api.bulkDelete(gubun, [...checkedRows]);
      setCheckedRows(new Set());
      const msg = res.message || `${res.deleted ?? checkedRows.size}건 삭제 완료`;
      showToast(res._client_toast || msg);
      if (res._client_alert) alert(res._client_alert);
      const af = buildAllFilter(filterValues, filterFields);
      load(page, orderby, af, recently);
    } catch (e) {
      showToast(e.message || '삭제 실패');
    }
  }

  function handleCheckRow(idx, e) {
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (e?.shiftKey && lastCheckedRef.current != null) {
        // Shift+클릭: 범위 선택
        const idxList = rows.map(r => r.idx ?? r[pkAlias]);
        const from = idxList.indexOf(lastCheckedRef.current);
        const to = idxList.indexOf(idx);
        const [start, end] = from < to ? [from, to] : [to, from];
        for (let i = start; i <= end; i++) {
          next.add(idxList[i]);
        }
      } else {
        if (next.has(idx)) next.delete(idx); else next.add(idx);
      }
      lastCheckedRef.current = idx;
      return next;
    });
  }

  function handleCheckAll() {
    if (checkedRows.size === rows.length) {
      setCheckedRows(new Set());
    } else {
      setCheckedRows(new Set(rows.map(r => r.idx ?? r[pkAlias])));
    }
  }
  const lastCheckedRef = useRef(null);

  function handleSort(alias, e) {
    const af  = buildAllFilter(filterValues, filterFields);
    const newR = false; // 컬럼 클릭 시 최근순 자동 OFF
    setRecently(newR);
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+클릭: 다중 정렬 추가/토글 (현재 orderby 기준)
      const parts = orderby ? orderby.split(',').filter(Boolean) : [];
      const hasAsc  = parts.includes(alias);
      const hasDesc = parts.includes(`-${alias}`);
      let newParts;
      if (hasAsc)       newParts = parts.map(p => p === alias ? `-${alias}` : p);
      else if (hasDesc) newParts = parts.filter(p => p !== `-${alias}`);
      else              newParts = [...parts, alias];
      const newOb = newParts.join(',');
      setOrderby(newOb);
      load(1, newOb, af, newR);
    } else {
      // 일반 클릭: 단일 정렬 (ASC→DESC→해제)
      const newOb = orderby === alias ? `-${alias}` : (orderby === `-${alias}` ? '' : alias);
      setOrderby(newOb);
      load(1, newOb, af, newR);
    }
  }

  function handlePage(pg) {
    const af = buildAllFilter(filterValues, filterFields);
    if (panelOpenRef.current) pageChangePending.current = true;
    load(pg, orderby, af, recently);
  }

  // ── 셀 선택 ────────────────────────────────────────────────────────────────

  function getSelRange() {
    if (!selAnchor || !selFocus) return null;
    return {
      r1: Math.min(selAnchor.ri, selFocus.ri), r2: Math.max(selAnchor.ri, selFocus.ri),
      c1: Math.min(selAnchor.ci, selFocus.ci), c2: Math.max(selAnchor.ci, selFocus.ci),
    };
  }

  function isCellSelected(ri, ci) {
    const r = getSelRange();
    return r ? ri >= r.r1 && ri <= r.r2 && ci >= r.c1 && ci <= r.c2 : false;
  }

  function handleCellMouseDown(e, ri, ci) {
    if (e.button !== 0) return;
    if (e.shiftKey && selAnchor) {
      setSelFocus({ ri, ci });
    } else {
      setSelAnchor({ ri, ci });
      setSelFocus({ ri, ci });
    }
    isDragging.current = true;
    // 셀 클릭 후 그리드 컨테이너에 포커스 유지 (Ctrl+C 동작 보장) — 편집 중엔 제외
    if (!editCell) requestAnimationFrame(() => tableScrollRef.current?.focus());
  }

  function handleCellMouseEnter(ri, ci) {
    if (isDragging.current) setSelFocus({ ri, ci });
  }

  function handleCopy() {
    const r = getSelRange();
    if (!r) return;
    const lines = [];

    // 전체 선택(Ctrl+A)인 경우 헤더 행 포함
    const isAll = r.r1 === 0 && r.r2 === rows.length - 1
               && r.c1 === 0 && r.c2 === listFields.length - 1;
    if (isAll) {
      const headers = listFields.slice(r.c1, r.c2 + 1).map(f => {
        const t = parseColTitle(f.col_title ?? f.alias_name ?? '');
        return t.r2 ?? t.r1 ?? f.alias_name ?? '';
      });
      lines.push(headers.join('\t'));
    }

    for (let ri = r.r1; ri <= r.r2; ri++) {
      const row = rows[ri];
      if (!row) continue;
      const cells = [];
      for (let ci = r.c1; ci <= r.c2; ci++) {
        const f = listFields[ci];
        if (!f) continue;
        cells.push(String(row[f.alias_name ?? ''] ?? ''));
      }
      lines.push(cells.join('\t'));
    }
    const text = lines.join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopyDone(true);
        setTimeout(() => setCopyDone(false), 1500);
      }).catch(() => {
        // clipboard API 실패 시 fallback
        legacyCopy(text);
        setCopyDone(true);
        setTimeout(() => setCopyDone(false), 1500);
      });
    } else {
      legacyCopy(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1500);
    }
  }

  function handleGridKeyDown(e) {
    // Ctrl+C 복사
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      handleCopy();
      return;
    }
    // Ctrl+A 전체선택
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      if (rows.length > 0 && listFields.length > 0) {
        setSelAnchor({ ri: 0, ci: 0 });
        setSelFocus({ ri: rows.length - 1, ci: listFields.length - 1 });
      }
      return;
    }
    // 방향키 이동
    if (!selFocus) return;
    const maxRi = rows.length - 1;
    const maxCi = listFields.length - 1;
    let { ri, ci } = selFocus;
    let moved = true;
    switch (e.key) {
      case 'ArrowUp':    ri = Math.max(0, ri - 1);    break;
      case 'ArrowDown':  ri = Math.min(maxRi, ri + 1); break;
      case 'ArrowLeft':  ci = Math.max(0, ci - 1);    break;
      case 'ArrowRight': ci = Math.min(maxCi, ci + 1); break;
      default: moved = false;
    }
    if (!moved) return;
    e.preventDefault();
    const newPos = { ri, ci };
    setSelFocus(newPos);
    if (!e.shiftKey) setSelAnchor(newPos);
  }

  // ── 컬럼 너비 ────────────────────────────────────────────────────────────────

  // 컬럼 너비: 사용자 조정값 우선, 없으면 col_width 기본값
  function getColWidth(f) {
    const alias = f.alias_name ?? '';
    if (colWidths[alias] != null) return colWidths[alias];
    return Math.max(42, Math.abs(parseInt(f.col_width ?? '10', 10)) * 8);
  }

  function handleResizeStart(e, alias, currentWidth) {
    e.preventDefault();
    e.stopPropagation();
    resizeDrag.current = { alias, startX: e.clientX, startWidth: currentWidth };

    function onMouseMove(ev) {
      const dx   = ev.clientX - resizeDrag.current.startX;
      const newW = Math.max(30, resizeDrag.current.startWidth + dx);
      setColWidths(prev => ({ ...prev, [resizeDrag.current.alias]: newW }));
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      resizeDrag.current = null;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleSearch() {
    const af = buildAllFilter(filterValues, filterFields);
    load(1, orderby, af, recently);
  }

  async function handleExcel() {
    try {
      const af = buildAllFilter(filterValues, filterFields);
      const data = await api.list(gubun, {
        page: 1, pageSize: 10000, orderby, allFilter: af,
        recently: recently ? 'Y' : 'N',
      });
      const allRows = data.data ?? [];
      const headers = ['No', ...listFields.map(f => {
        const t = parseColTitle(f.col_title ?? f.alias_name ?? '');
        return t.r2 ?? t.r1 ?? f.alias_name ?? '';
      })];
      const excelTotal = data.total ?? allRows.length;

      // 워크시트를 셀 단위로 구성 — 모든 값을 문자열(t:'s')로 지정해 앞자리 0 보존
      const ws = {};
      const range = { s: { r: 0, c: 0 }, e: { r: allRows.length, c: headers.length - 1 } };

      // 헤더 행
      headers.forEach((h, ci) => {
        const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
        ws[addr] = { t: 's', v: h };
      });

      // 데이터 행 — No + 필드값
      allRows.forEach((row, ri) => {
        // No 컬럼 (중앙정렬)
        const noAddr = XLSX.utils.encode_cell({ r: ri + 1, c: 0 });
        ws[noAddr] = { t: 'n', v: excelTotal - ri, z: '0', s: { alignment: { horizontal: 'center' } } };
        // 필드 컬럼
        listFields.forEach((f, ci) => {
          const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci + 1 });
          const raw  = row[f.alias_name ?? ''] ?? '';
          ws[addr]   = { t: 's', v: String(raw) };
        });
      });

      // No 컬럼 너비 설정
      ws['!cols'] = [{ wch: 6 }, ...listFields.map(() => ({ wch: 15 }))];
      ws['!ref'] = XLSX.utils.encode_range(range);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, menu?.menu_name?.slice(0, 31) ?? 'Sheet1');
      XLSX.writeFile(wb, `${menu?.menu_name ?? 'export'}.xlsx`);
    } catch (e) {
      alert(e.message);
    }
  }

  function handlePrint() {
    const headers = listFields.map(f => {
      const t = parseColTitle(f.col_title ?? f.alias_name ?? '');
      return t.r2 ?? t.r1 ?? f.alias_name ?? '';
    });
    const thHtml = headers.map(h => `<th>${h}</th>`).join('');
    const tbodyHtml = rows.map(row =>
      `<tr>${listFields.map(f => `<td>${String(row[f.alias_name ?? ''] ?? '')}</td>`).join('')}</tr>`
    ).join('');
    const title = menu?.menu_name ?? '목록';
    const win = window.open('', '_blank', 'width=1000,height=700');
    win.document.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Malgun Gothic',Arial,sans-serif;font-size:11px;padding:14px}
h2{font-size:13px;font-weight:bold;margin-bottom:8px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
thead th{background:#f0f0f0;font-weight:bold}
@media print{thead{display:table-header-group}}
</style></head><body>
<h2>${title}</h2>
<table><thead><tr>${thHtml}</tr></thead><tbody>${tbodyHtml}</tbody></table>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function handleToggleRecently() {
    const newR = !recently;
    setRecently(newR);
    const af = buildAllFilter(filterValues, filterFields);
    load(1, orderby, af, newR);
  }

  function handleFilterChange(alias, val) {
    filterValuesRef.current = { ...filterValuesRef.current, [alias]: val };
    setFilterValues(filterValuesRef.current);
  }

  function handleFilterRangeChange(alias, key, val) {
    const prev = filterValuesRef.current;
    filterValuesRef.current = {
      ...prev,
      [alias]: { ...(prev[alias] ?? { from: '', to: '' }), [key]: val },
    };
    setFilterValues(filterValuesRef.current);
  }

  // 목록 표시 필드: col_width ∉ {0, -1, -2}
  const listFields = fields.length > 0
    ? fields.filter(f => {
        const w = parseInt(f.col_width ?? '0', 10);
        return w !== 0 && w !== -1 && w !== -2;
      })
    : (rows[0]
        ? Object.keys(rows[0])
            .filter(k => !['idx','wdate','wdater','last_update','last_updater','use_yn'].includes(k))
            .slice(0, 8)
            .map(k => ({ alias_name: k, col_title: k, col_width: 10 }))
        : []);

  // 필터 필드: grid_is_handle ∈ {s, t, w}
  const filterFields = fields.filter(f => ['s','t','w'].includes(f.grid_is_handle ?? ''));

  // 컬럼 필터 blur 검색 함수 — 항상 최신 상태 캡처 (ref로 갱신)
  colFilterSearchRef.current = () => {
    const af = buildAllFilter(filterValuesRef.current, filterFields);
    load(1, orderby, af, recently);
  };

  // 툴바 필터 blur 검색 함수 — filterValuesRef 사용으로 stale 방지
  const toolbarBlurSearch = () => {
    const af = buildAllFilter(filterValuesRef.current, filterFields);
    load(1, orderby, af, recently);
  };

  // PK 필드: fields 전체 중 sort_order 1번째 (col_width 무관, 숨겨져도 됨)
  // 링크 표시 필드: listFields 중 첫 번째 visible 필드
  const pkAlias      = fields[0]?.alias_name ?? 'idx';
  const firstAlias   = listFields[0]?.alias_name ?? '';
  // URL idx 값 결정 규칙:
  //   fields[0].col_width가 -1/-2(완전 숨김) → 첫 번째 visible 필드값 사용 (예: real_pid)
  //   그 외(0 또는 양수)                      → pk 필드값 사용 (예: integer idx)
  const pk0cw        = parseInt(fields[0]?.col_width ?? '0', 10);
  const usePkForLink = pk0cw !== -1 && pk0cw !== -2;
  const getLinkVal   = (r) => usePkForLink
    ? (r[pkAlias] ?? r.idx)
    : (r[firstAlias] ?? r[pkAlias] ?? r.idx);
  const totalPages = Math.ceil(total / pageSize);
  const colSpan    = listFields.length + 2 + (isSimpleList ? 0 : 1);
  const hasAnyColFilter = Object.values(colFilters).some(v => v?.trim());

  // URL 생성용: filterValues → allFilter JSON (toolbar_ 접두어 포함)
  function buildUrlAllFilter() {
    const filters = [];
    filterFields.forEach(f => {
      const alias  = f.alias_name ?? '';
      const handle = f.grid_is_handle ?? '';
      const val    = filterValues[alias];
      if (handle === 't' && val) {
        filters.push({ field: `toolbar_${alias}`, operator: 'contains', value: val });
      } else if (handle === 's' && val) {
        filters.push({ field: `toolbar_${alias}`, operator: 'eq', value: val });
      } else if (handle === 'w') {
        const from = val?.from ?? '', to = val?.to ?? '';
        if (from || to) filters.push({ field: `toolbar_${alias}`, operator: 'between', value: [from, to] });
      }
    });
    return JSON.stringify(filters);
  }

  function buildCurrentUrl() {
    const p = new URLSearchParams(window.location.search);
    const toolbarParts = JSON.parse(buildUrlAllFilter() || '[]');
    const colParts = Object.entries(colFiltersRef.current)
      .map(([alias, raw]) => parseColFilter(alias, raw)).filter(Boolean);
    const allParts = [...toolbarParts, ...colParts];
    const af = allParts.length > 0 ? JSON.stringify(allParts) : '[]';
    if (af !== '[]') p.set('allFilter', af); else p.delete('allFilter');
    if (orderby)     p.set('orderby', orderby); else p.delete('orderby');
    p.set('recently', recently ? 'Y' : 'N');
    p.delete('colF');
    return window.location.pathname + '?' + decodeURIComponent(p.toString());
  }

  // 정렬 정보 맵: alias → { dir:'asc'|'desc', rank:number }
  const sortInfo = {};
  if (orderby) {
    orderby.split(',').filter(Boolean).forEach((token, i) => {
      const desc  = token.startsWith('-');
      const alias = desc ? token.slice(1) : token;
      sortInfo[alias] = { dir: desc ? 'desc' : 'asc', rank: i + 1 };
    });
  }
  const multiSort = Object.keys(sortInfo).length > 1;
  const selRange = getSelRange(); // 행 강조용 미리 계산

  function sortLabel(alias) {
    const s = sortInfo[alias];
    if (!s) return null;
    return (s.dir === 'asc' ? '▲' : '▼') + (multiSort ? s.rank : '');
  }

  // 2행 헤더 여부 판단
  const hasGroupHeader = listFields.some(f => (f.col_title ?? '').includes(','));
  const { parsed, groups } = hasGroupHeader
    ? computeHeaderGroups(listFields)
    : { parsed: listFields.map(f => ({ r1: null, r2: f.col_title ?? f.alias_name ?? '', field: f })), groups: [] };

  if (error) return (
    <div className="flex-1 px-5 py-5 text-danger text-base">{error}</div>
  );

  const isNarrow = gridW < 450 || isMobile;

  return (
    <div ref={gridContainerRef} className="relative flex flex-col flex-1 overflow-hidden">

      {/* ── 검색 필터 툴바 ── */}
      <div className="flex items-center border-b border-border-base flex-shrink-0 bg-surface-2 h-[38px]">
        {/* 맨 좌측: 새로고침 + 최근순 + 조회/수정 모드 */}
        <div className="flex-shrink-0 flex items-center gap-1 pl-2 pr-1 py-2 border-r border-border-base">
          <button
            title="새로고침"
            className={clickModeCls}
            onClick={() => {
              const af = buildAllFilter(filterValues, fields.filter(f => ['s','t','w'].includes(f.grid_is_handle ?? '')));
              load(page, orderby, af, recently);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button
            className={recently ? recentlyOnCls : recentlyOffCls}
            onClick={handleToggleRecently}
            title={recently ? '최근순 OFF' : '최근순 ON'}
          >최근순</button>
          <button
            title="조회 모드"
            className={clickMode === 'view' ? clickModeActiveCls : clickModeCls}
            onClick={() => {
              setClickMode('view');
              const tr  = rows[selFocus?.ri ?? 0] ?? rows[0];
              if (!tr) return;
              const rPk = usePkForLink ? (tr[pkAlias] ?? tr.idx ?? 0) : getLinkVal(tr);
              if (rPk) onToggleView?.(rPk, getLinkVal(tr));
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button
            title="수정 모드"
            className={clickMode === 'modify' ? clickModeActiveCls : clickModeCls}
            onClick={() => {
              setClickMode('modify');
              const tr = rows[selFocus?.ri ?? 0] ?? rows[0];
              if (!tr || !tr.idx) return;
              onModify?.(tr.idx, getLinkVal(tr));
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>

        {/* 좌측: 필터 영역 (가로 스크롤) */}
        <div className="flex-1 flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-hide min-w-0">
          {filterFields.map(f => {
            const alias  = f.alias_name ?? '';
            const handle = f.grid_is_handle ?? '';
            const label  = (() => {
              const s = f.col_title ?? alias;
              const ci = s.indexOf(',');
              return ci === -1 ? s : s.slice(ci + 1) || s.slice(0, ci) || alias;
            })();

            if (handle === 's') {
              // items 있으면 정적 목록, 없으면 서버에서 동적 로드한 distinct 값 사용
              const staticOpts = f.items ? parseItems(f.items) : null;
              const dynVals    = dynamicOptions[alias] ?? null;
              const options    = staticOpts ?? (dynVals ? dynVals.map(v => ({ value: v, text: v })) : []);
              const doChange = (val) => {
                handleFilterChange(alias, val);
                const newVals = { ...filterValues, [alias]: val };
                load(1, orderby, buildAllFilter(newVals, filterFields), recently);
              };
              return (
                <div key={alias} className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-secondary whitespace-nowrap">{label}</span>
                  {options.length > SEARCHABLE_THRESHOLD ? (
                    <SearchableSelect
                      options={[...options]}
                      value={filterValues[alias] ?? ''}
                      className={filterInputCls + ' cursor-pointer'}
                      onChange={(val) => doChange(val)}
                    />
                  ) : (
                    <select
                      className={filterInputCls}
                      value={filterValues[alias] ?? ''}
                      onChange={e => doChange(e.target.value)}
                    >
                      <option value="">전체</option>
                      {options.map(o => (
                        <option key={o.value} value={o.value}>{o.text ?? o.value}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            }

            if (handle === 'w') {
              const rv = filterValues[alias] ?? { from: '', to: '' };
              return (
                <div key={alias} className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-secondary whitespace-nowrap">{label}</span>
                  <input
                    className={filterInputCls}
                    type="text"
                    placeholder="시작"
                    value={rv.from}
                    onChange={e => handleFilterRangeChange(alias, 'from', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    onBlur={toolbarBlurSearch}
                  />
                  <span className="text-xs text-muted">~</span>
                  <input
                    className={filterInputCls}
                    type="text"
                    placeholder="끝"
                    value={rv.to}
                    onChange={e => handleFilterRangeChange(alias, 'to', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    onBlur={toolbarBlurSearch}
                  />
                </div>
              );
            }

            // handle === 't'
            return (
              <div key={alias} className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-secondary whitespace-nowrap">{label}</span>
                <input
                  className={filterInputCls}
                  type="text"
                  placeholder={`${label} 검색`}
                  value={filterValues[alias] ?? ''}
                  onChange={e => handleFilterChange(alias, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  onBlur={toolbarBlurSearch}
                />
              </div>
            );
          })}
        </div>

        {/* 우측: 내용보기 */}
        {!isMobile && (
          <div className="relative flex-shrink-0 flex items-center gap-1 px-3 py-2">
            {!panelOpen && !noPanelBtn && !onlyListMode && <>
              <span className="text-border-base mx-0.5 select-none">|</span>
              {(!onPanelSizeClick || isNarrow) ? (
                <button
                  className={viewSizeCls}
                  onClick={() => {
                    const tr  = rows[selFocus?.ri ?? 0] ?? rows[0] ?? {};
                    const rPk = usePkForLink ? (tr[pkAlias] ?? tr.idx ?? 0) : getLinkVal(tr);
                    if (onPanelSizeClick) onPanelSizeClick(4, rPk, getLinkVal(tr));
                    else onToggleView?.(rPk, getLinkVal(tr));
                  }}
                >내용보기</button>
              ) : (<>
                <span className="text-xs text-secondary whitespace-nowrap select-none">내용보기</span>
                {[4, 3, 2, 1].map(size => (
                  <button
                    key={size}
                    className={panelSize === size ? viewSizeDimActiveCls : viewSizeCls}
                    onClick={() => {
                      const tr  = rows[selFocus?.ri ?? 0] ?? rows[0] ?? {};
                      const rPk = usePkForLink ? (tr[pkAlias] ?? tr.idx ?? 0) : getLinkVal(tr);
                      onPanelSizeClick(size, rPk, getLinkVal(tr));
                    }}
                  >{size}</button>
                ))}
              </>)}
            </>}
          </div>
        )}
      </div>


      {/* ── SQL 상세 모달 ── */}
      {sqlModalOpen && devSql && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          className="modal-overlay"
          onClick={() => setSqlModalOpen(false)}
        >
          <div
            className="bg-surface rounded-lg border border-border-base shadow-pop flex flex-col overflow-hidden modal-box"
            style={{ width: 'min(860px, 92vw)', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-base bg-surface-2 flex-shrink-0">
              <span className="text-sm font-bold text-primary">실행 쿼리 (개발자모드)</span>
              <div className="flex items-center gap-2">
                <button
                  className="h-btn-sm px-3 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors"
                  onClick={() => { copyText(buildCopyText(devSql)); showToast('복사되었습니다'); }}
                >복사</button>
                <button
                  className="h-btn-sm px-3 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors"
                  onClick={() => setSqlModalOpen(false)}
                >✕ 닫기</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              {devSql.error && (
                <div className="rounded border border-solid border-danger bg-danger-dim px-3 py-2 flex items-start gap-2">
                  <span className="text-danger font-bold text-sm flex-shrink-0">SQL 오류</span>
                  <span className="text-danger text-xs font-mono break-all leading-5">{devSql.error}</span>
                </div>
              )}
              <div>
                <div className={`text-xs font-bold mb-1 uppercase tracking-wide ${devSql.error ? 'text-danger' : 'text-secondary'}`}>SELECT</div>
                <pre className={`text-xs bg-surface-2 rounded p-3 overflow-auto whitespace-pre-wrap font-mono leading-6 ${devSql.error ? 'text-danger' : 'text-primary'}`}>{formatSQL(devSql.sql)}</pre>
              </div>
              {devSql.count_sql && (
                <div>
                  <div className="text-xs font-bold text-secondary mb-1 uppercase tracking-wide">COUNT</div>
                  <pre className="text-xs text-primary bg-surface-2 rounded p-3 overflow-auto whitespace-pre-wrap font-mono leading-6">{formatSQL(devSql.count_sql)}</pre>
                </div>
              )}
              {devSql.bindings?.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-secondary mb-1 uppercase tracking-wide">바인딩 값</div>
                  <pre className="text-xs text-primary bg-surface-2 rounded p-3 font-mono leading-6">{devSql.bindings.map((v, i) => `[${i + 1}] ${JSON.stringify(v)}`).join('\n')}</pre>
                </div>
              )}
              {devSql.execSql?.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-link mb-1 uppercase tracking-wide">실행쿼리 (execSql)</div>
                  {devSql.execSql.map((log, i) => (
                    <div key={i} className="mb-2">
                      <pre className={`text-xs rounded p-3 overflow-auto whitespace-pre-wrap font-mono leading-6 ${log.result === 'fail' ? 'bg-danger-dim text-danger' : 'bg-surface-2 text-primary'}`}>
                        {formatSQL(log.sql)}{log.bindings?.length > 0 ? '\n-- bindings: ' + JSON.stringify(log.bindings) : ''}{'\n'}-- {log.result === 'success' ? `OK (${log.rowCount ?? 0} rows)` : `FAIL: ${log.error}`}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 테이블 ── */}
      <div
        ref={tableScrollRef}
        className="flex-1 overflow-auto outline-none"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onMouseDown={e => { if (e.target === e.currentTarget) { setSelAnchor(null); setSelFocus(null); } }}
      >
        {copyDone && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded bg-accent text-white text-xs shadow pointer-events-none">
            복사됨
          </div>
        )}
        <table className="w-full table-fixed border-collapse text-base bg-surface select-none">
          <thead className="bg-surface-2">
            {hasGroupHeader ? (
              <>
                <tr>
                  {!isSimpleList && <th className={thCls + ' text-center mis-check-col'} style={{width:45,maxWidth:45}} rowSpan={2}>
                    <input type="checkbox" checked={rows.length > 0 && checkedRows.size === rows.length} onChange={handleCheckAll} className="cursor-pointer" tabIndex={-1} />
                  </th>}
                  <th className={thCls + ' text-center'} style={{width:60,maxWidth:60}} rowSpan={2}
                      onClick={toggleFilterRow} title={showFilterRow ? '필터 숨기기' : '필터 보기'}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span className={showFilterRow ? 'text-link' : hasAnyColFilter ? 'text-danger' : 'text-muted'}>No</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={!showFilterRow && hasAnyColFilter ? 'text-danger' : showFilterRow ? 'text-link' : 'text-muted'}>
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                      </svg>
                    </span>
                  </th>
                  {groups.map((g, gi) => {
                    const f = listFields[g.startIdx];
                    const alias = f.alias_name ?? '';
                    const cw = getColWidth(f);
                    if (g.r1 === null) {
                      const sl = sortLabel(alias);
                      return (
                        <th key={gi} className={thCls} rowSpan={2}
                            style={{ width: cw + 'px' }}
                            onClick={e => handleSort(alias, e)}>
                          {parsed[g.startIdx].r2}
                          {sl && <span className="text-link text-[10px] ml-0.5">{sl}</span>}
                          <ResizeHandle onMouseDown={e => handleResizeStart(e, alias, cw)} />
                        </th>
                      );
                    }
                    return (
                      <th key={gi} className={thCls + ' text-center border-b border-border-base'}
                          colSpan={g.colspan}>
                        {g.r1}
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {parsed.map((p, i) => {
                    if (p.r1 === null) return null;
                    const alias = p.field.alias_name ?? '';
                    const cw = getColWidth(p.field);
                    const sl = sortLabel(alias);
                    const hasColFilter = !!(colFilters[alias]?.trim());
                    return (
                      <th key={i} className={thCls} style={{ width: cw + 'px' }}
                          title={p.field.col_title ?? alias}
                          onClick={e => handleSort(alias, e)}>
                        {hasColFilter && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-0.5 align-middle -mt-0.5 flex-shrink-0" />}
                        {p.r2}
                        {sl && <span className="text-link text-[10px] ml-0.5">{sl}</span>}
                        <ResizeHandle onMouseDown={e => handleResizeStart(e, alias, cw)} />
                      </th>
                    );
                  })}
                </tr>
              </>
            ) : (
              <tr>
                {!isSimpleList && <th className={thCls + ' text-center mis-check-col'} style={{width:45,maxWidth:45}}>
                  <input type="checkbox" checked={rows.length > 0 && checkedRows.size === rows.length} onChange={handleCheckAll} className="cursor-pointer" tabIndex={-1} />
                </th>}
                <th className={thCls + ' text-center'} style={{width:60,maxWidth:60}}
                    onClick={toggleFilterRow} title={showFilterRow ? '필터 숨기기' : '필터 보기'}>
                  <span className="inline-flex items-center gap-1 justify-center">
                    <span className={showFilterRow ? 'text-link' : hasAnyColFilter ? 'text-danger' : 'text-muted'}>No</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={!showFilterRow && hasAnyColFilter ? 'text-danger' : showFilterRow ? 'text-link' : 'text-muted'}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                  </span>
                </th>
                {listFields.map(f => {
                  const alias = f.alias_name ?? '';
                  const cw = getColWidth(f);
                  const sl = sortLabel(alias);
                  const hasColFilter = !!(colFilters[alias]?.trim());
                  return (
                    <th key={alias} className={thCls} style={{ width: cw + 'px' }}
                        title={f.col_title ?? alias}
                        onClick={e => handleSort(alias, e)}>
                      {hasColFilter && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-0.5 align-middle -mt-0.5 flex-shrink-0" />}
                      {f.col_title ?? alias}
                      {sl && <span className="text-link text-[10px] ml-0.5">{sl}</span>}
                      <ResizeHandle onMouseDown={e => handleResizeStart(e, alias, cw)} />
                    </th>
                  );
                })}
              </tr>
            )}
            {/* 컬럼 헤더 인라인 필터 행 */}
            <tr ref={filterRowRef} className={'border-b border-border-base' + (showFilterRow ? '' : ' hidden')} style={{position:'sticky',top: hasGroupHeader ? 72 : 36, zIndex:9}}>
              {!isSimpleList && <td className="px-1 py-0.5 bg-surface-2 border-r border-border-base mis-check-col" style={{width:45,maxWidth:45}} />}
              <td className="px-1 py-0.5 bg-surface-2 border-r border-border-base w-12" />
              {listFields.map(f => {
                const alias = f.alias_name ?? '';
                const cw = getColWidth(f);
                return (
                  <td key={alias} className="px-1 py-0.5 bg-surface border-r border-border-base" style={{ maxWidth: cw + 'px' }}>
                    <input
                      type="text"
                      className="w-full h-5 px-1.5 text-xs bg-surface-2 border border-border-base rounded text-primary outline-none focus:border-accent transition-colors"
                      value={colFilters[alias] ?? ''}
                      placeholder=""
                      onChange={e => {
                        const newFilters = { ...colFiltersRef.current, [alias]: e.target.value };
                        colFiltersRef.current = newFilters;
                        setColFilters(newFilters);
                      }}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          colFilterSearchRef.current?.();
                        }
                        if (e.key === 'Escape') {
                          const n = { ...colFiltersRef.current };
                          delete n[alias];
                          colFiltersRef.current = n;
                          setColFilters(n);
                          colFilterSearchRef.current?.();
                        }
                      }}
                      onBlur={e => {
                        if (filterRowRef.current?.contains(e.relatedTarget)) return;
                        colFilterSearchRef.current?.();
                      }}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    />
                  </td>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <SkeletonRows colSpan={colSpan} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-12 text-center text-muted text-sm">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : rows.map((row, ri) => {
              // PK가 숨겨진 경우(usePkForLink=false) → 첫 visible 필드값을 식별자로 사용
              const rowPk      = usePkForLink ? (row[pkAlias] ?? row.idx) : getLinkVal(row);
              const rowLinkVal = getLinkVal(row);
              // string/number 혼합 비교: pk 또는 linkVal 중 하나라도 일치하면 강조
              const isActiveRow = panelOpen && !!currentIdx
                && (rowPk == currentIdx || String(rowLinkVal) === String(currentIdx)); // eslint-disable-line eqeqeq
              const isInSel     = selRange ? ri >= selRange.r1 && ri <= selRange.r2 : false;
              const isSavedRow  = savedRowIdx != null && (row.idx == savedRowIdx); // eslint-disable-line eqeqeq
              const rowBgCls    = isSavedRow  ? 'saved-row-flash'
                                : isActiveRow ? 'bg-accent-dim'
                                : isInSel     ? 'bg-surface-2'
                                :               'hover:bg-surface-2';
              return (
              <tr key={row.idx ?? ri}
                  className={`transition-colors ${rowBgCls}`}>
                {!isSimpleList && <td className={tdCls + ' text-center cursor-pointer mis-check-col'} style={{width:45,maxWidth:45}} onClick={e => { e.stopPropagation(); handleCheckRow(row.idx ?? row[pkAlias], e); }}>
                  <input type="checkbox" checked={checkedRows.has(row.idx ?? row[pkAlias])} readOnly className="pointer-events-none" />
                </td>}
                <td className={tdCls + ' text-center text-muted text-xs tabular-nums'} style={{width:60,maxWidth:60}}>
                  {total - (page - 1) * pageSize - ri}
                </td>
                {listFields.map((f, ci) => {
                  const alias    = f.alias_name ?? '';
                  const val      = row[alias] ?? '';
                  const html     = row.__html?.[alias];
                  const isLink   = alias === firstAlias;
                  const cw       = getColWidth(f);
                  const selected = isCellSelected(ri, ci);
                  const isListEdit = f.grid_list_edit === 'Y' || !!fkMapRef.current[alias];
                  const isCheckEdit = isListEdit && (f.grid_ctl_name === 'check' || f.grid_ctl_name === 'checkbox');
                  const isEditing  = editCell && editCell.ri === ri && editCell.alias === alias;
                  return (
                    <td key={alias}
                        className={tdCls + (selected ? ' !bg-accent-dim' : '') + (isListEdit && !isEditing ? ' cursor-pointer' : '') + (isEditing ? ' !px-0' : '')}
                        style={{ maxWidth: cw + 'px' }}
                        onMouseDown={e => { if (!isEditing) handleCellMouseDown(e, ri, ci); }}
                        onMouseEnter={() => { if (!isEditing) handleCellMouseEnter(ri, ci); }}
                        onClick={isCheckEdit && !isEditing ? () => handleCheckClick(ri, alias, val, row.idx)
                          : isListEdit && !isCheckEdit && !isEditing && selected ? () => startEdit(ri, alias, val, row.idx, row)
                          : undefined}
                        onDoubleClick={isListEdit && !isCheckEdit && !isEditing ? () => startEdit(ri, alias, val, row.idx, row) : undefined}>
                      <div className={isEditing ? '' : 'truncate'}>
                        {isEditing
                          ? <InlineEdit
                              field={f}
                              fkField={editCell.fkField}
                              value={editVal}
                              onChange={setEditVal}
                              onSave={saveEdit}
                              onCancel={cancelEdit}
                              saving={editSaving}
                              gubun={gubun}
                            />
                          : html
                          ? <span className="text-primary cell-html" dangerouslySetInnerHTML={{ __html: html }} />
                          : isLink && !onlyListMode
                          ? <span className="text-link cursor-pointer underline underline-offset-2 hover:text-accent-hover"
                                  onClick={e => {
                                    if (e.shiftKey) {
                                      e.preventDefault();
                                      onOpenTab?.(rowPk, rowLinkVal);
                                    } else if (e.ctrlKey || e.metaKey) {
                                      const p = new URLSearchParams(window.location.search);
                                      p.set('idx', String(rowLinkVal));
                                      window.open(window.location.pathname + '?' + p.toString(), '_blank');
                                    } else if (clickMode === 'modify') {
                                      onModify?.(row.idx, rowLinkVal);
                                    } else {
                                      onToggleView(rowPk, rowLinkVal);
                                    }
                                  }}>{val || '-'}</span>
                          : isCheckEdit
                          ? (() => {
                              const checked = val === 'Y' || val === '1' || val === 'true';
                              const active = checkActive && checkActive.ri === ri && checkActive.alias === alias;
                              return (
                                <span className={`flex items-center justify-center transition-all ${active ? 'scale-125' : ''}`}>
                                  {checked
                                    ? <svg className={`w-4 h-4 ${active ? 'text-danger' : 'text-accent'}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                    : <span className={`text-base ${active ? 'text-accent' : 'text-secondary'}`}>☐</span>}
                                </span>
                              );
                            })()
                          : isListEdit
                          ? <span className="text-link cursor-pointer">{val || '-'}</span>
                          : <CellValue val={val} schemaType={f.schema_type} />
                        }
                      </div>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 페이지네이션 (항상 하단 고정) ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-surface border-t border-border-base">
        <div className="flex items-center gap-2">
          <span className="text-muted text-sm">전체 {total.toLocaleString()}건</span>
          <select
            className="h-btn-sm px-1.5 text-sm rounded border border-solid border-border-base bg-surface text-secondary outline-none cursor-pointer"
            value={pageSize}
            onChange={e => {
              const ps = Number(e.target.value);
              setPageSize(ps);
              const af = buildAllFilter(filterValues, filterFields);
              load(1, orderby, af, recently, ps);
            }}
          >
            {[25, 1000].concat(![25, 1000].includes(pageSize) ? [pageSize] : [])
              .sort((a, b) => a - b)
              .map(n => <option key={n} value={n}>{n}개</option>)}
          </select>
        </div>
        <div className="flex gap-1 items-center">
          <PagerBtn label="◀" disabled={page <= 1}          onClick={() => handlePage(page - 1)} />
          {isNarrow ? (
            <span className="text-sm text-secondary tabular-nums px-1 whitespace-nowrap">{page}/{totalPages}</span>
          ) : (
            Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const pg = Math.max(1, page - 4) + i;
              if (pg > totalPages) return null;
              return <PagerBtn key={pg} label={pg} active={pg === page} onClick={() => handlePage(pg)} />;
            })
          )}
          <PagerBtn label="▶" disabled={page >= totalPages} onClick={() => handlePage(page + 1)} />
        </div>
      </div>
    </div>
  );
});

export default DataGrid;

function ResizeHandle({ onMouseDown }) {
  return (
    <div
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize group z-20"
      onMouseDown={onMouseDown}
      onClick={e => e.stopPropagation()}
    >
      <div className="absolute right-0.5 top-1 bottom-1 w-px bg-border-base opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

const SKEL_WIDTHS = ['w-full','w-11/12','w-10/12','w-9/12','w-full','w-10/12','w-11/12','w-9/12'];
function SkeletonRows({ colSpan }) {
  return Array.from({ length: 8 }, (_, i) => (
    <tr key={i} className="border-b border-border-base">
      <td colSpan={colSpan} className="h-row px-3">
        <div className={`skeleton h-3 ${SKEL_WIDTHS[i]} rounded`} />
      </td>
    </tr>
  ));
}

function InlineEdit({ field, fkField, value, onChange, onSave, onCancel, saving, gubun }) {
  const ctl = (fkField ?? field).grid_ctl_name ?? '';
  const staticItems = (fkField ?? field).items ? parseItems((fkField ?? field).items) : [];
  const hasPrimeKey = !!(fkField?.prime_key);
  const isDate = field.schema_type === 'date' || field.schema_type === 'datetime';

  // prime_key 드롭다운: 서버에서 아이템 로드
  const [pkItems, setPkItems] = useState(null);
  useEffect(() => {
    if (!hasPrimeKey || !gubun) return;
    api.primeKeyItems(gubun, fkField.alias_name).then(res => {
      setPkItems(res.data ?? []);
    }).catch(() => setPkItems([]));
  }, [hasPrimeKey, gubun, fkField?.alias_name]);

  const items = hasPrimeKey ? (pkItems ?? []) : staticItems;
  const isCheck = ctl === 'check' || ctl === 'checkbox';
  const isSelect = !isCheck && (hasPrimeKey || ctl === 'dropdownlist' || ctl === 'select' || staticItems.length > 0);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onSave(e.shiftKey ? 'up' : 'down'); }
    if (e.key === 'Escape') onCancel();
  };

  // 체크박스: 클릭 즉시 토글 저장
  if (isCheck) {
    const checked = value === 'Y' || value === '1' || value === 'true';
    return (
      <label className="flex items-center justify-center h-row cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-accent cursor-pointer"
          checked={checked}
          onChange={() => { onChange(checked ? '' : 'Y'); setTimeout(onSave, 0); }}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={saving}
        />
      </label>
    );
  }

  if (isSelect) {
    if (hasPrimeKey && pkItems === null) {
      return <span className="text-xs text-muted px-1">로딩...</span>;
    }
    return (
      <select
        className="w-full h-row text-xs bg-surface border border-accent rounded px-0.5 text-primary focus:outline-none"
        value={value}
        onChange={e => { const v = e.target.value; onChange(v); setTimeout(() => onSave(null, v), 50); }}
        onKeyDown={handleKeyDown}
        autoFocus
        disabled={saving}
      >
        <option value="">-</option>
        {items.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
      </select>
    );
  }

  return (
    <input
      type={isDate ? 'date' : 'text'}
      className="w-full h-row text-xs bg-surface border border-accent rounded px-0.5 text-primary focus:outline-none"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={() => onSave()}
      onKeyDown={handleKeyDown}
      autoFocus
      disabled={saving}
      maxLength={field.max_length ? parseInt(field.max_length, 10) : undefined}
    />
  );
}

function CellValue({ val, html, schemaType }) {
  // __html 우선: 표시용 HTML이 있으면 렌더링 (원본 데이터는 보존)
  if (html !== undefined && html !== null && html !== '') {
    return <span className="text-primary cell-html" dangerouslySetInnerHTML={{ __html: String(html) }} />;
  }
  if (val === null || val === undefined || val === '') {
    return <span className="text-muted">-</span>;
  }
  const s = String(val);
  if ((schemaType === 'datetime' || schemaType === 'date') && s.length >= 10) {
    return <span className="text-primary tabular-nums">{s.slice(0, schemaType === 'date' ? 10 : 16)}</span>;
  }
  return <span className="text-primary" title={s}>{s}</span>;
}

function PagerBtn({ label, active, disabled, onClick }) {
  return (
    <button
      className={[
        'min-w-[28px] h-btn-sm px-2 text-sm rounded border transition-colors',
        active
          ? 'bg-accent border-accent text-white font-semibold'
          : 'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
        disabled ? 'opacity-40 cursor-default' : 'cursor-pointer',
      ].join(' ')}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const clickModeCls = [
  'w-7 h-btn-sm flex items-center justify-center rounded border border-solid cursor-pointer transition-colors',
  'border-border-base bg-surface text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const clickModeActiveCls = [
  'w-7 h-btn-sm flex items-center justify-center rounded border border-solid cursor-pointer',
  'bg-accent border-accent text-white',
].join(' ');

const thCls = [
  'sticky top-0 z-10 relative',
  'h-row px-3 text-left bg-surface-2',
  'text-xs font-bold uppercase tracking-wide text-primary',
  'border border-solid border-border-base',
  'cursor-pointer select-none whitespace-nowrap overflow-hidden',
].join(' ');

const tdCls = 'px-3 h-row align-middle border-b border-r border-solid border-border-base';

const filterInputCls = [
  'h-btn-sm px-2 text-sm rounded border border-solid border-border-base',
  'bg-surface text-primary outline-none',
  'focus:border-accent transition-colors',
].join(' ');

const recentlyOnCls = [
  'h-btn-sm px-3 text-sm rounded border border-solid border-accent cursor-pointer transition-colors',
  'bg-accent text-white',
].join(' ');

const recentlyOffCls = [
  'h-btn-sm px-3 text-sm rounded border border-solid border-border-base cursor-pointer transition-colors',
  'bg-surface text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const resetBtnCls = [
  'h-btn-sm px-3 text-sm rounded border border-solid border-border-base cursor-pointer transition-colors',
  'bg-surface text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const urlBtnCls = [
  'h-btn-sm px-3 text-sm rounded border border-solid border-border-base cursor-pointer transition-colors',
  'bg-surface text-muted hover:bg-surface-2 hover:text-secondary',
].join(' ');

const excelBtnCls = [
  'h-btn-sm px-3 text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-surface border-success text-success hover:bg-success-dim',
].join(' ');

const printBtnCls = [
  'h-btn-sm px-3 text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const viewSizeCls = [
  'w-7 h-btn-sm text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const viewSizeActiveCls = [
  'w-7 h-btn-sm text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-accent border-accent text-white font-semibold',
].join(' ');

// 패널 닫힌 상태에서의 크기 선택 버튼 (비활성 강조)
const viewSizeDimActiveCls = [
  'w-7 h-btn-sm text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-surface-2 border-border-base text-primary font-semibold underline',
].join(' ');

const moreCls = [
  'w-8 h-btn-sm text-base rounded border border-solid cursor-pointer transition-colors leading-none',
  'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const moreActiveCls = [
  'w-8 h-btn-sm text-base rounded border border-solid cursor-pointer transition-colors leading-none',
  'bg-surface-2 border-border-base text-primary',
].join(' ');

const dropItemCls = [
  'w-full text-left px-3 h-btn-sm text-sm rounded cursor-pointer transition-colors whitespace-nowrap border-0',
  'bg-transparent text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const btnEditCls = [
  'mr-1 px-2 h-btn-sm text-xs rounded border border-solid cursor-pointer',
  'bg-surface border-accent text-link',
  'hover:bg-accent-dim transition-colors',
].join(' ');

const btnDelCls = [
  'px-2 h-btn-sm text-xs rounded border border-solid cursor-pointer',
  'bg-surface border-danger text-danger',
  'hover:bg-danger-dim transition-colors',
].join(' ');
