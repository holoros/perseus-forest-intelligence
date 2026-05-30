## ycx_02_perseus.R  (yield curves -> Perseus calendar-year state series)
##
## Translates the age-based empirical yield curves into the Perseus
## api/series contract by projecting the *current* FIA inventory of the
## state forward along the scenario curves:
##
##   reserve (no harvest) : every forested plot advances along its
##                          stratum's UNTREATED curve (passive succession)
##   managed (harvest)    : every plot advances along its stratum's
##                          v4-anchored HARVESTED curve
##
## The state-aggregate density in year t is the mean over forested plots
## of stock(age_plot + (t - start)). Climate sensitivity is a +/-10%
## productivity multiplier on the asymptote, giving the lo/hi ribbon.
##
## A stratum fit is resolved with fallback: cell -> ft_group x owner ->
## ft_group -> state. Output is in native FIA-derived units (Mg C/ha,
## Mg/ha, m3/ha); calibration to the live Perseus FIA anchor happens in
## the local merge step.
##
## Usage: Rscript ycx_02_perseus.R <STATE_ABBR>
## Inputs : <out>/ycx_<ST>_fits.csv, <out>/config/ycx_membership_<ST>.csv
## Outputs: <out>/ycx_<ST>_state_series.csv   (state,metric,mgmt,variant,year,value)
##          <out>/figures/ycx_<ST>_validation.png

args <- commandArgs(trailingOnly = TRUE)
ST   <- if (length(args) >= 1) toupper(args[1]) else stop("need state abbr")
out  <- if (length(args) >= 2) args[2] else file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config"); figd <- file.path(out, "figures")
dir.create(figd, showWarnings = FALSE, recursive = TRUE)

START <- 2025L; HORIZON <- 50L; STEP <- 5L
years <- seq(START, START + HORIZON, by = STEP)
CLIM  <- 0.10                      # +/- productivity sensitivity

## unit conversions
LBAC_TO_MGHA  <- 0.00045359237 * 2.4710538   # lb/ac  -> Mg/ha
TONAC_TO_MGHA <- 2.2417                       # ton/ac -> Mg/ha
CUFTAC_TO_M3HA<- 0.069972                     # ft3/ac -> m3/ha
BG_RATIO      <- 0.22                          # below-ground / above-ground

cat(sprintf("[ycx_02] state=%s years=%d..%d\n", ST, min(years), max(years)))

fits <- read.csv(file.path(out, sprintf("ycx_%s_fits.csv", ST)),
                 stringsAsFactors = FALSE)
mem  <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", ST)),
                 stringsAsFactors = FALSE)
mem  <- mem[!is.na(mem$STDAGE) & mem$STDAGE > 0, ]
mem$ft_owner <- paste(mem$ft_group, mem$owner4, sep = "|")

chap <- function(age,a,b,c) a*(1-exp(-b*age))^c

## keyed fit lookups by scope for O(1) fallback
key_cell <- function(k,trt,rv) paste(k,trt,rv,sep="@@")
L <- list()
for (i in seq_len(nrow(fits))) {
  r <- fits[i,]
  sc <- r$scope
  id <- switch(sc,
    cell     = r$cell_key,
    ft_owner = r$cell_key,
    ft       = r$cell_key,
    state    = ST)
  L[[paste(sc, id, r$treatment, r$response, sep="@@")]] <- c(r$a, r$b, r$c)
}
get_abc <- function(ft, prov, own, trt, rv) {
  cand <- c(
    paste("cell",     paste(ft,prov,own,sep="|"), trt, rv, sep="@@"),
    paste("ft_owner", paste(ft,own,sep="|"),      trt, rv, sep="@@"),
    paste("ft",       ft,                          trt, rv, sep="@@"),
    paste("state",    ST,                          trt, rv, sep="@@"))
  for (k in cand) if (!is.null(L[[k]])) return(L[[k]])
  NULL
}

resp_metric <- list(
  agc_live_total = list(rv="carbon_lbac", conv=LBAC_TO_MGHA*(1+BG_RATIO)),
  agc_live_ag    = list(rv="carbon_lbac", conv=LBAC_TO_MGHA),
  agb_dry        = list(rv="agb_tonac",   conv=TONAC_TO_MGHA),
  vol_stem       = list(rv="vol_cuftac",  conv=CUFTAC_TO_M3HA))
scen <- list(`reserve (no harvest)`="untreated", `managed (harvest)`="harvested")

## precompute, per plot, the abc for each (treatment x response) once
need_rv <- unique(vapply(resp_metric, function(x) x$rv, ""))
plot_abc <- vector("list", nrow(mem))
for (p in seq_len(nrow(mem))) {
  m <- mem[p,]; ab <- list()
  for (trt in c("untreated","harvested"))
    for (rv in need_rv)
      ab[[paste(trt,rv,sep="@@")]] <- get_abc(m$ft_group,m$prov_code,m$owner4,trt,rv)
  plot_abc[[p]] <- ab
}
ages0 <- mem$STDAGE

rows <- list()
for (mm in names(resp_metric)) {
  rv <- resp_metric[[mm]]$rv; conv <- resp_metric[[mm]]$conv
  for (sc in names(scen)) {
    trt <- scen[[sc]]
    for (yr in years) {
      dlt <- yr - START
      vals <- numeric(nrow(mem)); vals[] <- NA_real_
      for (p in seq_len(nrow(mem))) {
        abc <- plot_abc[[p]][[paste(trt,rv,sep="@@")]]
        if (is.null(abc)) next
        vals[p] <- chap(ages0[p] + dlt, abc[1], abc[2], abc[3])
      }
      base <- mean(vals, na.rm = TRUE) * conv
      rows[[length(rows)+1]] <- data.frame(
        state=ST, metric=mm, mgmt=sc, year=yr,
        value=round(base,4),
        value_lo=round(base*(1-CLIM),4),
        value_hi=round(base*(1+CLIM),4),
        n_plots=sum(!is.na(vals)), stringsAsFactors=FALSE)
    }
  }
}
ser <- do.call(rbind, rows)
write.csv(ser, file.path(out, sprintf("ycx_%s_state_series.csv", ST)),
          row.names = FALSE)
cat(sprintf("[ycx_02] %s: wrote %d series rows (%d plots projected)\n",
            ST, nrow(ser), nrow(mem)))

## ---- validation thumbnail (agc_live_total, native Mg C/ha) -----------
png(file.path(figd, sprintf("ycx_%s_validation.png", ST)),
    width=720, height=520, res=110)
op <- par(mar=c(4,4,3,1))
sub <- ser[ser$metric=="agc_live_total", ]
ymax <- max(sub$value_hi, na.rm=TRUE)*1.05; if(!is.finite(ymax)) ymax<-1
plot(NA, xlim=range(years), ylim=c(0,ymax),
     xlab="Year", ylab="AGC live total (Mg C / ha, native)",
     main=sprintf("%s yield-curve engine: reserve vs managed", ST))
cols <- c(`reserve (no harvest)`="#1b5e20", `managed (harvest)`="#c62828")
for (sc in names(scen)) {
  d <- sub[sub$mgmt==sc, ]
  polygon(c(d$year, rev(d$year)), c(d$value_lo, rev(d$value_hi)),
          col=adjustcolor(cols[[sc]],0.18), border=NA)
  lines(d$year, d$value, col=cols[[sc]], lwd=2.4)
}
legend("topleft", legend=names(scen), col=cols, lwd=2.4, bty="n", cex=0.85)
mtext("ribbon = +/-10% productivity (climate sensitivity)", 3, cex=0.7, line=0.2)
par(op); dev.off()
cat(sprintf("[ycx_02] wrote figures/ycx_%s_validation.png\n", ST))
