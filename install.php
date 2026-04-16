<?php
/**
 * SpeedMIS v7 — Install Wizard
 *
 * 1) DB 접속정보 입력 → 연결 테스트
 * 2) DB 생성 (없으면) → 테이블 생성 → 시드 데이터 삽입
 * 3) 관리자 계정 설정
 * 4) .env 자동 생성
 * 5) 설치 완료 → install.php 잠금
 */

// 이미 설치되었으면 차단
if (file_exists(__DIR__ . '/.env') && !isset($_GET['force'])) {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SpeedMIS</title></head><body style="font-family:sans-serif;text-align:center;padding:80px">';
    echo '<h2>SpeedMIS v7 은 이미 설치되어 있습니다.</h2>';
    echo '<p><a href="/">메인으로 이동</a></p></body></html>';
    exit;
}

$step    = (int)($_POST['step'] ?? $_GET['step'] ?? 1);
$errors  = [];
$success = '';

// ── STEP 2: DB 연결 테스트 & 생성 ──────────────────────────────────────────
if ($step === 2 && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $dbHost = trim($_POST['db_host'] ?? '');
    $dbPort = trim($_POST['db_port'] ?? '3306');
    $dbName = trim($_POST['db_name'] ?? 'speedmis_v7');
    $dbUser = trim($_POST['db_user'] ?? '');
    $dbPass = $_POST['db_pass'] ?? '';

    if (!$dbHost) $errors[] = 'DB 호스트를 입력하세요.';
    if (!$dbUser) $errors[] = 'DB 사용자를 입력하세요.';
    if (!$dbName) $errors[] = 'DB 이름을 입력하세요.';

    if (empty($errors)) {
        try {
            // DB 없이 서버 접속 테스트
            $pdo = new PDO(
                "mysql:host={$dbHost};port={$dbPort};charset=utf8mb4",
                $dbUser, $dbPass,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );

            // DB 생성 (없으면)
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("USE `{$dbName}`");

            // 이미 핵심 테이블이 있는지 확인
            $existing = $pdo->query("SHOW TABLES LIKE 'mis_menus'")->fetchColumn();
            if ($existing) {
                $errors[] = "'{$dbName}' 데이터베이스에 이미 mis_menus 테이블이 존재합니다. 빈 DB를 사용하거나, DB 이름을 변경하세요.";
            }
        } catch (PDOException $e) {
            $errors[] = 'DB 연결 실패: ' . $e->getMessage();
        }
    }

    if (empty($errors)) {
        // 테이블 생성
        $schemaSql = file_get_contents(__DIR__ . '/migration/v7_fresh_install.sql');
        if (!$schemaSql) {
            $errors[] = 'migration/v7_fresh_install.sql 파일을 찾을 수 없습니다.';
        } else {
            try {
                $pdo->exec($schemaSql);
            } catch (PDOException $e) {
                $errors[] = '테이블 생성 실패: ' . $e->getMessage();
            }
        }

        // 시드 데이터
        if (empty($errors)) {
            $seedSql = file_get_contents(__DIR__ . '/migration/v7_seed_data.sql');
            if ($seedSql) {
                try {
                    $pdo->exec($seedSql);
                } catch (PDOException $e) {
                    $errors[] = '시드 데이터 삽입 실패: ' . $e->getMessage();
                }
            }
        }

        if (empty($errors)) {
            // 세션에 DB 정보 저장 (step 3 에서 사용)
            session_start();
            $_SESSION['install_db'] = compact('dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPass');
            $step = 3;
        }
    }

    if (!empty($errors)) $step = 1;
}

// ── STEP 3: 관리자 계정 + .env 생성 ──────────────────────────────────────────
if ($step === 3 && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['admin_id'])) {
    session_start();
    $db = $_SESSION['install_db'] ?? null;
    if (!$db) { $errors[] = '세션이 만료되었습니다. 처음부터 다시 진행하세요.'; $step = 1; }

    $adminId   = trim($_POST['admin_id']   ?? '');
    $adminName = trim($_POST['admin_name'] ?? '');
    $adminPass = trim($_POST['admin_pass'] ?? '');
    $adminPass2= trim($_POST['admin_pass2'] ?? '');
    $siteTitle = trim($_POST['site_title'] ?? 'SpeedMIS v7');
    $appUrl    = trim($_POST['app_url']    ?? 'http://localhost');

    if (!$adminId)   $errors[] = '관리자 아이디를 입력하세요.';
    if (!$adminName) $errors[] = '관리자 이름을 입력하세요.';
    if (strlen($adminPass) < 4) $errors[] = '비밀번호는 4자 이상이어야 합니다.';
    if ($adminPass !== $adminPass2) $errors[] = '비밀번호가 일치하지 않습니다.';

    if (empty($errors) && $db) {
        try {
            $pdo = new PDO(
                "mysql:host={$db['dbHost']};port={$db['dbPort']};dbname={$db['dbName']};charset=utf8mb4",
                $db['dbUser'], $db['dbPass'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );

            // 관리자 계정 INSERT
            $hashed = password_hash($adminPass, PASSWORD_DEFAULT);
            $pdo->prepare(
                "INSERT INTO mis_users (user_id, user_name, password, is_admin, use_yn, is_stop, wdate)
                 VALUES (?, ?, ?, 'Y', '1', 'N', NOW())"
            )->execute([$adminId, $adminName, $hashed]);

            // 부서 기본값
            $pdo->exec("INSERT IGNORE INTO mis_stations (idx, station_name, auto_gubun, use_yn, wdate) VALUES (1, '본사', '0001', '1', NOW())");

            // .env 생성
            $pwdKey = bin2hex(random_bytes(32));
            $env = <<<ENV
DB_HOST={$db['dbHost']}
DB_PORT={$db['dbPort']}
DB_NAME={$db['dbName']}
DB_USER={$db['dbUser']}
DB_PASS={$db['dbPass']}
DB_CHARSET=utf8mb4

APP_ENV=production
APP_DEBUG=false
APP_URL={$appUrl}
APP_PWD_KEY={$pwdKey}

SITE_ID=speedmis
REAL_PID_HOME=speedmis000001
SITE_TITLE="{$siteTitle}"

DEFAULT_PAGE_SIZE=25
AUTO_LOGOUT_MINUTE=30
LOGIN_FAIL_LEVEL=1

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_NAME=
ENV;
            file_put_contents(__DIR__ . '/.env', $env);

            // 디렉토리 생성
            foreach (['uploadFiles', 'uploadFiles/_temp', 'logs', 'logs/cache'] as $d) {
                $dir = __DIR__ . '/' . $d;
                if (!is_dir($dir)) @mkdir($dir, 0755, true);
            }

            // 세션 정리
            unset($_SESSION['install_db']);

            $step = 4;
        } catch (PDOException $e) {
            $errors[] = '관리자 생성 실패: ' . $e->getMessage();
        }
    }

    if (!empty($errors)) $step = 3;
}

// step 3 진입 (GET 또는 DB 생성 성공 후)
if ($step === 3 && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    session_start();
    if (empty($_SESSION['install_db'])) { $step = 1; }
}

?>
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SpeedMIS v7 Install</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Pretendard', -apple-system, sans-serif; background: #f4f5f7; color: #1a1d27; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 480px; max-width: 95vw; padding: 40px; }
  h1 { font-size: 22px; margin-bottom: 6px; }
  .sub { color: #8c93b0; font-size: 14px; margin-bottom: 28px; }
  .step-bar { display: flex; gap: 8px; margin-bottom: 28px; }
  .step-dot { flex: 1; height: 4px; border-radius: 2px; background: #dde0e8; }
  .step-dot.active { background: #4f6ef7; }
  .step-dot.done { background: #22c55e; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; color: #4a5068; }
  input[type=text], input[type=password], input[type=number] {
    width: 100%; height: 38px; border: 1px solid #dde0e8; border-radius: 6px;
    padding: 0 12px; font-size: 14px; outline: none; transition: border 0.15s;
  }
  input:focus { border-color: #4f6ef7; }
  .row { margin-bottom: 16px; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .btn {
    width: 100%; height: 42px; border: 0; border-radius: 6px; font-size: 15px; font-weight: 600;
    background: #4f6ef7; color: #fff; cursor: pointer; transition: background 0.15s;
  }
  .btn:hover { background: #3b5de7; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .err { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  .ok { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  .hint { font-size: 12px; color: #8c93b0; margin-top: 4px; }
  .done-icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
  a { color: #4f6ef7; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="card">

  <div class="step-bar">
    <div class="step-dot <?= $step >= 2 ? 'done' : ($step === 1 ? 'active' : '') ?>"></div>
    <div class="step-dot <?= $step >= 3 ? 'done' : ($step === 2 ? 'active' : '') ?>"></div>
    <div class="step-dot <?= $step >= 4 ? 'done' : ($step === 3 ? 'active' : '') ?>"></div>
  </div>

<?php if ($step === 1): // ── DB 접속정보 ── ?>
  <h1>SpeedMIS v7 설치</h1>
  <p class="sub">1단계 — 데이터베이스 접속 정보</p>

  <?php foreach ($errors as $e): ?><div class="err"><?= htmlspecialchars($e) ?></div><?php endforeach; ?>

  <form method="post">
    <input type="hidden" name="step" value="2">
    <div class="row">
      <label>DB 호스트</label>
      <input type="text" name="db_host" value="<?= htmlspecialchars($_POST['db_host'] ?? '127.0.0.1') ?>" placeholder="127.0.0.1" required>
    </div>
    <div class="row2">
      <div>
        <label>DB 포트</label>
        <input type="number" name="db_port" value="<?= htmlspecialchars($_POST['db_port'] ?? '3306') ?>" placeholder="3306">
      </div>
      <div>
        <label>DB 이름</label>
        <input type="text" name="db_name" value="<?= htmlspecialchars($_POST['db_name'] ?? 'speedmis_v7') ?>" placeholder="speedmis_v7" required>
      </div>
    </div>
    <div class="row2">
      <div>
        <label>DB 사용자</label>
        <input type="text" name="db_user" value="<?= htmlspecialchars($_POST['db_user'] ?? 'root') ?>" required>
      </div>
      <div>
        <label>DB 비밀번호</label>
        <input type="password" name="db_pass" value="">
      </div>
    </div>
    <div class="hint" style="margin-bottom:20px">데이터베이스가 없으면 자동으로 생성합니다.</div>
    <button type="submit" class="btn">연결 테스트 &amp; 설치</button>
  </form>

<?php elseif ($step === 3): // ── 관리자 계정 ── ?>
  <h1>관리자 설정</h1>
  <p class="sub">2단계 — 관리자 계정 및 사이트 정보</p>

  <?php foreach ($errors as $e): ?><div class="err"><?= htmlspecialchars($e) ?></div><?php endforeach; ?>

  <form method="post">
    <input type="hidden" name="step" value="3">
    <div class="row2">
      <div>
        <label>관리자 아이디</label>
        <input type="text" name="admin_id" value="<?= htmlspecialchars($_POST['admin_id'] ?? 'admin') ?>" required>
      </div>
      <div>
        <label>관리자 이름</label>
        <input type="text" name="admin_name" value="<?= htmlspecialchars($_POST['admin_name'] ?? '관리자') ?>" required>
      </div>
    </div>
    <div class="row2">
      <div>
        <label>비밀번호</label>
        <input type="password" name="admin_pass" required>
      </div>
      <div>
        <label>비밀번호 확인</label>
        <input type="password" name="admin_pass2" required>
      </div>
    </div>
    <div class="row">
      <label>사이트 제목</label>
      <input type="text" name="site_title" value="<?= htmlspecialchars($_POST['site_title'] ?? 'SpeedMIS v7') ?>">
    </div>
    <div class="row">
      <label>사이트 URL</label>
      <input type="text" name="app_url" value="<?= htmlspecialchars($_POST['app_url'] ?? 'http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')) ?>" placeholder="http://example.com">
      <div class="hint">외부 접속 주소 (포트 포함). 예: http://myserver.com:8087</div>
    </div>
    <button type="submit" class="btn">설치 완료</button>
  </form>

<?php elseif ($step === 4): // ── 완료 ── ?>
  <div class="done-icon">&#10004;</div>
  <h1 style="text-align:center">설치 완료!</h1>
  <p class="sub" style="text-align:center">SpeedMIS v7 이 성공적으로 설치되었습니다.</p>
  <div class="ok">
    <strong>.env</strong> 파일이 생성되었습니다.<br>
    보안을 위해 <strong>install.php 파일을 삭제</strong>하세요.
  </div>
  <a href="/" style="display:block;text-align:center;margin-top:20px;font-size:15px;font-weight:600">로그인 페이지로 이동 &rarr;</a>

<?php endif; ?>

</div>
</body>
</html>
