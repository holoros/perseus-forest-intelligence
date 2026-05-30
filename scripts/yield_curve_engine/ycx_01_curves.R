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
need <- c("PLT_CN","STATUSCD","DIA","TPA_UNADJ","DRYBIO_AG","CARBON_AG","VOLCFNET")
idx <- match(need, hdr)
if (any(is.na(idx))) stop("missing TREE cols: ",
                          paste(need[is.na(idx)], collapse=", "))
slim <- file.path(out, sprintf(".tmp_tree_%s.csv", ST))
system(sprintf("cut -d, -f%s '%s' > '%s'",
               paste(idx, collapse=","), tf, slim))
tree <- read.csv(slim, stringsAsFactors = FALSE)
unlink(slim)
for (c0 in c("DIA","TPA_UNADJ","DRYBIO_AG","CARBON_AG","VOLCFNET"))
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
vol <- A(I(VOLCFNET * TPA_UNADJ) ~ PLT_CN); names(vol)[2] <- "vol_cuftac"

pd <- Reduce(function(a,b) merge(a,b,by="PLT_CN",all=TRUE),
             list(agb, cb, ba, tpa, vol))
pd <- merge(pd, mem[, c("PLT_CN","cell_key","ft_group","prov_code",
                        "owner4","STDAGE","treatment")], by = "PLT_CN")
names(pd)[names(pd)=="STDAGE"] <- "stand_age"
pd <- pd[!is.na(pd$stand_age) & pd$stand_age > 0 &
         pd$treatment %in% c("untreated","harvested"), ]
pd$ft_owner <- paste(pd$ft_group, pd$owner4, sep="|")
cat(sprintf("  plots with age+treatment: %d\n", nrow(pd)))

## ---- bounded Chapman-Richards ---------------------------------------
chap <- function(age,a,b,c) a*(1-exp(-b*age))^c
fit1 <- function(age, y) {
  ok <- !is.na(age) & !is.na(y) & y > 0; age<-age[ok]; y<-y[ok]
  if (length(y) < MIN_FIT) return(NULL)
  ymax <- max(y)
  tryCatch(nls(y ~ chap(age,a,b,c),
      data=data.frame(age=age,y=y),
      start=list(a=ymax*1.2, b=0.04, c=1.5), algorithm="port",
      lower=c(a=1,b=0.005,c=0.5), upper=c(a=ymax*3,b=0.20,c=5.0),
      control=list(maxiter=300, warnOnly=TRUE)),
    error=function(e) NULL)
}
resp <- c("agb_tonac","carbon_lbac","ba_ft2ac","tpa_total","vol_cuftac")
age_grid <- seq(5,150,by=5)

emit_fit <- function(sub, scope, key, ft, prov, own, trt) {
  rows_f <- list(); rows_c <- list()
  for (rv in resp) {
    m <- fit1(sub$stand_age, sub[[rv]]); if (is.null(m)) next
    co <- coef(m); pr <- chap(age_grid, co["a"], co["b"], co["c"])
    rows_f[[rv]] <- data.frame(scope=scope, cell_key=key, ft_group=ft,
      prov_code=prov, owner=own, treatment=trt, response=rv,
      a=round(unname(co["a"]),3), b=round(unname(co["b"]),5),
      c=round(unname(co["c"]),3),
      rmse=round(sqrt(mean(residuals(m)^2,na.rm=TRUE)),3),
      n_plots=nrow(sub), stringsAsFactors=FALSE)
    rows_c[[rv]] <- data.frame(scope=scope, cell_key=key, ft_group=ft,
      prov_code=prov, owner=own, treatment=trt, response=rv,
      age=age_grid, predicted=round(pr,3), stringsAsFactors=FALSE)
  }
  list(f=do.call(rbind,rows_f), c=do.call(rbind,rows_c))
}

FIT <- list(); CUR <- list()
add <- function(x){ if(!is.null(x$f)){FIT[[length(FIT)+1]]<<-x$f; CUR[[length(CUR)+1]]<<-x$c} }

## 1) primary cells x treatment
for (i in seq_len(nrow(strata))) {
  s <- strata[i,]
  for (trt in c("untreated","harvested")) {
    sub <- pd[pd$cell_key==s$cell_key & pd$treatment==trt, ]
    if (nrow(sub) < MIN_FIT) next
    add(emit_fit(sub,"cell",s$cell_key,s$ft_group,s$prov_code,s$owner4,trt))
  }
}
## 2) fallback ft_group x owner x treatment
for (fo in unique(pd$ft_owner)) {
  parts <- strsplit(fo,"\\|")[[1]]
  for (trt in c("untreated","harvested")) {
    sub <- pd[pd$ft_owner==fo & pd$treatment==trt, ]
    if (nrow(sub) < MIN_FIT) next
    add(emit_fit(sub,"ft_owner",fo,parts[1],NA,parts[2],trt))
  }
}
## 3) fallback ft_group x treatment
for (ft in unique(pd$ft_group)) {
  for (trt in c("untreated","harvested")) {
    sub <- pd[pd$ft_group==ft & pd$treatment==trt, ]
    if (nrow(sub) < MIN_FIT) next
    add(emit_fit(sub,"ft",ft,ft,NA,NA,trt))
  }
}
## 4) fallback state x treatment
for (trt in c("untreated","harvested")) {
  sub <- pd[pd$treatment==trt, ]
  if (nrow(sub) < MIN_FIT) next
  add(emit_fit(sub,"state",ST,NA,NA,NA,trt))
}

fits <- do.call(rbind, FIT); curves <- do.call(rbind, CUR)

## ---- v4 anchoring on cell-scope fits --------------------------------
fits$a_free <- fits$a; fits$anchor_source <- "free"
cell_fits <- fits$scope == "cell"
for (k in unique(fits$cell_key[cell_fits])) {
  for (rv in resp) {
    iu <- which(fits$scope=="cell" & fits$cell_key==k &
                fits$response==rv & fits$treatment=="untreated")
    ih <- which(fits$scope=="cell" & fits$cell_key==k &
                fits$response==rv & fits$treatment=="harvested")
    if (length(iu)==1 && length(ih)==1) {
      if (fits$a[ih] > fits$a[iu]*1.20) {
        fits$a[ih] <- fits$a[iu]; fits$anchor_source[ih] <- "anchored_untreated_a"
      } else fits$anchor_source[ih] <- "kept_within_20pct"
    } else if (length(ih)==1) fits$anchor_source[ih] <- "kept_no_pair"
  }
}
## rebuild curves for any anchored rows
for (i in which(fits$anchor_source=="anchored_untreated_a")) {
  r <- fits[i,]
  sel <- which(curves$scope=="cell" & curves$cell_key==r$cell_key &
               curves$response==r$response & curves$treatment=="harvested")
  curves$predicted[sel] <- round(chap(curves$age[sel], r$a, r$b, r$c), 3)
}

write.csv(fits,   file.path(out, sprintf("ycx_%s_fits.csv", ST)),       row.names=FALSE)
write.csv(curves, file.path(out, sprintf("ycx_%s_curves_long.csv", ST)),row.names=FALSE)
cat(sprintf("[ycx_01] %s: %d fits (%d cell-scope), %d anchored; %d curve rows\n",
            ST, nrow(fits), sum(fits$scope=="cell"),
            sum(fits$anchor_source=="anchored_untreated_a"), nrow(curves)))
