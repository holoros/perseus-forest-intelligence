## ycx_index_test.R
##
## Head-to-head: does observed FIA aboveground-carbon GROWTH couple to any of
## three productivity indices -- CSI (Climate Site Index, height-based, east),
## CSPI (Composite Site Productivity Index, national), BGI (Bioclimatic Growth
## Index, Maine)? For each index, regress
##     log(net annual AGC growth) ~ log(index) + log(BA_t1) + poly(age,2) + ft
## over the plots where that index exists, plus an apples-to-apples comparison
## on the common Maine subset. Saves the per-plot calibration dataframe.
##
## Usage: Rscript ycx_index_test.R [out_dir]
## Output: <out>/config/index_growth_calib.csv  (per-plot df)
##         prints the comparison table

suppressMessages(library(terra))
out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config")
fia  <- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
RL   <- file.path(Sys.getenv("HOME"), "raster_layers")
csi30f <- file.path(RL,"csi","CSI_2030.tif")
cspif  <- file.path(RL,"cspi_rs","CSPI_V4_CONUS_1km_forest.tif")
bgif   <- file.path(RL,"bgi","ME_BGI_V1.tif")

ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
abbr_all <- names(ABBR2FIPS)

carbon_of <- function(abbr){
  fp <- file.path(fia, sprintf("%d_TREE.csv", ABBR2FIPS[[abbr]]))
  if(!file.exists(fp)) return(NULL)
  hdr <- gsub('"','',strsplit(readLines(fp,1),",")[[1]])
  idx <- match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ","DIA"), hdr)
  tmp <- tempfile(fileext=".csv")
  system(sprintf("cut -d, -f%s '%s' > '%s'", paste(idx,collapse=","), fp, tmp))
  t <- read.csv(tmp, stringsAsFactors=FALSE); unlink(tmp)
  t$STATUSCD <- suppressWarnings(as.integer(t$STATUSCD))
  for(c0 in c("CARBON_AG","TPA_UNADJ","DIA")) t[[c0]] <- suppressWarnings(as.numeric(t[[c0]]))
  t <- t[!is.na(t$STATUSCD) & t$STATUSCD==1, ]
  t$baind <- 0.005454154 * t$DIA^2 * t$TPA_UNADJ
  aggregate(cbind(agc_lbac=CARBON_AG*TPA_UNADJ, ba=baind) ~ PLT_CN, data=t, FUN=sum, na.rm=TRUE)
}
cat("[idx] aggregating plot carbon (all CONUS)...\n")
pc <- do.call(rbind, lapply(abbr_all, carbon_of))
pc <- pc[!duplicated(pc$PLT_CN), ]; pc$PLT_CN <- as.character(pc$PLT_CN)
cat(sprintf("[idx] plot AGC+BA for %d visits\n", nrow(pc)))

rm <- read.csv(file.path(fia,"plot_remeas.csv"), colClasses="character")
rm$REMPER <- suppressWarnings(as.numeric(rm$REMPER))
rm$LAT <- suppressWarnings(as.numeric(rm$LAT)); rm$LON <- suppressWarnings(as.numeric(rm$LON))
ci <- setNames(pc$agc_lbac, pc$PLT_CN); bi <- setNames(pc$ba, pc$PLT_CN)
rm$c2 <- ci[rm$CN]; rm$c1 <- ci[rm$PREV_PLT_CN]; rm$ba1 <- bi[rm$PREV_PLT_CN]
rm <- rm[is.finite(rm$c1)&is.finite(rm$c2)&is.finite(rm$REMPER)&rm$REMPER>=3&rm$REMPER<=15,]
rm$grow <- (rm$c2-rm$c1)/rm$REMPER
rm <- rm[is.finite(rm$grow)&rm$grow>0&is.finite(rm$ba1)&rm$ba1>0,]

mfiles <- list.files(cfg, pattern="^ycx_membership_.*\\.csv$", full.names=TRUE)
ftm <- do.call(rbind, lapply(mfiles, function(f){
  d<-read.csv(f,colClasses="character"); d[,c("PLT_CN","ft_group","STDAGE")]}))
ftm <- ftm[!duplicated(ftm$PLT_CN),]
rm$ft  <- setNames(ftm$ft_group,ftm$PLT_CN)[rm$CN]
rm$age <- suppressWarnings(as.numeric(setNames(ftm$STDAGE,ftm$PLT_CN)[rm$CN]))
rm <- rm[!is.na(rm$ft)&is.finite(rm$age)&rm$age>0,]
cat(sprintf("[idx] growth plots with covariates: %d\n", nrow(rm)))

## ---- sample the three indices ----
pts <- vect(rm[,c("LON","LAT")], geom=c("LON","LAT"), crs="EPSG:4326")
rm$CSI  <- terra::extract(rast(csi30f), pts)[,2]
cspi <- rast(cspif); crs(cspi) <- "EPSG:5070"
rm$CSPI <- terra::extract(cspi, project(pts, "EPSG:5070"))[,2]
bgi <- rast(bgif)
rm$BGI <- terra::extract(bgi, project(pts, crs(bgi)))[,2]
rm$STATE <- rm$STATECD

write.csv(rm[,c("CN","STATE","LAT","LON","grow","ba1","age","ft","CSI","CSPI","BGI")],
          file.path(cfg,"index_growth_calib.csv"), row.names=FALSE)

elasticity <- function(d, ix){
  d <- d[is.finite(d[[ix]]) & d[[ix]]>0, ]
  if(nrow(d) < 200) return(c(beta=NA,se=NA,r2=NA,n=nrow(d)))
  f <- lm(as.formula(sprintf("log(grow) ~ log(%s) + log(ba1) + poly(age,2) + ft", ix)), data=d)
  cf <- summary(f)$coefficients
  k <- sprintf("log(%s)", ix)
  c(beta=unname(cf[k,"Estimate"]), se=unname(cf[k,"Std. Error"]),
    r2=summary(f)$r.squared, n=nrow(d))
}

cat("\n[idx] === growth-elasticity per index (own coverage) ===\n")
for(ix in c("CSI","CSPI","BGI")){
  e <- elasticity(rm, ix)
  cat(sprintf("  %-5s beta=%+.3f  SE=%.3f  R2=%.3f  n=%d\n", ix, e["beta"],e["se"],e["r2"],e["n"]))
}

cat("\n[idx] === common Maine subset (all three present) ===\n")
me <- rm[rm$STATE=="23" & is.finite(rm$CSI)&is.finite(rm$CSPI)&is.finite(rm$BGI), ]
cat(sprintf("  ME common-subset n=%d\n", nrow(me)))
for(ix in c("CSI","CSPI","BGI")){
  e <- elasticity(me, ix)
  cat(sprintf("  %-5s beta=%+.3f  SE=%.3f  R2=%.3f  n=%d\n", ix, e["beta"],e["se"],e["r2"],e["n"]))
}
# also a model with all three jointly (ME)
if(nrow(me)>500){
  fj <- lm(log(grow) ~ log(CSI)+log(CSPI)+log(BGI)+log(ba1)+poly(age,2)+ft, data=me)
  cat("\n[idx] joint model (ME) coefficients:\n")
  print(round(summary(fj)$coefficients[c("log(CSI)","log(CSPI)","log(BGI)"),c(1,2,4)],4))
  cat(sprintf("  joint R2=%.3f\n", summary(fj)$r.squared))
}
cat("[idx] wrote index_growth_calib.csv\n")
