<?php

function list_query(&$selectQuery, &$countQuery) {
    // v_mis_parts_cate_ → vv_mis_parts_cate_ (vv_ 이미 있으면 유지)
    $selectQuery = str_replace('vvv_mis_parts_cate_', 'vv_mis_parts_cate_',
                   str_replace('v_mis_parts_cate_', 'vv_mis_parts_cate_', $selectQuery));
    $countQuery  = str_replace('vvv_mis_parts_cate_', 'vv_mis_parts_cate_',
                   str_replace('v_mis_parts_cate_', 'vv_mis_parts_cate_', $countQuery));
}