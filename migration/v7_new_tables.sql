-- SpeedMIS v7 신규 테이블 / 컬럼 추가
-- v6에 없던 v7 전용 테이블 및 mis_users 신규 컬럼
-- 생성일: 2026-04-02

USE speedmis_v7;

-- ─── mis_users 신규 컬럼 ──────────────────────────────────────────────────────
-- v6에서 권한 로직으로 계산하던 is_admin 을 v7에서는 DB 컬럼으로 관리
ALTER TABLE `mis_users`
  ADD COLUMN IF NOT EXISTS `is_admin`  char(1)      NOT NULL DEFAULT 'N'  COMMENT 'Y=관리자',
  ADD COLUMN IF NOT EXISTS `use_yn`    char(1)      NOT NULL DEFAULT '1'  COMMENT '1=사용,0=정지',
  ADD COLUMN IF NOT EXISTS `auth_version` int        NOT NULL DEFAULT 0    COMMENT '타장비 강제로그아웃용 버전';

-- ─── 로그인 잠금 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `mis_login_locks` (
    `user_id`      varchar(50)  NOT NULL               COMMENT '로그인 시도 아이디',
    `fail_count`   int          NOT NULL DEFAULT 0     COMMENT '연속 실패 횟수',
    `last_fail_at` datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP COMMENT '마지막 실패 일시',
    PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='로그인 실패 잠금 (5회 실패 → 1시간 차단)';

-- ─── JWT Refresh Token ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `mis_refresh_tokens` (
    `id`         int          NOT NULL AUTO_INCREMENT,
    `user_id`    varchar(50)  NOT NULL                 COMMENT '사용자 ID (mis_users.user_id)',
    `token_hash` varchar(64)  NOT NULL                 COMMENT 'SHA-256(refresh_token)',
    `expires_at` datetime     NOT NULL                 COMMENT '만료 일시',
    PRIMARY KEY (`id`),
    UNIQUE  KEY `uk_user_id`    (`user_id`),
    KEY         `idx_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='JWT Refresh Token 저장소 (사용자당 1개)';

-- ─── 파일 첨부 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `mis_attachments` (
    `idx`         int           NOT NULL AUTO_INCREMENT,
    `menu_idx`    int           NOT NULL DEFAULT 0     COMMENT '메뉴 idx (mis_menus.idx)',
    `link_idx`    int           NOT NULL DEFAULT 0     COMMENT '연결 레코드 idx',
    `real_pid`    varchar(14)   NOT NULL DEFAULT ''    COMMENT '메뉴 real_pid',
    `orig_name`   varchar(255)  NOT NULL               COMMENT '원본 파일명',
    `stored_name` varchar(255)  NOT NULL               COMMENT '저장 파일명 (랜덤 hex)',
    `file_path`   varchar(500)  NOT NULL               COMMENT 'UPLOADS_PATH 기준 상대경로',
    `file_size`   int           NOT NULL DEFAULT 0     COMMENT '파일 크기(bytes)',
    `mime_type`   varchar(100)  NOT NULL DEFAULT ''    COMMENT 'MIME 타입',
    `user_id`     varchar(50)   NOT NULL DEFAULT ''    COMMENT '업로드 사용자',
    `wdate`       datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`idx`),
    KEY `idx_link` (`link_idx`, `menu_idx`),
    KEY `idx_real_pid` (`real_pid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='파일 첨부 (업로드/다운로드/삭제)';
