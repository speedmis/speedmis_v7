import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { showToast } from './Toast';
import DataGrid from './DataGrid';
import DataForm from './DataForm';

function copyText(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  else legacyCopy(text);
}
function legacyCopy(text) {
  const el = document.createElement('textarea');
  el.value = text; el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el); el.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(el);
}
function formatSaveSQL(sql) {
  if (!sql) return sql;
  if (sql.includes('\n')) return sql.trim();
  let s = sql.replace(/\s+/g, ' ').trim();
  return s.replace(/\bSET\b/gi, '\nSET ').replace(/\bVALUES\b/gi, '\nVALUES').replace(/\bWHERE\b/gi, '\nWHERE').replace(/,\s*/g, ',\n    ').trim();
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

/**
 * 마스터-디테일 자식 프로그램 패널
 * - iframe 없이 React 컴포넌트로 직접 렌더
 * - parentIdx prop 변경 시 DataGrid만 재조회 (전체 재로드 없음)
 * - 내용보기는 항상 전체화면(100%), 자동 첫행 열기 없음
 */
export default function ChildProgram({ childGubun, parentIdx, user, devMode = false }) {
  const [menu,    setMenu]    = useState(null);
  const [loading, setLoading] = useState(true);

  const [sqlVisible,  setSqlVisible]  = useState(false);
  const [sqlHasError, setSqlHasError] = useState(false);
  const sqlOpenRef = React.useRef(null);
  const handleSqlBtn = useCallback((visible, openFn, hasError) => {
    setSqlVisible(visible);
    setSqlHasError(!!hasError);
    if (openFn) sqlOpenRef.current = openFn;
  }, []);

  const [saveSqlData, setSaveSqlData] = useState(null);
  const [saveSqlOpen, setSaveSqlOpen] = useState(false);
  const handleSaveSql = useCallback((sqlData) => { setSaveSqlData(sqlData); }, []);

  // 자식 패널 상태 (panelSize는 항상 4 = 전체화면)
  const [panelOpen,      setPanelOpen]      = useState(false);
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [currentLinkVal, setCurrentLinkVal] = useState(null);
  const [panelMode,      setPanelMode]      = useState('view');
  const [gridReloadKey,  setGridReloadKey]  = useState(0);

  // 폼 탭 상태
  const [formTabs,      setFormTabs]      = useState(['기본폼']);
  const [formActiveTab, setFormActiveTab] = useState('기본폼');

  useEffect(() => {
    if (!childGubun) return;
    setLoading(true);
    api.menuItem(childGubun)
      .then(d => { setMenu(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [childGubun]);

  // 탭 초기화: 모드 변경 시
  useEffect(() => {
    setFormTabs(['기본폼']);
    setFormActiveTab('기본폼');
  }, [panelMode]);

  const handleToggleView = useCallback((pk, linkVal) => {
    if (panelOpen && currentIdx === pk) {
      setPanelOpen(false);
    } else {
      setCurrentIdx(pk);
      setCurrentLinkVal(linkVal ?? pk);
      setPanelMode('view');
      setPanelOpen(true);
    }
  }, [panelOpen, currentIdx]);

  const openModify = useCallback(idx => {
    setCurrentIdx(idx);
    setPanelMode('modify');
    setPanelOpen(true);
  }, []);

  const openWrite = useCallback(() => {
    setCurrentIdx(0);
    setPanelMode('write');
    setPanelOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    setPanelOpen(false);
    setGridReloadKey(k => k + 1);
  }, []);

  const handleCancel = useCallback(() => setPanelOpen(false), []);

  const handleFormModify = useCallback(() => setPanelMode('modify'), []);

  const handleDeleted = useCallback(() => {
    setPanelOpen(false);
    setGridReloadKey(k => k + 1);
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-muted text-sm">로딩 중...</div>
  );
  if (!menu) return (
    <div className="flex-1 flex items-center justify-center text-muted text-sm">메뉴 정보를 찾을 수 없습니다.</div>
  );

  // 내용보기가 열리면 그리드는 숨김 (항상 전체화면)
  const showGrid   = !panelOpen;
  const showDetail = panelOpen;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-solid border-border-base flex-shrink-0">
        <span className="text-sm font-bold text-primary">{menu.menu_name}</span>
        <div className="flex items-center gap-1.5">
          {(devMode || sqlHasError) && sqlVisible && (
            <button
              className={`h-btn-sm px-2 rounded border text-xs cursor-pointer transition-colors ${sqlHasError ? 'border-danger bg-danger-dim text-danger hover:opacity-80' : 'border-border-base bg-surface text-link hover:bg-surface-2'}`}
              onClick={() => sqlOpenRef.current?.()}
            >SQL</button>
          )}
          {saveSqlData && (
            <button
              className="h-btn-sm px-2 rounded border border-border-base bg-surface text-link text-xs cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => setSaveSqlOpen(true)}
            >저장쿼리</button>
          )}
          {devMode && menu?.menu_type === '01' && menu?.real_pid && (
            <button
              className="h-btn-sm px-2 rounded border border-border-base bg-surface text-link text-xs cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mis:openTab', {
                  detail: { gubun: 266, label: `웹소스 (${menu.real_pid})`, idx: menu.real_pid, linkVal: menu.real_pid, openFull: true }
                }));
              }}
            >웹소스</button>
          )}
          {menu?.g01 !== 'simple_list' && (
            <button
              className="h-btn-sm px-3 rounded bg-accent text-white text-sm border-0 cursor-pointer hover:bg-accent-hover transition-colors"
              onClick={openWrite}
            >+ 등록</button>
          )}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* 그리드 */}
        {showGrid && (
          <div className="flex flex-col overflow-hidden min-w-0 w-full">
            <DataGrid
              key={gridReloadKey}
              gubun={childGubun}
              user={user}
              menu={menu}
              onToggleView={handleToggleView}
              onModify={openModify}
              panelOpen={panelOpen}
              panelSize={4}
              onPanelSizeClick={null}
              currentIdx={currentIdx}
              onOpenTab={null}
              parentIdx={parentIdx}
              noAutoOpen={true}
              noPanelBtn={true}
              devMode={devMode}
              onSqlBtn={handleSqlBtn}
            />
          </div>
        )}

        {/* 상세 패널 (전체화면) */}
        {showDetail && (
          <div className="flex flex-col overflow-hidden w-full">
            {/* 패널 헤더 */}
            <div className="flex items-stretch border-b border-solid border-border-base flex-shrink-0 bg-surface">
              <div className="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-hide">
                {(panelMode === 'write' || panelMode === 'modify') && (
                  <span className="px-3 flex items-center text-xs font-semibold text-secondary border-r border-solid border-border-base whitespace-nowrap flex-shrink-0">
                    {panelMode === 'write' ? '등록' : '수정'}
                  </span>
                )}
                {formTabs.map(g => (
                  <button
                    key={g}
                    type="button"
                    className={[
                      'px-3 flex items-center text-sm font-semibold border-r border-solid border-border-base transition-colors cursor-pointer whitespace-nowrap flex-shrink-0',
                      formActiveTab === g ? 'bg-surface-2 text-link' : 'bg-transparent text-tab-inactive hover:text-secondary',
                    ].join(' ')}
                    onClick={() => setFormActiveTab(g)}
                  >{g}</button>
                ))}
              </div>
              <div className="flex items-center px-2 flex-shrink-0">
                <button
                  type="button"
                  className="h-btn-sm px-3 rounded border border-border-base bg-surface text-secondary text-sm cursor-pointer hover:text-primary hover:bg-surface-2 transition-colors"
                  onClick={() => setPanelOpen(false)}
                >닫기</button>
              </div>
            </div>

            {/* 폼 영역 */}
            <div className="flex-1 overflow-auto p-3">
              <DataForm
                key={`child-form-${childGubun}-${currentIdx}-${panelMode}`}
                gubun={childGubun}
                idx={currentIdx}
                mode={panelMode}
                user={user}
                onSaved={handleSaved}
                onCancel={handleCancel}
                onSaveSql={handleSaveSql}
                onModify={handleFormModify}
                onDelete={handleDeleted}
                activeTab={formActiveTab}
                onTabChange={setFormActiveTab}
                onTabsChange={tabs => {
                  // tabs는 {type, label} 객체 배열 — form 탭의 label만 추출
                  const labels = tabs
                    .filter(t => t.type === 'form')
                    .map(t => t.label);
                  const keys = labels.length > 0 ? labels : ['기본폼'];
                  setFormTabs(keys);
                  setFormActiveTab(prev => {
                    if (keys.includes(prev)) return prev;
                    if (keys.length === 1 && keys[0] === '기본폼') return prev;
                    return keys[0] ?? '기본폼';
                  });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 저장쿼리 모달 */}
      {saveSqlOpen && saveSqlData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center modal-overlay" onClick={() => setSaveSqlOpen(false)}>
          <div className="bg-surface rounded-lg border border-border-base shadow-pop flex flex-col overflow-hidden modal-box" style={{ width: 'min(860px, 92vw)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
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
