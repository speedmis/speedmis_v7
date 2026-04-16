<?php


function list_json_init() {
    global $actionFlag, $gubun, $misSessionUserId, $isFirstLoad;
    // 목록 데이터 로딩 전에 실행되는 초기화 로직
    //$GLOBALS['_client_alert'] = $misSessionUserId;
    //if($isFirstLoad === true ) {
    //  $GLOBALS['_client_openTab'] = [
    //      'gubun' => 314,
    //      'label' => '대시보드',
    //  ];
    //}
}

function list_json_load(&$data) {
    // $data: 목록 데이터 배열 (각 행을 수정 가능)
        //$data['gname'] = $data['gname'] . " | hahaha";
        //$data['__html']['gname'] = '<a href="https://naver.com" target="_blank">zzz' . $data['gname'] . '</a>';
}

function before_query($menu, $fields, $params) {
    global $actionFlag, $gubun, $idx, $misSessionUserId, $__pdo;
    // 리스트·조회·수정·저장 모든 액션에서 쿼리 생성 전에 호출됨
    // $menu: 메뉴 정보 배열 (table_name, real_pid 등)
    // $fields: 필드 정의 배열
    // $params: 요청 파라미터 (gubun, idx, allFilter, page 등)
    //
    // 예) 전역변수 세팅
    // $GLOBALS['my_var'] = $__pdo->query("SELECT ...")->fetchColumn();

      // 여러 쿼리 한번에
    $sql = "update mis_groups set remark=concat(remark,'.') where idx='$idx';";
    $result = execSql($sql);

    // 결과 확인
    if ($result['resultCode'] === 'success') {
        $result['resultMessage'] = '성공!!';
    } else {
        // 실패 — $result['resultMessage']
    }
    
}
function save_updateReady(&$saveList) {
      global $__pdo, $idx;

      // 값 검증
      if ($saveList['gname']=='바보') {
          $GLOBALS['_client_confirm'] = '바보라고요? 정말로 저장할까요?';
          return;
      }

}