<?php


  function pageLoad() {
     

      $GLOBALS['_client_buttons'] = [
          ['label' => '권한적용', 'action' => '권한적용']
      ];
  }


function list_json_init() {
    global $isFirstLoad, $customAction;

    if ($customAction === '권한적용') {
        // 일괄승인 로직
        execSql("call mis_user_authority_proc('{$_ENV['SITE_ID']}');");
        $GLOBALS['_client_toast'] = ['msg' => '권한적용 완료', 'type' => 'success', 'duration' => 8000];
    }

    if ($isFirstLoad) {
        //$GLOBALS['_client_redirect'] = [
        //    'gubun' => 36,
        //    'label' => '그룹관리',
        //];
    }
}
  function list_json_load(&$data) {

    global $customAction;

      $rp = $data['real_pid'] ?? '';
      if ($rp) {
          $data['__html']['real_pid'] = '<span class="btn-open" data-opentab=\'{"realPid":"' . $rp . '"}\'>연결</span> ' . $rp;
      }
  }