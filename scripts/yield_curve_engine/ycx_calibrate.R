## ycx_calibrate.R
##
## (b) Calibrate the site-index -> biomass elasticity beta empirically:
##     regress log(carbon carrying capacity) on log(Climate Site Index)
##     across well-sampled strata (eastern domain, where CSI exists).
##
## (a) Extend the CSI climate signal to the western/plains states that fall
##     outside the CSI raster domain: fit the eastern per-plot CSI ratio
##     (2060/2030, 2090/2030) to national climate-embedding predictors +
##     latitude (a space-for-time transfer), then predict the ratio for
##     western plots. Aggregate to a per-state table with a domain flag.
##
## Outputs: <out>/config/csi_states_ext.csv  (state,csi_2030,csi_2060,csi_2090,domain)
##          <out>/config/ycx_beta.txt        (calibrated beta)

suppressMessages(library(terra))
out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config")
csid <- file.path(Sys.getenv("HOME"), "raster_layers", "csi")
embf <- file.path(Sys.getenv("HOME"), "SiteIndex", "CONUS_Climate_Embedding_Top4.tif")

## ---- gather all plots from membership ----
mfiles <- list.files(cfg, pattern="^ycx_membership_.*\\.csv$", full.names=TRUE)
mem <- do.call(rbind, lapply(mfiles, function(f){
  st <- sub("^ycx_membership_","",sub("\\.csv$","",basename(f)))
  d <- read.csv(f, stringsAsFactors=FALSE)
  d <- d[is.finite(d$LON)&is.finite(d$LAT), c("LON","LAT","cell_key")]
  if(!nrow(d)) return(NULL)
  data.frame(state=st, LON=d$LON, LAT=d$LAT, cell_key=d$cell_key)
}))
cat(sprintf("[cal] %d plots, %d states\n", nrow(mem), length(unique(mem$state))))
pts <- vect(mem[,c("LON","LAT")], geom=c("LON","LAT"), crs="EPSG:4326")

## ---- sample CSI (eastern domain) ----
csi30 <- terra::extract(rast(file.path(csid,"CSI_2030.tif")), pts)[,2]
csi60 <- terra::extract(rast(file.path(csid,"CSI_2060.tif")), pts)[,2]
csi90 <- terra::extract(rast(file.path(csid,"CSI_2090.tif")), pts)[,2]
mem$csi30 <- csi30; mem$csi60 <- csi60; mem$csi90 <- csi90
east <- is.finite(csi30) & csi30>0
cat(sprintf("[cal] plots with CSI (eastern domain): %d (%.0f%%)\n",
            sum(east), 100*mean(east)))

## ---- sample national climate embedding (Albers meters; assign EPSG:5070) ----
emb <- rast(embf); crs(emb) <- "EPSG:5070"
ptsA <- project(pts, "EPSG:5070")
E <- terra::extract(emb, ptsA)[,-1]
names(E) <- paste0("PC", seq_len(ncol(E)))
mem <- cbind(mem, E)

## ===========================================================
## (b) beta = elasticity of carbon carrying capacity to CSI
## ===========================================================
mem$mcsi <- mem$csi30
cell_csi <- aggregate(mcsi ~ cell_key + state, data=mem[east,], FUN=mean, na.rm=TRUE)
# carbon asymptote per cell from each eastern state's fits
ffiles <- file.path(out, sprintf("ycx_%s_fits.csv", unique(cell_csi$state)))
fits <- do.call(rbind, lapply(ffiles[file.exists(ffiles)], function(f){
  d <- read.csv(f, stringsAsFactors=FALSE)
  d[d$scope=="cell" & d$response=="carbon_lbac" & d$treatment=="untreated",
    c("cell_key","a","n_plots")]
}))
cal <- merge(cell_csi, fits, by="cell_key")
cal <- cal[is.finite(cal$a) & cal$a>0 & is.finite(cal$mcsi) & cal$mcsi>0, ]
# carbon carrying capacity is dominated by forest-type group; estimate the
# WITHIN-type elasticity by including ft-group fixed effects.
cal$ft  <- sub("\\|.*", "", cal$cell_key)
cal$own <- sub(".*\\|", "", cal$cell_key)
fitb <- lm(log(a) ~ log(mcsi) + ft + own, data=cal, weights=n_plots)
beta  <- unname(coef(fitb)["log(mcsi)"])
seb   <- summary(fitb)$coefficients["log(mcsi)","Std. Error"]
r2b   <- summary(fitb)$r.squared
cat(sprintf("[cal] within-type beta = %.3f (SE %.3f, model R2=%.2f, n_cells=%d)\n",
            beta, seb, r2b, nrow(cal)))
# use the empirical within-type elasticity if it is positive and reasonable,
# else fall back to a biometric default (~0.8, volume ~ site index).
beta_use <- if (is.finite(beta) && beta >= 0.2 && beta <= 1.5) beta else 0.80
beta_use <- max(0.3, min(1.3, beta_use))
cat(sprintf("[cal] beta_use = %.3f\n", beta_use))
writeLines(sprintf("%.4f", beta_use), file.path(cfg, "ycx_beta.txt"))

## ===========================================================
## (a) transfer model: eastern CSI ratio ~ climate embedding + lat
## ===========================================================
mem$r60 <- mem$csi60/mem$csi30
mem$r90 <- mem$csi90/mem$csi30
estr <- mem[east & is.finite(mem$r90) & is.finite(mem$PC1), ]
m60 <- lm(r60 ~ PC1+PC2+PC3+PC4+LAT, data=cbind(estr, LAT=estr$LAT))
m90 <- lm(r90 ~ PC1+PC2+PC3+PC4+LAT, data=cbind(estr, LAT=estr$LAT))
cat(sprintf("[cal] transfer R2: r60=%.2f  r90=%.2f  (n=%d)\n",
            summary(m60)$r.squared, summary(m90)$r.squared, nrow(estr)))

mem$LAT <- mem$LAT  # ensure present
pr60 <- predict(m60, newdata=mem); pr90 <- predict(m90, newdata=mem)
# clamp predictions to plausible range
clamp <- function(x) pmin(1.35, pmax(0.65, x))
mem$r60_use <- ifelse(east, mem$r60, clamp(pr60))
mem$r90_use <- ifelse(east, mem$r90, clamp(pr90))

## ---- per-state output ----
agg <- function(v, w) tapply(v, mem$state, function(i) mean(i, na.rm=TRUE))
st_r60 <- tapply(mem$r60_use, mem$state, mean, na.rm=TRUE)
st_r90 <- tapply(mem$r90_use, mem$state, mean, na.rm=TRUE)
st_east<- tapply(east,        mem$state, mean, na.rm=TRUE)
states <- names(st_r60)
ext <- data.frame(
  state    = states,
  csi_2030 = 1.0,
  csi_2060 = round(as.numeric(st_r60[states]),4),
  csi_2090 = round(as.numeric(st_r90[states]),4),
  domain   = ifelse(st_east[states] > 0.5, "observed", "modeled"),
  stringsAsFactors=FALSE)
write.csv(ext, file.path(cfg, "csi_states_ext.csv"), row.names=FALSE)

cat("[cal] per-state CSI ratio (2090) by domain:\n")
ext$chg <- round(100*(ext$csi_2090-1),1)
print(ext[order(ext$chg), c("state","csi_2090","chg","domain")], row.names=FALSE)
cat(sprintf("[cal] wrote csi_states_ext.csv (%d states) and ycx_beta.txt (beta=%.3f)\n",
            nrow(ext), beta_use))
