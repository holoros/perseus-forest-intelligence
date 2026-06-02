## ycx_validate_obs.R  (read-only)
##
## Per-state OBSERVED net annual above-ground live carbon growth rate (%/yr)
## from the FIA remeasurement record, on UNDISTURBED plots (the closest
## empirical analogue to the engine's reserve / no-harvest scenario):
##   growth%/yr = mean[(AGC_t2 - AGC_t1)/REMPER] / mean[AGC_t1]
## over paired plots whose latest-visit treatment is "untreated".
##
## Output: <out>/treemap/obs_growth_by_state.csv  (state, n, agc_density_t1, growth_pct_yr)
## Nothing in the production pipeline is modified.

out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg  <- file.path(out,"config"); td <- file.path(out,"treemap")
dir.create(td, showWarnings=FALSE, recursive=TRUE)
fia  <- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)

rm <- read.csv(file.path(fia,"plot_remeas.csv"), colClasses="character")
rm$REMPER <- suppressWarnings(as.numeric(rm$REMPER))

agc_of <- function(abbr){
  fp <- file.path(fia, sprintf("%d_TREE.csv", ABBR2FIPS[[abbr]])); if(!file.exists(fp)) return(NULL)
  hdr <- gsub('"','',strsplit(readLines(fp,1),",")[[1]])
  idx <- match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"), hdr)
  tmp <- tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'", paste(idx,collapse=","), fp, tmp))
  t <- read.csv(tmp, stringsAsFactors=FALSE); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD))
  for(c0 in c("CARBON_AG","TPA_UNADJ")) t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t <- t[!is.na(t$STATUSCD)&t$STATUSCD==1,]
  a <- aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN, data=t, FUN=sum, na.rm=TRUE); names(a)[2]<-"agc"
  a$PLT_CN<-as.character(a$PLT_CN); a
}
LBAC_TO_MGHA <- 0.00045359237 * 2.4710538

res <- list()
for (st in names(ABBR2FIPS)) {
  mf <- file.path(cfg, sprintf("ycx_membership_%s.csv", st)); if(!file.exists(mf)) next
  mem <- read.csv(mf, colClasses="character")
  trt <- setNames(mem$treatment, mem$PLT_CN)
  ac <- agc_of(st); if(is.null(ac)) next
  ci <- setNames(ac$agc, ac$PLT_CN)
  d <- rm[rm$STATECD==as.character(ABBR2FIPS[[st]]), ]
  d$c1 <- ci[d$PREV_PLT_CN]; d$c2 <- ci[d$CN]
  d$trt <- trt[d$CN]
  d <- d[is.finite(d$c1)&is.finite(d$c2)&is.finite(d$REMPER)&d$REMPER>=3&d$REMPER<=15 &
         d$c1>0 & d$trt=="untreated", ]
  if (nrow(d) < 30) next
  grow <- (d$c2-d$c1)/d$REMPER                          # lb/ac/yr
  pct  <- mean(grow,na.rm=TRUE)/mean(d$c1,na.rm=TRUE)*100
  res[[st]] <- data.frame(state=st, n=nrow(d),
    agc_density_MgC_ha=round(mean(d$c1,na.rm=TRUE)*LBAC_TO_MGHA,1),
    growth_pct_yr=round(pct,3), stringsAsFactors=FALSE)
}
out_df <- do.call(rbind, res)
write.csv(out_df, file.path(td,"obs_growth_by_state.csv"), row.names=FALSE)
cat(sprintf("[val] observed undisturbed net AGC growth, %d states\n", nrow(out_df)))
print(out_df[order(-out_df$growth_pct_yr),], row.names=FALSE)
