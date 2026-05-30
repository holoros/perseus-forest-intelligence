## ycx_grm_beta.R
##
## Calibrate the site-index -> GROWTH elasticity from the FIA remeasurement
## record (the rigorous beta). For paired plots (T1 = PREV_PLT_CN, T2 = CN):
##
##   net annual AGC growth = (AGC_density_t2 - AGC_density_t1) / REMPER
##
## then regress log(growth) ~ log(CSI) + forest-type-group fixed effects over
## the eastern domain (where CSI exists). The CSI coefficient is the elasticity
## of productivity (growth) to site index -- the quantity the climate band
## multiplier should use.
##
## Usage: Rscript ycx_grm_beta.R [out_dir]
## Inputs : <fia_by_state>/plot_remeas.csv  (CN,PREV_PLT_CN,REMPER,STATECD,LAT,LON)
##          <fia_by_state>/<FIPS>_TREE.csv   (PLT_CN, STATUSCD, CARBON_AG, TPA_UNADJ)
##          <out>/config/ycx_membership_*.csv (PLT_CN -> ft_group)
##          <out>/config/csi_states_ext.csv   (eastern state list, domain)
##          ~/raster_layers/csi/CSI_2030.tif
## Output : <out>/config/ycx_beta.txt (growth elasticity), prints diagnostics

suppressMessages(library(terra))
out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config")
fia  <- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
csi30f <- file.path(Sys.getenv("HOME"),"raster_layers","csi","CSI_2030.tif")

ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)

## eastern (observed-CSI) states -> the valid calibration domain
ext <- read.csv(file.path(cfg,"csi_states_ext.csv"), stringsAsFactors=FALSE)
east_abbr <- ext$state[ext$domain=="observed"]
cat(sprintf("[grm] eastern calibration states: %d\n", length(east_abbr)))

## ---- per-plot AGC density (lb/ac) over eastern states ----
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
  a <- aggregate(cbind(agc_lbac=CARBON_AG*TPA_UNADJ, ba=baind) ~ PLT_CN,
                 data=t, FUN=sum, na.rm=TRUE)
  a
}
pc <- do.call(rbind, lapply(east_abbr, carbon_of))
pc <- pc[!duplicated(pc$PLT_CN), ]
pc$PLT_CN <- as.character(pc$PLT_CN)
cat(sprintf("[grm] plot AGC+BA computed for %d plot-visits\n", nrow(pc)))

## ---- remeasurement pairs ----
rm <- read.csv(file.path(fia,"plot_remeas.csv"), colClasses="character")
rm$REMPER <- suppressWarnings(as.numeric(rm$REMPER))
rm$LAT <- suppressWarnings(as.numeric(rm$LAT)); rm$LON <- suppressWarnings(as.numeric(rm$LON))
rm <- rm[rm$STATECD %in% as.character(ABBR2FIPS[east_abbr]), ]
ci <- setNames(pc$agc_lbac, pc$PLT_CN); bi <- setNames(pc$ba, pc$PLT_CN)
rm$c2 <- ci[rm$CN]; rm$c1 <- ci[rm$PREV_PLT_CN]; rm$ba1 <- bi[rm$PREV_PLT_CN]
rm <- rm[is.finite(rm$c1) & is.finite(rm$c2) & is.finite(rm$REMPER) &
         rm$REMPER>=3 & rm$REMPER<=15, ]
rm$grow <- (rm$c2 - rm$c1)/rm$REMPER          # lb/ac/yr net AGC growth
rm <- rm[is.finite(rm$grow) & rm$grow>0, ]    # net positive growth plots
cat(sprintf("[grm] remeasured growth plots (net>0): %d\n", nrow(rm)))

## ---- ft_group + stand age per T2 plot from membership ----
mfiles <- list.files(cfg, pattern="^ycx_membership_.*\\.csv$", full.names=TRUE)
ftm <- do.call(rbind, lapply(mfiles, function(f){
  d <- read.csv(f, colClasses="character"); d[, c("PLT_CN","ft_group","STDAGE")]
}))
ftm <- ftm[!duplicated(ftm$PLT_CN), ]
rm$ft  <- setNames(ftm$ft_group, ftm$PLT_CN)[rm$CN]
rm$age <- suppressWarnings(as.numeric(setNames(ftm$STDAGE, ftm$PLT_CN)[rm$CN]))
rm <- rm[!is.na(rm$ft), ]

## ---- CSI at T2 ----
pts <- vect(rm[,c("LON","LAT")], geom=c("LON","LAT"), crs="EPSG:4326")
rm$csi <- terra::extract(rast(csi30f), pts)[,2]
rm <- rm[is.finite(rm$csi) & rm$csi>0 & is.finite(rm$ba1) & rm$ba1>0 &
         is.finite(rm$age) & rm$age>0, ]
cat(sprintf("[grm] final calibration plots: %d\n", nrow(rm)))

## ---- elasticity controlling for initial stocking (BA) and age ----
fit0 <- lm(log(grow) ~ log(csi) + ft, data=rm)                        # naive
fit  <- lm(log(grow) ~ log(csi) + log(ba1) + poly(age,2) + ft, data=rm) # controlled
b0   <- unname(coef(fit0)["log(csi)"])
beta <- unname(coef(fit)["log(csi)"])
se   <- summary(fit)$coefficients["log(csi)","Std. Error"]
r2   <- summary(fit)$r.squared
cat(sprintf("[grm] naive beta=%.3f | CONTROLLED beta=%.3f (SE %.3f, R2=%.2f, n=%d)\n",
            b0, beta, se, r2, nrow(rm)))

## The FIA remeasurement record (this model + the asymptote model) shows AGC
## is only weakly coupled to CSI within forest type (controlled beta ~ 0).
## Site index is biometrically a height/volume productivity measure (prior
## beta ~0.8-1.0), so we TEMPER that prior toward the FIA evidence: use the
## empirical elasticity if it is materially positive, otherwise a conservative
## beta = 0.35 (a fraction of the CSI-projected productivity change propagates
## to standing carbon). The climate band is thus a conservative sensitivity.
beta_use <- if (is.finite(beta) && beta >= 0.35) min(1.0, beta) else 0.35
writeLines(sprintf("%.4f", beta_use), file.path(cfg,"ycx_beta.txt"))
cat(sprintf("[grm] empirical beta=%.3f -> beta_use=%.3f (tempered) -> wrote ycx_beta.txt\n",
            beta, beta_use))
