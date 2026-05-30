#!/bin/bash
#SBATCH --job-name=ycx_split
#SBATCH --time=02:00:00
#SBATCH --mem=8G
#SBATCH --cpus-per-task=2
#SBATCH --account=PUOM0008
#SBATCH --output=/users/PUOM0008/crsfaaron/yield_curves_conus/logs/ycx_split_%j.out
#SBATCH --error=/users/PUOM0008/crsfaaron/yield_curves_conus/logs/ycx_split_%j.err
#
# Split the national FIADB ENTIRE_{TREE,COND,PLOT}.csv into slim per-state
# CSVs (only the columns the yield-curve pipeline needs), for all CONUS states.
set -e
D=/fs/scratch/PUOM0008/crsfaaron/FIA
OUT=/fs/scratch/PUOM0008/crsfaaron/fia_by_state
mkdir -p "$OUT"

# CONUS state FIPS (exclude AK=2, HI=15, DC=11, territories)
CONUS="|1|4|5|6|8|9|10|12|13|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|44|45|46|47|48|49|50|51|53|54|55|56|"

echo "[split] PLOT (STATECD col 6)"
awk -F, -v OUT="$OUT" -v CONUS="$CONUS" '
NR==1{ for(i=1;i<=NF;i++) h[i]=$i;
       hdr="PLT_CN,STATECD,UNITCD,COUNTYCD,PLOT,INVYR,PLOT_STATUS_CD,LAT,LON"; next }
{ st=$6; if(index(CONUS,"|"st"|")==0) next;
  f=OUT"/"st"_PLOT.csv";
  if(!(st in seen)){ print hdr > f; seen[st]=1 }
  print $1","$6","$7","$8","$9","$5","$10","$20","$21 >> f }
' "$D/ENTIRE_PLOT.csv"
echo "[split] PLOT done"

echo "[split] COND (STATECD col 4)"
awk -F, -v OUT="$OUT" -v CONUS="$CONUS" '
NR==1{ hdr="PLT_CN,STATECD,CONDID,CONDPROP_UNADJ,FORTYPCD,OWNCD,OWNGRPCD,STDAGE,TRTCD1,TRTYR1,DSTRBCD1,DSTRBYR1"; next }
{ st=$4; if(index(CONUS,"|"st"|")==0) next;
  f=OUT"/"st"_COND.csv";
  if(!(st in seen)){ print hdr > f; seen[st]=1 }
  print $2","$4","$8","$28","$15","$12","$13","$18","$43","$44","$37","$38 >> f }
' "$D/ENTIRE_COND.csv"
echo "[split] COND done"

echo "[split] TREE (STATECD col 5, 13 GB single pass)"
awk -F, -v OUT="$OUT" -v CONUS="$CONUS" '
NR==1{ hdr="PLT_CN,STATECD,STATUSCD,DIA,TPA_UNADJ,DRYBIO_AG,CARBON_AG,VOLCFNET"; next }
{ st=$5; if(index(CONUS,"|"st"|")==0) next;
  f=OUT"/"st"_TREE.csv";
  if(!(st in seen)){ print hdr > f; seen[st]=1 }
  print $2","$5","$13","$16","$86","$127","$90","$36 >> f }
' "$D/ENTIRE_TREE.csv"
echo "[split] TREE done"

echo "[split] per-state file counts:"
ls "$OUT" | sed -E 's/_(TREE|COND|PLOT).csv//' | sort -u | wc -l
echo "[split] DONE"
