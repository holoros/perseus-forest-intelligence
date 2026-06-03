## ycx_raster_disturb_params.R  (read-only)
##
## Spatially-explicit, data-driven disturbance parameters for the decline scenarios,
## sampled from the v5 CONUS disturbance rasters (the SAME layers the dashboard shows
## as risk metrics) at FIA plot coordinates, then calibrated to the FIA annual rate.
## Replaces the FIA-COND stratum-mean p_dist/severity.
##
## Per FIA plot (membership LAT/LON, projected to the raster CRS EPSG:5070) extract:
##   p_disturbance_2022      -> relative disturbance probability (spatial pattern)
##   expected_severity_2022  -> relative per-pixel severity (spatial pattern)
##   p_type Fire / Insects   -> agent mix (for reporting)
## Aggregate to ecoregion(prov) x forest-type cells; CALIBRATE:
##   p_dist_annual = p_raster * (FIA_ANNUAL / weighted_mean(p_raster))   # level from FIA, pattern from raster
##   sev           = sev_raster * (SEV_REF  / weighted_mean(sev_raster)) # mean matched to the documented live-mortality ref
##
## Output: treemap/disturb/disturb_params_raster.csv (prov, ft, p_dist_ann, sev, n)
## Usage: Rscript ycx_raster_disturb_params.R [out_dir] [raster_dir]
suppressMessages({library(terra)})
args<-commandArgs(TRUE)
out <- if(length(args)>=1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
RD  <- if(length(args)>=2) args[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_outputs_v5"
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dd<-file.path(td,"disturb"); dir.create(dd,showWarnings=FALSE,recursive=TRUE)
FIA_ANNUAL <- 0.0146   # observed CONUS undisturbed-plot annual disturbance probability
SEV_REF    <- 0.26     # documented type-weighted live-mortality fraction per event

## ---- all plot coords + cell keys ----
mf<-list.files(cfg,pattern="^ycx_membership_.*\\.csv$",full.names=TRUE)
mem<-do.call(rbind,lapply(mf,function(f){d<-read.csv(f,stringsAsFactors=FALSE); d[,c("PLT_CN","LAT","LON","ft_group","prov_code")]}))
mem<-mem[is.finite(mem$LAT)&is.finite(mem$LON)&!is.na(mem$prov_code)&!is.na(mem$ft_group),]
mem<-mem[!duplicated(mem$PLT_CN),]
cat(sprintf("[ras] %d plots with coords\n",nrow(mem)))

pts<-vect(mem[,c("LON","LAT")], geom=c("LON","LAT"), crs="EPSG:4326")
r_p<-rast(file.path(RD,"p_disturbance_2022.tif"))
pts<-project(pts, crs(r_p))
xy<-crds(pts)

ex1<-function(file){ r<-rast(file); v<-terra::extract(r, xy)[,1]; v }
mem$p   <- ex1(file.path(RD,"p_disturbance_2022.tif"))
mem$sev <- ex1(file.path(RD,"expected_severity_2022.tif"))
mem$fire<- ex1(file.path(RD,"p_type_P(Y = Fire)_2022.tif"))
mem$ins <- ex1(file.path(RD,"p_type_P(Y = Insects)_2022.tif"))
ok<-is.finite(mem$p); mem<-mem[ok,]
cat(sprintf("[ras] extracted: p mean %.3f (range %.3f-%.3f), sev mean %.3f\n",
  mean(mem$p),min(mem$p),max(mem$p),mean(mem$sev,na.rm=TRUE)))

## calibrate level (pattern preserved)
Kp <- FIA_ANNUAL / mean(mem$p, na.rm=TRUE)
Ks <- SEV_REF    / mean(mem$sev, na.rm=TRUE)
mem$p_ann <- mem$p * Kp
mem$sev_c <- pmin(mem$sev * Ks, 0.9)
cat(sprintf("[ras] calibration Kp=%.4f Ks=%.4f -> CONUS p_ann %.4f, sev %.3f\n",
  Kp,Ks,mean(mem$p_ann),mean(mem$sev_c)))

## per prov x ft cell
agg<-do.call(rbind,lapply(split(mem,interaction(mem$prov_code,mem$ft_group,drop=TRUE)),function(x){
  if(nrow(x)<10) return(NULL)
  data.frame(prov=x$prov_code[1],ft=x$ft_group[1],n=nrow(x),
    p_dist_ann=round(mean(x$p_ann,na.rm=TRUE),5),
    sev=round(mean(x$sev_c,na.rm=TRUE),4),
    fire_share=round(mean(x$fire,na.rm=TRUE),3),
    insect_share=round(mean(x$ins,na.rm=TRUE),3))}))
write.csv(agg,file.path(dd,"disturb_params_raster.csv"),row.names=FALSE)
cat(sprintf("[ras] wrote %d ecoregion x ft cells -> disturb_params_raster.csv\n",nrow(agg)))
cat("[ras] highest-disturbance cells:\n")
print(head(agg[order(-agg$p_dist_ann),c("prov","ft","n","p_dist_ann","sev","fire_share")],10),row.names=FALSE)
