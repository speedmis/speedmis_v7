-- SpeedMIS v7 실제 DB 기준 컬럼 정규화
-- 실행 대상 DB가 이미 소문자+언더스코어로 1차 변환된 상태를 기준으로 작성
-- 생성일: 2026-04-02

USE speedmis_v7;

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- mis_users
-- =============================================================================
ALTER TABLE `mis_users`
  CHANGE `num`           `idx`           int(11)      NOT NULL AUTO_INCREMENT,
  CHANGE `unique_num`    `user_id`       varchar(50)  NOT NULL,
  CHANGE `passwd_decrypt` `password`     varchar(100) NULL DEFAULT NULL,
  CHANGE `position_num`  `position_code` int(11)      NULL DEFAULT NULL,
  CHANGE `station__new_num` `station_idx` int(11)     NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `is_admin` char(1) NOT NULL DEFAULT 'N' COMMENT 'Y=관리자',
  ADD COLUMN IF NOT EXISTS `use_yn`   char(1) NOT NULL DEFAULT '1' COMMENT '1=사용';

-- =============================================================================
-- mis_menu_fields
-- =============================================================================
ALTER TABLE `mis_menu_fields`
  CHANGE `sort_element`            `sort_order`        float        NULL DEFAULT NULL,
  CHANGE `grid__select__field`     `db_field`          varchar(2000) NULL DEFAULT NULL,
  CHANGE `grid__select__tname`     `db_table`          varchar(50)  NULL DEFAULT NULL,
  CHANGE `grid__columns__title`    `col_title`         varchar(100) NULL DEFAULT NULL,
  CHANGE `grid__columns__width`    `col_width`         int(11)      NULL DEFAULT NULL,
  CHANGE `grid__schema__type`      `schema_type`       varchar(50)  NULL DEFAULT NULL,
  CHANGE `grid__items`             `items`             varchar(2000) NULL DEFAULT NULL,
  CHANGE `grid__schema__validation` `schema_validation` varchar(500) NULL DEFAULT NULL,
  CHANGE `grid__max_length`        `max_length`        varchar(50)  NULL DEFAULT NULL,
  CHANGE `grid__default`           `default_value`     varchar(2000) NULL DEFAULT NULL,
  CHANGE `grid__pil`               `required`          varchar(50)  NULL DEFAULT NULL,
  CHANGE `grid__form_group`        `form_group`        varchar(50)  NULL DEFAULT NULL;

-- =============================================================================
-- mis_group_rules
-- =============================================================================
ALTER TABLE `mis_group_rules`
  CHANGE `gidx` `group_idx` int(11) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `auth_code` char(2) NULL DEFAULT NULL COMMENT '메뉴 auth_code 매핑';

-- =============================================================================
-- mis_group_members
-- =============================================================================
ALTER TABLE `mis_group_members`
  CHANGE `gidx`   `group_idx` int(11)     NULL DEFAULT NULL,
  CHANGE `userid` `user_id`   varchar(50) NULL DEFAULT NULL;

-- =============================================================================
-- mis_stations
-- =============================================================================
ALTER TABLE `mis_stations`
  CHANGE `num` `idx` int(11) NOT NULL AUTO_INCREMENT;

-- =============================================================================
-- 신규 테이블 (v6에 없던 테이블)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `mis_login_locks` (
    `user_id`      varchar(50) NOT NULL,
    `fail_count`   int         NOT NULL DEFAULT 0,
    `last_fail_at` datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mis_refresh_tokens` (
    `id`         int         NOT NULL AUTO_INCREMENT,
    `user_id`    varchar(50) NOT NULL,
    `token_hash` varchar(64) NOT NULL,
    `expires_at` datetime    NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_id`    (`user_id`),
    KEY        `idx_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mis_attachments` (
    `idx`         int          NOT NULL AUTO_INCREMENT,
    `menu_idx`    int          NOT NULL DEFAULT 0,
    `link_idx`    int          NOT NULL DEFAULT 0,
    `real_pid`    varchar(14)  NOT NULL DEFAULT '',
    `orig_name`   varchar(255) NOT NULL,
    `stored_name` varchar(255) NOT NULL,
    `file_path`   varchar(500) NOT NULL,
    `file_size`   int          NOT NULL DEFAULT 0,
    `mime_type`   varchar(100) NOT NULL DEFAULT '',
    `user_id`     varchar(50)  NOT NULL DEFAULT '',
    `wdate`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`idx`),
    KEY `idx_link`    (`link_idx`, `menu_idx`),
    KEY `idx_real_pid` (`real_pid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
