import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import SearchableSelect, { SEARCHABLE_THRESHOLD } from './SearchableSelect';
import { showToast } from './Toast';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));
const GanttChartLazy = lazy(() => import('./GanttChart'));

function AlimTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (!btnRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  function toggle(e) {
    e.stopPropagation();
    if (!open) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top - 8, left: r.left + r.width / 2 });
    }
    setOpen(v => !v);
  }

  return (
    <>
      <span
        ref={btnRef}
        onClick={toggle}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold cursor-pointer select-none leading-none flex-shrink-0"
      >?</span>
      {open && createPortal(
        <div
          className="fixed z-[9999] px-3 py-2 rounded shadow-lg text-xs leading-relaxed text-white whitespace-pre-wrap max-w-[260px]"
          style={{ background: '#1e2a35', top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-[#1e2a35]" />
        </div>,
        document.body
      )}
    </>
  );
}

const ReactQuill = lazy(() =>
  Promise.all([
    import('react-quill'),
    import('react-quill/dist/quill.snow.css'),
  ]).then(([m]) => ({ default: m.default }))
);

/** SQL 가독성 포맷: 주요 절 앞에 줄바꿈 (서버 포맷 SQL은 그대로 반환) */
function formatSQL(sql) {
  if (!sql) return sql;
  // 서버에서 이미 포맷된 SQL (줄바꿈 또는 주석 포함)
  if (sql.includes('\n') || sql.trimStart().startsWith('--')) return sql.trim();
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

function buildCopyText(devSql) {
  return ['-- 1. SELECT', formatSQL(buildCompleteSQL(devSql.sql, devSql.bindings)) + ';'].join('\n');
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

const DEFAULT_TAB = '기본폼';

// 반응형 브레이크포인트 — 폼 컨테이너 내부 폭(panelW) 기준
// Bootstrap 5 표준:  XS <576 / SM ≥576 / MD ≥768 / LG ≥992 / XL ≥1200
const BP = { sm: 576, md: 768, lg: 992, xl: 1200 };

function intOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// grid_view_class 파싱 — "col-xxs-N col-xs-N col-sm-N col-md-N col-lg-N col-xl-N row-N"
function parseViewClass(cls) {
  const r = { xxs: null, xs: null, sm: null, md: null, lg: null, xl: null, height: null, isMaxHeight: false };
  if (!cls) return r;
  for (const p of String(cls).split(/\s+/)) {
    const m = p.match(/^col-(xxs|xs|sm|md|lg|xl)-(\d+)$/);
    if (m) r[m[1]] = parseInt(m[2], 10);
    const h = p.match(/^row-(\d+)$/);
    if (h) {
      const n = parseInt(h[1], 10);
      if (n >= 52) { r.height = n - 51; r.isMaxHeight = true; }
      else          { r.height = n;      r.isMaxHeight = false; }
    }
  }
  return r;
}

// 개별 컬럼(grid_view_sm/md/lg/xl) 우선, 없으면 grid_view_class 파싱값 사용
// XS 는 개별 컬럼 없음 → grid_view_class 내부 xs/xxs 만 사용
// panelW ≤ 375 (모바일 소형) 은 무조건 100% (span=12)
function getSpan(vc, f, w) {
  if (w <= 375) return 12;
  const xs = vc.xs ?? vc.xxs;
  const sm = intOrNull(f.grid_view_sm) ?? vc.sm;
  const md = intOrNull(f.grid_view_md) ?? vc.md;
  const lg = intOrNull(f.grid_view_lg) ?? vc.lg;
  const xl = intOrNull(f.grid_view_xl) ?? vc.xl;
  let span = xs ?? sm ?? md ?? lg ?? xl ?? 12;
  if (w >= BP.sm && sm != null) span = sm;
  if (w >= BP.md && md != null) span = md;
  if (w >= BP.lg && lg != null) span = lg;
  if (w >= BP.xl && xl != null) span = xl;
  return Math.min(Math.max(span, 1), 12);
}

// 높이 해석: 개별 컬럼 grid_view_hight 우선 / 없으면 grid_view_class 의 row-N 폴백
function parseHeight(f, vc) {
  const h = intOrNull(f.grid_view_hight);
  if (h != null) {
    if (h >= 52) return { rows: h - 51, isMaxHeight: true };
    return { rows: Math.max(1, h), isMaxHeight: false };
  }
  if (vc.height != null) {
    return { rows: Math.max(1, vc.height), isMaxHeight: vc.isMaxHeight };
  }
  return { rows: 1, isMaxHeight: false };
}

function formLabel(colTitle, aliasName) {
  const s = colTitle ?? aliasName ?? '';
  const ci = s.indexOf(',');
  return ci === -1 ? s : s.slice(ci + 1) || s.slice(0, ci) || aliasName;
}

export default function DataForm({ gubun, idx, mode, user, onSaved, onCancel, onModify, onDelete,
                                   activeTab: activeTabProp, onTabChange, onTabsChange, onSqlBtn,
                                   onSaveSql, filterGroups = null, hideActions = false, menuReadOnly = false }) {
  const [fields,   setFields]   = useState([]);
  const [values,   setValues]   = useState({});
  // 첨부파일 임시 토큰: { alias: [token, token, ...] }
  const [tempAttach, setTempAttach] = useState({});
  const [loading,  setLoading]  = useState(mode !== 'write');
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');
  const [devSql,       setDevSql]       = useState(null);
  const [showSqlBtn,   setShowSqlBtn]   = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [printHtml,   setPrintHtml]   = useState(null);
  const devMode = localStorage.getItem('mis_dev_mode') === '1';

  // 패널(컨테이너) 폭 추적 — callback ref로 처리 (loading 중엔 form 미렌더)
  const containerRef = useRef(null);
  const resizeObsRef = useRef(null);
  const [panelW, setPanelW] = useState(600);

  // 그룹별 섹션 DOM ref (스크롤 이동용)
  const groupRefsMap = useRef({});

  const formRefCallback = useCallback(el => {
    if (resizeObsRef.current) {
      resizeObsRef.current.disconnect();
      resizeObsRef.current = null;
    }
    containerRef.current = el;
    if (!el) return;
    setPanelW(el.offsetWidth);
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setPanelW(e.contentRect.width);
    });
    obs.observe(el);
    resizeObsRef.current = obs;
  }, []);

  // SQL 버튼 상태 변경 시 부모에게 알림 + 8초 자동 숨김
  useEffect(() => {
    onSqlBtn?.(showSqlBtn, () => setSqlModalOpen(true));
    if (!showSqlBtn) return;
    const t = setTimeout(() => setShowSqlBtn(false), 8000);
    return () => clearTimeout(t);
  }, [showSqlBtn, onSqlBtn]);

  useEffect(() => () => { onSqlBtn?.(false, null); }, [onSqlBtn]);

  const readOnly = mode === 'view';

  useEffect(() => {
    const applyFields = (flds) => {
      setFields(flds);
      const normalize = g => (g && g.trim() && g.trim() !== 'Y') ? g.trim() : DEFAULT_TAB;
      const sortedFlds = [...flds].sort((a, b) =>
        (parseInt(a.sort_order ?? '0', 10)) - (parseInt(b.sort_order ?? '0', 10))
      );
      const seen = new Set();
      const unifiedTabs = [];
      for (const f of sortedFlds) {
        if (f.grid_ctl_name === 'child' && f.default_value) {
          const realPid = String(f.default_value).trim();
          const key = `child:${realPid}`;
          if (!seen.has(key)) {
            seen.add(key);
            unifiedTabs.push({ type: 'child', label: formLabel(f.col_title, f.alias_name), realPid });
          }
        } else if (parseInt(f.col_width ?? '0', 10) >= 0) {
          const group = normalize(f.form_group);
          const key = `form:${group}`;
          if (!seen.has(key)) {
            seen.add(key);
            unifiedTabs.push({ type: 'form', label: group });
          }
        }
      }
      onTabsChange?.(unifiedTabs);
    };

    if (mode === 'write') {
      api.list(gubun, { pageSize: 1, actionFlag: 'write' })
        .then(data => {
          const flds = data.fields ?? [];
          applyFields(flds);
          const defaults = {};
          flds.forEach(f => { if (f.default_value) defaults[f.alias_name] = f.default_value; });
          setValues(defaults);
          if (data._client_alert) alert(data._client_alert);
          if (data._client_toast) showToast(data._client_toast);
        })
        .catch(() => {});
      return;
    }
    if (idx <= 0) return;
    setLoading(true);
    Promise.all([
      api.view(gubun, idx, devMode, mode),
      api.list(gubun, { pageSize: 1 }),
    ]).then(([viewData, listData]) => {
      setValues(viewData.data ?? {});
      applyFields(listData.fields ?? []);
      setPrintHtml(viewData.printHtml ?? null);
      if (viewData._sql || viewData._execSql) { setDevSql({ sql: viewData._sql, bindings: viewData._bindings, execSql: viewData._execSql ?? null }); setShowSqlBtn(true); }
      if (viewData._client_alert) alert(viewData._client_alert);
      if (viewData._client_toast) showToast(viewData._client_toast);
      if (viewData._client_openTab) {
        const t = viewData._client_openTab;
        window.dispatchEvent(new CustomEvent('mis:openTab', { detail: { gubun: t.gubun, label: t.label ?? '', idx: t.idx ?? 0, linkVal: t.linkVal ?? t.idx ?? 0, openFull: !!t.openFull } }));
      }
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, [gubun, idx, mode]);

  // activeTab 변경 → 해당 섹션으로 스크롤
  // scrollIntoView 는 그리드 등 상위 레이아웃까지 스크롤시키므로
  // form 을 감싸는 overflow-auto 컨테이너를 직접 찾아 scrollTop 조정
  useEffect(() => {
    if (!activeTabProp || activeTabProp.startsWith('child-')) return;
    const raf = requestAnimationFrame(() => {
      const el = groupRefsMap.current[activeTabProp];
      if (!el) return;
      // 가장 가까운 overflow-auto/scroll 조상 찾기
      let container = el.parentElement;
      while (container && container !== document.body) {
        const { overflowY } = getComputedStyle(container);
        if (overflowY === 'auto' || overflowY === 'scroll') break;
        container = container.parentElement;
      }
      if (container && container !== document.body) {
        const top = el.offsetTop - container.offsetTop - 15;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      // 그룹 타이틀 깜빡임 효과
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 1200);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTabProp]);

  const formFields = fields.length > 0
    ? fields.filter(f => parseInt(f.col_width ?? '0', 10) >= 0 && f.grid_ctl_name !== 'child')
    : Object.keys(values).filter(k => k !== 'idx').map(k => ({
        alias_name: k, col_title: k, schema_type: 'text', grid_ctl_name: '',
      }));

  // Qn display 필드 분석 + dropdownlist 숨김 처리:
  // 1. table_XXXQnYYY → display필드에 selectbox, XXX(value) 숨김
  // 2. grid_ctl_name=dropdownlist + prime_key → 직전 display필드에 selectbox, 자신 숨김
  const qnDisplayToValue = {};  // displayAlias → valueAlias
  const qnHiddenAliases  = new Set();  // 숨길 value 필드 alias 목록
  formFields.forEach((f, i) => {
    // 패턴1: Qn alias
    const valueAlias = parseQnAlias(f.alias_name ?? '');
    if (valueAlias) {
      const valueField = formFields.find(vf => vf.alias_name === valueAlias && vf.prime_key);
      if (valueField) {
        qnDisplayToValue[f.alias_name] = valueAlias;
        qnHiddenAliases.add(valueAlias);
      }
      return;
    }
    // 패턴2: dropdownlist + prime_key → 직전 필드가 display
    if ((f.grid_ctl_name === 'dropdownlist' || f.grid_ctl_name === 'dropdownitem') && f.prime_key && i > 0) {
      const prev = formFields[i - 1];
      // 직전 필드가 JOIN 테이블(table_m이 아닌)이면 display 필드
      if (prev && prev.db_table && prev.db_table !== 'table_m') {
        qnDisplayToValue[prev.alias_name] = f.alias_name;
        qnHiddenAliases.add(f.alias_name);
      }
    }
  });

  const normalizeGroup = g => (g && g.trim() && g.trim() !== 'Y') ? g.trim() : DEFAULT_TAB;

  const groups = [];
  formFields.forEach(f => {
    const g = normalizeGroup(f.form_group);
    if (!groups.includes(g)) groups.push(g);
  });

  // filterGroups 가 지정된 경우 해당 그룹만 표시
  const displayGroups = (filterGroups && filterGroups.length > 0)
    ? groups.filter(g => filterGroups.includes(g))
    : groups;

  const multiGroup = displayGroups.length > 1;

  // PK(key) alias 결정 — 수정 모드에서 편집 불가 처리용
  // sort_order 기준 첫 번째가 col_width=-1 이면 두 번째가 visible key
  const pkAlias = (() => {
    if (fields.length === 0) return 'idx';
    const first = fields[0];
    const w = parseInt(first.col_width ?? '0', 10);
    if (w === -1 || w === -2) return fields[1]?.alias_name ?? first.alias_name ?? 'idx';
    return first.alias_name ?? 'idx';
  })();

  // 코드 에디터 / 간트차트 그룹 감지 (전체 높이 사용)
  const codeGroupSet = new Set();
  const ganttGroupSet = new Set();
  formFields.forEach(f => {
    if (f.schema_validation === 'code') codeGroupSet.add(normalizeGroup(f.form_group));
    if (f.schema_validation === 'gantt') ganttGroupSet.add(normalizeGroup(f.form_group));
  });
  const activeIsCode = codeGroupSet.has(activeTabProp);
  const activeIsGantt = ganttGroupSet.has(activeTabProp);

  function handleChange(alias, val) {
    setValues(prev => ({ ...prev, [alias]: val }));
  }

  // FileAttach → 부모로 임시 토큰 통지
  const handleTempAttachChange = useCallback((alias, tokens) => {
    setTempAttach(prev => {
      const cur = prev[alias] ?? [];
      // 동일 배열이면 setState 생략
      if (cur.length === tokens.length && cur.every((t, i) => t === tokens[i])) return prev;
      return { ...prev, [alias]: tokens };
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (readOnly || saving) return;

    // 필수 입력 검증
    const missing = formFields.filter(f => {
      if (f.required !== 'Y') return false;
      const w = parseInt(f.col_width ?? '0', 10);
      if (w === -1 || w === -2) return false; // 숨김 필드 제외
      const v = values[f.alias_name];
      return v === undefined || v === null || String(v).trim() === '';
    });
    if (missing.length > 0) {
      const names = missing.map(f => f.col_title || f.alias_name).join(', ');
      setError(`필수 입력: ${names}`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saveBody = { ...values };
      // 첨부파일 임시 토큰 동봉 (서버에서 finalize)
      const validTempAttach = Object.fromEntries(
        Object.entries(tempAttach).filter(([, v]) => Array.isArray(v) && v.length > 0)
      );
      if (Object.keys(validTempAttach).length > 0) saveBody._tempAttach = validTempAttach;
      const res = await api.save(gubun, saveBody, mode === 'modify' ? idx : 0, devMode);

      // 서버 confirm 요청 → 사용자 확인 후 _confirmed 플래그 붙여 재전송
      if (res._confirm) {
        setSaving(false);
        if (!window.confirm(res._confirm)) return;
        setSaving(true);
        const res2 = await api.save(gubun, { ...saveBody, _confirmed: true }, mode === 'modify' ? idx : 0, devMode);
        if (res2._sql || res2._execSql) {
          onSaveSql?.({ sql: res2._sql, bindings: res2._bindings ?? [], execSql: res2._execSql ?? null });
        }
        if (res2._client_openTab) {
          const t = res2._client_openTab;
          window.dispatchEvent(new CustomEvent('mis:openTab', { detail: { gubun: t.gubun, label: t.label ?? '', idx: t.idx ?? 0, linkVal: t.linkVal ?? t.idx ?? 0, openFull: !!t.openFull } }));
        }
        onSaved(res2.idx);
        return;
      }

      if (res._sql || res._execSql) {
        onSaveSql?.({ sql: res._sql, bindings: res._bindings ?? [], execSql: res._execSql ?? null });
      }
      if (res._client_openTab) {
        const t = res._client_openTab;
        window.dispatchEvent(new CustomEvent('mis:openTab', { detail: { gubun: t.gubun, label: t.label ?? '', idx: t.idx ?? 0, linkVal: t.linkVal ?? t.idx ?? 0, openFull: !!t.openFull } }));
      }
      onSaved(res.idx);
    } catch (ex) {
      setError(ex.message);
      if (ex._sqlData) {
        onSaveSql?.({ sql: ex._sqlData.sql, bindings: ex._sqlData.bindings ?? [], error: ex._sqlData.error });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="p-10 text-center">
      <div className="skeleton h-4 w-48 rounded mx-auto mb-3" />
      <div className="skeleton h-4 w-64 rounded mx-auto mb-3" />
      <div className="skeleton h-4 w-56 rounded mx-auto" />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={activeIsCode || activeIsGantt ? 'flex flex-col h-full' : ''}>
      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded border border-danger bg-danger-dim text-danger text-base flex-shrink-0">
          {error}
        </div>
      )}

      {/* SQL 상세 모달 */}
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
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-base bg-surface-2 flex-shrink-0">
              <span className="text-sm font-bold text-primary">실행 쿼리 — VIEW (개발자모드)</span>
              <div className="flex items-center gap-2">
                <button type="button" className="h-btn-sm px-3 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors" onClick={() => { copyText(buildCopyText(devSql)); showToast('복사되었습니다'); }}>복사</button>
                <button type="button" className="h-btn-sm px-3 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors" onClick={() => setSqlModalOpen(false)}>✕ 닫기</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              <div>
                <div className="text-xs font-bold text-secondary mb-1 uppercase tracking-wide">SELECT</div>
                <pre className="text-xs text-primary bg-surface-2 rounded p-3 overflow-auto whitespace-pre-wrap font-mono leading-6">{formatSQL(devSql.sql)}</pre>
              </div>
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

      {activeIsGantt ? (
        /* ── 간트차트 전체화면 모드 ── */
        <div className="flex flex-col flex-1 min-h-0">
          <GanttChartLazy projectIdx={idx || 0} gubun={gubun} />
        </div>
      ) : activeIsCode ? (
        /* ── 코드 에디터 전체화면 모드 ── */
        <div className="flex flex-col flex-1 min-h-0" ref={formRefCallback}>
          {(() => {
            const codeField = formFields.find(f => normalizeGroup(f.form_group) === activeTabProp && f.schema_validation === 'code');
            if (!codeField) return null;
            const alias = codeField.alias_name ?? '';
            return (
              <div className="flex-1 min-h-0 border border-border-base rounded overflow-hidden" style={{ minHeight: '400px' }}>
                <CodeEditor
                  alias={alias}
                  val={values[alias] ?? ''}
                  readOnly={readOnly}
                  onChange={handleChange}
                />
              </div>
            );
          })()}
        </div>
      ) : (
        /* ── 일반 그룹 렌더링 ── */
        <div className="flex flex-col gap-0" ref={formRefCallback}>
          {displayGroups.filter(g => !codeGroupSet.has(g)).map((group, gi) => {
              const gFields = formFields.filter(f => normalizeGroup(f.form_group) === group);

              return (
                <div
                  key={group}
                  ref={el => { groupRefsMap.current[group] = el; }}
                  className={gi > 0 ? 'mt-1' : ''}
                >
                  {/* 그룹 구분선 — 그룹이 2개 이상일 때만 표시 */}
                  {multiGroup && (
                    <div className="flex items-center gap-2.5 mb-2 mt-6 first:mt-0 py-1">
                      <div className="w-1 h-5 rounded-sm bg-accent flex-shrink-0" />
                      <span className="text-sm font-bold text-primary tracking-wide select-none">
                        {group}
                      </span>
                      <div className="flex-1 h-px bg-border-base" />
                    </div>
                  )}

                  {/* 필드 그리드 — gap 1px + 배경색으로 border collapse 효과 */}
                  <div
                    className="grid border border-border-base"
                    style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: 'minmax(62px, auto)', gap: '1px', background: 'var(--color-border)' }}
                  >
                {gFields.map((f, fi) => {
                  const alias    = f.alias_name ?? '';

                  // Qn value 필드는 숨김 (display 필드에서 selectbox로 대체)
                  if (qnHiddenAliases.has(alias)) return null;

                  // col_title에 콜론(:) 포함 → 섹션 제목 (데이터 영역 없음, 전체 너비)
                  const titleText = (f.col_title ?? '').trim();
                  if (titleText.includes(':')) {
                    const cleanTitle = titleText.replace(/:/g, '').trim();
                    if (!cleanTitle) return null; // 콜론만 있으면 숨김
                    return (
                      <div key={alias} style={{ gridColumn: '1 / -1' }} className="bg-surface-2 px-3 py-2">
                        <span className="text-xs font-bold text-secondary tracking-wide">{cleanTitle}</span>
                      </div>
                    );
                  }

                  // key 필드는 수정 모드에서도 읽기전용
                  const fieldReadOnly = readOnly || (mode === 'modify' && alias === pkAlias);

                  const val      = values[alias] ?? '';
                  const vc       = parseViewClass(f.grid_view_class);
                  const colSpan  = getSpan(vc, f, panelW);
                  const colStart = (f.grid_enter === '1' || f.grid_enter === 1) ? 1 : 'auto';
                  const hInfo    = parseHeight(f, vc);
                  const isHtmlCtl = f.grid_ctl_name === 'html';
                  const hRows    = isHtmlCtl ? Math.max(4, hInfo.rows) : hInfo.rows;
                  // 기하학적 정렬: 셀 전체는 h=1 셀을 hRows 개 스택한 것과 동일 높이
                  // grid-auto-rows=62px, gap=1px → span n 셀 높이 = 62n + (n-1)
                  const cellPx  = 62 * hRows + Math.max(0, hRows - 1);
                  const inputPx = cellPx - 28; // 라벨 헤더 ~28px 제외
                  // max-height 모드(grid_view_hight ≥ 52): 내용이 있을 때만 커지고 없으면 1행 수축
                  //  → 고정 row-span 대신 minHeight=1행, maxHeight=N행 으로 제한
                  const heightStyle = isHtmlCtl
                    ? { height: `${inputPx}px` }
                    : hInfo.isMaxHeight
                      ? { minHeight: '34px', maxHeight: `${inputPx}px` }
                      : { minHeight: `${inputPx}px` };

                  // Qn display 필드: 연결된 value 필드의 prime_key로 selectbox 렌더링
                  const linkedValueAlias = qnDisplayToValue[alias];
                  const linkedValueField = linkedValueAlias
                    ? formFields.find(vf => vf.alias_name === linkedValueAlias)
                    : null;

                  // Qn selectbox인 경우 코드값
                  const isQnSelect = !!linkedValueField;
                  const qnCodeVal  = isQnSelect ? (values[linkedValueAlias] ?? '') : '';

                  // schema_validation=zipcode → 우편번호 검색 UI
                  const isZipcode = f.schema_validation === 'zipcode';
                  const zipcodeAliases = isZipcode ? {
                    zipcode: alias,                                  // 현재 필드 = 우편번호
                    address: gFields[fi + 1]?.alias_name ?? null,   // 직후 필드 = 우편주소
                    detail:  gFields[fi + 2]?.alias_name ?? null,   // 직직후 필드 = 상세주소
                  } : null;

                  const isAttach = f.grid_ctl_name === 'attach' || f.grid_ctl_name === 'image';
                  const attachInfo = isAttach ? parseAttachLimit(f.max_length) : null;

                  const inputEl = isZipcode
                    ? <ZipcodeInput
                        val={val}
                        readOnly={fieldReadOnly}
                        aliases={zipcodeAliases}
                        onChange={handleChange}
                      />
                    : isAttach
                    ? <FileAttach
                        gubun={gubun}
                        idx={idx}
                        realPid={f.field_real_pid ?? ''}
                        alias={alias}
                        readOnly={fieldReadOnly}
                        multi={attachInfo.multi}
                        maxMB={attachInfo.maxMB}
                        allowExts={f.schema_validation || ''}
                        mode={mode}
                        midx={parseInt(values[alias + '_midx'] ?? 0, 10) || 0}
                        onTempChange={handleTempAttachChange}
                      />
                    : isQnSelect
                    ? (() => {
                        // 연결된 value 필드에 ctl_name이 없으면 텍스트만 표시
                        if (!linkedValueField.grid_ctl_name) {
                          return <span className="w-full h-full px-2 text-base text-secondary bg-transparent cursor-default flex items-center">{val ?? ''}</span>;
                        }
                        const baseCls  = 'w-full h-full px-2 text-base text-primary bg-transparent outline-none border-0';
                        const ROCls    = baseCls + ' text-secondary cursor-default';
                        const inputCls = fieldReadOnly ? ROCls : baseCls + ' border-b border-accent/30 focus:border-accent transition-colors';
                        return (
                          <DropdownSelect
                            gubun={gubun}
                            field={linkedValueField}
                            val={values[linkedValueAlias] ?? ''}
                            readOnly={fieldReadOnly}
                            onChange={(valueAlias, codeVal, displayText) => {
                              handleChange(valueAlias, codeVal);
                              handleChange(alias, displayText);
                            }}
                            baseCls={baseCls}
                            ROCls={ROCls}
                            inputCls={inputCls}
                          />
                        );
                      })()
                    : renderInput(f, val, fieldReadOnly, handleChange, hRows, gubun, inputPx);

                  // 개발자모드: 라벨 tooltip 생성
                  const devTitle = devMode
                    ? `field: ${f.db_field ?? ''}` +
                      (f.db_table ? ` (${f.db_table})` : '') +
                      `\nalias: ${alias}` +
                      (isQnSelect && qnCodeVal !== '' ? `\ncode: ${qnCodeVal}` : '') +
                      ((f.schema_type === 'dropdownitem' || f.grid_ctl_name === 'dropdownlist' || f.grid_ctl_name === 'dropdownitem') && val !== '' ? `\ncode: ${val}` : '')
                    : undefined;

                  // 행 span: 일반 셀은 hRows 행 고정 / max-height 셀은 1행부터 시작해 콘텐츠에 따라 auto 성장
                  const rowSpan = hInfo.isMaxHeight ? 1 : Math.max(1, hRows);

                  return (
                    <div
                      key={alias}
                      style={{
                        gridColumnStart: colStart,
                        gridColumnEnd:  `span ${colSpan}`,
                        gridRowEnd:     `span ${rowSpan}`,
                      }}
                      className="flex flex-col bg-surface overflow-hidden"
                    >
                      <div className="px-2 py-1 bg-surface-2 border-b border-border-base flex-shrink-0 flex items-center gap-1" title={devTitle}>
                        <span className="text-sm font-semibold text-secondary whitespace-nowrap truncate">
                          {formLabel(f.col_title, alias)}
                        </span>
                        {f.required === 'Y' && <span className="text-danger text-xs flex-shrink-0">*</span>}
                        {!readOnly && f.grid_alim && (
                          <AlimTooltip text={f.grid_alim} />
                        )}
                      </div>
                      <div
                        className={`flex-1 min-h-0${hInfo.isMaxHeight ? ' overflow-auto' : ''}`}
                        style={heightStyle}
                      >
                        {inputEl}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* 액션 버튼 - 수정/저장 모드 */}
      {!readOnly && !hideActions && !menuReadOnly && (
        <div className="flex gap-2 mt-4 flex-shrink-0">
          <button
            type="submit"
            disabled={saving}
            className="h-btn px-5 rounded bg-accent text-white text-base font-medium border-0 cursor-pointer disabled:opacity-50 hover:bg-accent-hover transition-colors flex items-center gap-2"
          >
            {saving && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            className="h-btn px-5 rounded bg-surface border border-border-base text-secondary text-base cursor-pointer hover:bg-surface-2 hover:text-primary transition-colors"
            onClick={onCancel}
          >취소</button>
        </div>
      )}

      {/* 액션 버튼 - 조회 모드 */}
      {readOnly && !hideActions && !menuReadOnly && (
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="h-btn px-5 rounded bg-accent text-white text-base font-medium border-0 cursor-pointer hover:bg-accent-hover transition-colors"
            onClick={() => onModify?.()}
          >수정</button>
          {printHtml && (
            <button
              type="button"
              className="h-btn px-5 rounded bg-surface border border-border-base text-primary text-base cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => {
                const w = window.open('', '_blank', 'width=900,height=700');
                if (!w) return;
                w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>인쇄</title>
                  <style>body{font-family:Pretendard,sans-serif;padding:20px;font-size:13px;color:#191F28}
                  table{border-collapse:collapse;width:100%} th,td{border:1px solid #E5E8EB;padding:6px 10px;text-align:left}
                  th{background:#F5F6F8;font-weight:600} h1,h2,h3{margin:0 0 12px}
                  .no-print{margin-top:24px;text-align:center}
                  @media print{.no-print{display:none!important}}</style>
                  </head><body>${printHtml}
                  <div class="no-print">
                    <button onclick="window.print()" style="padding:10px 32px;font-size:15px;cursor:pointer;border:1px solid #E5E8EB;border-radius:10px;background:#4F6EF7;color:#fff;font-weight:600">🖨 인쇄하기</button>
                    <button onclick="window.close()" style="padding:10px 32px;font-size:15px;cursor:pointer;border:1px solid #E5E8EB;border-radius:10px;margin-left:8px;background:#fff;color:#4E5968;font-weight:600">닫기</button>
                  </div></body></html>`);
                w.document.close();
                setTimeout(() => w.print(), 300);
              }}
            >🖨 인쇄</button>
          )}
          <button
            type="button"
            disabled={deleting}
            className="h-btn px-5 rounded bg-surface border border-danger text-danger text-base cursor-pointer disabled:opacity-50 hover:bg-danger-dim transition-colors flex items-center gap-2"
            onClick={async () => {
              if (!window.confirm('삭제하시겠습니까?')) return;
              setDeleting(true);
              try {
                await api.delete(gubun, idx);
                showToast('삭제되었습니다.', 'success');
                onDelete?.();
              } catch (e) {
                showToast(e.message, 'error');
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting && <span className="inline-block w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin" />}
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      )}
    </form>
  );
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};
const QUILL_FORMATS = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'bullet', 'indent',
  'align', 'link', 'image',
];

function HtmlEditor({ alias, val, readOnly, onChange, heightPx = 136 }) {
  const editorBodyPx = Math.max(60, heightPx - 42); // 42px = Quill 툴바 높이
  if (readOnly) {
    return (
      <div
        className="w-full h-full px-2 py-1.5 text-base text-primary overflow-auto prose-sm"
        style={{ minHeight: `${heightPx}px` }}
        dangerouslySetInnerHTML={{ __html: val || '' }}
      />
    );
  }
  return (
    <Suspense fallback={<div className="flex items-center justify-center text-muted text-sm" style={{ height: `${heightPx}px` }}>에디터 로딩 중...</div>}>
      <ReactQuill
        theme="snow"
        value={val || ''}
        onChange={v => onChange(alias, v)}
        modules={QUILL_MODULES}
        formats={QUILL_FORMATS}
        style={{ height: `${editorBodyPx}px` }}
      />
    </Suspense>
  );
}

/* SearchableSelect는 SearchableSelect.jsx로 분리됨 */

/**
 * 코드 에디터 (Monaco Editor)
 * schema_validation='code' 일 때 사용
 */
function guessLanguage(val) {
  const s = (val ?? '').trimStart();
  if (/^<\?php/i.test(s) || /function\s+\w+\s*\(.*\$/.test(s)) return 'php';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(s)) return 'sql';
  if (/<html|<div|<span|<!DOCTYPE/i.test(s)) return 'html';
  if (/^import\s|^export\s|^const\s|^function\s|=>\s*{/.test(s)) return 'javascript';
  if (/^\.\w|^#\w|^\*\s*{|^@media/m.test(s)) return 'css';
  return 'php';
}

const HOOK_GLOBALS = `
/*
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  사용 가능한 전역변수 (global 선언 후 사용)                           │
 * ├──────────────────────────┬───────────────────────────────────────────┤
 * │ $actionFlag              │ 현재 액션 (list/view/modify/write/delete) │
 * │ $gubun                   │ 메뉴 idx (정수)                           │
 * │ $idx                     │ 레코드 idx (정수)                         │
 * │ $real_pid                │ 프로그램 real_pid (speedmis000036 형태)   │
 * │ $menu_name               │ 프로그램명                                │
 * │ $parent_idx              │ 마스터-디테일 상위 idx                    │
 * │ $misSessionUserId        │ 로그인 사용자 ID                         │
 * │ $misSessionIsAdmin       │ 관리자 여부 ('Y' 또는 '')                │
 * │ $misSessionPositionCode  │ 직급 코드                                │
 * │ $isFirstLoad             │ 프로그램 최초 로딩 여부 (bool)            │
 * │ $isListEdit              │ 목록편집(인라인) 저장 여부 (bool)         │
 * │ $listEditField           │ 목록편집 시 변경된 필드명 배열            │
 * │ $customAction            │ 사용자 정의 버튼 action 값               │
 * │ $allFilter               │ 필터 JSON 문자열                         │
 * │ $orderby                 │ 정렬 문자열                              │
 * │ $page                    │ 현재 페이지                              │
 * │ $pageSize                │ 페이지당 건수                            │
 * │ $__pdo                   │ PDO 인스턴스 (DB 직접 접근)              │
 * │ $full_site               │ 사이트 주소                              │
 * ├──────────────────────────┴───────────────────────────────────────────┤
 * │  클라이언트 제어 ($GLOBALS['...'] = 값)                              │
 * ├──────────────────────────┬───────────────────────────────────────────┤
 * │ _client_alert            │ alert() 팝업 표시                        │
 * │ _client_toast            │ 토스트 알림 표시                         │
 * │ _client_confirm          │ 저장 전 확인 (Yes→저장, No→취소)         │
 * │ _client_openTab          │ 새 탭 열기 {gubun, label, idx, openFull} │
 * │ _client_redirect         │ 현재 탭 교체 {gubun, label}              │
 * │ _client_css              │ CSS 주입 (문자열)                        │
 * │ _client_buttonText       │ 버튼 텍스트 변경 {write, reset}          │
 * │ _client_buttons          │ 사용자정의 버튼 [{label, action}]        │
 * │ _onlyList                │ 리스트전용 모드 (true)                   │
 * └──────────────────────────┴───────────────────────────────────────────┘
 *
 *  SQL 실행 헬퍼:
 *    $result = execSql("INSERT INTO t (name) VALUES (?)", ['홍길동']);
 *    $result = execSql("UPDATE a SET x=1; DELETE FROM b WHERE y=2");
 *    // 결과: resultCode, resultMessage, lastInsertId, rowCount
 */`;

const HOOK_TEMPLATES = [
  { group: '공통(Common)', items: [
    { label: 'pageLoad — 프로그램 속성 선언 (1회)', fn: `
function pageLoad() {
    global $actionFlag, $gubun, $misSessionUserId, $misSessionIsAdmin;
${HOOK_GLOBALS}

    /*
     * ■ 리스트전용 프로그램 (조회만, 등록/수정 불가)
     * $GLOBALS['_onlyList'] = true;
     *
     * ■ 버튼 텍스트 변경
     * $GLOBALS['_client_buttonText'] = [
     *     'write' => '접수하기',     // +등록 → 접수하기
     *     'reset' => '전체보기',     // 초기화 → 전체보기
     * ];
     *
     * ■ 사용자 정의 버튼 추가 (list_json_init에서 $customAction으로 감지)
     * $GLOBALS['_client_buttons'] = [
     *     ['label' => '일괄적용', 'action' => 'apply'],
     *     ['label' => '마감처리', 'action' => 'close'],
     *     ['label' => '엑셀가져오기', 'action' => 'importExcel'],
     * ];
     *
     * ■ CSS 주입 (특정 요소 숨기기/스타일링)
     * $GLOBALS['_client_css'] = '
     *     #mis-btn-write { display: none; }
     *     #mis-btn-reset { background: #3182F6; color: #fff; }
     *     #mis-header { background: #f0f8ff; }
     * ';
     * // 주요 CSS ID: #mis-program, #mis-header, #mis-title,
     * //   #mis-header-actions, #mis-btn-write, #mis-btn-reset, #mis-btn-custom-0
     */
}` },
    { label: 'before_query — 쿼리 빌드 전 초기화', fn: `
function before_query($menu, $fields, $params) {
    global $actionFlag, $gubun, $idx, $misSessionUserId, $__pdo;
    /*
     * 리스트·조회·수정·저장 모든 액션에서 쿼리 생성 전에 호출됨
     * $menu:   메뉴 정보 배열 (table_name, real_pid, base_filter 등)
     * $fields: 필드 정의 배열 (alias_name, db_field, col_width 등)
     * $params: 요청 파라미터 (gubun, idx, allFilter, page, pageSize 등)
     *
     * ■ 전역변수 세팅 (다른 훅에서 활용)
     * $GLOBALS['my_dept'] = $__pdo->query(
     *     "SELECT station_idx FROM mis_users WHERE user_id='{$misSessionUserId}'"
     * )->fetchColumn();
     *
     * ■ 추가 SQL 실행
     * execSql("INSERT INTO access_log (gubun, user_id, wdate) VALUES (?, ?, NOW())",
     *     [$gubun, $misSessionUserId]);
     */
}` },
  ]},
  { group: '목록(List)', items: [
    { label: 'list_query — 목록 쿼리문 가로채기', fn: `
function list_query(&$selectQuery, &$countQuery) {
    global $misSessionUserId, $__pdo;
    /*
     * 목록 SELECT/COUNT 쿼리를 직접 수정 가능
     * $selectQuery: "SELECT ... FROM ... WHERE ..."
     * $countQuery:  "SELECT COUNT(*) FROM ... WHERE ..."
     *
     * ■ WHERE 조건 추가
     * $selectQuery = str_replace('WHERE 1=1',
     *     "WHERE 1=1 AND table_m.wdater='{$misSessionUserId}'", $selectQuery);
     * $countQuery = str_replace('WHERE 1=1',
     *     "WHERE 1=1 AND table_m.wdater='{$misSessionUserId}'", $countQuery);
     *
     * ■ JOIN 추가
     * $join = " LEFT JOIN mis_users u ON u.user_id = table_m.wdater";
     * $selectQuery = str_replace('WHERE', $join . ' WHERE', $selectQuery);
     *
     * ■ INFORMATION_SCHEMA JOIN에 TABLE_SCHEMA 조건 추가
     * $dbName = $_ENV['DB_NAME'] ?? 'speedmis_v7';
     * $selectQuery = str_replace('table_COLUMNS.TABLE_NAME=',
     *     "table_COLUMNS.TABLE_SCHEMA='{$dbName}' AND table_COLUMNS.TABLE_NAME=",
     *     $selectQuery);
     */
}` },
    { label: 'list_json_init — 목록 로딩 전 초기화', fn: `
function list_json_init() {
    global $actionFlag, $gubun, $misSessionUserId, $isFirstLoad, $customAction, $__pdo;
    /*
     * 목록 데이터를 가져오기 전에 실행
     * 매 조회마다 실행됨 (페이지 이동, 필터, 정렬 변경 시마다)
     *
     * ■ 최초 로딩 시에만 실행
     * if ($isFirstLoad) {
     *     $GLOBALS['_client_toast'] = '환영합니다!';
     * }
     *
     * ■ 사용자 정의 버튼 클릭 감지
     * if ($customAction === 'apply') {
     *     execSql("UPDATE my_table SET status='적용' WHERE status='대기'");
     *     $GLOBALS['_client_toast'] = '일괄 적용 완료!';
     * }
     * if ($customAction === 'close') {
     *     execSql("UPDATE my_table SET closed=1 WHERE closed=0");
     *     $GLOBALS['_client_toast'] = '마감 처리 완료!';
     * }
     *
     * ■ 다른 프로그램을 새 탭으로 열기
     * if ($isFirstLoad) {
     *     $GLOBALS['_client_openTab'] = [
     *         'gubun' => 314, 'label' => '대시보드',
     *         'idx' => 0, 'openFull' => true,
     *     ];
     * }
     *
     * ■ 현재 탭을 다른 프로그램으로 교체 (리다이렉트)
     * if ($isFirstLoad && $misSessionUserId !== 'admin') {
     *     $GLOBALS['_client_redirect'] = ['gubun' => 36, 'label' => '그룹관리'];
     * }
     *
     * ■ alert / toast
     * $GLOBALS['_client_alert'] = '중요 공지사항입니다!';
     * $GLOBALS['_client_toast'] = '새 데이터 3건이 등록되었습니다.';
     */
}` },
    { label: 'list_json_load — 목록 각 행 변환', fn: `
function list_json_load(&$data) {
    /*
     * 목록의 각 행(row)마다 호출됨
     * $data: 연관배열 (alias_name => 값)
     *
     * ■ 데이터 값 자체를 변경 (폼에서도 변경된 값 사용)
     * $data['total'] = (int)$data['price'] * (int)$data['qty'];
     * $data['full_name'] = $data['last_name'] . ' ' . $data['first_name'];
     *
     * ■ 그리드 표시만 변경 (원본 데이터는 보존)
     * $data['__html']['필드명'] = 'HTML 문자열';
     *
     * 예1) 링크로 표시
     * $data['__html']['site_name'] = '<a href="'.$data['site_url']
     *     .'" target="_blank">'.$data['site_name'].'</a>';
     *
     * 예2) 상태 뱃지
     * $st = $data['status'];
     * $colors = ['완료'=>'#22c55e', '진행중'=>'#3b82f6', '대기'=>'#f59e0b'];
     * $bg = $colors[$st] ?? '#6b7280';
     * $data['__html']['status'] = '<span class="badge" style="background:'
     *     .$bg.';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">'
     *     .$st.'</span>';
     *
     * 예3) 조건부 색상
     * $amt = (int)$data['amount'];
     * $color = $amt >= 100000 ? '#ef4444' : ($amt >= 50000 ? '#f59e0b' : '#22c55e');
     * $data['__html']['amount'] = '<span style="color:'.$color.';font-weight:700">'
     *     .number_format($amt).'</span>';
     *
     * 예4) 이미지 썸네일
     * if ($data['photo_url']) {
     *     $data['__html']['photo'] = '<img src="'.$data['photo_url']
     *         .'" style="height:24px;border-radius:4px">';
     * }
     */
}` },
  ]},
  { group: '저장(Update)', items: [
    { label: 'save_updateReady — 저장 전 검증/확인', fn: `
function save_updateReady(&$saveList) {
    global $isListEdit, $listEditField, $idx, $__pdo;
    /*
     * 저장 버튼 클릭 직후, 데이터 필터링 전에 호출
     * $saveList: POST로 전달된 원본 데이터 (alias_name => 값)
     *
     * ■ 값 추가/수정
     * $saveList['updated_by'] = $GLOBALS['misSessionUserId'];
     * $saveList['total'] = (int)$saveList['price'] * (int)$saveList['qty'];
     *
     * ■ 저장 전 확인 다이얼로그
     * $GLOBALS['_client_confirm'] = '정말로 저장할까요?';
     * // → 브라우저 confirm → Yes → _confirmed=true로 재전송 → 저장
     * // → No → 저장 취소
     *
     * ■ 조건부 확인
     * if ((int)$saveList['amount'] > 1000000) {
     *     $GLOBALS['_client_confirm'] = '100만원 이상입니다. 승인하시겠습니까?';
     * }
     *
     * ■ 중복 체크
     * $cnt = $__pdo->prepare("SELECT COUNT(*) FROM my_table WHERE name=? AND idx<>?");
     * $cnt->execute([$saveList['name'], $idx]);
     * if ($cnt->fetchColumn() > 0) {
     *     $GLOBALS['_client_confirm'] = '동일한 이름이 이미 존재합니다. 계속할까요?';
     * }
     *
     * ■ 목록편집(인라인) 감지
     * if ($isListEdit) {
     *     // $listEditField = ['status'] — 변경된 필드명 배열
     *     if (in_array('status', $listEditField)) {
     *         $GLOBALS['_client_toast'] = '상태가 변경되었습니다.';
     *     }
     * }
     */
}` },
    { label: 'save_updateBefore — UPDATE 직전 데이터 수정', fn: `
function save_updateBefore(&$updateList) {
    global $misSessionUserId;
    /*
     * DB 컬럼명 기준 UPDATE 데이터 (alias가 아닌 실제 컬럼명)
     * 여기서 값을 바꾸면 UPDATE 쿼리에 반영됨
     *
     * ■ 자동 계산 필드
     * $updateList['total_price'] = (int)$updateList['price'] * (int)$updateList['qty'];
     *
     * ■ 특정 필드 강제 세팅
     * $updateList['modifier'] = $misSessionUserId;
     * $updateList['modify_date'] = date('Y-m-d H:i:s');
     *
     * ■ 특정 필드 제거 (UPDATE에서 제외)
     * unset($updateList['readonly_field']);
     */
}` },
    { label: 'save_updateQueryBefore — UPDATE SQL 가로채기', fn: `
function save_updateQueryBefore(&$sql, &$bindings) {
    /*
     * 최종 UPDATE SQL과 바인딩을 직접 수정 가능
     * $sql: "UPDATE \`table\` SET col1=?, col2=? WHERE idx=?"
     * $bindings: [값1, 값2, idx값]
     *
     * ■ SQL 직접 수정 (위험 — 신중하게)
     * $sql = str_replace('SET', 'SET version=version+1,', $sql);
     */
}` },
    { label: 'save_updateAfter — UPDATE 완료 후 처리', fn: `
function save_updateAfter($idx, &$afterScript) {
    global $__pdo, $misSessionUserId, $gubun;
    /*
     * UPDATE 쿼리 실행 완료 후 호출
     * $idx: 저장된 레코드 idx
     *
     * ■ 다른 테이블 연동
     * $__pdo->prepare("UPDATE related SET synced=NOW() WHERE link_idx=?")
     *     ->execute([$idx]);
     *
     * ■ 여러 쿼리 실행
     * execSql("UPDATE log SET status='done' WHERE ref_idx={$idx};
     *          INSERT INTO history (gubun, idx, action, user_id, wdate)
     *          VALUES ({$gubun}, {$idx}, 'update', '{$misSessionUserId}', NOW())");
     *
     * ■ 알림/토스트
     * $GLOBALS['_client_toast'] = "idx={$idx} 저장 완료";
     *
     * ■ 저장 후 다른 탭 열기
     * $GLOBALS['_client_openTab'] = [
     *     'gubun' => 100, 'label' => '결과확인', 'idx' => $idx,
     * ];
     */
}` },
  ]},
  { group: '등록(Insert)', items: [
    { label: 'save_writeBefore — INSERT 직전 데이터 수정', fn: `
function save_writeBefore(&$updateList) {
    global $misSessionUserId, $__pdo;
    /*
     * INSERT 데이터를 수정/추가 가능
     *
     * ■ 자동 채번
     * $max = $__pdo->query("SELECT MAX(seq)+1 FROM my_table")->fetchColumn();
     * $updateList['seq'] = $max ?: 1;
     *
     * ■ 작성자 자동 세팅
     * $updateList['creator'] = $misSessionUserId;
     *
     * ■ 기본값 설정
     * if (empty($updateList['status'])) $updateList['status'] = '대기';
     */
}` },
    { label: 'save_writeQueryBefore — INSERT SQL 가로채기', fn: `
function save_writeQueryBefore(&$sql, &$bindings) {
    /*
     * 최종 INSERT SQL과 바인딩 직접 수정 가능
     * $sql: "INSERT INTO \`table\` (col1, col2) VALUES (?, ?)"
     * $bindings: [값1, 값2]
     */
}` },
    { label: 'save_writeAfter — INSERT 완료 후 처리', fn: `
function save_writeAfter($newIdx, &$afterScript) {
    global $__pdo, $misSessionUserId;
    /*
     * INSERT 완료 후 호출
     * $newIdx: 새로 생성된 레코드 idx (AUTO_INCREMENT)
     *
     * ■ 연관 데이터 자동 생성
     * $__pdo->prepare("INSERT INTO child_table (parent_idx, wdater, wdate)
     *     VALUES (?, ?, NOW())")->execute([$newIdx, $misSessionUserId]);
     *
     * ■ 알림
     * $GLOBALS['_client_toast'] = "새 레코드(#{$newIdx}) 등록 완료";
     */
}` },
  ]},
  { group: '삭제(Delete)', items: [
    { label: 'save_deleteBefore — 삭제 전 검증/취소', fn: `
function save_deleteBefore($idx, &$cancelDelete) {
    global $__pdo, $misSessionUserId, $misSessionIsAdmin;
    /*
     * $cancelDelete = true; → 삭제 취소
     *
     * ■ 관리자만 삭제 허용
     * if ($misSessionIsAdmin !== 'Y') {
     *     $cancelDelete = true;
     *     $GLOBALS['_client_alert'] = '관리자만 삭제할 수 있습니다.';
     * }
     *
     * ■ 하위 데이터 존재 시 삭제 방지
     * $cnt = $__pdo->query("SELECT COUNT(*) FROM child_table
     *     WHERE parent_idx={$idx}")->fetchColumn();
     * if ($cnt > 0) {
     *     $cancelDelete = true;
     *     $GLOBALS['_client_alert'] = "하위 데이터 {$cnt}건이 있어 삭제할 수 없습니다.";
     * }
     */
}` },
    { label: 'save_deleteAfter — 삭제 완료 후 처리', fn: `
function save_deleteAfter($idx, &$afterScript) {
    global $__pdo;
    /*
     * ■ 연관 데이터 정리
     * execSql("DELETE FROM child_table WHERE parent_idx={$idx};
     *          DELETE FROM log_table WHERE ref_idx={$idx}");
     *
     * ■ 알림
     * $GLOBALS['_client_toast'] = '삭제 완료';
     */
}` },
  ]},
  { group: '폼(View/Modify)', items: [
    { label: 'view_query — 조회 쿼리문 가로채기', fn: `
function view_query(&$viewSql) {
    /*
     * 단건 조회 SELECT 쿼리 수정 가능
     * $viewSql: "SELECT ... FROM ... WHERE idx=? LIMIT 1"
     *
     * ■ JOIN 조건 추가
     * $viewSql = str_replace('WHERE',
     *     "LEFT JOIN extra_table e ON e.id = table_m.extra_id WHERE", $viewSql);
     *
     * ■ INFORMATION_SCHEMA TABLE_SCHEMA 조건 추가 (267번 참고)
     * $dbName = $_ENV['DB_NAME'] ?? 'speedmis_v7';
     * if (!str_contains($viewSql, 'TABLE_SCHEMA')) {
     *     $viewSql = str_replace('table_COLUMNS.TABLE_NAME=',
     *         "table_COLUMNS.TABLE_SCHEMA='{$dbName}' AND table_COLUMNS.TABLE_NAME=",
     *         $viewSql);
     * }
     */
}` },
    { label: 'view_load — 폼 데이터 로딩 후 처리', fn: `
function view_load(&$row) {
    global $actionFlag, $gubun, $idx, $misSessionUserId, $__pdo;
    /*
     * 조회/수정 폼 데이터 로딩 직후 실행
     * $row: 조회된 레코드 연관배열 (수정 가능)
     * $actionFlag: 'view' 또는 'modify'
     *
     * ■ 파일에서 값 로드 (266번 웹소스 참고)
     * $filePath = PROGRAMS_PATH . '/' . $row['real_pid'] . '.php';
     * if (file_exists($filePath)) {
     *     $row['add_logic'] = file_get_contents($filePath);
     * }
     *
     * ■ 계산 필드 추가
     * $row['total'] = (int)($row['price'] ?? 0) * (int)($row['qty'] ?? 0);
     *
     * ■ 수정 모드에서 경고
     * if ($actionFlag === 'modify') {
     *     $GLOBALS['_client_toast'] = '수정 모드입니다. 변경 후 저장해주세요.';
     * }
     *
     * ■ 특정 조건에서 새 탭 열기
     * if ($row['status'] === '긴급') {
     *     $GLOBALS['_client_alert'] = '긴급 건입니다!';
     * }
     */
}` },
  ]},
  { group: '기타(Etc)', items: [
    { label: 'addLogic_treat — 커스텀 API 액션', fn: `
function addLogic_treat(&$result) {
    global $__pdo, $gubun, $idx, $misSessionUserId;
    /*
     * act=treat&gubun=XX 호출 시 실행되는 커스텀 로직
     * 프론트에서: api.treat(gubun, { key: 'value' })
     *
     * ■ 데이터 조회 반환
     * $stmt = $__pdo->query("SELECT * FROM my_table WHERE status='Y'");
     * $result['success'] = true;
     * $result['data'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
     *
     * ■ 처리 후 메시지
     * execSql("UPDATE my_table SET processed=1 WHERE idx={$idx}");
     * $result['success'] = true;
     * $result['message'] = '처리 완료';
     */
}` },
  ]},
];

function CodeEditor({ alias, val, readOnly, onChange }) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const editorRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  // 함수명 추출: "function xxx(" → "xxx"
  const getFuncName = (code) => {
    const m = code.match(/function\s+(\w+)\s*\(/);
    return m ? m[1] : '';
  };

  // 에디터에서 함수가 존재하는 줄 번호 찾기
  const findFuncLine = (funcName) => {
    const editor = editorRef.current;
    if (!editor || !funcName) return 0;
    const model = editor.getModel();
    const pattern = new RegExp('function\\s+' + funcName + '\\s*\\(');
    for (let i = 1; i <= model.getLineCount(); i++) {
      if (pattern.test(model.getLineContent(i))) return i;
    }
    return 0;
  };

  // 코드에 함수가 이미 있는지 검사
  const hasFuncInCode = (funcName) => {
    if (!funcName) return false;
    const code = val ?? '';
    return new RegExp('function\\s+' + funcName + '\\s*\\(').test(code);
  };

  const insertSnippet = (code) => {
    const editor = editorRef.current;
    if (!editor) {
      onChange(alias, (val ?? '') + '\n' + code.trim() + '\n');
      setMenuOpen(false);
      return;
    }
    const model = editor.getModel();
    const lastLine = model.getLineCount();
    const lastCol  = model.getLineMaxColumn(lastLine);
    const range = { startLineNumber: lastLine, startColumn: lastCol, endLineNumber: lastLine, endColumn: lastCol };
    const text  = '\n' + code.trim() + '\n';
    editor.executeEdits('snippet', [{ range, text }]);
    const newLastLine = model.getLineCount();
    editor.setPosition({ lineNumber: newLastLine, column: 1 });
    editor.revealLineInCenter(newLastLine);
    editor.focus();
    setMenuOpen(false);
  };

  // 이미 존재하는 함수로 이동
  const goToFunc = (funcName) => {
    const line = findFuncLine(funcName);
    if (!line) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    setMenuOpen(false);
  };

  const ensurePhpTag = () => {
    const current = (val ?? '').trim();
    if (!current) {
      onChange(alias, '<?php\n\n');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 툴바 */}
      {!readOnly && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-base bg-surface-2 flex-shrink-0">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              className="h-btn-sm px-3 rounded border border-border-base bg-surface text-link text-xs font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => { ensurePhpTag(); setMenuOpen(v => !v); }}
            >+ 함수 삽입</button>
            {menuOpen && (
              <div className="absolute left-0 top-full mt-1 z-[100] min-w-[360px] max-h-[400px] overflow-auto rounded border border-border-base bg-surface shadow-md">
                {HOOK_TEMPLATES.map(g => (
                  <div key={g.group}>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-muted uppercase tracking-wider bg-surface-2 sticky top-0">{g.group}</div>
                    {g.items.map(item => {
                      const fn = getFuncName(item.fn);
                      const exists = hasFuncInCode(fn);
                      return (
                        <div
                          key={item.label}
                          className={[
                            'px-3 py-2 text-sm cursor-pointer transition-colors border-b border-border-base last:border-b-0 flex items-center gap-2',
                            exists ? 'bg-accent-dim text-link font-semibold hover:bg-accent/20' : 'text-primary hover:bg-surface-2',
                          ].join(' ')}
                          onClick={() => exists ? goToFunc(fn) : insertSnippet(item.fn)}
                        >
                          {exists && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
                          <span className="flex-1">{item.label}</span>
                          {exists && <span className="text-[10px] text-accent flex-shrink-0">이동</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="text-muted text-[10px]">저장 시 programs/ 파일에 자동 반영됩니다</span>
        </div>
      )}
      {/* Monaco 에디터 */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted text-sm">에디터 로딩 중...</div>}>
          <MonacoEditor
            height="100%"
            language={guessLanguage(val)}
            theme={isDark ? 'vs-dark' : 'vs'}
            value={val ?? ''}
            onChange={v => onChange(alias, v ?? '')}
            onMount={editor => { editorRef.current = editor; }}
            options={{
              readOnly,
              minimap: { enabled: true },
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              folding: true,
              lineDecorationsWidth: 8,
              padding: { top: 8, bottom: 8 },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * prime_key 기반 동적 드롭다운
 * onChange(alias, codeValue, displayText) — 3번째 인자로 표시 텍스트 전달
 */
function DropdownSelect({ gubun, field, val, readOnly, onChange, baseCls, ROCls, inputCls }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (!gubun || !field.alias_name) return;
    api.primeKeyItems(gubun, field.alias_name)
      .then(d => setOptions(Array.isArray(d.data) ? d.data : []))
      .catch(() => setOptions([]));
  }, [gubun, field.alias_name]);

  if (readOnly) {
    const matched = options.find(o => o.value === String(val ?? ''));
    const label   = matched ? matched.text : (val ?? '');
    return <span className={ROCls + ' flex items-center'}>{label}</span>;
  }

  if (options.length > SEARCHABLE_THRESHOLD) {
    return (
      <SearchableSelect
        options={options}
        value={val ?? ''}
        className={inputCls + ' cursor-pointer'}
        onChange={(code, display) => onChange(field.alias_name, code, display ?? '')}
      />
    );
  }

  return (
    <select
      className={inputCls + ' appearance-none cursor-pointer'}
      value={val ?? ''}
      onChange={e => {
        const code    = e.target.value;
        const display = options.find(o => o.value === code)?.text ?? '';
        onChange(field.alias_name, code, display);
      }}
    >
      <option value="">-- 선택 --</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.text ?? o.value}</option>)}
    </select>
  );
}

/**
 * dropdownitem — grid_items 기반 selectbox
 * items: JSON 배열 [{value,text}] 또는 SELECT SQL
 */
function DropdownItemSelect({ gubun, field, val, readOnly, onChange, baseCls, ROCls, inputCls }) {
  const alias   = field.alias_name ?? '';
  const rawItems = field.items ?? '';
  const isSql   = /^\s*select\s+/i.test(rawItems);
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (isSql) {
      api.dropdownItems(gubun, alias)
        .then(d => setOptions(Array.isArray(d.data) ? d.data : []))
        .catch(() => setOptions([]));
    } else {
      try {
        const parsed = JSON.parse(rawItems);
        setOptions(Array.isArray(parsed)
          ? parsed.map(o => typeof o === 'object' ? { value: String(o.value ?? ''), text: String(o.text ?? o.value ?? '') } : { value: String(o), text: String(o) })
          : []);
      } catch {
        setOptions(rawItems.split(',').filter(Boolean).map(v => ({ value: v.trim(), text: v.trim() })));
      }
    }
  }, [gubun, alias, rawItems, isSql]);

  if (readOnly) {
    const matched = options.find(o => o.value === String(val ?? ''));
    return <span className={(ROCls ?? '') + ' flex items-center'}>{matched ? matched.text : (val ?? '')}</span>;
  }

  if (options.length > SEARCHABLE_THRESHOLD) {
    return (
      <SearchableSelect
        options={options}
        value={val ?? ''}
        className={(inputCls ?? '') + ' cursor-pointer'}
        onChange={(code) => onChange(alias, code)}
      />
    );
  }

  return (
    <select
      className={(inputCls ?? '') + ' appearance-none cursor-pointer'}
      value={val ?? ''}
      onChange={e => onChange(alias, e.target.value)}
    >
      <option value="">-- 선택 --</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
    </select>
  );
}

/**
 * 첨부파일 max_length 파싱
 * '5' → { maxMB: 5, multi: false }
 * '5!' → { maxMB: 5, multi: true }
 */
function parseAttachLimit(raw) {
  const s = String(raw ?? '').trim();
  const multi = s.endsWith('!');
  const num = parseInt(multi ? s.slice(0, -1) : s, 10);
  return { maxMB: num > 0 ? num : 20, multi };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/**
 * 첨부파일 업로드/목록/다운로드/삭제 컴포넌트
 */
const IMG_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg']);
const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊',
  ppt: '📎', pptx: '📎', hwp: '📝', txt: '📃', zip: '📦', rar: '📦', '7z': '📦',
};
function getFileExt(name) { return (name ?? '').split('.').pop()?.toLowerCase() ?? ''; }
function isImageMime(mime) { return (mime ?? '').startsWith('image/'); }
function fileIcon(name, mime) {
  if (isImageMime(mime)) return null; // 이미지는 썸네일로 대체
  return FILE_ICONS[getFileExt(name)] ?? '📎';
}

function FileAttach({ gubun, idx, realPid, alias, readOnly, multi, maxMB, allowExts, mode, midx, onTempChange }) {
  // 기존 저장된 파일 (midx 기준으로 로드)
  const [files, setFiles]         = useState([]);
  // temp 업로드된 파일 목록 [{ token, orig_name, size, mime }]
  const [tempFiles, setTempFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const [lightbox, setLightbox]   = useState(null);
  const fileRef = React.useRef(null);

  const extList = (() => {
    const raw = (allowExts || '').trim();
    if (!raw) return [];
    // JSON 또는 불완전한 JSON ("allowedExtensions": [...]) 감지
    if (raw.includes('allowedExtensions') || raw.startsWith('{') || raw.startsWith('"')) {
      try {
        const json = raw.startsWith('{') ? raw : `{${raw}}`;
        const parsed = JSON.parse(json);
        const arr = parsed.allowedExtensions ?? parsed.ext ?? [];
        return arr.map(s => s.replace(/^\./, '').trim().toLowerCase()).filter(Boolean);
      } catch { /* fallthrough */ }
    }
    return raw.split(',').map(s => s.replace(/^\./, '').trim().toLowerCase()).filter(Boolean);
  })();
  const acceptAttr = extList.length > 0 ? extList.map(e => '.' + e).join(',') : undefined;

  // midx 변경 시 기존 파일 로드
  useEffect(() => {
    if (!midx || midx <= 0) { setFiles([]); return; }
    api.fileList(midx).then(d => setFiles(d.data ?? [])).catch(() => {});
  }, [midx]);

  // temp 토큰 리스트를 부모(form)에 실시간 통지
  useEffect(() => {
    onTempChange?.(alias, tempFiles.map(t => t.token));
  }, [tempFiles, alias, onTempChange]);

  const handleUpload = async (e) => {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    e.target.value = '';
    setError('');

    const toUpload = multi ? selected : [selected[0]];

    if (extList.length > 0) {
      const badExt = toUpload.filter(f => !extList.includes(getFileExt(f.name)));
      if (badExt.length) {
        setError(`허용되지 않는 파일 형식 (${extList.join(', ')}만 가능): ${badExt.map(f => f.name).join(', ')}`);
        return;
      }
    }

    const oversized = toUpload.filter(f => f.size > maxMB * 1024 * 1024);
    if (oversized.length) {
      setError(`파일 크기 초과 (최대 ${maxMB}MB): ${oversized.map(f => f.name).join(', ')}`);
      return;
    }

    setUploading(true);
    try {
      const added = [];
      for (const f of toUpload) {
        const res = await api.fileUpload(f);
        if (!res.success) { setError(res.message ?? '업로드 실패'); break; }
        added.push({
          token: res.token,
          orig_name: res.orig_name,
          size: res.size,
          mime: res.mime,
          previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
          isImage: f.type.startsWith('image/'),
        });
      }
      setTempFiles(prev => multi ? [...prev, ...added] : added);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteTemp = (token) => {
    setTempFiles(prev => prev.filter(t => t.token !== token));
  };

  const handleDeleteSaved = async (attachIdx) => {
    if (!confirm('파일을 삭제하시겠습니까?')) return;
    try {
      await api.fileDelete(attachIdx);
      setFiles(prev => prev.filter(f => f.idx !== attachIdx));
    } catch (ex) {
      setError(ex.message);
    }
  };

  const isImgMime = (m) => /^image\//.test(m ?? '');
  const total = files.length + tempFiles.length;

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 h-full overflow-auto">
      {error && <div className="text-xs text-danger">{error}</div>}

      {/* 저장된 이미지 썸네일 (midx 기준) */}
      {files.filter(f => isImgMime(f.attach_mime)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.filter(f => isImgMime(f.attach_mime)).map(f => (
            <div key={`s-${f.idx}`} className="relative group rounded border border-border-base bg-surface-2 overflow-hidden cursor-pointer"
              style={{ width: 64, height: 64 }}
              onClick={() => setLightbox(f.attach_url)}>
              <img src={f.attach_url} alt={f.attach_name} className="w-full h-full object-cover" loading="lazy" />
              {!readOnly && (
                <button type="button"
                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-danger text-white text-[9px] leading-none opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-0 rounded-bl"
                  onClick={(e) => { e.stopPropagation(); handleDeleteSaved(f.idx); }}
                  title="삭제">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 임시 업로드된 이미지 썸네일 */}
      {tempFiles.filter(t => t.isImage).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tempFiles.filter(t => t.isImage).map(t => (
            <div key={`t-${t.token}`} className="relative group rounded border border-accent bg-surface-2 overflow-hidden"
              style={{ width: 64, height: 64 }}>
              <img src={t.previewUrl} alt={t.orig_name} className="w-full h-full object-cover" />
              <span className="absolute bottom-0 left-0 right-0 bg-accent text-white text-[9px] text-center py-[1px]">대기</span>
              {!readOnly && (
                <button type="button"
                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-danger text-white text-[9px] leading-none opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-0 rounded-bl"
                  onClick={() => handleDeleteTemp(t.token)} title="삭제">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 저장된 비-이미지 파일 */}
      {files.filter(f => !isImgMime(f.attach_mime)).map(f => (
        <div key={`sf-${f.idx}`} className="flex items-center gap-1.5 text-xs group">
          <span className="flex-shrink-0">{fileIcon(f.attach_name, f.attach_mime) ?? '📎'}</span>
          <a href={f.attach_url} target="_blank" rel="noopener noreferrer"
            className="text-link hover:underline truncate flex-1 min-w-0" title={f.attach_name}
          >{f.attach_name}</a>
          <span className="text-muted flex-shrink-0">{formatFileSize(f.attach_size)}</span>
          {!readOnly && (
            <button type="button"
              className="text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-transparent border-0 text-xs px-0.5"
              onClick={() => handleDeleteSaved(f.idx)} title="삭제">✕</button>
          )}
        </div>
      ))}

      {/* 임시 업로드된 비-이미지 파일 */}
      {tempFiles.filter(t => !t.isImage).map(t => (
        <div key={`tf-${t.token}`} className="flex items-center gap-1.5 text-xs group">
          <span className="flex-shrink-0">{fileIcon(t.orig_name, t.mime) ?? '📎'}</span>
          <span className="text-accent truncate flex-1 min-w-0" title={t.orig_name}>{t.orig_name}</span>
          <span className="text-accent text-[10px] flex-shrink-0">대기</span>
          <span className="text-muted flex-shrink-0">{formatFileSize(t.size)}</span>
          {!readOnly && (
            <button type="button"
              className="text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-transparent border-0 text-xs px-0.5"
              onClick={() => handleDeleteTemp(t.token)} title="삭제">✕</button>
          )}
        </div>
      ))}

      {/* 업로드 버튼 */}
      {!readOnly && (multi || total === 0) && (
        <div className="flex items-center gap-1.5">
          <input ref={fileRef} type="file" className="hidden" multiple={multi} accept={acceptAttr} onChange={handleUpload} />
          <button type="button" disabled={uploading}
            className="h-btn-sm px-2.5 rounded border border-border-base bg-surface-2 text-secondary text-xs cursor-pointer hover:bg-surface hover:text-primary transition-colors flex-shrink-0 whitespace-nowrap disabled:opacity-60"
            onClick={() => fileRef.current?.click()}
          >{uploading ? '업로드 중...' : `파일 첨부 (${maxMB}MB${extList.length > 0 ? ` · ${extList.join(',')}` : ''})`}</button>
          {multi && <span className="text-muted text-[10px]">복수 가능</span>}
        </div>
      )}

      {readOnly && total === 0 && (
        <span className="text-muted text-sm flex items-center h-full">-</span>
      )}

      {/* 이미지 라이트박스 */}
      {lightbox && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-[90vw] max-h-[90vh] rounded shadow-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/**
 * 다음(Daum) 우편번호 검색
 * aliases: { zipcode: 직전필드alias, address: 현재필드alias, detail: 직후필드alias }
 */
let daumScriptLoaded = false;
function loadDaumPostcode() {
  return new Promise((resolve) => {
    if (daumScriptLoaded && window.daum?.Postcode) { resolve(); return; }
    const s = document.createElement('script');
    s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.onload = () => { daumScriptLoaded = true; resolve(); };
    document.head.appendChild(s);
  });
}

function ZipcodeInput({ val, readOnly, aliases, onChange }) {
  const baseCls = 'w-full h-full px-2 text-base text-primary bg-transparent outline-none border-0';
  const ROCls   = baseCls + ' text-secondary cursor-default';
  const inputCls = readOnly ? ROCls : baseCls + ' focus:ring-1 focus:ring-inset focus:ring-accent';

  if (readOnly) return <span className={ROCls + ' flex items-center'}>{val ?? ''}</span>;

  const handleSearch = async () => {
    await loadDaumPostcode();
    new window.daum.Postcode({
      oncomplete(data) {
        const addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
        if (aliases.zipcode) onChange(aliases.zipcode, data.zonecode);
        onChange(aliases.address, addr);
        if (aliases.detail)  onChange(aliases.detail, '');
      },
    }).open();
  };

  return (
    <div className="flex items-center h-full gap-1 pr-1">
      <input className={inputCls + ' flex-1 min-w-0'} type="text" value={val ?? ''} readOnly
        placeholder="우편번호 검색 버튼을 누르세요" />
      <button type="button"
        className="h-btn-sm px-2.5 rounded border border-border-base bg-surface-2 text-secondary text-xs cursor-pointer hover:bg-surface hover:text-primary transition-colors flex-shrink-0 whitespace-nowrap"
        onClick={handleSearch}
      >우편번호 검색</button>
    </div>
  );
}

/**
 * table_XXX_qnYYY 패턴에서 valueAlias(XXX) 추출
 * 예: table_auth_code_qnkname → 'auth_code'
 *     table_new_gidx_qngname → 'new_gidx'
 */
function parseQnAlias(alias) {
  if (!alias.startsWith('table_')) return null;
  const inner = alias.slice('table_'.length);          // position_codeQnkname
  // Qn (대문자) 또는 _qn (소문자) 모두 지원
  let idx = inner.indexOf('Qn');
  if (idx <= 0) idx = inner.indexOf('_qn');
  if (idx <= 0) return null;
  // Qn 앞에 _ 가 있으면 제거
  let val = inner.slice(0, idx);
  if (val.endsWith('_')) val = val.slice(0, -1);
  return val;                                          // position_code
}

function renderInput(field, val, readOnly, onChange, hRows = 1, gubun = 0, inputPx = 0) {
  const alias   = field.alias_name     ?? '';
  const type    = field.schema_type    ?? 'text';
  const ctlName = field.grid_ctl_name ?? '';
  const maxLen  = parseInt(field.max_length ?? '200', 10) || 200;

  // 객체명(컨트롤)이 없으면 → 읽기전용 텍스트 출력 (입력글수만 있어도 편집 불가)
  if (!ctlName) {
    return <span className="w-full h-full px-2 text-base text-secondary bg-transparent cursor-default flex items-center">{val ?? ''}</span>;
  }
  const items   = field.items ?? '';

  const baseCls = 'w-full h-full px-2 text-base text-primary bg-transparent outline-none border-0';
  const ROCls   = baseCls + ' text-secondary cursor-default';

  const inputCls = readOnly
    ? ROCls
    : baseCls + ' border-b border-accent/30 focus:border-accent transition-colors';

  // attach/image 는 메인 렌더 루프에서 FileAttach 로 처리됨

  if (type === 'dropdownitem' || ctlName === 'dropdownlist' || ctlName === 'dropdownitem') {
    // items(grid_items) 있으면 DropdownItemSelect
    if (items) {
      return (
        <DropdownItemSelect
          gubun={gubun}
          field={field}
          val={val}
          readOnly={readOnly}
          onChange={onChange}
          baseCls={baseCls}
          ROCls={ROCls}
          inputCls={inputCls}
        />
      );
    }
    // prime_key 있으면 동적 조회
    if (field.prime_key) {
      return (
        <DropdownSelect
          gubun={gubun}
          field={field}
          val={val}
          readOnly={readOnly}
          onChange={onChange}
          baseCls={baseCls}
          ROCls={ROCls}
          inputCls={inputCls}
        />
      );
    }
    if (readOnly) return <span className={ROCls + ' flex items-center'}>{val}</span>;
    return <select className={inputCls + ' appearance-none cursor-pointer'} value={val ?? ''} onChange={e => onChange(alias, e.target.value)}><option value="">-- 선택 --</option></select>;
  }

  if (type === 'date' || type === 'datetime') {
    const dv = val ? String(val).slice(0, type === 'date' ? 10 : 16) : '';
    if (readOnly) return <span className={ROCls + ' flex items-center'}>{dv}</span>;
    return (
      <input className={inputCls} type={type === 'date' ? 'date' : 'datetime-local'} value={dv}
        onChange={e => onChange(alias, e.target.value)} />
    );
  }

  if (type === 'boolean') {
    const bChecked = val === 1 || val === '1' || val === true;
    if (readOnly) return <span className={ROCls + ' flex items-center'}>{bChecked ? '1' : '0'}</span>;
    return (
      <div className="flex items-center h-full px-2">
        <input type="checkbox" className="w-4 h-4 cursor-pointer accent-accent"
          checked={bChecked} onChange={e => onChange(alias, e.target.checked ? '1' : '0')} />
      </div>
    );
  }

  // ctlName='check': schema_type에 따라 체크값 결정
  // boolean → 0/1, 그 외 → Y/N
  if (ctlName === 'check') {
    const isBoolean = type === 'boolean';
    const checked   = isBoolean ? (val === 1 || val === '1' || val === true) : (val === 'Y');
    const onVal     = isBoolean ? '1' : 'Y';
    const offVal    = isBoolean ? '0' : 'N';
    const label     = checked ? onVal : offVal;
    if (readOnly) return <span className={ROCls + ' flex items-center'}>{label}</span>;
    return (
      <div className="flex items-center h-full px-2">
        <input type="checkbox" className="w-4 h-4 cursor-pointer accent-accent"
          checked={checked} onChange={e => onChange(alias, e.target.checked ? onVal : offVal)} />
      </div>
    );
  }

  // html 에디터 (웹에디터) — 부모 셀이 할당한 inputPx 를 그대로 사용해 하단 여백 제거
  if (ctlName === 'html') {
    return <HtmlEditor alias={alias} val={val} readOnly={readOnly} onChange={onChange} heightPx={inputPx || hRows * 34} />;
  }

  // zipcode 는 별도 처리 (renderInput 밖에서 처리)
  // → renderInput 에서는 일반 텍스트로 fallback

  const isArea = type === 'content' || ctlName === 'textarea' || hRows > 1 || maxLen > 500;
  if (isArea) {
    const areaCls = readOnly
      ? 'w-full h-full px-2 py-1.5 text-base text-secondary bg-transparent outline-none border-0 cursor-default resize-none'
      : 'w-full h-full px-2 py-1.5 text-base text-primary bg-transparent outline-none border-0 resize-none focus:ring-1 focus:ring-inset focus:ring-accent';
    return (
      <textarea className={areaCls} value={val} readOnly={readOnly}
        maxLength={maxLen} onChange={e => onChange(alias, e.target.value)} />
    );
  }

  if (type === 'number' || type?.startsWith('number')) {
    return (
      <input className={inputCls + ' text-right tabular-nums'} type="text" inputMode="numeric"
        value={val} readOnly={readOnly} maxLength={maxLen} onChange={e => onChange(alias, e.target.value)} />
    );
  }

  return (
    <input className={inputCls} type="text" value={val}
      readOnly={readOnly} maxLength={maxLen} onChange={e => onChange(alias, e.target.value)} />
  );
}
