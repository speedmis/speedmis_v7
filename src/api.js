/**
 * SpeedMIS v7 — API 클라이언트
 * 모든 요청: /api.php?act=xxx
 */

const BASE = (window.__APP_CONFIG__?.apiUrl ?? '/api.php').replace(/api\.php.*$/, 'api.php');

let _csrfToken = null;

async function ensureCsrf() {
  if (_csrfToken) return _csrfToken;
  // 쿠키에서 읽기
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  if (match) {
    _csrfToken = decodeURIComponent(match[1]);
    return _csrfToken;
  }
  // 없으면 서버에서 발급
  const res = await fetch(`${BASE}?act=csrf`, { credentials: 'include' });
  const data = await res.json();
  _csrfToken = data.csrf_token ?? '';
  return _csrfToken;
}

async function request(act, options = {}) {
  const { params = {}, body = null, method = body ? 'POST' : 'GET' } = options;

  const qs = new URLSearchParams({ act, ...params }).toString();
  const url = `${BASE}?${qs}`;

  const headers = { 'Content-Type': 'application/json' };

  if (method === 'POST') {
    headers['X-CSRF-Token'] = await ensureCsrf();
  }

  const init = {
    method,
    headers,
    credentials: 'include',
  };

  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  let res = await fetch(url, init);

  // 401 → refresh 시도
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await fetch(url, init);
    } else {
      window.dispatchEvent(new CustomEvent('mis:logout'));
      throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
    }
  }

  const data = await res.json();
  if (!data.success) {
    // 서버 confirm 요청: 에러 대신 _confirm 포함하여 반환
    if (data._confirm) return data;
    const err = new Error(data.message ?? '요청 실패');
    if (data._sql) err._sqlData = { sql: data._sql, count_sql: data._count_sql ?? null, bindings: data._bindings ?? [], error: data._sql_error ?? null };
    throw err;
  }
  return data;
}

async function tryRefresh() {
  try {
    const res = await fetch(`${BASE}?act=refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

export const api = {
  // 인증
  login:   (uid, pass)  => request('login',  { body: { uid, pass } }),
  logout:  ()           => request('logout', { method: 'POST', body: {} }),
  me:      ()           => request('me'),

  // 메뉴
  menu:              ()         => request('menu'),
  menuItem:          (gubun)    => request('menuItem', { params: { gubun } }),
  menuItemByRealPid: (realPid)  => request('menuItem', { params: { real_pid: realPid } }),

  // CRUD
  list: (gubun, opts = {}) => request('list', {
    params: { gubun, ...opts },
  }),

  view: (gubun, idx, devMode = false, actionFlag = '') => request('view', {
    params: { gubun, idx, ...(devMode ? { dev_mode: '1' } : {}), ...(actionFlag ? { actionFlag } : {}) },
  }),

  save: (gubun, body, idx = 0, devMode = false) => request('save', {
    params: { gubun, idx, ...(devMode ? { dev_mode: '1' } : {}) },
    body,
  }),

  delete: (gubun, idx) => request('delete', { params: { gubun, idx } }),

  bulkDelete: (gubun, idxList) => request('bulkDelete', {
    params: { gubun },
    body: { idxList },
  }),

  filterItems:    (gubun, field) => request('filterItems',    { params: { gubun, field } }),
  primeKeyItems:  (gubun, field) => request('primeKeyItems',  { params: { gubun, field } }),
  dropdownItems:  (gubun, alias) => request('dropdownItems',  { params: { gubun, alias } }),

  treat: (gubun, body) => request('treat', {
    params: { gubun },
    body,
  }),

  briefInsert: (gubun, count, parentIdx = '') => request('briefInsert', {
    params: { gubun },
    body: { gubun, count, parent_idx: parentIdx },
  }),

  saveFormLayout: (gubun, items) => request('saveFormLayout', {
    params: { gubun },
    body: { items },
  }),

  shortUrl: (url) => request('shortUrl', { body: { url } }),

  // 파일
  // 임시 업로드 — 파일 선택 즉시 호출. 응답의 token 을 보관 후 저장 시 _tempAttach 로 전달
  fileUpload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return ensureCsrf().then(csrf =>
      fetch(`${BASE}?act=fileUpload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
        body: fd,
      }).then(r => r.json())
    );
  },

  // midx 기준 파일 목록
  fileList:   (midx) => request('fileList', { params: { midx } }),
  fileDelete: (idx)        => request('fileDelete',  { params: { idx } }),
  fileDownloadUrl: (idx)   => `${BASE}?act=fileDownload&idx=${idx}`,
  fileViewUrl:     (idx)   => `${BASE}?act=fileDownload&idx=${idx}&view=1`,
};

export default api;
