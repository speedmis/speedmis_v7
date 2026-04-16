-- SpeedMIS v7 DB 마이그레이션
-- v6 PascalCase → v7 snake_case
-- 생성일: 2026-04-01

USE speedmis_v7;

SET FOREIGN_KEY_CHECKS=0;

-- ===== MisComments → mis_comments =====
ALTER TABLE `MisComments`
  CHANGE `RealPid` `real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisComments` TO `mis_comments`;

-- ===== MisCommentsLike → mis_comment_likes =====
ALTER TABLE `MisCommentsLike`
  CHANGE `commentsIdx` `comments_idx` int(11) NULL DEFAULT NULL,
  CHANGE `likeOrHate` `like_or_hate` char(1) NULL DEFAULT NULL;
RENAME TABLE `MisCommentsLike` TO `mis_comment_likes`;

-- ===== MisCommonTable → mis_common_data =====
ALTER TABLE `MisCommonTable`
  CHANGE `RealCid` `real_cid` varchar(14) NULL DEFAULT NULL,
  CHANGE `Gcode` `gcode` varchar(14) NULL DEFAULT NULL,
  CHANGE `Kcode` `kcode` varchar(16) NULL DEFAULT NULL,
  CHANGE `Kname` `kname` varchar(500) NULL DEFAULT NULL,
  CHANGE `Kname2` `kname2` varchar(500) NULL DEFAULT NULL,
  CHANGE `DocItem` `doc_item` varchar(4000) NULL DEFAULT NULL,
  CHANGE `Station` `station` varchar(50) NULL DEFAULT NULL,
  CHANGE `Userid` `userid` varchar(50) NULL DEFAULT NULL,
  CHANGE `Flag1` `flag1` varchar(20) NULL DEFAULT NULL,
  CHANGE `Flag2` `flag2` varchar(20) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `transID` `trans_id` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisCommonTable` TO `mis_common_data`;

-- ===== MisCompanyMgt → mis_companies =====
ALTER TABLE `MisCompanyMgt`
  CHANGE `Clon_CustIdx` `clon_cust_idx` int(11) NULL DEFAULT NULL,
  CHANGE `UserID` `user_id` varchar(50) NULL DEFAULT NULL,
  CHANGE `TaxIdx` `tax_idx` int(11) NULL DEFAULT NULL,
  CHANGE `CompanyCEO` `company_ceo` varchar(50) NULL DEFAULT NULL,
  CHANGE `BusinessNo` `business_no` varchar(50) NULL DEFAULT NULL,
  CHANGE `CorporationNo` `corporation_no` varchar(50) NULL DEFAULT NULL,
  CHANGE `BusinessCondition` `business_condition` varchar(50) NULL DEFAULT NULL,
  CHANGE `BusinessItem` `business_item` varchar(50) NULL DEFAULT NULL,
  CHANGE `BankInfo1` `bank_info1` varchar(100) NULL DEFAULT NULL,
  CHANGE `BankInfo2` `bank_info2` varchar(100) NULL DEFAULT NULL,
  CHANGE `BankInfo3` `bank_info3` varchar(100) NULL DEFAULT NULL,
  CHANGE `BankInfoBrief` `bank_info_brief` varchar(100) NULL DEFAULT NULL,
  CHANGE `자재담당HP` `자재담당hp` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `isMainCompany` `is_main_company` varchar(1) NULL DEFAULT NULL;
RENAME TABLE `MisCompanyMgt` TO `mis_companies`;

-- ===== MisCustCounsel_Detail → mis_counsel_detail =====
ALTER TABLE `MisCustCounsel_Detail`
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisCustCounsel_Detail` TO `mis_counsel_detail`;

-- ===== MisCustCounsel_Master → mis_counsel_master =====
ALTER TABLE `MisCustCounsel_Master`
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisCustCounsel_Master` TO `mis_counsel_master`;

-- ===== MisEmailSkin → mis_email_skins =====
ALTER TABLE `MisEmailSkin`
  CHANGE `RealEid` `real_eid` varchar(14) NULL DEFAULT NULL,
  CHANGE `EmailFrom` `email_from` varchar(100) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisEmailSkin` TO `mis_email_skins`;

-- ===== MisFavoriteMenu → mis_favorite_menus =====
ALTER TABLE `MisFavoriteMenu`
  CHANGE `RealPid` `real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `isMain` `is_main` char(1) NULL DEFAULT NULL,
  CHANGE `isPublic` `is_public` char(1) NULL DEFAULT NULL,
  CHANGE `isNotRecently` `is_not_recently` char(1) NULL DEFAULT NULL,
  CHANGE `isSendMail` `is_send_mail` char(1) NULL DEFAULT NULL,
  CHANGE `AddURL` `add_url` varchar(500) NULL DEFAULT NULL,
  CHANGE `W2` `w2` bit(1) NULL DEFAULT NULL,
  CHANGE `H2` `h2` bit(1) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisFavoriteMenu` TO `mis_favorite_menus`;

-- ===== MisGlobal_Language → mis_global_languages =====
ALTER TABLE `MisGlobal_Language`
  CHANGE `LanguageCode` `language_code` varchar(20) NULL DEFAULT NULL,
  CHANGE `LanguageName` `language_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `isSupport` `is_support` varchar(1) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `tinymceCode` `tinymce_code` varchar(10) NULL DEFAULT NULL;
RENAME TABLE `MisGlobal_Language` TO `mis_global_languages`;

-- ===== MisGroup_Detail → mis_group_rules =====
ALTER TABLE `MisGroup_Detail`
  CHANGE `SetNewStation` `set_new_station` int(11) NULL DEFAULT NULL,
  CHANGE `WhereCode1` `where_code1` char(2) NULL DEFAULT NULL,
  CHANGE `SetPosition` `set_position` char(2) NULL DEFAULT NULL,
  CHANGE `WhereCode2` `where_code2` char(2) NULL DEFAULT NULL,
  CHANGE `SetUserid` `set_userid` varchar(50) NOT NULL,
  CHANGE `isAdminS` `is_admin_s` char(1) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisGroup_Detail` TO `mis_group_rules`;

-- ===== MisGroup_Master → mis_groups =====
ALTER TABLE `MisGroup_Master`
  CHANGE `UsingLevel` `using_level` char(2) NULL DEFAULT NULL,
  CHANGE `AllListMember` `all_list_member` varchar(3000) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisGroup_Master` TO `mis_groups`;

-- ===== MisGroup_Member → mis_group_members =====
ALTER TABLE `MisGroup_Member`
  CHANGE `isAdminS` `is_admin_s` char(1) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisGroup_Member` TO `mis_group_members`;

-- ===== MisGroup_Member_Log → mis_group_member_logs =====
ALTER TABLE `MisGroup_Member_Log`
  CHANGE `setPosition` `set_position` int(11) NULL DEFAULT NULL,
  CHANGE `whereCode2` `where_code2` varchar(10) NULL DEFAULT NULL,
  CHANGE `isAdminS` `is_admin_s` varchar(1) NULL DEFAULT NULL;
RENAME TABLE `MisGroup_Member_Log` TO `mis_group_member_logs`;

-- ===== MisHelp → mis_help =====
ALTER TABLE `MisHelp`
  CHANGE `phpCode` `php_code` varchar(4000) NULL DEFAULT NULL,
  CHANGE `youtubeCode` `youtube_code` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisHelp` TO `mis_help`;

-- ===== MisHoliDayDefine → mis_holidays =====
ALTER TABLE `MisHoliDayDefine`
  CHANGE `useflag` `use_yn` char(1) NOT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisHoliDayDefine` TO `mis_holidays`;

-- ===== MisHomeImages → mis_home_images =====
ALTER TABLE `MisHomeImages`
  CHANGE `Attach01` `attach01` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach01_midx` `attach01_midx` int(11) NULL DEFAULT NULL,
  CHANGE `Attach02` `attach02` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach02_midx` `attach02_midx` int(11) NULL DEFAULT NULL,
  CHANGE `Attach03` `attach03` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach03_midx` `attach03_midx` int(11) NULL DEFAULT NULL,
  CHANGE `Attach04` `attach04` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach04_midx` `attach04_midx` int(11) NULL DEFAULT NULL,
  CHANGE `Attach05` `attach05` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach05_midx` `attach05_midx` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisHomeImages` TO `mis_home_images`;

-- ===== MisIncomeMgt → mis_income_mgt =====
ALTER TABLE `MisIncomeMgt`
  CHANGE `saveDate` `save_date` char(10) NULL DEFAULT NULL,
  CHANGE `Contents` `contents` varchar(500) NULL DEFAULT NULL,
  CHANGE `saveMoney` `save_money` bigint(20) NULL DEFAULT NULL,
  CHANGE `savePlan` `save_plan` varchar(500) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NOT NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisIncomeMgt` TO `mis_income_mgt`;

-- ===== MisLog → mis_activity_logs =====
ALTER TABLE `MisLog`
  CHANGE `logType` `log_type` varchar(8) NOT NULL,
  CHANGE `menuIdx` `menu_idx` bigint(20) NULL DEFAULT NULL,
  CHANGE `HTTP_REFERER` `http_referer` varchar(1000) NULL DEFAULT NULL,
  CHANGE `linkDateTime` `link_date_time` datetime NULL DEFAULT NULL,
  CHANGE `linkResult` `link_result` char(2) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `HTTP_USER_AGENT` `http_user_agent` varchar(4000) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisLog` TO `mis_activity_logs`;

-- ===== MisMenuList → mis_menus =====
ALTER TABLE `MisMenuList`
  CHANGE `RealPid` `real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `MenuName` `menu_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `briefTitle` `brief_title` varchar(20) NULL DEFAULT NULL,
  CHANGE `isMenuHidden` `is_menu_hidden` char(1) NULL DEFAULT NULL,
  CHANGE `AuthCode` `auth_code` char(2) NULL DEFAULT NULL,
  CHANGE `AllListMember` `all_list_member` text NULL DEFAULT NULL,
  CHANGE `wAllListMember` `w_all_list_member` text NULL DEFAULT NULL,
  CHANGE `MenuType` `menu_type` char(2) NULL DEFAULT NULL,
  CHANGE `upRealPid` `up_real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `AddURL` `add_url` varchar(500) NULL DEFAULT NULL,
  CHANGE `AutoGubun` `auto_gubun` varchar(6) NULL DEFAULT NULL,
  CHANGE `SortG2` `sort_g2` float NULL DEFAULT NULL,
  CHANGE `SortG4` `sort_g4` float NULL DEFAULT NULL,
  CHANGE `SortG6` `sort_g6` float NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `filelastupdate` `file_last_update` datetime NULL DEFAULT NULL,
  CHANGE `filelastupdater` `file_last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `compiledate` `compile_date` datetime NULL DEFAULT NULL,
  CHANGE `addLogic` `add_logic` mediumtext NULL DEFAULT NULL,
  CHANGE `addLogic_treat` `add_logic_treat` mediumtext NULL DEFAULT NULL,
  CHANGE `isUsePrint` `is_use_print` bit(1) NULL DEFAULT NULL,
  CHANGE `isUseForm` `is_use_form` bit(1) NULL DEFAULT NULL,
  CHANGE `addLogic_print` `add_logic_print` mediumtext NULL DEFAULT NULL,
  CHANGE `LanguageCode` `language_code` varchar(10) NULL DEFAULT NULL,
  CHANGE `MisJoinPid` `mis_join_pid` varchar(50) NULL DEFAULT NULL,
  CHANGE `MisJoinList` `mis_join_list` varchar(300) NULL DEFAULT NULL,
  CHANGE `transID` `trans_id` varchar(50) NULL DEFAULT NULL,
  CHANGE `isCoreProgram` `is_core_program` varchar(1) NULL DEFAULT NULL,
  CHANGE `excelData` `excel_data` varchar(50) NULL DEFAULT NULL,
  CHANGE `excelData_midx` `excel_data_midx` int(11) NULL DEFAULT NULL,
  CHANGE `SPREADSHEET_ID` `spreadsheet_id` varchar(300) NULL DEFAULT NULL;
RENAME TABLE `MisMenuList` TO `mis_menus`;

-- ===== MisMenuList_Detail → mis_menu_fields =====
ALTER TABLE `MisMenuList_Detail`
  CHANGE `RealPid` `real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `SortElement` `sort_order` float NULL DEFAULT NULL,
  CHANGE `Grid_Select_Field` `db_field` varchar(2000) NULL DEFAULT '',
  CHANGE `Grid_Select_Tname` `db_table` varchar(50) NULL DEFAULT '',
  CHANGE `aliasName` `alias_name` varchar(100) NULL DEFAULT '',
  CHANGE `RealPidAliasName` `real_pid_alias_name` varchar(100) NULL DEFAULT '',
  CHANGE `Grid_Columns_Title` `col_title` varchar(100) NULL DEFAULT '',
  CHANGE `Grid_Columns_Width` `col_width` int(11) NOT NULL DEFAULT '0',
  CHANGE `Grid_View_Fixed` `col_fixed` bit(1) NULL DEFAULT NULL,
  CHANGE `Grid_Enter` `col_enter` bit(1) NULL DEFAULT NULL,
  CHANGE `Grid_View_XS` `col_xs` int(11) NULL DEFAULT NULL,
  CHANGE `Grid_View_SM` `col_sm` int(11) NULL DEFAULT NULL,
  CHANGE `Grid_View_MD` `col_md` int(11) NULL DEFAULT NULL,
  CHANGE `Grid_View_LG` `col_lg` int(11) NULL DEFAULT NULL,
  CHANGE `Grid_View_Hight` `col_height` int(11) NULL DEFAULT NULL,
  CHANGE `Grid_View_Class` `col_class` varchar(100) NULL DEFAULT '',
  CHANGE `Grid_IsVisibleMobile` `is_visible_mobile` bit(1) NULL DEFAULT NULL,
  CHANGE `Grid_Schema_Type` `schema_type` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_Items` `items` varchar(2000) NULL DEFAULT NULL,
  CHANGE `Grid_Schema_Validation` `schema_validation` varchar(500) NULL DEFAULT NULL,
  CHANGE `Grid_Align` `align` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_Orderby` `orderby` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_Relation` `relation` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_MaxLength` `max_length` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_Default` `default_value` varchar(2000) NULL DEFAULT NULL,
  CHANGE `Grid_GroupCompute` `group_compute` varchar(2000) NULL DEFAULT NULL,
  CHANGE `Grid_CtlName` `ctl_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_IsHandle` `is_handle` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_ListEdit` `list_edit` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_Templete` `template` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_PrimeKey` `prime_key` varchar(2000) NULL DEFAULT NULL,
  CHANGE `Grid_Alim` `alim` varchar(2000) NULL DEFAULT NULL,
  CHANGE `Grid_Pil` `required` varchar(50) NULL DEFAULT NULL,
  CHANGE `Grid_FormGroup` `form_group` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `transID` `trans_id` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisMenuList_Detail` TO `mis_menu_fields`;

-- ===== MisMenuList_Language → mis_menu_languages =====
ALTER TABLE `MisMenuList_Language`
  CHANGE `RealPid` `real_pid` varchar(14) NOT NULL,
  CHANGE `From_LanguageCode` `from_language_code` char(2) NOT NULL,
  CHANGE `To_LanguageCode` `to_language_code` char(2) NOT NULL,
  CHANGE `isOK` `is_ok` char(1) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisMenuList_Language` TO `mis_menu_languages`;

-- ===== MisMenuList_Member → mis_menu_auth =====
ALTER TABLE `MisMenuList_Member`
  CHANGE `RealPid` `real_pid` varchar(14) NOT NULL,
  CHANGE `AuthorityLevel` `authority_level` int(11) NOT NULL;
RENAME TABLE `MisMenuList_Member` TO `mis_menu_auth`;

-- ===== MisMenuList_UserAuth → mis_menu_user_auth =====
ALTER TABLE `MisMenuList_UserAuth`
  CHANGE `userID` `user_id` varchar(50) NULL DEFAULT NULL,
  CHANGE `RealPid` `real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `menuAuthCode` `menu_auth_code` varchar(2) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisMenuList_UserAuth` TO `mis_menu_user_auth`;

-- ===== MisMessageLog → mis_message_logs =====
ALTER TABLE `MisMessageLog`
  CHANGE `HTTP_USER_AGENT` `http_user_agent` varchar(500) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisMessageLog` TO `mis_message_logs`;

-- ===== MisMoney_AccountCode → mis_account_codes =====
ALTER TABLE `MisMoney_AccountCode`
  CHANGE `Kcode` `kcode` varchar(50) NOT NULL,
  CHANGE `Kname` `kname` varchar(50) NULL DEFAULT NULL,
  CHANGE `Station` `station` varchar(50) NULL DEFAULT NULL,
  CHANGE `Userid` `userid` varchar(50) NULL DEFAULT NULL,
  CHANGE `Flag1` `flag1` varchar(50) NULL DEFAULT NULL,
  CHANGE `Flag2` `flag2` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisMoney_AccountCode` TO `mis_account_codes`;

-- ===== MisMoney_IO → mis_money_io =====
ALTER TABLE `MisMoney_IO`
  CHANGE `CntNum` `cnt_num` int(11) NULL DEFAULT NULL,
  CHANGE `OutDate` `out_date` char(10) NULL DEFAULT NULL,
  CHANGE `Contents` `contents` varchar(3000) NULL DEFAULT NULL,
  CHANGE `OutMoney` `out_money` bigint(20) NULL DEFAULT NULL,
  CHANGE `OutPlan` `out_plan` varchar(10) NULL DEFAULT NULL,
  CHANGE `OutCode` `out_code` char(2) NULL DEFAULT NULL,
  CHANGE `Object_num` `object_num` int(11) NULL DEFAULT NULL,
  CHANGE `CarNum` `car_num` varchar(30) NULL DEFAULT NULL,
  CHANGE `OutPersonName` `out_person_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `OutBankName` `out_bank_name` varchar(200) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(20) NULL DEFAULT NULL,
  CHANGE `paymentDate` `payment_date` char(10) NULL DEFAULT NULL,
  CHANGE `pdfName_date` `pdf_name_date` datetime NULL DEFAULT NULL,
  CHANGE `pdfName` `pdf_name` varchar(200) NULL DEFAULT NULL;
RENAME TABLE `MisMoney_IO` TO `mis_money_io`;

-- ===== MisPaymentMgt → mis_payments =====
ALTER TABLE `MisPaymentMgt`
  CHANGE `inCompanyIdx` `in_company_idx` int(11) NULL DEFAULT NULL,
  CHANGE `dealCustIdx` `deal_cust_idx` int(11) NULL DEFAULT NULL,
  CHANGE `dealComIdx` `deal_com_idx` int(11) NULL DEFAULT NULL,
  CHANGE `dealUserId` `deal_user_id` varchar(50) NULL DEFAULT NULL,
  CHANGE `inOrderIdx` `in_order_idx` int(11) NULL DEFAULT NULL,
  CHANGE `outOrderIdx` `out_order_idx` int(11) NULL DEFAULT NULL,
  CHANGE `billIdx` `bill_idx` int(11) NULL DEFAULT NULL,
  CHANGE `taxIdx` `tax_idx` int(11) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `inOrderIdxidx` `in_order_idxidx` int(11) NULL DEFAULT NULL,
  CHANGE `CarNo` `car_no` varchar(10) NULL DEFAULT NULL,
  CHANGE `isCheckOut` `is_check_out` varchar(1) NULL DEFAULT NULL,
  CHANGE `printIdx` `print_idx` int(11) NULL DEFAULT NULL,
  CHANGE `pdfName` `pdf_name` varchar(100) NULL DEFAULT NULL;
RENAME TABLE `MisPaymentMgt` TO `mis_payments`;

-- ===== MisPush_subscriptions → mis_push_subscriptions =====
ALTER TABLE `MisPush_subscriptions`
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1';
RENAME TABLE `MisPush_subscriptions` TO `mis_push_subscriptions`;

-- ===== MisReadList → mis_read_history =====
ALTER TABLE `MisReadList`
  CHANGE `RealPid` `real_pid` varchar(14) NULL DEFAULT NULL,
  CHANGE `push_deviceNums` `push_device_nums` int(11) NULL DEFAULT NULL,
  CHANGE `readDate` `read_date` datetime NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1';
RENAME TABLE `MisReadList` TO `mis_read_history`;

-- ===== MisSample_부품구매 → mis_sample_parts_purchase =====
ALTER TABLE `MisSample_부품구매`
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisSample_부품구매` TO `mis_sample_parts_purchase`;

-- ===== MisSample_부품내역 → mis_sample_parts_history =====
RENAME TABLE `MisSample_부품내역` TO `mis_sample_parts_history`;

-- ===== MisSchedule_meeting → mis_schedule_meetings =====
ALTER TABLE `MisSchedule_meeting`
  CHANGE `taskID` `task_id` int(11) NOT NULL auto_increment,
  CHANGE `ownerID` `owner_id` int(11) NULL DEFAULT NULL,
  CHANGE `useDate` `use_date` varchar(10) NULL DEFAULT NULL,
  CHANGE `startTime` `start_time` varchar(5) NULL DEFAULT NULL,
  CHANGE `endTIme` `end_t_ime` varchar(5) NULL DEFAULT NULL,
  CHANGE `recurrenceRule` `recurrence_rule` varchar(50) NULL DEFAULT NULL,
  CHANGE `recurrenceID` `recurrence_id` int(11) NULL DEFAULT NULL,
  CHANGE `recurrenceException` `recurrence_exception` varchar(500) NULL DEFAULT NULL,
  CHANGE `IsAllDay` `is_all_day` bit(1) NULL DEFAULT NULL,
  CHANGE `roomID` `room_id` varchar(2) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL;
RENAME TABLE `MisSchedule_meeting` TO `mis_schedule_meetings`;

-- ===== MisShare → mis_shares =====
ALTER TABLE `MisShare`
  CHANGE `RealPid` `real_pid` varchar(14) NOT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `updateVersion` `update_version` varchar(12) NULL DEFAULT NULL;
RENAME TABLE `MisShare` TO `mis_shares`;

-- ===== MisStation → mis_stations =====
ALTER TABLE `MisStation`
  CHANGE `num` `idx` int(11) NOT NULL auto_increment,
  CHANGE `StationName` `station_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `StationProperty` `station_property` varchar(8) NULL DEFAULT NULL,
  CHANGE `StationRealName` `station_real_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `AutoGubun` `auto_gubun` varchar(20) NULL DEFAULT NULL,
  CHANGE `SortG2` `sort_g2` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG4` `sort_g4` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG6` `sort_g6` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG8` `sort_g8` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG10` `sort_g10` bigint(20) NULL DEFAULT NULL,
  CHANGE `통장사본` `bank_book_copy` varchar(500) NULL DEFAULT NULL,
  CHANGE `통장사본_midx` `bank_book_copy_midx` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisStation` TO `mis_stations`;

-- ===== MisTempSql → mis_temp_sql =====
ALTER TABLE `MisTempSql`
  CHANGE `uniqueKey` `unique_key` varchar(50) NULL DEFAULT NULL,
  CHANGE `tempSql` `temp_sql` varchar(8000) NULL DEFAULT NULL;
RENAME TABLE `MisTempSql` TO `mis_temp_sql`;

-- ===== MisUpdateCancel → mis_update_cancels =====
ALTER TABLE `MisUpdateCancel`
  CHANGE `cancelSql` `cancel_sql` varchar(500) NOT NULL,
  CHANGE `cancelYN` `cancel_yn` varchar(1) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisUpdateCancel` TO `mis_update_cancels`;

-- ===== MisUrls → mis_urls =====
RENAME TABLE `MisUrls` TO `mis_urls`;

-- ===== MisUser → mis_users =====
ALTER TABLE `MisUser`
  CHANGE `num` `idx` int(11) NOT NULL auto_increment,
  CHANGE `UniqueNum` `user_id` varchar(50) NOT NULL,
  CHANGE `EngName` `eng_name` varchar(60) NULL DEFAULT NULL,
  CHANGE `Station_NewNum` `station_idx` int(11) NULL DEFAULT NULL,
  CHANGE `UserName` `user_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `UserAlias` `user_alias` varchar(50) NULL DEFAULT NULL,
  CHANGE `mainSortable` `main_sortable` varchar(500) NULL DEFAULT NULL,
  CHANGE `isRest` `is_rest` varchar(1) NULL DEFAULT NULL,
  CHANGE `Sex` `sex` varchar(1) NULL DEFAULT NULL,
  CHANGE `positionNum` `position_code` int(11) NULL DEFAULT NULL,
  CHANGE `UsrPhone` `usr_phone` varchar(50) NULL DEFAULT NULL,
  CHANGE `BankName` `bank_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `BankBookNum` `bank_book_num` varchar(50) NULL DEFAULT NULL,
  CHANGE `BankInsertMan` `bank_insert_man` varchar(50) NULL DEFAULT NULL,
  CHANGE `LastCollege` `last_college` varchar(50) NULL DEFAULT NULL,
  CHANGE `CollegeSubject` `college_subject` varchar(50) NULL DEFAULT NULL,
  CHANGE `IntraPhone` `intra_phone` varchar(50) NULL DEFAULT NULL,
  CHANGE `ZipCode` `zip_code` varchar(7) NULL DEFAULT NULL,
  CHANGE `UsrAddress` `usr_address` varchar(300) NULL DEFAULT NULL,
  CHANGE `LastAddress` `last_address` varchar(300) NULL DEFAULT NULL,
  CHANGE `HandPhone` `hand_phone` varchar(50) NULL DEFAULT NULL,
  CHANGE `Email` `email` varchar(50) NULL DEFAULT NULL,
  CHANGE `이력서` `resume` varchar(200) NULL DEFAULT NULL,
  CHANGE `이력서_midx` `resume_midx` int(11) NULL DEFAULT NULL,
  CHANGE `경력증명서` `career_cert` varchar(200) NULL DEFAULT NULL,
  CHANGE `경력증명서_midx` `career_cert_midx` int(11) NULL DEFAULT NULL,
  CHANGE `통장사본` `bank_book_copy` varchar(200) NULL DEFAULT NULL,
  CHANGE `통장사본_midx` `bank_book_copy_midx` int(11) NULL DEFAULT NULL,
  CHANGE `증명사진` `id_photo` varchar(200) NULL DEFAULT NULL,
  CHANGE `증명사진_midx` `id_photo_midx` int(11) NULL DEFAULT NULL,
  CHANGE `주민등록등본` `resident_reg` varchar(200) NULL DEFAULT NULL,
  CHANGE `주민등록등본_midx` `resident_reg_midx` int(11) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `Married` `married` varchar(50) NULL DEFAULT NULL,
  CHANGE `Hobby` `hobby` varchar(200) NULL DEFAULT NULL,
  CHANGE `Talent` `talent` varchar(200) NULL DEFAULT NULL,
  CHANGE `House` `house` varchar(50) NULL DEFAULT NULL,
  CHANGE `Hurdle` `hurdle` varchar(50) NULL DEFAULT NULL,
  CHANGE `Bohun` `bohun` varchar(50) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `passwdDecrypt` `password` varchar(100) NULL DEFAULT NULL,
  CHANGE `passwdChangeDate` `password_change_date` datetime NULL DEFAULT NULL,
  CHANGE `myLanguageCode` `my_language_code` varchar(10) NULL DEFAULT NULL,
  CHANGE `소속거래처idx` `company_idx` int(11) NULL DEFAULT NULL,
  CHANGE `isHpSender` `is_hp_sender` varchar(1) NULL DEFAULT NULL,
  CHANGE `입력된업체도메인` `company_domain` varchar(50) NULL DEFAULT NULL,
  CHANGE `입력된업체명` `company_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `승인요청일` `approval_request_date` datetime NULL DEFAULT NULL,
  CHANGE `appmake_noti_YN` `appmake_noti_yn` varchar(1) NULL DEFAULT NULL,
  CHANGE `appmake_login_lastTime` `appmake_login_last_time` datetime NULL DEFAULT NULL,
  CHANGE `appmake_read_lastTime` `appmake_read_last_time` datetime NULL DEFAULT NULL,
  CHANGE `menuRefresh` `menu_refresh` varchar(1) NULL DEFAULT NULL,
  CHANGE `menuRefreshApp` `menu_refresh_app` varchar(1) NULL DEFAULT NULL,
  CHANGE `receive_YN` `receive_yn` varchar(1) NOT NULL,
  CHANGE `allPush_YN` `all_push_yn` varchar(1) NOT NULL,
  CHANGE `isStop` `is_stop` varchar(1) NULL DEFAULT NULL,
  CHANGE `push_YN` `push_yn` varchar(1) NULL DEFAULT NULL;
RENAME TABLE `MisUser` TO `mis_users`;

-- ===== MisWorkReport → mis_work_reports =====
ALTER TABLE `MisWorkReport`
  CHANGE `PartCode` `part_code` varchar(10) NOT NULL,
  CHANGE `rDate` `r_date` varchar(10) NOT NULL,
  CHANGE `periodUnit` `period_unit` varchar(10) NOT NULL,
  CHANGE `Attach1` `attach1` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach1_timename` `attach1_timename` varchar(200) NULL DEFAULT NULL,
  CHANGE `Attach1_size` `attach1_size` int(11) NULL DEFAULT NULL,
  CHANGE `Attach1_hit` `attach1_hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NOT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL;
RENAME TABLE `MisWorkReport` TO `mis_work_reports`;

-- ===== MisWorkTree → mis_work_tree =====
ALTER TABLE `MisWorkTree`
  CHANGE `WorkName` `work_name` varchar(50) NULL DEFAULT NULL,
  CHANGE `WorkProperty` `work_property` varchar(8) NULL DEFAULT NULL,
  CHANGE `IP` `ip` varchar(50) NULL DEFAULT NULL,
  CHANGE `HIT` `hit` int(11) NULL DEFAULT NULL,
  CHANGE `useflag` `use_yn` char(1) NULL DEFAULT '1',
  CHANGE `lastupdate` `last_update` datetime NULL DEFAULT 'current_timestamp()',
  CHANGE `lastupdater` `last_updater` varchar(50) NULL DEFAULT NULL,
  CHANGE `AutoGubun` `auto_gubun` varchar(10) NULL DEFAULT NULL,
  CHANGE `SortG2` `sort_g2` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG4` `sort_g4` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG6` `sort_g6` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG8` `sort_g8` bigint(20) NULL DEFAULT NULL,
  CHANGE `SortG10` `sort_g10` bigint(20) NULL DEFAULT NULL;
RENAME TABLE `MisWorkTree` TO `mis_work_tree`;

SET FOREIGN_KEY_CHECKS=1;

-- ===== 2026-04-03: mis_menus g-컬럼 리네임 =====
-- ALTER TABLE mis_menus
--   RENAME COLUMN g04 TO read_only_cond,
--   RENAME COLUMN g05 TO brief_insert_sql,
--   RENAME COLUMN g08 TO table_name,
--   RENAME COLUMN g09 TO base_filter,
--   RENAME COLUMN g10 TO use_condition,
--   RENAME COLUMN g11 TO delete_query;

-- ===== 2026-04-03: mis_menu_fields grid__ 컬럼 리네임 =====
-- ALTER TABLE mis_menu_fields
--   RENAME COLUMN grid__group_compute TO group_compute,
--   RENAME COLUMN grid__prime_key TO prime_key;

-- ===== 2026-04-03: 다크/라이트 테마 지원 =====
-- ALTER TABLE mis_users ADD COLUMN theme VARCHAR(10) NOT NULL DEFAULT 'light' AFTER is_stop;
