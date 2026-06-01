## ycx_hybrid_anchor.R
## FIA-anchor the hybrid carbon projection. The hybrid fit captures the curve
## SHAPE well but is not FIA-anchored, so its 2022 standing total runs ~16%
## above the production (peak-decline, FIA-anchored) baseline. This applies a
## per-state multiplicative scalar so the hybrid t0 matches the production t0,
## preserving the hybrid trajectory shape thereafter:
##   scalar(state) = PD_t0(state) / hybrid_t0(state)
##   anchored(state,year) = hybrid(state,year) * scalar(state)
##
## Inputs (this dir): conus_hybrid_100yr.csv (hybrid),
##   ../conus_scenarios_100yr.csv (peak-decline = reserve bucket)
## Output: conus_hybrid_anchored_100yr.csv
##
## Usage: Rscript ycx_hybrid_anchor.R <hybrid_products_dir>

args<-commandArgs(trailingOnly=TRUE); HP<-if(length(args)>=1) args[1] else "."
hy<-read.csv(file.path(HP,"conus_hybrid_100yr.csv"),stringsAsFactors=FALSE)
sc<-read.csv(file.path(HP,"..","conus_scenarios_100yr.csv"),stringsAsFactors=FALSE)
pd<-sc[sc$scenario=="reserve (no harvest)",c("state","year_offset","agc_Tg")]

hy_t0<-setNames(hy$agc_Tg[hy$year_offset==0], hy$state[hy$year_offset==0])
pd_t0<-setNames(pd$agc_Tg[pd$year_offset==0], pd$state[pd$year_offset==0])
common<-intersect(names(hy_t0),names(pd_t0))
scal<-setNames(ifelse(hy_t0[common]>0, pd_t0[common]/hy_t0[common], 1), common)

hy$scalar<-scal[hy$state]; hy$scalar[is.na(hy$scalar)]<-1
hy$agc_Tg<-round(hy$agc_Tg*hy$scalar,3)
out<-hy[,c("state","year_offset","agc_Tg","area_Mha")]
write.csv(out, file.path(HP,"conus_hybrid_anchored_100yr.csv"), row.names=FALSE)

cu<-function(d) aggregate(agc_Tg~year_offset,d,sum)
ch<-cu(out); cp<-cu(pd)
cat(sprintf("[anchor] median per-state scalar applied: %.3f\n", median(scal,na.rm=TRUE)))
cat(sprintf("[anchor] CONUS anchored hybrid: t0=%.0f t100=%.0f Tg (was hybrid t0 %.0f)\n",
    ch$agc_Tg[ch$year_offset==0], ch$agc_Tg[ch$year_offset==100], sum(hy_t0)))
cat(sprintf("[anchor] production (peak-decline) t0=%.0f t100=%.0f Tg\n",
    cp$agc_Tg[cp$year_offset==0], cp$agc_Tg[cp$year_offset==100]))
cat("[anchor] wrote conus_hybrid_anchored_100yr.csv\n")
