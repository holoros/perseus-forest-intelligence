## ycx_fiadb_vs_treemap.R
##
## CONUS-wide comparison of the SAME empirical yield curves expanded two ways:
##   FIADB expansion  : yc_fia_empirical_v1  (uniform-grid area model,
##                      area_ha = n_plots * A0, A0 anchored to FIA carbon totals)
##   TreeMap expansion : yc_treemap_spatial_v1 (actual TreeMap 2022 30 m pixel
##                      area per FIA-imputed plot; spatially explicit)
##
## Both lines are agc_live_total, reserve (no harvest). The comparison isolates
## the AREA-EXPANSION choice: plot-based FIA inventory expansion vs raster-based
## TreeMap pixel area. Where a state's real spatial composition departs from its
## plot-count mean, the two diverge. fia.json observed carbon is the t0 anchor.
##
## Input : tidy CSVs from ycx_extract_series.py (series_long.csv, fia_obs.csv).
##         Dependency-free base R (no jsonlite needed).
## Output: fiadb_vs_treemap_by_state.csv, _conus.csv, _t0.png
##
## Usage: Rscript ycx_fiadb_vs_treemap.R <csv_dir> <outdir>

args <- commandArgs(trailingOnly = TRUE)
csvd   <- if (length(args)>=1) args[1] else "."
outdir <- if (length(args)>=2) args[2] else "."
dir.create(outdir, showWarnings=FALSE, recursive=TRUE)

S  <- read.csv(file.path(csvd,"series_long.csv"), stringsAsFactors=FALSE)
OB <- tryCatch(read.csv(file.path(csvd,"fia_obs.csv"), stringsAsFactors=FALSE), error=function(e) NULL)

interp <- function(df, yr){
  if (is.null(df)||!nrow(df)) return(NA_real_)
  df <- df[order(df$year),]
  if (yr<=min(df$year)) return(df$val[1])
  if (yr>=max(df$year)) return(df$val[nrow(df)])
  approx(df$year, df$val, xout=yr)$y
}

states <- sort(unique(S$state)); rows <- list()
for (st in states){
  fia <- S[S$state==st & S$expansion=="FIADB",  c("year","val")]
  tm  <- S[S$state==st & S$expansion=="TreeMap", c("year","val")]
  if (!nrow(fia) || !nrow(tm)) next
  obs <- if (!is.null(OB) && st %in% OB$state) OB$tg_agc[OB$state==st][1] else NA
  rows[[st]] <- data.frame(state=st,
    fia_obs_tg   = round(as.numeric(obs),1),
    fiadb_2025   = round(interp(fia,2025),1),
    treemap_2025 = round(interp(tm,2025),1),
    fiadb_2125   = round(interp(fia,2125),1),
    treemap_2125 = round(interp(tm,2125),1), stringsAsFactors=FALSE)
}
bys <- do.call(rbind, rows)
bys$ratio_2025 <- round(bys$treemap_2025/bys$fiadb_2025,3)
bys$ratio_2125 <- round(bys$treemap_2125/bys$fiadb_2125,3)
bys <- bys[order(-bys$treemap_2025),]
write.csv(bys, file.path(outdir,"fiadb_vs_treemap_by_state.csv"), row.names=FALSE)

conus <- data.frame(
  expansion   = c("FIADB (uniform-grid, FIA-anchored)","TreeMap (pixel-area, spatial)"),
  agc_2025_Tg = c(sum(bys$fiadb_2025,na.rm=TRUE),   sum(bys$treemap_2025,na.rm=TRUE)),
  agc_2125_Tg = c(sum(bys$fiadb_2125,na.rm=TRUE),   sum(bys$treemap_2125,na.rm=TRUE)))
conus$net_pct <- round(100*(conus$agc_2125_Tg/conus$agc_2025_Tg-1),1)
write.csv(conus, file.path(outdir,"fiadb_vs_treemap_conus.csv"), row.names=FALSE)

cat("\n=== CONUS FIADB vs TreeMap expansion (agc_live_total, reserve) ===\n")
print(conus, row.names=FALSE)
div <- bys$state[abs(bys$ratio_2025-1) > 0.10]
cat(sprintf("\nCONUS t0 ratio TreeMap/FIADB = %.3f ; states >10%% divergence at t0: %s\n",
    sum(bys$treemap_2025)/sum(bys$fiadb_2025), paste(div, collapse=" ")))

png(file.path(outdir,"fiadb_vs_treemap_t0.png"), width=820, height=760, res=120)
op<-par(mar=c(4.5,4.5,3,1))
lim <- range(c(bys$fiadb_2025,bys$treemap_2025),na.rm=TRUE)
plot(bys$fiadb_2025, bys$treemap_2025, pch=19, col="#1b7837", xlim=lim, ylim=lim,
     xlab="FIADB expansion, 2025 AGC (Tg C)", ylab="TreeMap expansion, 2025 AGC (Tg C)",
     main="FIADB vs TreeMap area expansion (same yield curves)")
abline(0,1,lty=2,col="grey50"); grid(col="grey90")
text(bys$fiadb_2025, bys$treemap_2025, bys$state, pos=3, cex=0.6, col="#333")
par(op); dev.off()
cat(sprintf("[cmp] wrote fiadb_vs_treemap_by_state.csv, _conus.csv, _t0.png to %s\n", outdir))
