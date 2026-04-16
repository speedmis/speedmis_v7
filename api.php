<?php
/**
 * SpeedMIS v7 — 단일 API 엔트리포인트
 * 모든 요청: api.php?act=xxx&gubun=xxx
 */

define('BASE_PATH', __DIR__);
require_once BASE_PATH . '/config/constants.php';
require_once BASE_PATH . '/vendor/autoload.php';

use App\Bootstrap;
use App\DataHandler;
use App\MenuRouter;
use App\FileManager;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

$app = Bootstrap::createApp();

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────
function jsonOut(Response $response, array $data, int $status = 200): Response
{
    $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $response
        ->withStatus($status)
        ->withHeader('Content-Type', 'application/json; charset=utf-8');
}

function getUser(Request $request): object
{
    return $request->getAttribute('user') ?? (object)[];
}

// ─── 라우트 ───────────────────────────────────────────────────────────────────

$app->any('/api.php', function (Request $req, Response $res) use ($app): Response {
    $params  = $req->getQueryParams();
    $body    = (array)($req->getParsedBody() ?? []);
    $act     = $params['act'] ?? '';
    $user    = getUser($req);
    $container = $app->getContainer();

    switch ($act) {

        // ── 인증 ──────────────────────────────────────────────────────────────
        case 'login':
            return handleLogin($req, $res, $container, $body);

        case 'logout':
            return handleLogout($res);

        case 'refresh':
            return handleRefresh($req, $res, $container);

        case 'csrf':
            $token = bin2hex(random_bytes(32));
            setcookie('csrf_token', $token, [
                'expires'  => time() + 3600,
                'path'     => '/',
                'httponly' => false,  // JS에서 읽을 수 있어야 함
                'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
                'samesite' => 'Lax',
            ]);
            return jsonOut($res, ['success' => true, 'csrf_token' => $token]);

        // ── 메뉴 ──────────────────────────────────────────────────────────────
        case 'menu':
            $router = $container->get(\App\MenuRouter::class);
            return jsonOut($res, ['success' => true, 'data' => $router->getMenuTree($user)]);

        case 'menuItem':
            $gubun   = (int)($params['gubun']    ?? 0);
            $realPid = trim($params['real_pid']  ?? '');
            $router  = $container->get(\App\MenuRouter::class);
            $menu    = $realPid !== '' ? $router->getMenuByRealPid($realPid) : $router->getMenu($gubun);
            return jsonOut($res, ['success' => !empty($menu), 'data' => $menu]);

        // ── CRUD ──────────────────────────────────────────────────────────────
        case 'list':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->list($params, $user));

        case 'filterItems':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->filterItems($params, $user));

        case 'primeKeyItems':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->primeKeyItems($params, $user));

        case 'dropdownItems':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->dropdownItems($params, $user));

        case 'view':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->view($params, $user));

        case 'save':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->save($params, $body, $user));

        case 'delete':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->delete($params, $user));

        case 'bulkDelete':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->bulkDelete($params, $body, $user));

        // ── 간편추가 ──────────────────────────────────────────────────────────
        case 'briefInsert':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->briefInsert($params, $body, $user));

        // ── 간트차트 ──────────────────────────────────────────────────────────
        case 'ganttList':
            $projectIdx = (int)($params['project_idx'] ?? 0);
            $pdo = $container->get(\App\Config\Database::class)::getInstance();
            $stmt = $pdo->prepare('SELECT * FROM mis_gantt_tasks WHERE project_idx = ? AND use_yn = "1" ORDER BY sort_order, idx');
            $stmt->execute([$projectIdx]);
            return jsonOut($res, ['success' => true, 'data' => $stmt->fetchAll()]);

        case 'ganttSave':
            $pdo = $container->get(\App\Config\Database::class)::getInstance();
            $id = (int)($body['idx'] ?? 0);
            if ($id > 0) {
                $sets = [];
                $vals = [];
                foreach (['task_name','start_date','end_date','progress','assignee','parent_task_idx','depend_on','color','sort_order','remark'] as $k) {
                    if (array_key_exists($k, $body)) { $sets[] = "`{$k}`=?"; $vals[] = $body[$k]; }
                }
                if ($sets) {
                    $sets[] = 'last_updater=?'; $vals[] = $user->uid ?? '';
                    $sets[] = 'last_update=NOW()';
                    $vals[] = $id;
                    $pdo->prepare('UPDATE mis_gantt_tasks SET ' . implode(',', $sets) . ' WHERE idx=?')->execute($vals);
                }
            } else {
                $pdo->prepare('INSERT INTO mis_gantt_tasks (project_idx, task_name, start_date, end_date, progress, assignee, sort_order, wdater, wdate) VALUES (?,?,?,?,?,?,?, ?, NOW())')
                    ->execute([$body['project_idx'] ?? 0, $body['task_name'] ?? '', $body['start_date'] ?? null, $body['end_date'] ?? null, (int)($body['progress'] ?? 0), $body['assignee'] ?? '', (int)($body['sort_order'] ?? 0), $user->uid ?? '']);
                $id = (int)$pdo->lastInsertId();
            }
            return jsonOut($res, ['success' => true, 'idx' => $id]);

        case 'ganttDelete':
            $pdo = $container->get(\App\Config\Database::class)::getInstance();
            $pdo->prepare("UPDATE mis_gantt_tasks SET use_yn='0' WHERE idx=?")->execute([(int)($params['idx'] ?? 0)]);
            return jsonOut($res, ['success' => true]);

        case 'treat':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->treat($params, $body, $user));

        case 'saveFormLayout':
            $handler = $container->get(DataHandler::class);
            return jsonOut($res, $handler->saveFormLayout($params, $body, $user));

        case 'shortUrl': {
            $longUrl = trim($body['url'] ?? $params['url'] ?? '');
            if ($longUrl === '') return jsonOut($res, ['success' => false, 'message' => 'url 필수'], 400);
            $pdo = $container->get(\PDO::class);
            // 이미 존재하면 기존 코드 반환
            $exists = $pdo->prepare('SELECT short_code FROM mis_urls WHERE long_url = ? LIMIT 1');
            $exists->execute([$longUrl]);
            $row = $exists->fetch();
            if ($row) {
                $base = rtrim($_ENV['APP_URL'] ?? ('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')), '/');
                return jsonOut($res, ['success' => true, 'short_url' => "{$base}/?s={$row['short_code']}", 'short_code' => $row['short_code']]);
            }
            // 유니크 코드 생성 (6자리 base62)
            $chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외
            $maxTry = 10;
            $code = '';
            for ($try = 0; $try < $maxTry; $try++) {
                $code = '';
                for ($i = 0; $i < 6; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
                $chk = $pdo->prepare('SELECT idx FROM mis_urls WHERE short_code = ? LIMIT 1');
                $chk->execute([$code]);
                if (!$chk->fetch()) break;
                $code = '';
            }
            if ($code === '') return jsonOut($res, ['success' => false, 'message' => '코드 생성 실패'], 500);
            $ins = $pdo->prepare('INSERT INTO mis_urls (long_url, short_code, wdater) VALUES (?, ?, ?)');
            $ins->execute([$longUrl, $code, $user->uid ?? '']);
            $base = rtrim($_ENV['APP_URL'] ?? ('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')), '/');
            return jsonOut($res, ['success' => true, 'short_url' => "{$base}/?s={$code}", 'short_code' => $code]);
        }

        // ── 파일 ──────────────────────────────────────────────────────────────
        // 임시 업로드 — 파일 선택 즉시 호출. 응답으로 받은 token 을 form value 로 전달
        case 'fileUpload':
            $files = $req->getUploadedFiles();
            $file  = $files['file'] ?? null;
            if (!$file) return jsonOut($res, ['success' => false, 'message' => '파일이 없습니다.'], 400);
            $fm    = $container->get(FileManager::class);
            return jsonOut($res, $fm->uploadTemp($file, $user->uid ?? ''));

        // midx 기준 파일 목록 (기존 레코드 뷰/수정 시)
        case 'fileList':
            $fm   = $container->get(FileManager::class);
            $midx = (int)($params['midx'] ?? 0);
            return jsonOut($res, ['success' => true, 'data' => $fm->listByMidx($midx)]);

        case 'fileDelete':
            $fm        = $container->get(FileManager::class);
            $attachIdx = (int)($params['idx'] ?? 0);
            return jsonOut($res, $fm->deleteByIdx($attachIdx, $user->uid ?? '', ($user->is_admin ?? '') === 'Y'));

        case 'fileDownload':
            return handleDownload($req, $res, $container);

        // ── 사용자 ────────────────────────────────────────────────────────────
        case 'me':
            return jsonOut($res, ['success' => true, 'user' => $user]);

        case 'saveTheme':
            $theme = $body['theme'] ?? ($params['theme'] ?? '');
            if (!in_array($theme, ['light', 'dark'], true)) {
                return jsonOut($res, ['success' => false, 'message' => '유효하지 않은 테마입니다.'], 400);
            }
            try {
                $pdo = $container->get(\PDO::class);
                $pdo->prepare('UPDATE mis_users SET theme = ? WHERE user_id = ?')
                    ->execute([$theme, $user->uid ?? '']);
                return jsonOut($res, ['success' => true, 'theme' => $theme]);
            } catch (\Throwable $e) {
                return jsonOut($res, ['success' => false, 'message' => 'DB 오류'], 500);
            }

        case 'ping':
            return jsonOut($res, ['success' => true, 'pong' => true]);

        default:
            return jsonOut($res, ['success' => false, 'message' => "알 수 없는 act: {$act}"], 400);
    }
});

$app->run();

// =============================================================================
// 인증 핸들러
// =============================================================================

function handleLogin(Request $req, Response $res, $container, array $body): Response
{
    $uid  = trim($body['uid']  ?? '');
    $pass = trim($body['pass'] ?? '');

    if ($uid === '' || $pass === '') {
        return jsonOut($res, ['success' => false, 'message' => '아이디와 비밀번호를 입력해주세요.'], 400);
    }

    try {
        $pdo = $container->get(\PDO::class);
    } catch (\Throwable) {
        return jsonOut($res, ['success' => false, 'message' => 'DB 연결 실패'], 500);
    }

    // 잠금 확인
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $lockStmt = $pdo->prepare(
        'SELECT fail_count, last_fail_at FROM mis_login_locks WHERE user_id = ? LIMIT 1'
    );
    $lockStmt->execute([$uid]);
    $lock = $lockStmt->fetch();

    if ($lock) {
        $lockedUntil = strtotime($lock['last_fail_at']) + LOGIN_LOCK_MINUTE * 60;
        if ($lock['fail_count'] >= LOGIN_MAX_FAIL && time() < $lockedUntil) {
            $remain = ceil(($lockedUntil - time()) / 60);
            return jsonOut($res, ['success' => false, 'message' => "계정이 잠겼습니다. {$remain}분 후 시도해주세요."], 403);
        }
    }

    // 사용자 조회
    $stmt = $pdo->prepare(
        'SELECT idx, user_id, user_name, password, position_code, is_admin, use_yn, theme
           FROM mis_users WHERE user_id = ? LIMIT 1'
    );
    $stmt->execute([$uid]);
    $u = $stmt->fetch();

    $ok = $u && $u['use_yn'] === '1' && password_verify($pass, $u['password']);

    if (!$ok) {
        // 실패 카운트 증가
        $pdo->prepare(
            'INSERT INTO mis_login_locks (user_id, fail_count, last_fail_at)
             VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE fail_count = fail_count + 1, last_fail_at = NOW()'
        )->execute([$uid]);
        return jsonOut($res, ['success' => false, 'message' => '아이디 또는 비밀번호가 올바르지 않습니다.'], 401);
    }

    // 성공 → 잠금 초기화
    $pdo->prepare('DELETE FROM mis_login_locks WHERE user_id = ?')->execute([$uid]);

    $secret  = $_ENV['APP_PWD_KEY'] ?? 'secret';
    $now     = time();

    $accessPayload = [
        'type'          => 'access',
        'sub'           => (string)$u['idx'],
        'uid'           => $u['user_id'],
        'name'          => $u['user_name'],
        'position_code' => $u['position_code'],
        'is_admin'      => $u['is_admin'],
        'iat'           => $now,
        'exp'           => $now + JWT_ACCESS_TTL,
    ];
    $refreshPayload = [
        'type' => 'refresh',
        'sub'  => (string)$u['idx'],
        'uid'  => $u['user_id'],
        'iat'  => $now,
        'exp'  => $now + JWT_REFRESH_TTL,
    ];

    $accessToken  = JWT::encode($accessPayload,  $secret, JWT_ALGO);
    $refreshToken = JWT::encode($refreshPayload, $secret, JWT_ALGO);

    // refresh token DB 저장
    $pdo->prepare(
        'INSERT INTO mis_refresh_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at)'
    )->execute([$u['user_id'], hash('sha256', $refreshToken), $now + JWT_REFRESH_TTL]);

    // HttpOnly 쿠키 — HTTPS 여부로 Secure 플래그 결정 (HTTP 접근 시 false)
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie('access_token', $accessToken, [
        'expires'  => $now + JWT_ACCESS_TTL,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $secure,
        'samesite' => 'Lax',
    ]);
    setcookie('refresh_token', $refreshToken, [
        'expires'  => $now + JWT_REFRESH_TTL,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $secure,
        'samesite' => 'Lax',
    ]);

    return jsonOut($res, [
        'success'      => true,
        'access_token' => $accessToken,
        'user'         => [
            'uid'           => $u['user_id'],
            'name'          => $u['user_name'],
            'is_admin'      => $u['is_admin'],
            'position_code' => $u['position_code'],
            'theme'         => $u['theme'] ?? 'light',
        ],
    ]);
}

function handleLogout(Response $res): Response
{
    foreach (['access_token', 'refresh_token'] as $name) {
        setcookie($name, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true]);
    }
    return jsonOut($res, ['success' => true, 'message' => '로그아웃되었습니다.']);
}

function handleRefresh(Request $req, Response $res, $container): Response
{
    $cookies = $req->getCookieParams();
    $rt      = $cookies['refresh_token'] ?? ($req->getParsedBody()['refresh_token'] ?? '');

    if (!$rt) return jsonOut($res, ['success' => false, 'message' => '리프레시 토큰이 없습니다.'], 401);

    try {
        $secret  = $_ENV['APP_PWD_KEY'] ?? 'secret';
        $payload = JWT::decode($rt, new Key($secret, JWT_ALGO));
        if (($payload->type ?? '') !== 'refresh') throw new \Exception('type mismatch');
    } catch (\Throwable) {
        return jsonOut($res, ['success' => false, 'message' => '리프레시 토큰이 유효하지 않습니다.'], 401);
    }

    try {
        $pdo  = $container->get(\PDO::class);
        $hash = hash('sha256', $rt);
        $stmt = $pdo->prepare(
            'SELECT user_id FROM mis_refresh_tokens
              WHERE token_hash = ? AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute([$hash]);
        $row = $stmt->fetch();
        if (!$row) throw new \Exception('token not found');
    } catch (\Throwable) {
        return jsonOut($res, ['success' => false, 'message' => '세션이 만료되었습니다.'], 401);
    }

    // 새 access token 발급
    $now     = time();
    $secret  = $_ENV['APP_PWD_KEY'] ?? 'secret';
    $newAccess = JWT::encode([
        'type' => 'access',
        'sub'  => $payload->sub,
        'uid'  => $payload->uid,
        'iat'  => $now,
        'exp'  => $now + JWT_ACCESS_TTL,
    ], $secret, JWT_ALGO);

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie('access_token', $newAccess, [
        'expires'  => $now + JWT_ACCESS_TTL,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $secure,
        'samesite' => 'Lax',
    ]);

    return jsonOut($res, ['success' => true, 'access_token' => $newAccess]);
}

function handleDownload(Request $req, Response $res, $container): Response
{
    $attachIdx = (int)($req->getQueryParams()['idx'] ?? 0);
    if ($attachIdx <= 0) return jsonOut($res, ['success' => false, 'message' => '잘못된 요청'], 400);

    $fm   = $container->get(FileManager::class);
    $info = $fm->getFilePath($attachIdx);
    if (!$info) return jsonOut($res, ['success' => false, 'message' => '파일을 찾을 수 없습니다.'], 404);

    $encodedName = rawurlencode($info['orig_name']);
    $body = $res->getBody();
    $body->write((string)file_get_contents($info['path']));

    $inline = ($req->getQueryParams()['view'] ?? '') === '1';
    $disp   = $inline ? 'inline' : 'attachment';

    return $res
        ->withHeader('Content-Type', $info['mime_type'])
        ->withHeader('Content-Disposition', "{$disp}; filename*=UTF-8''{$encodedName}")
        ->withHeader('Content-Length', (string)filesize($info['path']));
}
