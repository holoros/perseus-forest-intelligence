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
CLIM  <- 0.10
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

chap   <- function(age,a,b,c) a*(1-exp(-pmax(b*age,0)))^c
invert <- function(S,a,b,c){ S<-min(max(S,1e-6),a*0.999); -log(1-(S/a)^(1/c))/b }

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
      S <- chap(ages0[p], a, b, cc)
      for (j in seq_len(ny)) {
        if (j > 1) {
          g <- invert(S, a, b, cc); S <- chap(g + STEP, a, b, cc)   # grow 5 yr
          ra <- ages0[p] + (years[j]-START)
          if (floor(ra/reg$E) > floor((ra-STEP)/reg$E)) {           # entry this step
            pre <- S; S <- (1-reg$f)*S; rem[p,j] <- pre - S }
        }
        man[p,j] <- S
      }
    }
  }
  list(res=res, man=man, rem=rem)
}

rows <- list(); flux <- list()
for (mm in names(resp_metric)) {
  rv <- resp_metric[[mm]]$rv; conv <- resp_metric[[mm]]$conv
  base <- project(rv,1); lo <- project(rv,1-CLIM); hi <- project(rv,1+CLIM)
  for (sc in c("reserve (no harvest)","managed (harvest)")) {
    bm <- if (sc=="reserve (no harvest)") base$res else base$man
    lm <- if (sc=="reserve (no harvest)") lo$res   else lo$man
    hm <- if (sc=="reserve (no harvest)") hi$res   else hi$man
    for (j in seq_along(years))
      rows[[length(rows)+1]] <- data.frame(state=ST, metric=mm, mgmt=sc, year=years[j],
        value=round(mean(bm[,j],na.rm=TRUE)*conv,5),
        value_lo=round(mean(lm[,j],na.rm=TRUE)*conv,5),
        value_hi=round(mean(hm[,j],na.rm=TRUE)*conv,5),
        n_plots=sum(!is.na(bm[,j])), stringsAsFactors=FALSE)
  }
  if (mm == "agc_live_total")
    for (j in seq_along(years))
      flux[[length(flux)+1]] <- data.frame(state=ST, year=years[j],
        removed_density_per_yr=round(mean(base$rem[,j],na.rm=TRUE)*conv/STEP,6),
        stringsAsFactors=FALSE)
}
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
mtext("Industrial clearcut + NIPF/State/Public partial; ribbon +/-10% productivity",3,cex=0.66,line=0.2)
par(op); dev.off()
cat(sprintf("[ycx_02] wrote figures/ycx_%s_validation.png\n", ST))
