#!/bin/bash
#SBATCH --job-name=ycx_arr
#SBATCH --time=02:30:00
#SBATCH --mem=36G
#SBATCH --cpus-per-task=4
#SBATCH --account=PUOM0008
#SBATCH --array=0-47%12
#SBATCH --output=/users/PUOM0008/crsfaaron/yield_curves_conus/logs/ycx_arr_%A_%a.out
#SBATCH --error=/users/PUOM0008/crsfaaron/yield_curves_conus/logs/ycx_arr_%A_%a.err
set -e
cd /users/PUOM0008/crsfaaron/yield_curves_conus
FIADIR=/fs/scratch/PUOM0008/crsfaaron/fia_by_state

# index -> "FIPS ABBR" (CONUS 48, by FIPS)
MAP=( \
 "1 AL" "4 AZ" "5 AR" "6 CA" "8 CO" "9 CT" "10 DE" "12 FL" "13 GA" "16 ID" \
 "17 IL" "18 IN" "19 IA" "20 KS" "21 KY" "22 LA" "23 ME" "24 MD" "25 MA" "26 MI" \
 "27 MN" "28 MS" "29 MO" "30 MT" "31 NE" "32 NV" "33 NH" "34 NJ" "35 NM" "36 NY" \
 "37 NC" "38 ND" "39 OH" "40 OK" "41 OR" "42 PA" "44 RI" "45 SC" "46 SD" "47 TN" \
 "48 TX" "49 UT" "50 VT" "51 VA" "53 WA" "54 WV" "55 WI" "56 WY" )

read FIPS ABBR <<< "${MAP[$SLURM_ARRAY_TASK_ID]}"
echo "=== task $SLURM_ARRAY_TASK_ID : FIPS=$FIPS ABBR=$ABBR ==="

# symlink FIPS-named slim files to ABBR names the pipeline expects
for T in TREE COND PLOT; do
  src="$FIADIR/${FIPS}_${T}.csv"
  if [ ! -s "$src" ]; then echo "MISSING $src — skipping $ABBR"; exit 0; fi
  ln -sf "$src" "$FIADIR/${ABBR}_${T}.csv"
done

module load gcc/12.3.0
module load gdal/3.7.3 geos/3.12.0 proj/9.2.1
module load R/4.4.0

echo "--- ycx_00 strata ($ABBR) ---"; Rscript --vanilla ycx_00_strata.R  "$ABBR" "$FIADIR"
echo "--- ycx_01 curves ($ABBR) ---"; Rscript --vanilla ycx_01_curves.R  "$ABBR" "$FIADIR"
echo "--- ycx_02 perseus ($ABBR) ---";Rscript --vanilla ycx_02_perseus.R "$ABBR"
echo "=== $ABBR DONE ==="
