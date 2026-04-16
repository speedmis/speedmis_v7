import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';
import { showToast } from '../Toast';

const MAX_FIELDS = 12;

function parseItems(items) {
  try {
    const p = JSON.parse(items ?? '[]');
    if (Array.isArray(p)) return p.map(o => typeof o === 'object' ? o : { value: o, text: o });
  } catch {}
  return (items ?? '').split(',').filter(Boolean).map(v => ({ value: v.trim(), text: v.trim() }));
}

// 뱃지 색상 매핑
const BADGE_COLORS = [
  { bg: '#E6F9F0', color: '#03B26C' },
  { bg: '#E8F1FD', color: '#3182F6' },
  { bg: '#FFF7E6', color: '#F59E0B' },
  { bg: '#FDE8E8', color: '#F04452' },
  { bg: '#F3E8FF', color: '#8B5CF6' },
  { bg: '#E8F5E9', color: '#2E7D32' },
  { bg: '#FFF3E0', color: '#E65100' },
  { bg: '#E0F7FA', color: '#00838F' },
];
function getBadgeColor(value, items) {
  if (!value || !items?.length) return BADGE_COLORS[0];
  const idx = items.findIndex(o => String(o.value) === String(value));
  return BADGE_COLORS[(idx >= 0 ? idx : 0) % BADGE_COLORS.length];
}

function classifyFields(fields) {
  const visible = fields.filter(f => {
    const w = parseInt(f.col_width ?? '0', 10);
    return w > 0 && f.grid_ctl_name !== 'child';
  }).slice(0, MAX_FIELDS);
  if (!visible.length) return { title: null, badge: null, main: [], meta: [] };

  const title = visible[0];
  const rest = visible.slice(1);

  // selectbox 필드 중 첫 번째를 뱃지 후보로 추출
  const badgeIdx = rest.findIndex(f => f.schema_type === 'selectbox' || f.schema_type === 'dropdownlist');
  const badge = badgeIdx >= 0 ? rest[badgeIdx] : null;
  const afterBadge = badge ? rest.filter((_, i) => i !== badgeIdx) : rest;

  const metaKeys = ['wdate','lastupdate','last_update','wdater','lastupdater','last_updater'];
  const meta = afterBadge.filter(f =>
    metaKeys.some(a => f.alias_name?.includes(a)) ||
    f.col_title?.includes('작성') || f.col_title?.includes('수정') || f.col_title?.includes('일자')
  );
  const metaSet = new Set(meta.map(f => f.alias_name));
  return { title, badge, main: afterBadge.filter(f => !metaSet.has(f.alias_name)), meta };
}

function getSpan(f) {
  const w = Math.abs(parseInt(f.col_width ?? '10', 10));
  return w >= 25 ? 'full' : 'half';
}

export default function MobileCardList({ gubun, user, menu, onCardClick, onWrite, onMeta }) {
  const [rows, setRows] = useState([]);
  const [fields, setFields] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filterValues, setFilterValues] = useState({});
  const [dynamicItems, setDynamicItems] = useState({});
  const [recently, setRecently] = useState(() => menu?.g03 === 'Y');
  const pageSize = 20;

  const [searchText, setSearchText] = useState('');
  const filterFields = fields.filter(f => ['s','t','w'].includes(f.grid_is_handle ?? ''));
  const selectFilters = filterFields.filter(f => f.grid_is_handle === 's');
  const hasTextFilter = filterFields.some(f => f.grid_is_handle === 't');
  const { title: titleField, badge: badgeField, main: mainFields, meta: metaFields } = classifyFields(fields);

  const pk0cw = parseInt(fields[0]?.col_width ?? '0', 10);
  const pkAlias = fields[0]?.alias_name ?? 'idx';
  const usePk = pk0cw !== -1 && pk0cw !== -2;
  const listF = fields.filter(f => { const w = parseInt(f.col_width ?? '0', 10); return w > 0 && f.grid_ctl_name !== 'child'; });
  const firstA = listF[0]?.alias_name ?? '';
  const getLinkVal = useCallback(r => usePk ? (r[pkAlias] ?? r.idx) : (r[firstA] ?? r[pkAlias] ?? r.idx), [usePk, pkAlias, firstA]);

  // 동적 필터 아이템
  useEffect(() => {
    if (!fields.length || !gubun) return;
    fields.filter(f => f.grid_is_handle === 's' && !f.items).forEach(f => {
      api.filterItems(gubun, f.alias_name).then(res => {
        const vals = (res.data ?? []).map(v => typeof v === 'object' ? v : { value: v, text: v });
        setDynamicItems(prev => ({ ...prev, [f.alias_name]: vals }));
      }).catch(() => {});
    });
  }, [fields, gubun]);

  const fvRef = useRef(filterValues);
  fvRef.current = filterValues;
  const ffRef = useRef(filterFields);
  ffRef.current = filterFields;
  const recentlyRef = useRef(recently);
  recentlyRef.current = recently;

  const buildAf = useCallback(() => {
    const arr = Object.entries(fvRef.current)
      .filter(([, v]) => v !== '' && v != null)
      .map(([field, value]) => {
        const f = ffRef.current.find(x => x.alias_name === field);
        return { field, operator: f?.grid_is_handle === 's' ? 'eq' : 'contains', value };
      });
    return arr.length ? JSON.stringify(arr) : '[]';
  }, []);

  const loadRef = useRef(null);
  const load = useCallback(async (pg = 1) => {
    if (!gubun) return;
    setLoading(true);
    try {
      const listParams = { page: pg, pageSize, allFilter: buildAf(), recently: recentlyRef.current ? 'Y' : 'N' };
      if (window.__mis_custom_action) {
        listParams.customAction = window.__mis_custom_action;
        window.__mis_custom_action = '';
      }
      const data = await api.list(gubun, listParams);
      const nr = data.data ?? [], nf = data.fields ?? [];
      pg === 1 ? (setRows(nr), setFields(nf)) : setRows(prev => [...prev, ...nr]);
      setTotal(data.total ?? 0);
      setPage(pg);
      setHasMore(nr.length >= pageSize);
      if (pg === 1 && onMeta) {
        onMeta({ buttons: data._client_buttons || null, onlyList: !!data._onlyList, buttonText: data._client_buttonText || null });
      }
      if (data._client_alert) alert(data._client_alert);
      if (data._client_toast) showToast(data._client_toast);
    } catch (e) { showToast(e.message || '로드 실패'); }
    finally { setLoading(false); }
  }, [gubun, buildAf]);
  loadRef.current = load;

  useEffect(() => { load(1); }, [gubun]);

  const doSearch = useCallback(() => { setRows([]); setPage(1); loadRef.current?.(1); }, []);

  // 통합 검색 (텍스트 필터 첫 번째 필드에 바인딩)
  const textFilterField = filterFields.find(f => f.grid_is_handle === 't');
  const handleSearchSubmit = useCallback(() => {
    if (textFilterField) {
      setFilterValues(prev => ({ ...prev, [textFilterField.alias_name]: searchText }));
    }
    requestAnimationFrame(() => { setRows([]); setPage(1); loadRef.current?.(1); });
  }, [searchText, textFilterField]);

  const hasActiveFilter = Object.values(filterValues).some(v => v !== '' && v != null) || searchText !== '';

  return (
    <div className="m-scroll" style={{ height: '100%' }}>
      {/* 통합 검색바 — 텍스트 필터가 있을 때만 표시 */}
      {textFilterField && (
        <div className="m-search-bar">
          <div className="m-search-input-wrap">
            <svg className="m-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              className="m-search-input"
              type="text"
              placeholder={`${(() => { const s = textFilterField.col_title ?? ''; const ci = s.indexOf(','); return ci === -1 ? s : s.slice(ci + 1) || s.slice(0, ci); })()} 검색`}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
            />
            {searchText && (
              <button className="m-search-clear" onClick={() => { setSearchText(''); setFilterValues(prev => ({ ...prev, [textFilterField.alias_name]: '' })); requestAnimationFrame(doSearch); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 셀렉트 필터 (칩 스타일) */}
      {selectFilters.length > 0 && (
        <div className="m-filter-chips">
          {selectFilters.map(f => {
            const alias = f.alias_name ?? '';
            const label = (() => { const s = f.col_title ?? alias; const ci = s.indexOf(','); return ci === -1 ? s : s.slice(ci + 1) || s.slice(0, ci) || alias; })();
            const opts = (f.items ? parseItems(f.items) : null) ?? dynamicItems[alias] ?? [];
            return (
              <select key={alias} className="m-filter-chip" value={filterValues[alias] ?? ''}
                onChange={e => { setFilterValues(prev => ({ ...prev, [alias]: e.target.value })); requestAnimationFrame(() => { setRows([]); setPage(1); loadRef.current?.(1); }); }}>
                <option value="">{label}</option>
                {opts.map(o => <option key={o.value} value={o.value}>{o.text ?? o.value}</option>)}
              </select>
            );
          })}
          {/* 날짜 필터 */}
          {filterFields.filter(f => f.grid_is_handle === 'w').map(f => {
            const alias = f.alias_name ?? '';
            const rv = filterValues[alias] ?? { from: '', to: '' };
            return (
              <div key={alias} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="date" className="m-filter-chip m-filter-chip--date" value={typeof rv === 'object' ? rv.from : ''}
                  onChange={e => setFilterValues(prev => ({ ...prev, [alias]: { ...(typeof prev[alias] === 'object' ? prev[alias] : {}), from: e.target.value } }))} />
                <span style={{ color: 'var(--m-text-4)', fontSize: 12 }}>~</span>
                <input type="date" className="m-filter-chip m-filter-chip--date" value={typeof rv === 'object' ? rv.to : ''}
                  onChange={e => setFilterValues(prev => ({ ...prev, [alias]: { ...(typeof prev[alias] === 'object' ? prev[alias] : {}), to: e.target.value } }))}
                  onBlur={doSearch} />
              </div>
            );
          })}
        </div>
      )}

      {/* 건수 + 최근순 */}
      <div className="m-list-header">
        <span className="m-list-count">{loading && page === 1 ? '로딩 중...' : `총 ${total.toLocaleString()}건`}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className={`m-list-recently ${recently ? 'm-list-recently--on' : ''}`}
            onClick={() => { const next = !recently; setRecently(next); recentlyRef.current = next; setRows([]); setPage(1); requestAnimationFrame(() => loadRef.current?.(1)); }}>
            최근순
          </button>
          {hasActiveFilter && (
            <button className="m-list-reset" onClick={() => { setFilterValues({}); setSearchText(''); requestAnimationFrame(doSearch); }}>초기화</button>
          )}
        </div>
      </div>

      {/* 카드 리스트 */}
      {loading && page === 1 ? (
        <div style={{ padding: '0 16px' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="m-card" style={{ cursor: 'default' }}>
              <div className="m-skeleton" style={{ height: 18, width: '65%', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="m-skeleton" style={{ height: 14, width: '40%' }} />
                <div className="m-skeleton" style={{ height: 14, width: '30%' }} />
              </div>
              <div className="m-skeleton" style={{ height: 12, width: '50%', marginTop: 10 }} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="m-empty">
          <svg className="m-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
          <span className="m-empty-text">데이터가 없습니다</span>
        </div>
      ) : (
        <>
          {rows.map((row, ri) => {
            const pk = usePk ? (row[pkAlias] ?? row.idx) : getLinkVal(row);
            const lv = getLinkVal(row);
            const tv = titleField ? (row[titleField.alias_name] ?? '') : (row.idx ?? ri);
            const ht = row.__html?.[titleField?.alias_name];

            // 뱃지 값
            const badgeVal = badgeField ? (row[badgeField.alias_name] ?? '') : '';
            const badgeItems = badgeField ? ((badgeField.items ? parseItems(badgeField.items) : null) ?? []) : [];
            const badgeText = badgeItems.find(o => String(o.value) === String(badgeVal))?.text ?? badgeVal;
            const badgeStyle = badgeVal ? getBadgeColor(badgeVal, badgeItems) : null;

            return (
              <div key={row.idx ?? ri} className="m-card" onClick={() => onCardClick(pk, lv)}>
                {/* 제목 + 뱃지 */}
                <div className="m-card-head">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {ht ? <span className="m-card-title" dangerouslySetInnerHTML={{ __html: ht }} />
                        : <div className="m-card-title">{tv || '-'}</div>}
                  </div>
                  {badgeStyle && badgeText && (
                    <span className="m-card-status-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>{badgeText}</span>
                  )}
                </div>

                {/* 필드 — 간결한 텍스트 */}
                {mainFields.length > 0 && (
                  <div className="m-card-body">
                    {mainFields.slice(0, 4).map(f => {
                      const val = row[f.alias_name] ?? '';
                      const html = row.__html?.[f.alias_name];
                      const label = (() => { const s = f.col_title ?? ''; const ci = s.indexOf(','); return ci === -1 ? s : s.slice(ci + 1) || s.slice(0, ci); })();
                      return (
                        <div key={f.alias_name} className={`m-card-field ${getSpan(f) === 'full' ? 'm-card-field--full' : ''}`}>
                          <span className="m-card-field-label">{label}</span>
                          {html ? <span className="m-card-field-value cell-html" dangerouslySetInnerHTML={{ __html: html }} />
                                : <span className="m-card-field-value">{val || '-'}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 메타 */}
                {metaFields.length > 0 && (
                  <div className="m-card-meta">
                    {metaFields.map(f => {
                      let val = row[f.alias_name] ?? '';
                      if (val.length > 10 && (f.schema_type === 'datetime' || f.alias_name?.includes('date'))) val = val.slice(0, 10);
                      return <span key={f.alias_name}>{f.col_title} {val || '-'}</span>;
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && !loading && (
            <button className="m-load-more" onClick={() => !loading && loadRef.current?.(page + 1)}>
              더보기 ({rows.length} / {total.toLocaleString()})
            </button>
          )}
          {loading && page > 1 && <div style={{ textAlign: 'center', padding: 16, color: 'var(--m-text-3)', fontSize: 14 }}>로딩 중...</div>}
        </>
      )}
    </div>
  );
}
