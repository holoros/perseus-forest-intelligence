## ycx_02_perseus.R  (yield curves -> Perseus calendar-year state series)
##
## Projects the *current* FIA inventory forward along the empirical yield
## curves to produce calendar-year state-aggregate density trajectories
## for three metrics (AG live carbon, AG dry biomass, stem volume) under
## two scenarios:
##
##   reserve (no harvest) : every forested plot grows along its stratum's
##                          UNTREATED curve (passive succession).
##   managed (harvest)    : every plot grows along the same untreated curve
##                          but is CLEARCUT-HARVESTED on an owner-specific
##                          rotation (Industrial 45, NIPF 65, State 80,
##                          Public-Other 110 yr): at each rotation the stand
##                          is reset to regen age (5 yr) and the removed
##                          stock is tracked as a harvest flux. Staggered
##                          plot ages give a smooth managed aggregate below
##                          reserve.
##
## Densities are output in native units (Mg C/ha, Mg/ha, m3/ha) plus the
## forested-plot count; conversion to Tg / Mm3 state totals (area = plots x
## A0) and FIA anchoring happen in the merge step. Climate sensitivity is a
## +/-10% productivity multiplier giving the lo/hi ribbon.
##
## Usage: Rscript ycx_02_perseus.R <STATE_ABBR> [out_dir]
## Inputs : <out>/ycx_<ST>_fits.csv, <out>/config/ycx_membership_<ST>.csv
## Outputs: <out>/ycx_<ST>_state_series.csv
##          <out>/ycx_<ST>_harvest_flux.csv
##          <out>/figures/ycx_<ST>_validation.png

args <- commandArgs(trailingOnly = TRUE)
ST   <- if (length(args) >= 1) toupper(args[1]) else stop("need state abbr")
out  <- if (length(args) >= 2) args[2] else file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config"); figd <- file.path(out, "figures")
dir.create(figd, showWarnings = FALSE, recursive = TRUE)

START <- 2025L; HORIZON <- 50L; STEP <- 5L
years <- seq(START, START + HORIZON, by = STEP)
CLIM  <- 0.10
REGEN_AGE <- 5
ROTATION <- c(Industrial = 45, NIPF = 65, State = 80, `Public-Other` = 110)

## native density conversions
LBAC_TO_MGHA  <- 0.00045359237 * 2.4710538   # lb/ac  -> Mg/ha   (AG carbon)
TONAC_TO_MGHA <- 2.2417                       # ton/ac -> Mg/ha   (dry biomass)
CUFTAC_TO_M3HA<- 0.069972                     # ft3/ac -> m3/ha   (stem volume)

cat(sprintf("[ycx_02] state=%s years=%d..%d (managed = owner-rotation clearcut)\n",
            ST, min(years), max(years)))

fits <- read.csv(file.path(out, sprintf("ycx_%s_fits.csv", ST)),
                 stringsAsFactors = FALSE)
mem  <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", ST)),
                 stringsAsFactors = FALSE)
## use each physical plot once, at its latest measurement (current inventory).
## (curve fitting in ycx_01 still uses all visits; here we project the
##  current standing inventory forward, so one current age per ground plot.)
mem <- mem[order(mem$STATECD, mem$COUNTYCD, mem$PLOT, -mem$INVYR), ]
mem <- mem[!duplicated(mem[, c("STATECD", "COUNTYCD", "PLOT")]), ]
mem  <- mem[!is.na(mem$STDAGE) & mem$STDAGE > 0, ]

chap <- function(age,a,b,c) a*(1-exp(-pmax(b*age,0)))^c

## untreated-curve fit lookup with fallback (cell -> ft_owner -> ft -> state)
L <- list()
for (i in seq_len(nrow(fits))) {
  r <- fits[i,]; if (r$treatment != "untreated") next
  id <- if (r$scope == "state") ST else r$cell_key
  L[[paste(r$scope, id, r$response, sep="@@")]] <- c(r$a, r$b, r$c)
}
get_abc <- function(ft, prov, own, rv) {
  for (k in c(paste("cell",     paste(ft,prov,own,sep="|"), rv, sep="@@"),
              paste("ft_owner", paste(ft,own,sep="|"),      rv, sep="@@"),
              paste("ft",       ft,                          rv, sep="@@"),
              paste("state",    ST,                          rv, sep="@@")))
    if (!is.null(L[[k]])) return(L[[k]])
  NULL
}

resp_metric <- list(
  agc_live_total = list(rv="carbon_lbac", conv=LBAC_TO_MGHA),
  agb_dry        = list(rv="agb_tonac",   conv=TONAC_TO_MGHA),
  vol_stem       = list(rv="vol_cuftac",  conv=CUFTAC_TO_M3HA))
need_rv <- unique(vapply(resp_metric, function(x) x$rv, ""))

n <- nrow(mem)
ages0 <- mem$STDAGE
rot   <- ROTATION[mem$owner4]; rot[is.na(rot)] <- ROTATION[["NIPF"]]

## precompute per-plot abc for each response
abc_p <- vector("list", n)
for (p in seq_len(n)) {
  m <- mem[p,]; a <- list()
  for (rv in need_rv) a[[rv]] <- get_abc(m$ft_group, m$prov_code, m$owner4, rv)
  abc_p[[p]] <- a
}

## managed projection: per plot, grow on untreated curve, clearcut at rotation.
## Returns matrix [n x nyear] of stock density (native curve units) + removed.
project <- function(rv, scale = 1) {
  ny <- length(years)
  res_stock <- matrix(NA_real_, n, ny)   # reserve
  man_stock <- matrix(NA_real_, n, ny)   # managed
  man_rem   <- matrix(0,        n, ny)   # removed at each step (managed)
  for (p in seq_len(n)) {
    abc <- abc_p[[p]][[rv]]; if (is.null(abc)) next
    a <- abc[1]*scale; b <- abc[2]; cc <- abc[3]
    g_res <- ages0[p]; g_man <- ages0[p]; last <- 0
    for (j in seq_len(ny)) {
      dlt <- years[j] - START
      ## reserve: simple growth
      res_stock[p,j] <- chap(ages0[p] + dlt, a, b, cc)
      ## managed: advance to this step, harvest if rotation reached
      if (j > 1) {
        g_man <- g_man + STEP
        if (g_man >= rot[p]) {
          pre <- chap(g_man, a, b, cc)
          g_man <- REGEN_AGE + (g_man - rot[p])      # keep phase
          post <- chap(g_man, a, b, cc)
          man_rem[p,j] <- max(pre - post, 0)
        }
      }
      man_stock[p,j] <- chap(g_man, a, b, cc)
    }
  }
  list(res = res_stock, man = man_stock, rem = man_rem)
}

rows <- list(); flux <- list()
for (mm in names(resp_metric)) {
  rv <- resp_metric[[mm]]$rv; conv <- resp_metric[[mm]]$conv
  base <- project(rv, 1)
  lo   <- project(rv, 1 - CLIM)
  hi   <- project(rv, 1 + CLIM)
  for (sc in c("reserve (no harvest)","managed (harvest)")) {
    bm <- if (sc=="reserve (no harvest)") base$res else base$man
    lm <- if (sc=="reserve (no harvest)") lo$res   else lo$man
    hm <- if (sc=="reserve (no harvest)") hi$res   else hi$man
    for (j in seq_along(years)) {
      rows[[length(rows)+1]] <- data.frame(
        state=ST, metric=mm, mgmt=sc, year=years[j],
        value   = round(mean(bm[,j], na.rm=TRUE)*conv, 5),
        value_lo= round(mean(lm[,j], na.rm=TRUE)*conv, 5),
        value_hi= round(mean(hm[,j], na.rm=TRUE)*conv, 5),
        n_plots = sum(!is.na(bm[,j])), stringsAsFactors=FALSE)
    }
  }
  ## harvest flux (managed only): mean removed density per 5-yr step -> per yr
  for (j in seq_along(years))
    flux[[length(flux)+1]] <- data.frame(
      state=ST, metric=mm, year=years[j],
      removed_density_per_yr = round(mean(base$rem[,j], na.rm=TRUE)*conv/STEP, 6),
      stringsAsFactors=FALSE)
}
ser <- do.call(rbind, rows)
write.csv(ser, file.path(out, sprintf("ycx_%s_state_series.csv", ST)), row.names=FALSE)
write.csv(do.call(rbind, flux),
          file.path(out, sprintf("ycx_%s_harvest_flux.csv", ST)), row.names=FALSE)
cat(sprintf("[ycx_02] %s: %d series rows, %d plots, owner rotations applied\n",
            ST, nrow(ser), n))

## ---- validation thumbnail (AG carbon density, native) ----------------
png(file.path(figd, sprintf("ycx_%s_validation.png", ST)),
    width=720, height=520, res=110)
op <- par(mar=c(4,4,3,1))
sub <- ser[ser$metric=="agc_live_total", ]
ymax <- max(sub$value_hi, na.rm=TRUE)*1.05; if(!is.finite(ymax)||ymax<=0) ymax<-1
plot(NA, xlim=range(years), ylim=c(0,ymax),
     xlab="Year", ylab="AG live carbon (Mg C / ha, native)",
     main=sprintf("%s: reserve vs managed-with-harvest", ST))
cols <- c(`reserve (no harvest)`="#1b5e20", `managed (harvest)`="#c62828")
for (sc in names(cols)) {
  d <- sub[sub$mgmt==sc, ]
  polygon(c(d$year, rev(d$year)), c(d$value_lo, rev(d$value_hi)),
          col=adjustcolor(cols[[sc]],0.18), border=NA)
  lines(d$year, d$value, col=cols[[sc]], lwd=2.4)
}
legend("topleft", legend=names(cols), col=cols, lwd=2.4, bty="n", cex=0.85)
mtext("managed = owner-rotation clearcut; ribbon = +/-10% productivity", 3, cex=0.7, line=0.2)
par(op); dev.off()
cat(sprintf("[ycx_02] wrote figures/ycx_%s_validation.png\n", ST))
