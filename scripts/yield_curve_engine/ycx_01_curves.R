## ycx_01_curves.R  (CONUS-generalized empirical yield curves)
##
## Generalizes yc_05/yc_07/yc_09. For one state:
##   1. Aggregate FIA TREE to plot-level AGB, AG carbon, BA, TPA, volume.
##   2. Fit bounded Chapman-Richards curves per (cell x treatment x response)
##      over the FIA chronosequence (stand age), for untreated & harvested.
##   3. v4 anchoring: rescale harvested asymptote `a` to the untreated `a`
##      of the same cell when it is >20% higher (shared carrying capacity).
##   4. Build a fallback fit hierarchy (ft_group x owner, ft_group, state)
##      so every forested plot can be projected even in thin cells.
##
## Climate sensitivity is applied later (ycx_02) as a +/- productivity
## multiplier on the asymptote; here we just store the base fits.
##
## Usage: Rscript ycx_01_curves.R <STATE_ABBR>
## Inputs : ~/fia_data/<ST>_TREE.csv
##          <out>/config/ycx_membership_<ST>.csv, ycx_strata_<ST>.csv
## Outputs: <out>/ycx_<ST>_fits.csv, ycx_<ST>_curves_long.csv

args <- commandArgs(trailingOnly = TRUE)
ST   <- if (length(args) >= 1) toupper(args[1]) else stop("need state abbr")
fia  <- if (length(args) >= 2) args[2] else file.path(Sys.getenv("HOME"), "fia_data")
out  <- if (length(args) >= 3) args[3] else file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config")
MIN_PLOTS <- 30L; MIN_FIT <- 10L
set.seed(20260530)
cat(sprintf("[ycx_01] state=%s\n", ST))

strata <- read.csv(file.path(cfg, sprintf("ycx_strata_%s.csv", ST)),
                   stringsAsFactors = FALSE)
strata <- strata[strata$n_plots >= MIN_PLOTS, ]
mem <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", ST)),
                stringsAsFactors = FALSE)
mem <- mem[order(mem$PLT_CN, -mem$INVYR), ]
mem <- mem[!duplicated(mem$PLT_CN), ]

## ---- slim TREE read (cut needed cols by name) ------------------------
tf <- file.path(fia, sprintf("%s_TREE.csv", ST))
hdr <- strsplit(readLines(tf, n = 1), ",")[[1]]
hdr <- gsub('"', '', hdr)
need <- c("PLT_CN","STATUSCD","DIA","TPA_UNADJ","DRYBIO_AG","CARBON_AG",
          "VOLCFNET","VOLTSGRS","DRYBIO_BOLE")
idx <- match(need, hdr)
if (any(is.na(idx))) stop("missing TREE cols: ",
                          paste(need[is.na(idx)], collapse=", "))
slim <- file.path(out, sprintf(".tmp_tree_%s.csv", ST))
system(sprintf("cut -d, -f%s '%s' > '%s'",
               paste(idx, collapse=","), tf, slim))
tree <- read.csv(slim, stringsAsFactors = FALSE)
unlink(slim)
for (c0 in c("DIA","TPA_UNADJ","DRYBIO_AG","CARBON_AG","VOLCFNET",
             "VOLTSGRS","DRYBIO_BOLE"))
  tree[[c0]] <- suppressWarnings(as.numeric(tree[[c0]]))
tree$STATUSCD <- suppressWarnings(as.integer(tree$STATUSCD))
tree <- tree[!is.na(tree$STATUSCD) & tree$STATUSCD == 1, ]
cat(sprintf("  live trees: %d\n", nrow(tree)))

## ---- plot-level aggregates ------------------------------------------
A <- function(f) { o <- aggregate(f, tree, sum, na.rm = TRUE); o }
agb <- A(I(DRYBIO_AG * TPA_UNADJ) ~ PLT_CN); names(agb)[2] <- "agb_tonac"
agb$agb_tonac <- agb$agb_tonac / 2000
cb  <- A(I(CARBON_AG * TPA_UNADJ) ~ PLT_CN); names(cb)[2]  <- "carbon_lbac"
ba  <- A(I(0.005454154 * DIA^2 * TPA_UNADJ) ~ PLT_CN); names(ba)[2] <- "ba_ft2ac"
tpa <- A(TPA_UNADJ ~ PLT_CN); names(tpa)[2] <- "tpa_total"
vol <- A(I(VOLCFNET * TPA_UNADJ) ~ PLT_CN); names(vol)[2] <- "merchvol_cuftac"
vtt <- A(I(VOLTSGRS * TPA_UNADJ) ~ PLT_CN); names(vtt)[2] <- "voltot_cuftac"
mbo <- A(I(DRYBIO_BOLE * TPA_UNADJ) ~ PLT_CN); names(mbo)[2] <- "merchbio_tonac"
mbo$merchbio_tonac <- mbo$merchbio_tonac / 2000

pd <- Reduce(function(a,b) merge(a,b,by="PLT_CN",all=TRUE),
             list(agb, cb, ba, tpa, vol, vtt, mbo))
pd <- merge(pd, mem[, c("PLT_CN","cell_key","ft_group","prov_code",
                        "owner4","STDAGE","treatment")], by = "PLT_CN")
names(pd)[names(pd)=="STDAGE"] <- "stand_age"
pd <- pd[!is.na(pd$stand_age) & pd$stand_age > 0 &
         pd$treatment %in% c("untreated","harvested"), ]
pd$ft_owner <- paste(pd$ft_group, pd$owner4, sep="|")
cat(sprintf("  plots with age+treatment: %d\n", nrow(pd)))

## ---- peak-and-decline yield form: y = b1 * age^b2 * b3^age -----------
## (Weiskittel's Maine AGB form.) Linear in log space:
##   log(y) = log(b1) + b2*log(age) + log(b3)*age   -> robust OLS, no
## convergence issues. With b3 < 1 the curve rises then PEAKS at
## age* = b2 / -ln(b3) and declines, avoiding the unbounded accumulation
## of purely-asymptotic forms (Chapman-Richards) over 100+ yr horizons.
## Coefficient columns a,b,c hold b1,b2,b3 (names kept for downstream code).
chap <- function(age,a,b,c) a * age^b * c^age
fit1 <- function(age, y) {
  ok <- !is.na(age) & !is.na(y) & y > 0 & age > 0; age<-age[ok]; y<-y[ok]
  if (length(y) < MIN_FIT) return(NULL)
  m <- tryCatch(lm(log(y) ~ log(age) + age), error=function(e) NULL)
  if (is.null(m)) return(NULL)
  cf <- coef(m); if (any(!is.finite(cf))) return(NULL)
  ## cap b3 <= 1: forbid exponential growth (c^age must not explode).
  ## If the age term is positive, drop it -> b3 = 1 (pure power, saturates).
  if (cf[3] > 0) { m <- tryCatch(lm(log(y) ~ log(age)), error=function(e) NULL)
    if (is.null(m)) return(NULL); cf <- c(coef(m), 0) }
  a <- exp(unname(cf[1])); b <- unname(cf[2]); c <- exp(unname(cf[3]))
  ## reject implausible shapes so the fallback hierarchy supplies the curve
  if (!is.finite(a) || a<=0 || b < 0.2 || b > 3.0) return(NULL)
  pr <- chap(age, a, b, c)
  list(a=a, b=b, c=c, rmse=sqrt(mean((y-pr)^2, na.rm=TRUE)))
}
resp <- c("agb_tonac","carbon_lbac","ba_ft2ac","tpa_total",
          "merchvol_cuftac","voltot_cuftac","merchbio_tonac")
age_grid <- seq(5,150,by=5)

emit_fit <- function(sub, scope, key, ft, prov, own, trt) {
  rows_f <- list(); rows_c <- list()
  for (rv in resp) {
    m <- fit1(sub$stand_age, sub[[rv]]); if (is.null(m)) next
    pr <- chap(age_grid, m$a, m$b, m$c)
    rows_f[[rv]] <- data.frame(scope=scope, cell_key=key, ft_group=ft,
      prov_code=prov, owner=own, treatment=trt, response=rv,
      a=round(m$a,4), b=round(m$b,5), c=round(m$c,6),
      rmse=round(m$rmse,3), n_plots=nrow(sub), stringsAsFactors=FALSE)
    rows_c[[rv]] <- data.frame(scope=scope, cell_key=key, ft_group=ft,
      prov_code=prov, owner=own, treatment=trt, response=rv,
      age=age_grid, predicted=round(pr,3), stringsAsFactors=FALSE)
  }
  list(f=do.call(rbind,rows_f), c=do.call(rbind,rows_c))
}

## ===== hierarchical (partially-pooled) parameters ====================
## Fit on UNTREATED plots only (reserve chronosequence; ycx_02 derives the
## managed scenario by explicit harvest, so no harvested curve is needed).
## Model (per response):
##   log(y) ~ 0 + ft + ft:log(age) + ft:age            # shape & decline by
##            + (1+log(age) | eco) + (1|own) + (1|eco:own)   forest type;
## scale (b1) varies by ft, ecoregion, owner & eco:owner; shape (b2) by ft
## and ecoregion; decline (b3) by ft. lmer predicts a parameter set for
## EVERY populated cell, so sparse cells borrow strength (no degenerate
## fits). OLS fallback per response if lmer is unavailable / fails.
has_lme4 <- requireNamespace("lme4", quietly=TRUE)
pdu <- pd[pd$treatment=="untreated" & pd$stand_age>0, ]
pdu$la <- log(pdu$stand_age); pdu$ag <- pdu$stand_age
## every cell present in the membership (incl. sparse) gets partial-pooled
## parameters -- this is what shrinkage is for, and the TreeMap pixel-level
## application needs a curve for every forest-type x ecoregion x owner combo.
cellinfo <- unique(mem[, c("cell_key","ft_group","prov_code","owner4")])
cellinfo <- cellinfo[!is.na(cellinfo$ft_group) & !is.na(cellinfo$prov_code) &
                     !is.na(cellinfo$owner4), ]

cap_c <- function(lc) min(lc, 0)          # b3 <= 1 (no exponential growth)
emit_cell <- function(ci, rv, a,b,c) {
  if (!is.finite(a)||a<=0||b< -0.5||b>3.5) return(NULL)
  c <- exp(cap_c(log(c)))
  pr <- chap(age_grid, a, b, c)
  list(
    f=data.frame(scope="cell", cell_key=ci$cell_key, ft_group=ci$ft_group,
       prov_code=ci$prov_code, owner=ci$owner4, treatment="untreated",
       response=rv, a=round(a,4), b=round(b,5), c=round(c,6),
       rmse=NA, n_plots=NA, stringsAsFactors=FALSE),
    c=data.frame(scope="cell", cell_key=ci$cell_key, ft_group=ci$ft_group,
       prov_code=ci$prov_code, owner=ci$owner4, treatment="untreated",
       response=rv, age=age_grid, predicted=round(pr,3), stringsAsFactors=FALSE))
}

FIT <- list(); CUR <- list()
add <- function(x){ if(!is.null(x)&&!is.null(x$f)){FIT[[length(FIT)+1]]<<-x$f; CUR[[length(CUR)+1]]<<-x$c} }

for (rv in resp) {
  d <- pdu[is.finite(pdu[[rv]]) & pdu[[rv]]>0, ]
  if (nrow(d) < MIN_FIT) next
  d$y <- log(d[[rv]])
  d$ft <- factor(d$ft_group); d$eco <- factor(d$prov_code); d$own <- factor(d$owner4)
  m <- NULL
  if (has_lme4 && nlevels(d$ft)>=1 && nrow(d)>=80)
    m <- tryCatch(lme4::lmer(y ~ 0 + ft + ft:la + ft:ag +
            (1+la|eco) + (1|own) + (1|eco:own), data=d,
            control=lme4::lmerControl(optimizer="bobyqa",
              check.conv.singular=lme4::.makeCC("ignore",1e-4))),
          error=function(e) NULL)
  if (!is.null(m)) {
    fe <- lme4::fixef(m); re <- lme4::ranef(m)
    g <- function(tab,key,col){ if(!is.null(tab)&&key %in% rownames(tab)&&col %in% colnames(tab)) tab[key,col] else 0 }
    for (i in seq_len(nrow(cellinfo))) {
      ci <- cellinfo[i,]; ftn<-paste0("ft",ci$ft_group)
      lb1 <- (if(ftn %in% names(fe)) fe[[ftn]] else NA)
      b2  <- (if(paste0(ftn,":la") %in% names(fe)) fe[[paste0(ftn,":la")]] else NA)
      lb3 <- (if(paste0(ftn,":ag") %in% names(fe)) fe[[paste0(ftn,":ag")]] else NA)
      if (any(is.na(c(lb1,b2,lb3)))) next
      lb1 <- lb1 + g(re$eco,ci$prov_code,"(Intercept)") + g(re$own,ci$owner4,"(Intercept)") +
             g(re$`eco:own`, paste(ci$prov_code,ci$owner4,sep=":"), "(Intercept)")
      b2  <- b2  + g(re$eco,ci$prov_code,"la")
      add(emit_cell(ci, rv, exp(lb1), b2, exp(lb3)))
    }
  } else {
    ## OLS fallback per cell (with parent fallback)
    for (i in seq_len(nrow(cellinfo))) {
      ci <- cellinfo[i,]
      sub <- d[d$ft_group==ci$ft_group & d$prov_code==ci$prov_code & d$owner4==ci$owner4, ]
      if (nrow(sub)<MIN_FIT) sub <- d[d$ft_group==ci$ft_group, ]
      if (nrow(sub)<MIN_FIT) sub <- d
      fo <- fit1(sub$stand_age, sub[[rv]]); if (is.null(fo)) next
      add(emit_cell(ci, rv, fo$a, fo$b, fo$c))
    }
  }
  ## state-level safety fallback (untreated, this response)
  fst <- fit1(d$stand_age, d[[rv]])
  if (!is.null(fst)) add(list(
    f=data.frame(scope="state", cell_key=ST, ft_group=NA, prov_code=NA, owner=NA,
       treatment="untreated", response=rv, a=round(fst$a,4), b=round(fst$b,5),
       c=round(fst$c,6), rmse=round(fst$rmse,3), n_plots=nrow(d), stringsAsFactors=FALSE),
    c=data.frame(scope="state", cell_key=ST, ft_group=NA, prov_code=NA, owner=NA,
       treatment="untreated", response=rv, age=age_grid,
       predicted=round(chap(age_grid,fst$a,fst$b,fst$c),3), stringsAsFactors=FALSE)))
}

fits <- do.call(rbind, FIT); curves <- do.call(rbind, CUR)
write.csv(fits,   file.path(out, sprintf("ycx_%s_fits.csv", ST)),       row.names=FALSE)
write.csv(curves, file.path(out, sprintf("ycx_%s_curves_long.csv", ST)),row.names=FALSE)
cat(sprintf("[ycx_01] %s: %d fits (%d cell-scope), %d curve rows | lme4=%s\n",
            ST, nrow(fits), sum(fits$scope=="cell"), nrow(curves), has_lme4))
