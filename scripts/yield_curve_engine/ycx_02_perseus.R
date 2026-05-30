## ycx_02_perseus.R  (yield curves -> Perseus calendar-year state series)
##
## Projects the *current* FIA inventory forward along the empirical yield
## curves to produce calendar-year state-aggregate trajectories for three
## stock metrics (AG live carbon, AG dry biomass, stem volume) plus the
## annual harvest carbon flux, under two scenarios:
##
##   reserve (no harvest) : every current ground plot grows along its
##                          stratum UNTREATED curve (passive succession).
##   managed (harvest)    : owner-specific harvest regime ----
##        Industrial    even-aged CLEARCUT on a 45-yr rotation (reset to
##                      regen age, full removal).
##        NIPF          uneven-aged PARTIAL: 20-yr entry cycle, remove 30%
##                      of standing stock per entry.
##        State         uneven-aged PARTIAL: 25-yr cycle, remove 25%.
##        Public-Other  light PARTIAL: 30-yr cycle, remove 15%.
##      Partial removals use Chapman-Richards inversion so post-cut growth
##      resumes from the reduced stock's equivalent age. Removed stock is
##      tracked as the harvest carbon flux.
##
## Densities are native (Mg C/ha, Mg/ha, m3/ha) plus the forested-plot
## count; conversion to Tg / Mm3 totals + FIA anchoring happen in the merge.
## Climate sensitivity = +/-10% productivity multiplier (lo/hi ribbon).
##
## Usage: Rscript ycx_02_perseus.R <STATE_ABBR> [out_dir]

args <- commandArgs(trailingOnly = TRUE)
ST   <- if (length(args) >= 1) toupper(args[1]) else stop("need state abbr")
out  <- if (length(args) >= 2) args[2] else file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config"); figd <- file.path(out, "figures")
dir.create(figd, showWarnings = FALSE, recursive = TRUE)

START <- 2025L; HORIZON <- 50L; STEP <- 5L
years <- seq(START, START + HORIZON, by = STEP)
FALLBACK_CLIM <- 0.08   # +/- band where no CSI signal (observed or modeled)
REGEN_AGE <- 5

## owner regimes
REG <- list(
  Industrial     = list(type="clearcut", R=45),
  NIPF           = list(type="partial",  E=20, f=0.30),
  State          = list(type="partial",  E=25, f=0.25),
  `Public-Other` = list(type="partial",  E=30, f=0.15))
DEF_REG <- "NIPF"

LBAC_TO_MGHA  <- 0.00045359237 * 2.4710538
TONAC_TO_MGHA <- 2.2417
CUFTAC_TO_M3HA<- 0.069972

cat(sprintf("[ycx_02] state=%s (owner-specific clearcut + partial harvest)\n", ST))

fits <- read.csv(file.path(out, sprintf("ycx_%s_fits.csv", ST)), stringsAsFactors = FALSE)
mem  <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", ST)), stringsAsFactors = FALSE)
mem <- mem[order(mem$STATECD, mem$COUNTYCD, mem$PLOT, -mem$INVYR), ]
mem <- mem[!duplicated(mem[, c("STATECD","COUNTYCD","PLOT")]), ]
mem <- mem[!is.na(mem$STDAGE) & mem$STDAGE > 0, ]

## peak-and-decline yield form y = b1*age^b2*b3^age (a=b1,b=b2,c=b3).
chap <- function(age,a,b,c) a * pmax(age,1e-6)^b * c^age

## untreated-curve fit lookup with fallback
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
    if (!is.null(L[[k]])) return(L[[k]]); NULL
}

## native densities; merge converts to state totals + calibrates units.
##   agc_live_total : Mg C/ha   (AG carbon)         -> Tg, FIA-anchored
##   agb_dry        : Mg/ha     (total AG biomass)  -> Tg
##   merch_bio_dry  : Mg/ha     (merch bole bio)    -> Tg   [new metric]
##   vol_stem       : m3/ha     (total stem gross)  -> Mm3  [VOLTSGRS]
##   merch_vol_mcf  : cuft/ac   (net merch vol)     -> Mcf  [VOLCFNET, calibrated]
resp_metric <- list(
  agc_live_total = list(rv="carbon_lbac",    conv=LBAC_TO_MGHA),
  agb_dry        = list(rv="agb_tonac",      conv=TONAC_TO_MGHA),
  merch_bio_dry  = list(rv="merchbio_tonac", conv=TONAC_TO_MGHA),
  vol_stem       = list(rv="voltot_cuftac",  conv=CUFTAC_TO_M3HA),
  merch_vol_mcf  = list(rv="merchvol_cuftac",conv=1))
need_rv <- unique(vapply(resp_metric, function(x) x$rv, ""))

n <- nrow(mem); ages0 <- mem$STDAGE
owners <- mem$owner4; owners[is.na(owners) | !(owners %in% names(REG))] <- DEF_REG

abc_p <- vector("list", n)
for (p in seq_len(n)) {
  m <- mem[p,]; a <- list()
  for (rv in need_rv) a[[rv]] <- get_abc(m$ft_group, m$prov_code, m$owner4, rv)
  abc_p[[p]] <- a
}

## per-plot projection: reserve stock, managed stock, removed (per step)
project <- function(rv, scale=1) {
  ny <- length(years)
  res <- matrix(NA_real_, n, ny); man <- matrix(NA_real_, n, ny); rem <- matrix(0, n, ny)
  for (p in seq_len(n)) {
    abc <- abc_p[[p]][[rv]]; if (is.null(abc)) next
    a <- abc[1]*scale; b <- abc[2]; cc <- abc[3]
    reg <- REG[[owners[p]]]
    ## reserve
    for (j in seq_len(ny)) res[p,j] <- chap(ages0[p] + (years[j]-START), a, b, cc)
    ## managed
    if (reg$type == "clearcut") {
      age <- ages0[p]
      for (j in seq_len(ny)) {
        if (j > 1) { age <- age + STEP
          if (age >= reg$R) { pre <- chap(age,a,b,cc); age <- REGEN_AGE + (age - reg$R)
            rem[p,j] <- max(pre - chap(age,a,b,cc), 0) } }
        man[p,j] <- chap(age, a, b, cc)
      }
    } else {
      ## uneven-aged partial: stock accrues the curve's increment each step
      ## (negative past the peak -> senescence) and is knocked down at entries.
      ## No inversion needed, so the peak-decline form works directly.
      S <- chap(ages0[p], a, b, cc)
      for (j in seq_len(ny)) {
        if (j > 1) {
          ra <- ages0[p] + (years[j]-START)
          S  <- max(S + (chap(ra,a,b,cc) - chap(ra-STEP,a,b,cc)), 0)  # grow 5 yr
          if (floor(ra/reg$E) > floor((ra-STEP)/reg$E)) {            # entry this step
            pre <- S; S <- (1-reg$f)*S; rem[p,j] <- pre - S }
        }
        man[p,j] <- S
      }
    }
  }
  list(res=res, man=man, rem=rem)
}

## ---- climate band factors from Climate Site Index --------------------
## Central projection is current-climate (FIA-anchored). The uncertainty
## ribbon is the climate envelope: per state, CSI_2030->2090 implies a
## productivity multiplier pm(year) = 1 + beta*(CSI(year)/CSI_2030 - 1).
## lo/hi bracket current climate and the CSI-projected climate. Where CSI
## is unavailable (outside its domain) a flat +/-FALLBACK_CLIM is used.
## beta calibrated in ycx_calibrate.R (productivity/growth sensitivity to CSI)
beta_f <- file.path(cfg, "ycx_beta.txt")
CSI_BETA <- if (file.exists(beta_f)) as.numeric(readLines(beta_f)[1]) else 0.80
if (!is.finite(CSI_BETA)) CSI_BETA <- 0.80
## CSI ratios per state (observed east; climate-transfer modeled west)
csi_path <- file.path(cfg, "csi_states_ext.csv")
lo_fac <- rep(1-FALLBACK_CLIM, length(years))
hi_fac <- rep(1+FALLBACK_CLIM, length(years))
clim_src <- "fallback_flat"
if (file.exists(csi_path)) {
  csi <- read.csv(csi_path, stringsAsFactors=FALSE)
  r <- csi[csi$state==ST, ]
  if (nrow(r)==1 && is.finite(r$csi_2090)) {
    cyr <- c(2030,2060,2090); cval <- c(r$csi_2030,r$csi_2060,r$csi_2090)
    ci  <- approx(cyr, cval, xout=pmin(pmax(years,2030),2090), rule=2)$y
    pm  <- 1 + CSI_BETA*(ci/r$csi_2030 - 1)
    lo_fac <- pmin(1, pm); hi_fac <- pmax(1, pm)
    clim_src <- sprintf("CSI %s (beta=%.2f, 2090 %+.1f%%)",
                        r$domain, CSI_BETA, 100*(r$csi_2090/r$csi_2030-1))
  }
}

rows <- list(); flux <- list()
for (mm in names(resp_metric)) {
  rv <- resp_metric[[mm]]$rv; conv <- resp_metric[[mm]]$conv
  base <- project(rv,1)                 # single current-climate projection
  for (sc in c("reserve (no harvest)","managed (harvest)")) {
    bm <- if (sc=="reserve (no harvest)") base$res else base$man
    for (j in seq_along(years)) {
      cen <- mean(bm[,j],na.rm=TRUE)*conv
      rows[[length(rows)+1]] <- data.frame(state=ST, metric=mm, mgmt=sc, year=years[j],
        value=round(cen,5),
        value_lo=round(cen*lo_fac[j],5),
        value_hi=round(cen*hi_fac[j],5),
        n_plots=sum(!is.na(bm[,j])), stringsAsFactors=FALSE)
    }
  }
  if (mm == "agc_live_total")
    for (j in seq_along(years))
      flux[[length(flux)+1]] <- data.frame(state=ST, year=years[j],
        removed_density_per_yr=round(mean(base$rem[,j],na.rm=TRUE)*conv/STEP,6),
        stringsAsFactors=FALSE)
}
cat(sprintf("[ycx_02] climate band: %s\n", clim_src))
ser <- do.call(rbind, rows)
write.csv(ser, file.path(out, sprintf("ycx_%s_state_series.csv", ST)), row.names=FALSE)
write.csv(do.call(rbind,flux), file.path(out, sprintf("ycx_%s_harvest_flux.csv", ST)), row.names=FALSE)
cat(sprintf("[ycx_02] %s: %d rows, %d plots; owners: %s\n", ST, nrow(ser), n,
            paste(names(table(owners)), table(owners), sep="=", collapse=" ")))

## validation thumbnail
png(file.path(figd, sprintf("ycx_%s_validation.png", ST)), width=720, height=520, res=110)
op <- par(mar=c(4,4,3,1)); sub <- ser[ser$metric=="agc_live_total", ]
ymax <- max(sub$value_hi,na.rm=TRUE)*1.05; if(!is.finite(ymax)||ymax<=0) ymax<-1
plot(NA,xlim=range(years),ylim=c(0,ymax),xlab="Year",ylab="AG live carbon (Mg C/ha, native)",
     main=sprintf("%s: reserve vs managed (mixed harvest regimes)",ST))
cols <- c(`reserve (no harvest)`="#1b5e20",`managed (harvest)`="#c62828")
for (sc in names(cols)){ d<-sub[sub$mgmt==sc,]
  polygon(c(d$year,rev(d$year)),c(d$value_lo,rev(d$value_hi)),col=adjustcolor(cols[[sc]],0.18),border=NA)
  lines(d$year,d$value,col=cols[[sc]],lwd=2.4) }
legend("topleft",legend=names(cols),col=cols,lwd=2.4,bty="n",cex=0.85)
mtext(sprintf("Industrial clearcut + NIPF/State/Public partial; band = %s", clim_src),3,cex=0.62,line=0.2)
par(op); dev.off()
cat(sprintf("[ycx_02] wrote figures/ycx_%s_validation.png\n", ST))
