#!/bin/bash
# ingest_yc_production.sh  (STAGED -- run only after in-flight CEM/compos jobs settle)
# Ingests the CONUS YC FIADB + TreeMap canonical CI (5 CEM scenarios x rcp45/rcp85)
# into the PRODUCTION perseus_db as models yc_fiadb_rcp45/85 and yc_treemap_rcp45/85
# (class YC). Validated end to end on a staging copy (staging_yc/).
set -uo pipefail
PR=$HOME/perseus_db; DB=$PR/db/perseus_results.sqlite; CAN=$HOME/yield_curves_conus/canonical
# 1) collision guard: do not ingest while CEM/compos/other ingests are writing the shared DB
if squeue -u crsfaaron -h -o "%j" | grep -qiE "cem_rerun|compos|ingest"; then
  echo "ABORT: in-flight jobs (cem_rerun/compos/ingest) may be writing perseus_db. Re-run when clear."; exit 1; fi
# 2) backup
cp "$DB" "$DB.bak_$(date +%Y%m%d_%H%M)" && echo "backed up $DB"
module load gcc/12.3.0 R/4.4.0
# 3) register the 4 YC models (class YC) -- INSERT OR IGNORE, safe if present
python3 - <<PY
import sqlite3; c=sqlite3.connect("$DB")
for mc,lab in (("yc_fiadb_rcp45","YC hybrid FIADB expansion (rcp45)"),("yc_fiadb_rcp85","YC hybrid FIADB expansion (rcp85)"),
               ("yc_treemap_rcp45","YC hybrid TreeMap expansion (rcp45)"),("yc_treemap_rcp85","YC hybrid TreeMap expansion (rcp85)")):
    c.execute("INSERT OR IGNORE INTO model(model_code,label,model_class,native_unit,agb_to_agc_factor,notes) VALUES(?,?,'YC','Tg C / Tg biomass / Mcf',1.0,'Hybrid CR+decline yield curves; CEM-harmonized 5 scenarios; climate via scaled CSI.')",(mc,lab))
c.commit(); print("registered YC models")
PY
# 4) ingest all 48 states x both expansions x both climate arms
for ST in al ar az ca co ct de fl ga ia id il in ks ky la ma md me mi mn mo ms mt nc nd ne nh nj nm nv ny oh ok or pa ri sc sd tn tx ut va vt wa wi wv wy ; do U=$(echo $ST|tr a-z A-Z); for RCP in rcp45 rcp85; do
  Rscript --vanilla $PR/adapters/ingest_cem_state.R $PR --state $U --model yc_fiadb_$RCP  --climate ${RCP}_hadgem3 --version yc_v1 --csv $CAN/ci_yc_fiadb_${ST}_${RCP}.csv  --db $DB >/dev/null 2>&1 || echo "FAIL fiadb $U $RCP"
  Rscript --vanilla $PR/adapters/ingest_yc_treemap.R $PR --state $U --model yc_treemap_$RCP --climate ${RCP}_hadgem3 --version yc_v1 --csv $CAN/ci_yc_treemap_${ST}_${RCP}.csv --db $DB >/dev/null 2>&1 || echo "FAIL treemap $U $RCP"
done; done
echo "INGEST DONE. Next: regenerate the explorer API ->  python3 $PR/48_export_api.py <project_root> <out_dir>"
