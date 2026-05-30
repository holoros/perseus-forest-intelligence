#!/bin/bash
#SBATCH --job-name=ycx
#SBATCH --time=01:30:00
#SBATCH --mem=24G
#SBATCH --cpus-per-task=4
#SBATCH --account=PUOM0008
#SBATCH --output=/users/PUOM0008/crsfaaron/yield_curves_conus/logs/ycx_%x_%j.out
#SBATCH --error=/users/PUOM0008/crsfaaron/yield_curves_conus/logs/ycx_%x_%j.err

# Usage: sbatch --job-name=ycx_ME ycx_submit.sh ME
set -e
ST="${1:?need state abbr}"
cd /users/PUOM0008/crsfaaron/yield_curves_conus
module load gcc/12.3.0
module load gdal/3.7.3 geos/3.12.0 proj/9.2.1
module load R/4.4.0

echo "=== $ST : ycx_00 strata ==="
Rscript --vanilla ycx_00_strata.R  "$ST"
echo "=== $ST : ycx_01 curves ==="
Rscript --vanilla ycx_01_curves.R  "$ST"
echo "=== $ST : ycx_02 perseus ==="
Rscript --vanilla ycx_02_perseus.R "$ST"
echo "=== $ST DONE ==="
