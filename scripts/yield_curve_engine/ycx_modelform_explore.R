## ycx_modelform_explore.R
##
## Stress-test the yield-curve MODEL FORM and explore COVARIATES, and quantify
## how the curve parameters vary by forest type, ecoregion, and owner.
##
## Builds a national plot-level chronosequence dataset (AGC density vs stand
## age, with ft_group / ecoregion / owner / CSPI), then:
##   (A) 5-fold CV of three model forms fit with forest-type fixed effects:
##         - peak-decline : log(y) = b1 + b2 log(age) + b3 age   (Weiskittel)
##         - power        : log(y) = b1 + b2 log(age)            (no decline)
##         - Chapman-Rich.: y = a(1-exp(-k age))^p               (asymptotic)
##   (B) hierarchical variance decomposition: how much of the b1 (scale),
##       b2 (shape) and b3 (decline) variation is attributable to forest type
##       vs ecoregion vs owner (lme4 random slopes).
##   (C) covariate test: does CSPI on the scale (b1) improve the model (AIC,
##       residual variance)?
##
## Output: <out>/config/modelform_report.txt, <out>/figures/modelform_cv.png

suppressMessages({ library(terra); library(lme4) })
out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config"); figd <- file.path(out, "figures")
dir.create(figd, showWarnings=FALSE, recursive=TRUE)
fia  <- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
cspif<- file.path(Sys.getenv("HOME"),"raster_layers","cspi_rs","CSPI_V4_CONUS_1km_forest.tif")
set.seed(20260530)

ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)

## ---- assemble plot AGC density per latest-visit plot, with strata ----
agc_of <- function(abbr){
  fp <- file.path(fia, sprintf("%d_TREE.csv", ABBR2FIPS[[abbr]]))
  if(!file.exists(fp)) return(NULL)
  hdr <- gsub('"','',strsplit(readLines(fp,1),",")[[1]])
  idx <- match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"), hdr)
  tmp <- tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'", paste(idx,collapse=","), fp, tmp))
  t <- read.csv(tmp, stringsAsFactors=FALSE); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD))
  for(c0 in c("CARBON_AG","TPA_UNADJ")) t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t <- t[!is.na(t$STATUSCD)&t$STATUSCD==1,]
  a <- aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN, data=t, FUN=sum, na.rm=TRUE)
  names(a)[2]<-"agc"; a$PLT_CN<-as.character(a$PLT_CN); a
}
mfiles <- list.files(cfg, pattern="^ycx_membership_.*\\.csv$", full.names=TRUE)
abbrs  <- sub("^ycx_membership_","",sub("\\.csv$","",basename(mfiles)))
D <- list()
for (st in abbrs) {
  m <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", st)), colClasses="character")
  m <- m[order(m$STATECD,m$COUNTYCD,m$PLOT, -as.integer(m$INVYR)),]
  m <- m[!duplicated(paste(m$STATECD,m$COUNTYCD,m$PLOT)),]
  ac <- agc_of(st); if(is.null(ac)) next
  m$agc <- setNames(ac$agc, ac$PLT_CN)[m$PLT_CN]
  m$age <- suppressWarnings(as.numeric(m$STDAGE))
  d <- m[is.finite(m$agc)&m$agc>0&is.finite(m$age)&m$age>0,
         c("LON","LAT","ft_group","prov_code","owner4","age","agc")]
  D[[st]] <- d
}
dat <- do.call(rbind, D)
dat$LON<-as.numeric(dat$LON); dat$LAT<-as.numeric(dat$LAT)
cat(sprintf("[mf] national plot dataset: %d plots\n", nrow(dat)))

## ---- sample CSPI (native LAEA crs) ----
pts <- vect(dat[,c("LON","LAT")],geom=c("LON","LAT"),crs="EPSG:4326")
r <- rast(cspif); dat$cspi <- terra::extract(r, project(pts, crs(r)))[,2]

## keep well-represented forest types for stable form comparison
ftn <- table(dat$ft_group); keepft <- names(ftn[ftn>=2000])
dat <- dat[dat$ft_group %in% keepft, ]
dat$ft <- factor(dat$ft_group); dat$eco <- factor(dat$prov_code); dat$own <- factor(dat$owner4)
cat(sprintf("[mf] after ft filter: %d plots, %d forest types, %d ecoregions, %d owners\n",
            nrow(dat), nlevels(dat$ft), nlevels(dat$eco), nlevels(dat$own)))

sink(file.path(cfg,"modelform_report.txt"))
cat("===== YC engine: model-form stress test + covariate exploration =====\n")
cat(sprintf("plots=%d  forest_types=%d  ecoregions=%d  owners=%d\n\n",
            nrow(dat), nlevels(dat$ft), nlevels(dat$eco), nlevels(dat$own)))

## ===== (A) model-form 5-fold CV (forest-type fixed effects) ===========
chap <- function(age,a,b,c) a*(1-exp(-b*age))^c
K <- 5; fold <- sample(rep(1:K, length.out=nrow(dat)))
rmse_pd <- rmse_pw <- rmse_cr <- numeric(K)
for (k in 1:K) {
  tr <- dat[fold!=k,]; te <- dat[fold==k,]
  ## peak-decline (log-linear, ft-specific slopes)
  m1 <- lm(log(agc) ~ ft*log(age) + ft*age, data=tr)
  p1 <- exp(predict(m1, te)); rmse_pd[k] <- sqrt(mean((te$agc-p1)^2))
  ## power (no decline)
  m2 <- lm(log(agc) ~ ft*log(age), data=tr)
  p2 <- exp(predict(m2, te)); rmse_pw[k] <- sqrt(mean((te$agc-p2)^2))
  ## Chapman-Richards per forest type (nls), fallback global
  p3 <- rep(NA, nrow(te))
  for (lev in levels(dat$ft)) {
    trf <- tr[tr$ft==lev,]; tef <- which(te$ft==lev); if(!length(tef)) next
    fit <- tryCatch(nls(agc~chap(age,a,b,c), data=trf,
            start=list(a=max(trf$agc)*1.1,b=0.03,c=1.5),
            control=nls.control(maxiter=200,warnOnly=TRUE)), error=function(e) NULL)
    if(!is.null(fit)) p3[tef] <- predict(fit, te[tef,])
  }
  ok <- is.finite(p3); rmse_cr[k] <- sqrt(mean((te$agc[ok]-p3[ok])^2))
}
cat("(A) 5-fold CV RMSE (lb/ac AGC; lower=better):\n")
cat(sprintf("    peak-decline (b1*Age^b2*b3^Age) : %.0f\n", mean(rmse_pd)))
cat(sprintf("    power (no decline)              : %.0f\n", mean(rmse_pw)))
cat(sprintf("    Chapman-Richards (asymptotic)   : %.0f\n\n", mean(rmse_cr)))

## ===== (B) variance decomposition by ft / eco / owner =================
cat("(B) hierarchical variance of parameters by grouping factor\n")
dat$la <- log(dat$age)
hm <- tryCatch(lmer(log(agc) ~ la + age +
        (1+la+age|ft) + (1+la+age|eco) + (1+la+age|own),
        data=dat, control=lmerControl(optimizer="bobyqa",
        check.conv.singular=.makeCC("ignore",tol=1e-4))), error=function(e) NULL)
if (!is.null(hm)) {
  vc <- as.data.frame(VarCorr(hm))
  show <- vc[is.na(vc$var2), c("grp","var1","sdcor")]
  show$param <- ifelse(show$var1=="(Intercept)","b1_scale",
                ifelse(show$var1=="la","b2_shape",
                ifelse(show$var1=="age","b3_decline","resid")))
  cat("    random-effect SD by group (bigger = parameter varies more by that factor):\n")
  for (i in seq_len(nrow(show)))
    cat(sprintf("      %-8s  %-10s  SD=%.4f\n", show$grp[i], show$param[i], show$sdcor[i]))
} else cat("    (hierarchical model did not converge cleanly)\n")
cat("\n")

## ===== (C) covariate test: CSPI on scale ==============================
cat("(C) covariate test (CSPI on the scale/b1)\n")
sub <- dat[is.finite(dat$cspi)&dat$cspi>0,]
base <- lm(log(agc) ~ ft*la + ft*age, data=sub)
cov  <- lm(log(agc) ~ ft*la + ft*age + log(cspi), data=sub)
cat(sprintf("    n with CSPI=%d | AIC base=%.0f  +CSPI=%.0f (dAIC=%.0f)\n",
            nrow(sub), AIC(base), AIC(cov), AIC(cov)-AIC(base)))
cc <- summary(cov)$coefficients
cat(sprintf("    log(CSPI) coef=%+.3f (SE %.3f, p=%.1e); residSD %.3f -> %.3f\n",
            cc["log(cspi)","Estimate"], cc["log(cspi)","Std. Error"],
            cc["log(cspi)","Pr(>|t|)"], sigma(base), sigma(cov)))
sink()

## figure: CV bars
png(file.path(figd,"modelform_cv.png"), width=720, height=440, res=120)
op<-par(mar=c(4,8,3,1))
vals<-c(`Chapman-Richards\n(asymptotic)`=mean(rmse_cr),
        `power\n(no decline)`=mean(rmse_pw),
        `peak-decline\n(Weiskittel)`=mean(rmse_pd))
barplot(rev(vals), horiz=TRUE, las=1, col=c("#2f9e6a","#8da0cb","#c62828"),
        xlab="5-fold CV RMSE (lb/ac AGC) — lower is better",
        main="Yield-curve model form: cross-validated accuracy")
par(op); dev.off()
cat("[mf] wrote modelform_report.txt and figures/modelform_cv.png\n")
writeLines(readLines(file.path(cfg,"modelform_report.txt")))
