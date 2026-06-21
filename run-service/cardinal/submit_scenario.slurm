#!/bin/bash
#SBATCH --job-name=perseus_scenario
#SBATCH --time=01:00:00
#SBATCH --mem=16G
#SBATCH --cpus-per-task=4
#SBATCH --account=PUOM0008
#SBATCH --output=%x_%j.out
# Usage: sbatch submit_scenario.slurm <run_dir>
# Runs the scenario runner for one on-demand run-spec.
module load gcc/12.3.0 gdal/3.7.3 geos/3.12.0 proj/9.2.1 R/4.4.0
RUN_DIR="$1"
python3 ~/perseus_run/run_scenario.py "$RUN_DIR"
