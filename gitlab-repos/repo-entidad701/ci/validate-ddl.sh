#!/usr/bin/env bash
set -euo pipefail

ddl_dir="${DBUP_DDL_DIR:-dbup/ddl}"
pattern="^${ddl_dir}/(shared|dev|qa|uat)/((ENTIDAD|PARAM)[0-9]{3})/DBUP-[0-9]+_[A-Za-z0-9_]+\\.sql$"

if [[ ! -d "$ddl_dir" ]]; then
  echo "DDL directory not found: $ddl_dir"
  exit 1
fi

if [[ -n "${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}" ]]; then
  base_ref="$CI_MERGE_REQUEST_DIFF_BASE_SHA"
else
  base_ref="${CI_COMMIT_BEFORE_SHA:-}"
fi

if [[ -n "${base_ref:-}" && "$base_ref" != "0000000000000000000000000000000000000000" ]]; then
  mapfile -t files < <(git diff --name-only "$base_ref" "${CI_COG66†VÖ2&÷FVv–F÷2ò6öæf—&Ö6–öâFVÂG&öââ„TåD”DGÅ$Ò•³Ó•×³7ÒFà¢Ò6’D%Uô4„ätTÄôvf—fRVâVâ66†VÖ6VçG&ÂòVâ6FÖ&–VçFRà¢ÒW7G&FVv–FR&öÆÆ&6²&6Ö&–÷2FW7G'V7F—f÷2à¢ÒF—6VæòFVÂ&÷–V7Fò$ôB6W&Fò’ÖV6æ—6Öò&FöÖ"Vâ6öÖÖ—B÷FrfÆ–FFòVâTBà