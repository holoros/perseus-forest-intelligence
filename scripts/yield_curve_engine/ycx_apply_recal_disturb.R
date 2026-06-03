## ycx_apply_recal_disturb.R  (STAGING — writes to recal_staging/, never to live series)
##
## Engine-agnostic production wiring of two ADR-0002 changes onto the existing
## per-state dashboard series (ycx_<ST>_state_series.csv, which the merge consumes):
##
##  1. GROWTH RECALIBRATION. Multiply every metric/scenario value by the per-state,
##     per-year growth uplift r_recal(state,year) = recal_Tg / hybrid_Tg, taken from
##     the cell-level recalibration (treemap/recal_cell/conus_recal_cell_100yr.csv,
##     agedist variant). t0 ratio is ~1 (anchoring preserved); the uplift grows with
##     horizon. Applied to value/value_lo/value_hi.
##
##  2. DISTURBANCE-EXPOSED RESERVE. Add a new mgmt scenario
##     "reserve (no harvest, disturbance-exposed)" for every metric, built from the
##     recalibrated reserve times per-state disturbance arm ratios
##     (treemap/disturb/disturb_arms_bystate_100yr.csv):
##        value    = recal_reserve * (moderate_arm / recent_arm)     [central]
##        value_lo = recal_reserve * (severe_arm   / recent_arm)     [3x frequency]
##        value_hi = recal_reserve * (recent_arm   / recent_arm = 1) [historical rates]
##
## Output: recal_staging/ycx_<ST>_state_series.csv (+ harvest_flux copied through),
##         recal_staging/_wiring_summary.csv (CONUS before/after per metric/scenario).
## The merge is NOT run and nothing is deployed. Review, then:
##   python3 ycx_merge_perseus.py <repo> recal_staging   (on sign-off only)
## Usage: Rscript ycx_apply_recal_disturb.R [out_dir]

out <- if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
td  <- file.path(out,"treemap"); stg<-file.path(out,"recal_staging"); dir.create(stg,showWarnings=FALSE)
RECAL <- file.path(td,"recal_cell","conus_recal_capped_100yr.csv")  # APPROVED: agedist + ceiling
DARMS <- file.path(td,"disturb","disturb_arms_bystate_100yr.csv")
MARMS <- file.path(td,"disturb","mortarm_bystate_100yr.csv")
NEWSC <- "reserve (no harvest, disturbance-exposed)"
NEWSC2<- "reserve (no harvest, mortality-stressed)"
NEWSC_MD <- "managed (harvest, disturbance-exposed)"
NEWSC_MM <- "managed (harvest, mortality-stressed)"
RESERVE <- "reserve (no harvest)"
MANAGED <- "managed (harvest)"

RATIO_CAP <- 2.0   # guard tiny-state sparse-plot blowups (e.g. RI); review knob
rc <- read.csv(RECAL,stringsAsFactors=FALSE)        # state,year,hybrid_Tg,recal_Tg,...
rc$ratio <- with(rc, pmin(ifelse(hybrid_Tg>0, recal_Tg/hybrid_Tg, 1), RATIO_CAP))
da <- read.csv(DARMS,stringsAsFactors=FALSE)        # state,arm,year,agc_Tg
ma <- read.csv(MARMS,stringsAsFactors=FALSE)        # state,arm,year,agc_Tg (mortality arms)
MGR  <- file.path(td,"disturb","managed_stress_ratio_bystate.csv")  # in-loop managed ratios
mg <- read.csv(MGR,stringsAsFactors=FALSE)          # state,year,dist_moderate,dist_severe,mort_1p5x,mort_2x
mg_fun <- function(st,col){d<-mg[mg$state==st,]; if(!nrow(d)) return(function(y) rep(1,length(y))); approxfun(d$year,d[[col]],rule=2)}

recal_fun <- function(st){d<-rc[rc$state==st,]; if(!nrow(d)) return(function(y) rep(1,length(y)))
  approxfun(d$year, d$ratio, rule=2)}
ratio_fun <- function(tbl, st, arm, denom){
  num<-tbl[tbl$state==st & tbl$arm==arm,]; den<-tbl[tbl$state==st & tbl$arm==denom,]
  if(!nrow(num)||!nrow(den)) return(function(y) rep(1,length(y)))
  m<-merge(num[,c("year","agc_Tg")],den[,c("year","agc_Tg")],by="year",suffixes=c(".n",".d"))
  m$r<-ifelse(m$agc_Tg.d>0, m$agc_Tg.n/m$agc_Tg.d, 1); approxfun(m$year,m$r,rule=2)}
arm_ratio_fun <- function(st, arm) ratio_fun(da, st, arm, "recent")
mort_ratio_fun<- function(st, arm) ratio_fun(ma, st, arm, "baseline")

files <- list.files(out, pattern="^ycx_[A-Z]{2}_state_series\\.csv$", full.names=TRUE)
summ <- list()
for(f in files){
  st <- sub("^ycx_([A-Z]{2})_state_series\\.csv$","\\1",basename(f))
  s  <- read.csv(f,stringsAsFactors=FALSE)
  rf <- recal_fun(st); rr<-rf(s$year)
  # 1. growth recalibration on all rows
  for(c0 in c("value","value_lo","value_hi")) s[[c0]] <- s[[c0]]*rr
  # 2. disturbance-exposed reserve (exogenous fire/insect frequency), per metric
  rmod<-arm_ratio_fun(st,"moderate"); rsev<-arm_ratio_fun(st,"severe")
  # 3. mortality-stressed reserve (endogenous GRM density mortality), per metric
  m15<-mort_ratio_fun(st,"mort_1p5x"); m20<-mort_ratio_fun(st,"mort_2x")
  # managed (harvest) in-loop stress ratios
  gmdmod<-mg_fun(st,"dist_moderate"); gmdsev<-mg_fun(st,"dist_severe"); gmm15<-mg_fun(st,"mort_1p5x"); gmm20<-mg_fun(st,"mort_2x")
  add <- list()
  for(mt in unique(s$metric)){
    base <- s[s$metric==mt & s$mgmt==RESERVE,]; if(!nrow(base)) next
    nb <- base; nb$mgmt <- NEWSC
    nb$value    <- base$value * rmod(base$year)
    nb$value_lo <- base$value * rsev(base$year)
    nb$value_hi <- base$value                      # historical-rate upper edge
    add[[paste0(mt,"_d")]] <- nb
    nm <- base; nm$mgmt <- NEWSC2
    nm$value    <- base$value * m15(base$year)      # central = 1.5x mortality
    nm$value_lo <- base$value * m20(base$year)      # 2x mortality
    nm$value_hi <- base$value                       # baseline mortality
    add[[paste0(mt,"_m")]] <- nm
    # 4. climate stress on managed (harvest) BAU, using the IN-LOOP managed ratios
    #    (ycx_managed_stress.R: harvest age-resets correctly lower stress exposure;
    #    replaces the earlier reserve-borrowed fractional approximation).
    mb <- s[s$metric==mt & s$mgmt==MANAGED,]; if(nrow(mb)){
      md <- mb; md$mgmt <- NEWSC_MD
      md$value    <- mb$value * gmdmod(mb$year); md$value_lo <- mb$value * gmdsev(mb$year); md$value_hi <- mb$value
      add[[paste0(mt,"_md")]] <- md
      mm2 <- mb; mm2$mgmt <- NEWSC_MM
      mm2$value   <- mb$value * gmm15(mb$year); mm2$value_lo <- mb$value * gmm20(mb$year); mm2$value_hi <- mb$value
      add[[paste0(mt,"_mm")]] <- mm2
    }
  }
  s2 <- rbind(s, do.call(rbind, add))
  s2[,c("value","value_lo","value_hi")] <- lapply(s2[,c("value","value_lo","value_hi")], function(x) round(x,5))
  write.csv(s2, file.path(stg, basename(f)), row.names=FALSE)
  hf <- file.path(out, sprintf("ycx_%s_harvest_flux.csv",st)); if(file.exists(hf)) file.copy(hf, file.path(stg,basename(hf)), overwrite=TRUE)
  ## summary: agc_live_total reserve t0/t100 before(implied)/after + new scenario
  agc<-function(df,sc,yr) df$value[df$metric=="agc_live_total"&df$mgmt==sc&df$year==yr][1]
  summ[[st]]<-data.frame(state=st,
    reserve_2025=round(agc(s2,RESERVE,2025),2), reserve_2125=round(agc(s2,RESERVE,2125),2),
    recal_ratio_2125=round(rf(2125),3),
    distexp_2125=round(agc(s2,NEWSC,2125),2),
    distexp_lo_2125=round(s2$value_lo[s2$metric=="agc_live_total"&s2$mgmt==NEWSC&s2$year==2125][1],2),
    row.names=NULL)
}
S<-do.call(rbind,summ); write.csv(S,file.path(stg,"_wiring_summary.csv"),row.names=FALSE)
cat(sprintf("[wire] staged %d states -> %s\n",length(files),stg))
cat(sprintf("[wire] mean recal ratio @2125: %.3f\n",mean(S$recal_ratio_2125,na.rm=TRUE)))
cat("[wire] sample (native Mg C/ha, agc_live_total):\n")
print(head(S[order(-S$reserve_2125),],8),row.names=FALSE)
cat("\n[wire] NOTHING deployed. To publish after sign-off:\n")
cat("       python3 ycx_merge_perseus.py <repo_dir> ",stg,"\n",sep="")
