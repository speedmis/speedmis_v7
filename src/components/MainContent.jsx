import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import { showToast } from './Toast';
import DataGrid from './DataGrid';
import DataForm from './DataForm';
import ChildProgram from './ChildProgram';

const GanttChartFull = lazy(() => import('./GanttChart'));

function copyText(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  else legacyCopy(text);
}
function formatSaveSQL(sql) {
  if (!sql) return sql;
  if (sql.includes('\n')) return sql.trim();
  let s = sql.replace(/\s+/g, ' ').trim();
  s = s
    .replace(/\bSET\b/gi,     '\nSET ')
    .replace(/\bVALUES\b/gi,  '\nVALUES')
    .replace(/\bWHERE\b/gi,   '\nWHERE')
    .replace(/,\s*/g,          ',\n    ');
  return s.trim();
}
function buildCompleteSaveSQL(sql, bindings) {
  if (!bindings?.length) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = bindings[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  });
}
function legacyCopy(text) {
  const el = document.createElement('textarea');
  el.value = text; el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el); el.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(el);
}
const dropItemCls = 'h-btn-sm px-3 w-full text-left text-sm text-secondary hover:bg-surface-2 hover:text-primary rounded cursor-pointer border-0 bg-transparent transition-colors';

async function copyShortUrl(longUrl) {
  try {
    const data = await api.shortUrl(longUrl);
    copyText(data.short_url);
  } catch {
    copyText(longUrl);
  }
  showToast('복사되었습니다');
}

const PANEL_SIZE_KEY  = 'mis_panel_size';
const FORM_SPLIT_KEY  = 'mis_form_split';

function DesignerFloatingPopup({ url, onClose }) {
  const W = 603;
  const H = Math.max(200, window.innerHeight - 100);
  const [pos, setPos] = useState(() => {
    const prog = document.getElementById('mis-program');
    const rect = prog?.getBoundingClientRect();
    return {
      x: 0,
      y: rect ? Math.max(0, rect.top) : 60,
    };
  });
  const dragRef = useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const baseX = pos.x, baseY = pos.y;
    const move = (mv) => {
      const nx = Math.max(0, Math.min(window.innerWidth  - 100, baseX + (mv.clientX - startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 40,  baseY + (mv.clientY - startY)));
      setPos({ x: nx, y: ny });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      ref={dragRef}
      className="fixed z-[200] bg-surface rounded-lg flex flex-col overflow-hidden"
      style={{
        left: pos.x, top: pos.y, width: W, height: H,
        border: '3px solid var(--color-primary)',
        boxShadow: '0 0 0 4px rgba(79,110,247,0.25), 0 20px 50px rgba(0,0,0,0.35)',
      }}
    >
      <div
        onMouseDown={onMouseDown}
        className="flex items-center justify-between px-3 py-2 flex-shrink-0 cursor-move select-none"
        style={{ background: 'var(--color-primary)', color: '#fff' }}
      >
        <span className="text-sm font-bold" style={{ color: '#fff' }}>뷰 디자이너</span>
        <button
          className="h-btn-sm px-2 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >✕</button>
      </div>
      <iframe
        src={url}
        className="flex-1 w-full border-0"
        title="뷰 디자이너"
      />
    </div>
  );
}

function PanelMoreMenu({ currentLinkVal, menu, devMode, user, onOpenDesigner }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, right: 0 });
  const btnRef  = useRef(null);
  const popRef  = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(v => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        id="mis-panel-more"
        className="w-7 h-btn-sm flex items-center justify-center rounded border border-border-base bg-surface text-secondary text-xs cursor-pointer hover:bg-surface-2 hover:text-primary transition-colors"
        onClick={handleToggle}
      >&#8943;</button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}
          className="min-w-[140px] rounded-lg border border-border-light bg-surface shadow-pop py-1.5 modal-box"
        >
          {currentLinkVal != null && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-primary bg-transparent border-0 hover:bg-surface-2 cursor-pointer transition-colors"
              onClick={() => {
                const p = new URLSearchParams(window.location.search);
                p.set('idx', String(currentLinkVal));
                copyShortUrl(window.location.origin + window.location.pathname + '?' + p.toString());
                setOpen(false);
              }}
            >URL 복사</button>
          )}
          {devMode && menu?.menu_type === '01' && menu?.real_pid && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-primary bg-transparent border-0 hover:bg-surface-2 cursor-pointer transition-colors"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mis:openTab', {
                  detail: { gubun: 266, label: `웹소스 (${menu.real_pid})`, idx: menu.real_pid, linkVal: menu.real_pid, openFull: true }
                }));
                setOpen(false);
              }}
            >웹소스 열기</button>
          )}
          {(user?.is_admin === 'Y' || devMode) && menu?.real_pid && (
            <>
              <div className="h-px bg-border-base my-0.5" />
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-primary bg-transparent border-0 hover:bg-surface-2 cursor-pointer transition-colors"
                onClick={() => {
                  const rp = menu.real_pid;
                  const filter = encodeURIComponent(JSON.stringify([
                    { field: 'toolbar_table_real_pidQnreal_pid', operator: 'eq', value: rp },
                    { field: 'toolbar_znaeyongnochulyeobu',      operator: 'eq', value: 'Y' },
                  ]));
                  const url = `/?gubun=1333&isPopup=Y&psize=200&allFilter=${filter}`;
                  onOpenDesigner?.(url);
                  setOpen(false);
                }}
              >뷰 디자이너</button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function MainContent({ gubun, user, openIdx = null, openLinkVal = null, openFull = false, onOpenTab }) {
  const [menu, setMenu]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const [panelOpen, setPanelOpen]   = useState(false);
  const [panelSize, setPanelSize]   = useState(() => {
    const saved = parseInt(localStorage.getItem(PANEL_SIZE_KEY) ?? '3', 10);
    // 4(전체화면)이면 3으로 조정 — 새 프로그램 열 때 목록이 보여야 함
    if (saved === 4) return 3;
    return [1,2,3].includes(saved) ? saved : 3;
  });
  const [currentIdx, setCurrentIdx]         = useState(0);
  const [currentLinkVal, setCurrentLinkVal] = useState(null);
  const [panelMode, setPanelMode]           = useState('view');
  const currentIdxRef = useRef(currentIdx);
  currentIdxRef.current = currentIdx;
  const panelOpenRef = useRef(false);
  panelOpenRef.current = panelOpen;

  const [gridReloadKey, setGridReloadKey] = useState(0);
  const [formReloadKey, setFormReloadKey] = useState(0);
  const [onlyList,      setOnlyList]      = useState(false);
  const [clientCss,     setClientCss]     = useState(null);
  const [buttonText,    setButtonText]    = useState({});
  const [customButtons, setCustomButtons] = useState([]);
  const [briefPopup, setBriefPopup] = useState(null); // { minIdx, count }
  const [designerUrl, setDesignerUrl] = useState(null);
  const [designerWidth, setDesignerWidth] = useState(null); // 뷰 디자이너에서 지정한 폼 폭(px). null=자동

  // 뷰 디자이너 iframe → 부모창 폼 폭 강제 지정용 글로벌 노출
  useEffect(() => {
    window.__misSetDesignerWidth = (px) => {
      if (px === null || px === undefined) setDesignerWidth(null);
      else setDesignerWidth(parseInt(px, 10));
    };
    // 디자인 적용 후 부모창 전체 새로고침 없이 그리드/폼만 다시 로드
    window.__misRefreshProgram = () => {
      setGridReloadKey(k => k + 1);
      setFormReloadKey(k => k + 1);
    };
    return () => {
      delete window.__misSetDesignerWidth;
      delete window.__misRefreshProgram;
    };
  }, []);

  // 4/3/2/1 버튼(= panelSize 변경) 클릭 시 디자이너 오버라이드 해제
  useEffect(() => { setDesignerWidth(null); }, [panelSize]);

  const [gridSqlVisible, setGridSqlVisible] = useState(false);
  const [gridSqlError,   setGridSqlError]   = useState(false);
  const [formSqlVisible, setFormSqlVisible] = useState(false);
  const [saveSqlData,    setSaveSqlData]    = useState(null);
  const [saveSqlOpen,    setSaveSqlOpen]    = useState(false);
  const gridSqlOpenRef = useRef(null);
  const formSqlOpenRef = useRef(null);
  const handleGridSqlBtn = useCallback((visible, openFn, hasError = false) => {
    setGridSqlVisible(visible);
    setGridSqlError(hasError);
    if (openFn) gridSqlOpenRef.current = openFn;
  }, []);
  const handleFormSqlBtn = useCallback((visible, openFn) => {
    setFormSqlVisible(visible);
    if (openFn) formSqlOpenRef.current = openFn;
  }, []);
  const handleSaveSql = useCallback((sqlData) => {
    setSaveSqlData(sqlData);
  }, []);

  const gridRef  = useRef(null);
  const moreRef  = useRef(null);
  const [moreOpen,      setMoreOpen]      = useState(false);
  const [devMode,       setDevMode]       = useState(() => localStorage.getItem('mis_dev_mode') === '1');
  // 설정 패널에서 변경 시 실시간 반영
  useEffect(() => {
    const h = () => setDevMode(localStorage.getItem('mis_dev_mode') === '1');
    window.addEventListener('storage', h);
    // 같은 탭 내 변경도 감지 (커스텀 이벤트)
    window.addEventListener('mis:settingsChanged', h);
    return () => { window.removeEventListener('storage', h); window.removeEventListener('mis:settingsChanged', h); };
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const handler = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const [allTabs,       setAllTabs]       = useState([{ type: 'form', label: '기본폼' }]);
  const [formActiveTab, setFormActiveTab] = useState('기본폼');

  // ── 좌우 분할 상태 ──────────────────────────────────────────────────────────
  const [formSplit,      setFormSplit]      = useState(() => localStorage.getItem(FORM_SPLIT_KEY) === '1');
  const [formSplitRatio, setFormSplitRatio] = useState(0.5);
  // case1: 우측 child 활성 gubun / case2: 우측 폼 탭 활성
  const [splitRightChildGubun,  setSplitRightChildGubun]  = useState(null);
  const [splitRightActiveGroup, setSplitRightActiveGroup] = useState(null);
  const splitAreaRef = useRef(null);

  // 분할 드래그 핸들러
  const handleSplitDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    const el = splitAreaRef.current;
    if (!el) return;
    const onMove = (mv) => {
      const rect = el.getBoundingClientRect();
      const ratio = (mv.clientX - rect.left) / rect.width;
      setFormSplitRatio(Math.max(0.15, Math.min(0.85, ratio)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPanelOpen(false);
    api.menuItem(gubun)
      .then(data => {
        if (cancelled) return;
        setMenu(data.data);
        setLoading(false);
        const urlParams    = new URLSearchParams(window.location.search);
        const urlActionFlag = urlParams.get('actionFlag') ?? '';
        // only_one_list: 리스트 없이 최근 1건 자동 로드
        if (data.data?.g01 === 'only_one_list') {
          api.list(gubun, { pageSize: 1, page: 1 }).then(listRes => {
            if (cancelled) return;
            const rows = listRes.data ?? [];
            if (rows.length > 0) {
              const pk = rows[0].idx ?? rows[0][Object.keys(rows[0])[0]];
              setCurrentIdx(pk);
              setCurrentLinkVal(pk);
              setPanelMode('modify');
              setPanelSize(4);
              setPanelOpen(true);
            } else {
              setCurrentIdx(0);
              setPanelMode('write');
              setPanelSize(4);
              setPanelOpen(true);
            }
          }).catch(() => {});
          return;
        }

        if (urlActionFlag === 'write') {
          setCurrentIdx(0);
          setPanelMode('write');
          setPanelSize(4);
          setPanelOpen(true);
        } else if (openIdx != null) {
          const pk = typeof openIdx === 'string' && /^\d+$/.test(openIdx) ? Number(openIdx) : openIdx;
          setCurrentIdx(pk);
          setCurrentLinkVal(openLinkVal != null ? String(openLinkVal) : String(openIdx));
          setPanelSize(openFull ? 4 : panelSize);
          setPanelMode(urlActionFlag === 'modify' ? 'modify' : 'view');
          setPanelOpen(true);
        } else {
          const urlIdx = urlParams.get('idx');
          if (urlIdx) {
            const pk = /^\d+$/.test(urlIdx) ? Number(urlIdx) : urlIdx;
            setCurrentIdx(pk);
            setCurrentLinkVal(urlIdx);
            setPanelSize(4);
            setPanelMode(urlActionFlag === 'modify' ? 'modify' : 'view');
            setPanelOpen(true);
          }
        }
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [gubun]);

  // 인쇄양식 HTML
  const [printHtml, setPrintHtml]       = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  const isPrintMode = (menu?.is_use_print == '1' || menu?.is_use_print === 1);

  const loadPrintHtml = useCallback((idx) => {
    setPrintLoading(true);
    setPrintHtml(null);
    api.view(gubun, idx).then(res => {
      setPrintHtml(res.printHtml || '<p class="text-muted text-center py-10">인쇄양식이 없습니다.</p>');
    }).catch(e => {
      setPrintHtml(`<p style="color:red">오류: ${e.message}</p>`);
    }).finally(() => setPrintLoading(false));
  }, [gubun]);

  const panelModeRef = useRef(panelMode);
  panelModeRef.current = panelMode;

  const handleToggleView = useCallback((pk, linkVal, forceOpen = false) => {
    if (onlyList) return;
    const isSame = String(currentIdxRef.current) === String(pk);

    // is_use_print=1 이면 우측 패널에 인쇄양식 표시
    if (isPrintMode) {
      if (!forceOpen && panelOpenRef.current && panelModeRef.current === 'view' && isSame) {
        setPanelOpen(false);
        return;
      }
      if (window.innerWidth <= 768) setPanelSize(4);
      setCurrentIdx(pk);
      setCurrentLinkVal(linkVal ?? pk);
      setPanelMode('view');
      setPanelOpen(true);
      setFormActiveTab('__print__');
      loadPrintHtml(pk);
      return;
    }

    if (!forceOpen && panelOpenRef.current && panelModeRef.current === 'view' && isSame) {
      setPanelOpen(false);
    } else {
      if (window.innerWidth <= 768) setPanelSize(4);
      setCurrentIdx(pk);
      setCurrentLinkVal(linkVal ?? pk);
      setPanelMode('view');
      setPanelOpen(true);
    }
  }, [onlyList, isPrintMode, loadPrintHtml]);

  const handlePanelSizeClick = useCallback((size, rowPk, rowLinkVal) => {
    const effectiveSize = window.innerWidth <= 768 ? 4 : size;
    if (panelOpen && panelSize === effectiveSize) {
      // 같은 사이즈 재클릭 → 토글(닫기)
      setPanelOpen(false);
    } else if (panelOpen) {
      // 열린 상태에서 다른 사이즈 → 사이즈만 변경
      setPanelSize(effectiveSize);
      localStorage.setItem(PANEL_SIZE_KEY, String(effectiveSize));
    } else {
      // 닫힌 상태에서 클릭 → 열기
      setPanelSize(effectiveSize);
      localStorage.setItem(PANEL_SIZE_KEY, String(effectiveSize));
      if (rowPk) { setCurrentIdx(rowPk); setCurrentLinkVal(rowLinkVal ?? rowPk); }
      setPanelMode('view');
      setPanelOpen(true);
    }
  }, [panelOpen, panelSize]);

  const openModify = useCallback((idx, linkVal) => {
    if (panelOpenRef.current && panelModeRef.current === 'modify' && String(currentIdxRef.current) === String(idx)) {
      setPanelOpen(false);
      return;
    }
    if (window.innerWidth <= 768) setPanelSize(4);
    setCurrentIdx(idx);
    if (linkVal !== undefined) setCurrentLinkVal(linkVal);
    setPanelMode('modify');
    setPanelOpen(true);
  }, []);

  const openWrite = useCallback(() => {
    setCurrentIdx(0);
    setPanelMode('write');
    setPanelOpen(true);
  }, []);

  const handleSaved = useCallback((newIdx) => {
    if (newIdx) setCurrentIdx(newIdx);
    if (menu?.g01 === 'only_one_list') {
      setPanelMode('modify');
      setGridReloadKey(k => k + 1);
      return;
    }
    setPanelMode('view');
    setGridReloadKey(k => k + 1);
  }, [menu]);

  const handleCancel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleFormModify = useCallback(() => {
    setPanelMode('modify');
  }, []);

  const handleDeleted = useCallback(() => {
    setPanelOpen(false);
    setGridReloadKey(k => k + 1);
  }, []);

  // gubun 변경 시: 탭 전체 초기화
  useEffect(() => {
    setAllTabs([{ type: 'form', label: '기본폼' }]);
    setFormActiveTab('기본폼');
    setSplitRightChildGubun(null);
    setSplitRightActiveGroup(null);
    setSaveSqlData(null);
  }, [gubun]);

  // panelMode 변경 시: 활성 탭만 기본폼으로 (child 탭 목록은 유지)
  useEffect(() => {
    setFormActiveTab(prev => prev.startsWith('child-') ? '기본폼' : prev);
  }, [panelMode]);

  // 등록 모드에서는 분할 자동 해제 (view/modify 복귀 시 저장값 복원)
  useEffect(() => {
    if (panelMode === 'write') setFormSplit(false);
    else setFormSplit(localStorage.getItem(FORM_SPLIT_KEY) === '1');
  }, [panelMode]);

  // 분할 시 우측 child 초기화 — hooks는 반드시 early return 전에 선언
  useEffect(() => {
    const ct = allTabs.filter(t => t.type === 'child' && t.gubun > 0);
    if (formSplit && ct.length > 0 && !splitRightChildGubun) {
      setSplitRightChildGubun(ct[0].gubun);
    }
  }, [formSplit, allTabs, splitRightChildGubun]);

  // child 탭 카운트 — view/modify 모드에서 parent_idx로 각 child gubun의 건수 조회
  const [childCounts, setChildCounts] = useState({});
  useEffect(() => {
    const ct = allTabs.filter(t => t.type === 'child' && t.gubun > 0);
    if (ct.length === 0 || currentIdx <= 0 || (panelMode !== 'view' && panelMode !== 'modify')) {
      setChildCounts({});
      return;
    }
    let cancelled = false;
    Promise.all(
      ct.map(t =>
        api.list(t.gubun, { parent_idx: currentLinkVal ?? currentIdx, pageSize: 1 })
          .then(d => [t.gubun, d.total ?? 0])
          .catch(() => [t.gubun, null])
      )
    ).then(results => {
      if (cancelled) return;
      setChildCounts(Object.fromEntries(results));
    });
    return () => { cancelled = true; };
  }, [allTabs, currentIdx, panelMode]);

  const handleOpenTab = useCallback((pk, linkVal) => {
    onOpenTab?.(pk, linkVal, menu?.menu_name ?? String(gubun));
  }, [onOpenTab, menu, gubun]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-muted text-base">로딩 중...</div>
  );
  if (error) return (
    <div className="flex-1 flex items-center justify-center text-danger text-base">{error}</div>
  );
  if (!menu) return (
    <div className="flex-1 flex items-center justify-center text-muted text-base">메뉴 정보를 찾을 수 없습니다.</div>
  );

  const menuName    = menu.menu_name ?? '';
  const isSimpleList  = menu.g01 === 'simple_list';    // 목록+수정만 (등록/삭제 없음)
  const isOnlyOneList = menu.g01 === 'only_one_list';   // 리스트 없이 최근 1건만
  const isGanttMode   = menu.g01 === 'gantt';           // 간트차트 전용
  const detailPct  = { 1: 25, 2: 50, 3: 75, 4: 100 }[panelSize];
  const gridPct    = 100 - detailPct;
  const showGrid   = !isOnlyOneList && (!panelOpen || panelSize < 4 || onlyList);
  const showDetail = isOnlyOneList || (panelOpen && !onlyList);

  // ── allTabs 파생 (early return 이후는 파생값만, hooks 없음) ─────────────────
  const childTabs      = allTabs.filter(t => t.type === 'child' && t.gubun > 0);
  const formGroupTabs  = allTabs.filter(t => t.type === 'form');
  const hasChildren    = childTabs.length > 0;
  // 분할 가능 조건: view/modify 모드 + 우측에 보여줄 내용이 있을 때 (child 탭 OR 2개 이상 form 그룹)
  const canSplit       = (panelMode === 'view' || panelMode === 'modify') && (hasChildren || formGroupTabs.length > 1);

  // 분할 탭 클릭 처리
  function handleTabClick(t, tabKey) {
    if (formSplit) {
      if (t.type === 'child') {
        // 우측 child 전환
        setSplitRightChildGubun(t.gubun);
      } else {
        // form 탭: 어느 쪽 DataForm을 스크롤할지 결정
        if (!hasChildren && formGroupTabs.length > 1 && formGroupTabs[0]?.label !== t.label) {
          // 우측 DataForm 그룹
          setSplitRightActiveGroup(t.label);
        } else {
          // 좌측 DataForm 그룹
          setFormActiveTab(tabKey);
        }
      }
    } else {
      setFormActiveTab(tabKey);
    }
  }

  // 좌우 분할용 그룹 목록
  const leftFilterGroups  = hasChildren
    ? null  // case1: 좌측 = 전체 form 그룹 (null = 필터 없음)
    : formGroupTabs.length > 0 ? [formGroupTabs[0].label] : null; // case2: 기본폼만
  const rightFilterGroups = hasChildren
    ? null  // case1: 우측 = ChildProgram (DataForm 아님)
    : formGroupTabs.slice(1).map(t => t.label); // case2: 나머지 form 그룹

  return (
    <div id="mis-program" className="flex flex-col h-full overflow-hidden p-4 gap-0">
      {clientCss && <style dangerouslySetInnerHTML={{ __html: clientCss }} />}
      <div className="flex flex-col flex-1 overflow-hidden bg-surface rounded border border-border-base">
        {/* 헤더 바 */}
        <div id="mis-header" className="flex items-center justify-between px-4 py-2 border-b border-border-base flex-shrink-0">
          <h2 id="mis-title" className="text-md font-bold text-primary"
              title={devMode ? `real_pid: ${menu?.real_pid ?? ''}\nmenu_type: ${menu?.menu_type ?? ''}\ntable: ${menu?.table_name ?? ''}` : undefined}
          >{menuName}</h2>
          <div id="mis-header-actions" className="flex items-center gap-2">
            {(gridSqlVisible || gridSqlError) && !isOnlyOneList && !isGanttMode && (
              <button
                className={`h-btn-sm px-3 rounded border border-solid text-xs font-semibold cursor-pointer transition-colors ${
                  gridSqlError
                    ? 'border-danger bg-danger-dim text-danger hover:bg-danger-dim'
                    : 'border-border-base bg-surface text-link hover:bg-surface-2'
                }`}
                onClick={() => gridSqlOpenRef.current?.()}
              >목록쿼리{gridSqlError ? ' ⚠' : ''}</button>
            )}
            {formSqlVisible && (
              <button
                className="h-btn-sm px-3 rounded border border-solid border-border-base bg-surface text-link text-xs font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
                onClick={() => formSqlOpenRef.current?.()}
              >조회쿼리</button>
            )}
            {saveSqlData && (
              <button
                className="h-btn-sm px-3 rounded border border-solid border-border-base bg-surface text-link text-xs font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
                onClick={() => setSaveSqlOpen(true)}
              >저장쿼리</button>
            )}
            <button
              id="mis-btn-reset"
              className="h-btn-sm px-2 rounded border border-border-base bg-surface text-secondary text-xs cursor-pointer hover:bg-surface-2 hover:text-primary transition-colors"
              onClick={() => { gridRef.current?.reset?.(); setPanelOpen(false); }}
            >{buttonText.reset ?? '초기화'}</button>
            {/* 사용자 정의 버튼 */}
            {customButtons.map((btn, i) => (
              <button
                key={i}
                id={`mis-btn-custom-${i}`}
                className="h-btn-sm px-3 rounded border border-accent bg-accent-dim text-accent text-sm font-semibold cursor-pointer hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  window.__mis_custom_action = btn.action ?? btn.label;
                  setGridReloadKey(k => k + 1);
                }}
              >{btn.label}</button>
            ))}
            {/* 선택삭제 */}
            {!isSimpleList && !onlyList && (
              <button
                id="mis-btn-bulk-delete"
                className="h-btn-sm px-3 rounded border border-danger bg-surface text-danger text-xs font-semibold cursor-pointer hover:bg-danger hover:text-white transition-colors"
                onClick={() => gridRef.current?.bulkDelete?.()}
              >선택삭제</button>
            )}
            {/* 간편추가 */}
            {menu?.brief_insert_sql && !isSimpleList && !onlyList && (
              <select
                id="mis-brief-insert"
                className="h-btn-sm px-1 rounded border border-border-base bg-surface text-secondary text-xs cursor-pointer"
                value=""
                onChange={async (e) => {
                  const count = parseInt(e.target.value);
                  e.target.value = '';
                  if (!count) return;
                  try {
                    const res = await api.briefInsert(gubun, count);
                    if (res.success && res.ids?.length > 0) {
                      showToast(res.message);
                      const minIdx = Math.min(...res.ids);
                      setBriefPopup({ minIdx, count });
                    } else { showToast(res.message || '실패'); }
                  } catch (ex) { showToast(ex.message || '간편추가 실패'); }
                }}
              >
                <option value="">간편추가</option>
                <option value="1">1줄 추가</option>
                <option value="2">2줄 추가</option>
                <option value="3">3줄 추가</option>
                <option value="5">5줄 추가</option>
                <option value="10">10줄 추가</option>
                <option value="50">50줄 추가</option>
              </select>
            )}
            {menu?.g07 !== 'Y' && !onlyList && !isSimpleList && !isOnlyOneList && (
              <button
                id="mis-btn-write"
                className="h-btn-sm px-3 rounded bg-accent text-white text-sm border-0 cursor-pointer hover:bg-accent-hover transition-colors"
                onClick={openWrite}
              >{buttonText.write ?? '+ 등록'}</button>
            )}
            <div ref={moreRef} className="relative">
              <button
                className={[
                  'w-8 h-btn-sm text-base rounded border border-solid cursor-pointer transition-colors leading-none',
                  moreOpen
                    ? 'bg-surface-2 border-border-base text-primary'
                    : 'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
                ].join(' ')}
                onClick={() => setMoreOpen(v => !v)}
                title="더보기"
              >···</button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-max flex flex-col gap-0.5 p-1.5 rounded-lg border border-border-light bg-surface shadow-pop modal-box">
                  <button className={dropItemCls} onClick={() => { gridRef.current?.downloadExcel(); setMoreOpen(false); }}>엑셀다운로드</button>
                  <button className={dropItemCls} onClick={() => { gridRef.current?.print(); setMoreOpen(false); }}>목록인쇄</button>
                  <div className="h-px bg-border-base my-0.5" />
                  <button className={dropItemCls} onClick={() => { const u = gridRef.current?.getCurrentUrl(); if (u) copyShortUrl(window.location.origin + u); setMoreOpen(false); }}>URL복사</button>
                  <button className={dropItemCls} onClick={() => { const u = gridRef.current?.getCurrentUrl(); if (u) window.location.href = u; setMoreOpen(false); }}>다시열기</button>
                  <button className={dropItemCls} onClick={() => { const u = gridRef.current?.getCurrentUrl(); if (u) window.open(u, '_blank'); setMoreOpen(false); }}>새창</button>
                  {devMode && menu?.menu_type === '01' && menu?.real_pid && (
                    <>
                      <div className="h-px bg-border-base my-0.5" />
                      <button
                        className={dropItemCls}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('mis:openTab', {
                            detail: { gubun: 266, label: `웹소스 (${menu.real_pid})`, idx: menu.real_pid, linkVal: menu.real_pid, openFull: true }
                          }));
                          setMoreOpen(false);
                        }}
                      >해당 웹소스 열기</button>
                    </>
                  )}
                  {localStorage.getItem('mis_view_pref') === 'custom' && (
                    <>
                      <div className="h-px bg-border-base my-0.5" />
                      <button className={dropItemCls + (localStorage.getItem(`mis_view_pref_${gubun}`) === 'list' ? ' text-link font-semibold' : '')}
                        onClick={() => {
                          const cur = localStorage.getItem(`mis_view_pref_${gubun}`);
                          const next = cur === 'list' ? 'auto' : 'list';
                          localStorage.setItem(`mis_view_pref_${gubun}`, next);
                          setMoreOpen(false);
                          showToast(next === 'list' ? '이 프로그램: 목록만 먼저' : '이 프로그램: 내용 자동열림');
                        }}
                      >{localStorage.getItem(`mis_view_pref_${gubun}`) === 'list' ? '✓ 목록만 먼저' : '목록만 먼저'}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 간트차트 전용 모드 */}
        {isGanttMode && (
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted text-sm">간트차트 로딩 중...</div>}>
              <GanttChartFull gubun={gubun} menu={menu} />
            </Suspense>
          </div>
        )}

        {/* 분할 콘텐츠 영역 */}
        <div className={['flex flex-1 overflow-hidden min-h-0', isGanttMode ? 'hidden' : ''].join(' ')}>
          {/* 그리드 영역 (size=4에서도 언마운트하지 않고 숨김 → auto-open ref 유지) */}
            <div
              id="mis-grid-wrap"
              className={['flex flex-col overflow-hidden min-w-0 transition-[width] duration-200 border-r border-solid',
                showDetail ? 'border-border-base' : 'border-transparent',
                !showGrid ? 'hidden' : '',
              ].join(' ')}
              style={
                designerWidth != null && showDetail
                  ? { width: `calc(100% - ${designerWidth}px)`, flex: '1 1 auto' }
                  : { width: showDetail ? `${gridPct}%` : '100%' }
              }
            >
              <DataGrid
                key={gridReloadKey}
                ref={gridRef}
                gubun={gubun}
                user={user}
                menu={menu}
                onToggleView={handleToggleView}
                onModify={menu?.g07 === 'Y' || onlyList ? null : openModify}
                onOnlyList={setOnlyList}
                onClientMeta={(meta) => {
                  if (meta.css) setClientCss(meta.css);
                  if (meta.buttonText) setButtonText(meta.buttonText);
                  if (meta.buttons) setCustomButtons(meta.buttons);
                  if (meta.js) {
                    try { new Function(meta.js)(); }
                    catch (ex) { console.error('[_client_js]', ex); }
                  }
                }}
                panelOpen={panelOpen}
                panelSize={panelSize}
                onPanelSizeClick={handlePanelSizeClick}
                onPanelClose={() => setPanelOpen(false)}
                currentIdx={currentIdx}
                onOpenTab={handleOpenTab}
                onSqlBtn={handleGridSqlBtn}
                devMode={devMode}
              />
            </div>

          {/* 내용/수정 패널 */}
          {showDetail && (
            <div
              id="mis-form-wrap"
              className="flex flex-col overflow-hidden min-w-0 transition-[width] duration-200 panel-animate"
              style={
                designerWidth != null
                  ? { width: `${designerWidth}px`, flex: `0 0 ${designerWidth}px` }
                  : { width: panelSize === 4 ? '100%' : `${detailPct}%` }
              }
            >
              {/* 패널 헤더 */}
              <div className="flex items-stretch border-b border-solid border-border-base flex-shrink-0 bg-surface h-[38px]">
                {/* 좌측: 모드 레이블 + 탭 버튼 */}
                <div className="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-hide">
                  {(panelMode === 'write' || panelMode === 'modify') && (
                    <span className="px-3 flex items-center text-xs font-semibold text-secondary border-r border-solid border-border-base whitespace-nowrap flex-shrink-0">
                      {panelMode === 'write' ? '등록' : '수정'}
                    </span>
                  )}
                  {/* 인쇄폼 탭 (is_use_print=1 + view 모드) */}
                  {isPrintMode && panelMode === 'view' && (
                    <button
                      type="button"
                      className={[
                        'px-3 flex items-center text-sm font-semibold border-r border-solid border-border-base transition-colors cursor-pointer whitespace-nowrap flex-shrink-0',
                        formActiveTab === '__print__' ? 'bg-surface-2 text-link' : 'bg-transparent text-tab-inactive hover:text-secondary',
                      ].join(' ')}
                      onClick={() => setFormActiveTab('__print__')}
                    >🖨 인쇄폼</button>
                  )}
                  {allTabs
                    .filter(t => t.type === 'form' || ((panelMode === 'view' || panelMode === 'modify') && t.gubun > 0))
                    .map(t => {
                      const tabKey = t.type === 'form' ? t.label : `child-${t.gubun}`;
                      // 분할 모드에서 우측 child 탭 활성 표시
                      const isActive = formSplit
                        ? (t.type === 'child'
                            ? t.gubun === splitRightChildGubun
                            : (!hasChildren && formGroupTabs[0]?.label !== t.label
                                ? t.label === splitRightActiveGroup
                                : formActiveTab === tabKey))
                        : formActiveTab === tabKey;
                      return (
                        <button
                          key={tabKey}
                          type="button"
                          className={[
                            'px-3 flex items-center text-sm font-semibold border-r border-solid border-border-base transition-colors cursor-pointer whitespace-nowrap flex-shrink-0',
                            isActive ? 'bg-surface-2 text-link' : 'bg-transparent text-tab-inactive hover:text-secondary',
                            // 분할 모드에서 우측 탭은 약간 다른 스타일
                            formSplit && t.type === 'child' ? 'border-l border-l-accent' : '',
                            formSplit && !hasChildren && t.type === 'form' && formGroupTabs[0]?.label !== t.label
                              ? 'border-l border-l-accent' : '',
                          ].join(' ')}
                          onClick={() => handleTabClick(t, tabKey)}
                        >
                          {/* 분할 모드에서 우측 탭에 작은 R 뱃지 */}
                          {formSplit && (t.type === 'child' || (!hasChildren && t.type === 'form' && formGroupTabs[0]?.label !== t.label)) && (
                            <span className="mr-1 text-[9px] font-bold text-accent opacity-60">R</span>
                          )}
                          {t.label}
                          {/* child 탭 건수 뱃지 */}
                          {t.type === 'child' && childCounts[t.gubun] != null && (
                            <span className={[
                              'ml-1.5 px-1.5 py-0 rounded-full text-[10px] font-bold leading-[16px] tabular-nums flex-shrink-0',
                              isActive
                                ? 'bg-accent text-white'
                                : 'bg-surface-2 text-secondary border border-border-base',
                            ].join(' ')}>
                              {childCounts[t.gubun] >= 100 ? '99+' : childCounts[t.gubun]}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
                {/* 우측: ⋯ 메뉴 + 분할버튼 + 크기 버튼 */}
                <div className="flex items-center gap-1 px-2 flex-shrink-0">
                  {panelMode !== 'write' && (
                    <PanelMoreMenu
                      currentLinkVal={currentLinkVal}
                      menu={menu}
                      devMode={devMode}
                      user={user}
                      onOpenDesigner={(url) => setDesignerUrl(url)}
                    />
                  )}
                  {/* 좌우 분할 토글 + 사이즈 버튼 — only_one_list에서는 숨김 */}
                  {!isOnlyOneList && (<>
                  <span className="text-border-base mx-0.5 select-none text-xs">|</span>
                  <button
                    title={formSplit ? '분할 해제' : '좌우 분할 보기'}
                    disabled={!canSplit}
                    className={[
                      'w-7 h-btn-sm flex items-center justify-center rounded border border-solid cursor-pointer transition-colors',
                      formSplit
                        ? 'bg-accent border-accent text-white'
                        : 'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
                      !canSplit ? 'opacity-40 cursor-not-allowed' : '',
                    ].join(' ')}
                    onClick={() => {
                      if (!canSplit) return;
                      const next = !formSplit;
                      setFormSplit(next);
                      localStorage.setItem(FORM_SPLIT_KEY, next ? '1' : '0');
                      if (next) {
                        if (formActiveTab.startsWith('child-')) setFormActiveTab('기본폼');
                        setSplitRightActiveGroup(null);
                      }
                    }}
                  >
                    <PanelSplitIcon active={formSplit} />
                  </button>

                  <span className="text-border-base mx-0.5 select-none text-xs">|</span>
                  </>)}
                  {!isOnlyOneList && (isMobile ? (
                    <button
                      className={panelSizeCls}
                      onClick={() => setPanelOpen(false)}
                    >닫기</button>
                  ) : (
                    [4, 3, 2, 1].map(size => (
                      <button
                        key={size}
                        id={`mis-panel-size-${size}`}
                        className={panelSize === size ? panelSizeActiveCls : panelSizeCls}
                        onClick={() => {
                          if (panelSize === size) {
                            setPanelOpen(false);
                          } else {
                            setPanelSize(size);
                            localStorage.setItem(PANEL_SIZE_KEY, String(size));
                          }
                        }}
                      >{size}</button>
                    ))
                  ))}
                </div>
              </div>

              {/* ── 패널 콘텐츠 ── */}
              {/* 인쇄폼 탭 */}
              {formActiveTab === '__print__' ? (
                <div className="flex-1 overflow-auto">
                  {printLoading ? (
                    <div className="p-10 text-center text-muted">인쇄양식 로딩 중...</div>
                  ) : printHtml ? (
                    <div className="p-4">
                      <div
                        className="print-content text-sm"
                        data-theme="light"
                        style={{ fontFamily: 'Pretendard, sans-serif', background: '#fff', color: '#191F28', borderRadius: 8, padding: 16 }}
                        dangerouslySetInnerHTML={{ __html: printHtml }}
                      />
                      <div className="flex gap-2 mt-6 border-t border-border-base pt-4">
                        <button
                          type="button"
                          className="h-btn px-5 rounded bg-accent text-white text-sm border-0 cursor-pointer hover:bg-accent-hover transition-colors"
                          onClick={() => {
                            const w = window.open('', '_blank', 'width=900,height=700');
                            if (!w) return;
                            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${menu?.menu_name ?? ''} - 인쇄</title>
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
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : formSplit && canSplit ? (
                /* ── 분할 모드 ── */
                <div ref={splitAreaRef} className="flex flex-1 min-h-0 overflow-hidden">
                  {/* 좌측 패널: form 그룹 */}
                  <div
                    className="overflow-auto p-4 min-w-0 flex-shrink-0"
                    style={{ width: `${formSplitRatio * 100}%` }}
                  >
                    <DataForm
                      key={`${gubun}-${currentIdx}-${panelMode}-${formReloadKey}-left`}
                      gubun={gubun}
                      idx={currentIdx}
                      mode={menu?.g07 === 'Y' ? 'view' : panelMode}
                      user={user}
                      onSaved={handleSaved}
                      onCancel={handleCancel}
                      onModify={handleFormModify}
                      onDelete={handleDeleted}
                      menuReadOnly={menu?.g07 === 'Y'}
                      activeTab={formActiveTab}
                      onTabChange={setFormActiveTab}
                      filterGroups={leftFilterGroups}
                      onTabsChange={async (tabs) => {
                        const resolved = await Promise.all(tabs.map(async t => {
                          if (t.type !== 'child') return t;
                          try {
                            const d = await api.menuItemByRealPid(t.realPid);
                            const gid = d.data?.idx ?? 0;
                            return gid > 0 ? { ...t, gubun: gid } : null;
                          } catch { return null; }
                        }));
                        const valid = resolved.filter(Boolean);
                        setAllTabs(valid);
                        // 우측 child 초기화
                        const firstChild = valid.find(t => t.type === 'child');
                        if (firstChild && !splitRightChildGubun) setSplitRightChildGubun(firstChild.gubun);
                        // 우측 form 그룹 초기화
                        const formGroups = valid.filter(t => t.type === 'form');
                        if (!hasChildren && formGroups.length > 1 && !splitRightActiveGroup) {
                          setSplitRightActiveGroup(formGroups[1].label);
                        }
                      }}
                      onSqlBtn={handleFormSqlBtn}
                      onSaveSql={handleSaveSql}
                    />
                  </div>

                  {/* 분할 구분선 */}
                  <PanelSplitDivider onMouseDown={handleSplitDividerMouseDown} />

                  {/* 우측 패널 */}
                  <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-l border-border-base">
                    {hasChildren ? (
                      /* case 1: child 프로그램 */
                      <>
                        {childTabs.length > 1 && (
                          <div className="flex items-stretch border-b border-border-base bg-surface-2 flex-shrink-0 overflow-x-auto scrollbar-hide">
                            {childTabs.map(ct => (
                              <button
                                key={ct.gubun}
                                type="button"
                                className={[
                                  'px-3 h-full flex items-center text-sm font-semibold border-r border-border-base cursor-pointer whitespace-nowrap flex-shrink-0 transition-colors',
                                  ct.gubun === (splitRightChildGubun ?? childTabs[0].gubun)
                                    ? 'bg-surface text-link'
                                    : 'bg-transparent text-tab-inactive hover:text-secondary',
                                ].join(' ')}
                                onClick={() => setSplitRightChildGubun(ct.gubun)}
                              >{ct.label}</button>
                            ))}
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden min-h-0">
                          {(splitRightChildGubun ?? childTabs[0]?.gubun) ? (
                            <ChildProgram
                              key={`child-split-${splitRightChildGubun ?? childTabs[0]?.gubun}`}
                              childGubun={splitRightChildGubun ?? childTabs[0]?.gubun}
                              parentIdx={currentLinkVal ?? currentIdx}
                              user={user}
                              devMode={devMode}
                            />
                          ) : null}
                        </div>
                      </>
                    ) : (
                      /* case 2: 나머지 form 그룹 */
                      rightFilterGroups && rightFilterGroups.length > 0 ? (
                        <div className="overflow-auto p-4 flex-1">
                          <DataForm
                            key={`${gubun}-${currentIdx}-${panelMode}-${formReloadKey}-right`}
                            gubun={gubun}
                            idx={currentIdx}
                            mode={panelMode}
                            user={user}
                            onSaved={handleSaved}
                            onCancel={handleCancel}
                            onModify={handleFormModify}
                            onDelete={handleDeleted}
                            activeTab={splitRightActiveGroup ?? rightFilterGroups[0]}
                            filterGroups={rightFilterGroups}
                            hideActions={true}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted text-sm">
                          추가 그룹 없음
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : formActiveTab.startsWith('child-') ? (
                /* ── 일반 모드: child ── */
                (() => {
                  const childGubun = parseInt(formActiveTab.replace('child-', ''), 10);
                  return (
                    <div key={`child-program-${childGubun}`} className="flex-1 overflow-hidden min-h-0">
                      <ChildProgram childGubun={childGubun} parentIdx={currentLinkVal ?? currentIdx} user={user} devMode={devMode} />
                    </div>
                  );
                })()
              ) : (
                /* ── 일반 모드: 기본 폼 ── */
                <div className="flex-1 overflow-auto p-4">
                  <DataForm
                    key={`${gubun}-${currentIdx}-${panelMode}-${formReloadKey}`}
                    gubun={gubun}
                    idx={currentIdx}
                    mode={panelMode}
                    user={user}
                    onSaved={handleSaved}
                    onCancel={handleCancel}
                    onModify={handleFormModify}
                    onDelete={isSimpleList || isOnlyOneList ? null : handleDeleted}
                    activeTab={formActiveTab}
                    onTabChange={setFormActiveTab}
                    onTabsChange={async (tabs) => {
                      const resolved = await Promise.all(tabs.map(async t => {
                        if (t.type !== 'child') return t;
                        try {
                          const d = await api.menuItemByRealPid(t.realPid);
                          const gid = d.data?.idx ?? 0;
                          return gid > 0 ? { ...t, gubun: gid } : null;
                        } catch { return null; }
                      }));
                      const valid = resolved.filter(Boolean);
                      setAllTabs(valid);
                      setFormActiveTab(prev => {
                        const keys = valid.map(t => t.type === 'form' ? t.label : `child-${t.gubun}`);
                        if (keys.includes(prev)) return prev;
                        if (valid.length === 1 && valid[0].type === 'form' && valid[0].label === '기본폼') return prev;
                        return keys[0] ?? '기본폼';
                      });
                    }}
                    onSqlBtn={handleFormSqlBtn}
                    onSaveSql={handleSaveSql}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 뷰 디자이너 팝업 — 부모 조작 가능한 플로팅 iframe (오버레이 없음) */}
      {designerUrl && (
        <DesignerFloatingPopup url={designerUrl} onClose={() => setDesignerUrl(null)} />
      )}

      {/* 간편추가 팝업 — MainContent를 팝업으로 재사용 */}
      {briefPopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center modal-overlay"
             onClick={() => { setBriefPopup(null); setGridReloadKey(k => k + 1); }}>
          <div className="bg-surface rounded-lg shadow-pop flex flex-col overflow-hidden modal-box"
               style={{ width: 'min(1100px, 95vw)', height: 'min(700px, 85vh)' }} onClick={e => e.stopPropagation()}>
            {/* 팝업 내부: MainContent와 동일한 DataGrid */}
            <BriefInsertPopup
              gubun={gubun}
              user={user}
              menu={menu}
              minIdx={briefPopup.minIdx}
              count={briefPopup.count}
              onClose={() => { setBriefPopup(null); setGridReloadKey(k => k + 1); }}
            />
          </div>
        </div>
      )}

      {/* 저장쿼리 모달 */}
      {saveSqlOpen && saveSqlData && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center modal-overlay"
          onClick={() => setSaveSqlOpen(false)}
        >
          <div
            className="bg-surface rounded-lg border border-border-base shadow-pop flex flex-col overflow-hidden modal-box"
            style={{ width: 'min(860px, 92vw)', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-base bg-surface-2 flex-shrink-0">
              <span className="text-sm font-bold text-primary">실행 쿼리 — SAVE (개발자모드)</span>
              <div className="flex items-center gap-2">
                <button className="h-btn-sm px-3 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors" onClick={() => { copyText(formatSaveSQL(buildCompleteSaveSQL(saveSqlData.sql, saveSqlData.bindings)) + ';'); showToast('복사되었습니다'); }}>복사</button>
                <button className="h-btn-sm px-3 text-xs rounded border border-border-base bg-surface text-secondary hover:bg-surface-2 cursor-pointer transition-colors" onClick={() => setSaveSqlOpen(false)}>✕ 닫기</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              <div>
                <div className="text-xs font-bold text-secondary mb-1 uppercase tracking-wide">{saveSqlData.sql?.trimStart().startsWith('INSERT') ? 'INSERT' : 'UPDATE'}</div>
                <pre className="text-xs text-primary bg-surface-2 rounded p-3 overflow-auto whitespace-pre-wrap font-mono leading-6">{formatSaveSQL(saveSqlData.sql)}</pre>
              </div>
              {saveSqlData.bindings?.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-secondary mb-1 uppercase tracking-wide">바인딩 값</div>
                  <pre className="text-xs text-primary bg-surface-2 rounded p-3 font-mono leading-6">{saveSqlData.bindings.map((v, i) => `[${i + 1}] ${JSON.stringify(v)}`).join('\n')}</pre>
                </div>
              )}
              {saveSqlData.execSql?.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-link mb-1 uppercase tracking-wide">실행쿼리 (execSql)</div>
                  {saveSqlData.execSql.map((log, i) => (
                    <div key={i} className="mb-2">
                      <pre className={`text-xs rounded p-3 overflow-auto whitespace-pre-wrap font-mono leading-6 ${log.result === 'fail' ? 'bg-danger-dim text-danger' : 'bg-surface-2 text-primary'}`}>
                        {formatSaveSQL(log.sql)}{log.bindings?.length > 0 ? '\n-- bindings: ' + JSON.stringify(log.bindings) : ''}{'\n'}-- {log.result === 'success' ? `OK (${log.rowCount ?? 0} rows)` : `FAIL: ${log.error}`}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 패널 내 분할 구분선 ─────────────────────────────────────────────────────── */
function PanelSplitDivider({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 relative cursor-col-resize group z-10"
    >
      {/* 넓은 드래그 영역 */}
      <div className="absolute -left-1 -right-1 inset-y-0 z-10" />
      {/* 시각 라인 */}
      <div className="absolute inset-0 bg-border-base group-hover:bg-accent transition-colors duration-fast" />
      {/* 핸들 아이콘 */}
      <div className="absolute z-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                      w-3 h-8 flex items-center justify-center
                      bg-surface border border-border-base rounded shadow-sm
                      opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-muted text-[9px] leading-none">⋮⋮</span>
      </div>
    </div>
  );
}

/* ── 분할 아이콘 (좌우 분할) ─────────────────────────────────────────────────── */
function BriefInsertPopup({ gubun, user, menu, minIdx, count, onClose }) {
  const [panelOpen, setPanelOpen]     = useState(false);
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [panelMode, setPanelMode]     = useState('modify');
  const gridRef = useRef(null);

  const filter = JSON.stringify([{ field: 'idx', operator: 'gte', value: String(minIdx) }]);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-base bg-surface-2 flex-shrink-0">
        <span className="text-sm font-bold text-primary">{menu?.menu_name} — 간편추가 {count}건</span>
        <button className="h-btn-sm px-4 rounded border border-border-base bg-surface text-secondary text-xs cursor-pointer hover:bg-surface-2"
                onClick={onClose}>닫기</button>
      </div>
      {/* 콘텐츠 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 그리드 */}
        <div className={panelOpen ? 'w-1/2 flex flex-col overflow-hidden border-r border-border-base' : 'flex-1 flex flex-col overflow-hidden'}>
          <DataGrid
            ref={gridRef}
            gubun={gubun}
            user={user}
            menu={{ ...menu, add_url: `&psize=200&orderby=idx&allFilter=${encodeURIComponent(filter)}` }}
            onToggleView={(pk) => { setCurrentIdx(pk); setPanelMode('modify'); setPanelOpen(true); }}
            onModify={(idx) => { setCurrentIdx(idx); setPanelMode('modify'); setPanelOpen(true); }}
            panelOpen={panelOpen}
            panelSize={panelOpen ? 2 : 1}
            currentIdx={currentIdx}
            noAutoOpen
            noPanelBtn
          />
        </div>
        {/* 폼 */}
        {panelOpen && (
          <div className="w-1/2 flex flex-col overflow-hidden panel-animate">
            <div className="flex items-center justify-between px-3 py-1 border-b border-border-base bg-surface flex-shrink-0">
              <span className="text-xs font-semibold text-secondary">{panelMode === 'modify' ? '수정' : '조회'}</span>
              <button className="text-xs text-muted hover:text-primary cursor-pointer border-0 bg-transparent" onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <DataForm
                key={`brief-${gubun}-${currentIdx}-${panelMode}`}
                gubun={gubun} idx={currentIdx} mode={panelMode} user={user}
                onSaved={() => { setPanelMode('modify'); gridRef.current?.reset?.(); }}
                onCancel={() => setPanelOpen(false)}
                onModify={() => setPanelMode('modify')}
                onDelete={() => { setPanelOpen(false); gridRef.current?.reset?.(); }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelSplitIcon({ active }) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" className={active ? 'text-white' : 'text-secondary'}>
      <rect x="0.5" y="0.5" width="5.5" height="11" rx="1"
        fill="currentColor" fillOpacity={active ? 0.7 : 0.3} />
      <rect x="8"   y="0.5" width="5.5" height="11" rx="1"
        fill="currentColor" fillOpacity={active ? 0.7 : 0.3} />
      <line x1="7" y1="0" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

const panelUrlBtnCls = [
  'h-btn-sm px-2 text-xs rounded border border-solid cursor-pointer transition-colors',
  'bg-surface border-border-base text-muted hover:bg-surface-2 hover:text-secondary',
].join(' ');

const panelSizeCls = [
  'w-7 h-btn-sm text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-surface border-border-base text-secondary hover:bg-surface-2 hover:text-primary',
].join(' ');

const panelSizeActiveCls = [
  'w-7 h-btn-sm text-sm rounded border border-solid cursor-pointer transition-colors',
  'bg-accent border-accent text-white font-semibold',
].join(' ');
