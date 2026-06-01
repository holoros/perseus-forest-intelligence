## ycx_hwp.R
## Harvested wood products (HWP) net-flux layer. The scenario projections give
## STANDING live AG carbon (drawn down by removals) and cumulative carbon
## removed off-stump. This adds the carbon retained in wood products so the
## managed scenarios can be compared on a system (forest + products) basis
## rather than standing stock alone.
##
## Method (IPCC-style first-order decay): per decade, the carbon removed is
## split into sawtimber (long-lived in-use products, half-life 35 yr) and
## pulpwood (short-lived, half-life 2 yr) by the national merch product split.
## Each cohort decays exponentially; the in-use HWP pool at year t is the sum
## over past removals of cohort * exp(-ln2/HL * (t - t_harvest)).
##   net(t) = standing_live_AG_C(t) + HWP_in_use(t)
##
## Inputs (this folder): conus_scenarios_100yr.csv, conus_harvest_removed.csv,
##   hybrid_products/product_summary_by_state.csv
## Output: conus_hwp_netflux.csv, conus_hwp_netflux.png
##
## Usage: Rscript ycx_hwp.R <dir>

args<-commandArgs(trailingOnly=TRUE); D<-if(length(args)>=1) args[1] else "."
TM_BASE<-2022; HL_SAW<-35; HL_PULP<-2
k_saw<-log(2)/HL_SAW; k_pulp<-log(2)/HL_PULP

st<-read.csv(file.path(D,"conus_scenarios_100yr.csv"),stringsAsFactors=FALSE)
rm<-read.csv(file.path(D,"conus_harvest_removed.csv"),stringsAsFactors=FALSE)
ps<-read.csv(file.path(D,"hybrid_products","product_summary_by_state.csv"),stringsAsFactors=FALSE)
saw_frac<-mean(ps$saw_vol_frac,na.rm=TRUE); pulp_frac<-1-saw_frac    # national merch split
cat(sprintf("[hwp] national merch split: sawtimber %.2f / pulpwood %.2f\n", saw_frac, pulp_frac))

## CONUS standing carbon and cumulative removed, by scenario x year
standing<-aggregate(agc_Tg~scenario+year_offset, st, sum)
removed_cum<-aggregate(removed_cum_Tg~scenario+year_offset, rm, sum)
scn<-unique(standing$scenario); offs<-sort(unique(standing$year_offset)); yrs<-TM_BASE+offs

OUT<-list()
for(sc in scn){
  S<-standing[standing$scenario==sc,]; S<-S[order(S$year_offset),]
  R<-removed_cum[removed_cum$scenario==sc,]; R<-R[order(R$year_offset),]
  stand<-setNames(S$agc_Tg, S$year_offset)
  rcum<-setNames(R$removed_cum_Tg, as.character(offs)); rcum[is.na(rcum)]<-0
  ## per-decade removed (difference of cumulative)
  rdec<-numeric(length(offs)); names(rdec)<-as.character(offs)
  prev<-0; for(o in offs){ rdec[as.character(o)]<-max(rcum[as.character(o)]-prev,0); prev<-rcum[as.character(o)] }
  ## HWP in-use pool at each year from decaying cohorts
  hwp<-numeric(length(offs))
  for(j in seq_along(offs)){ t<-yrs[j]
    for(i in seq_along(offs)){ if(offs[i]>offs[j]) next
      s<-yrs[i]; coh<-rdec[i]
      hwp[j]<-hwp[j]+coh*(saw_frac*exp(-k_saw*(t-s))+pulp_frac*exp(-k_pulp*(t-s))) } }
  net<-as.numeric(stand[as.character(offs)])+hwp
  OUT[[sc]]<-data.frame(scenario=sc,year=yrs,
    standing_Tg=round(as.numeric(stand[as.character(offs)]),0),
    hwp_Tg=round(hwp,0), net_Tg=round(net,0), row.names=NULL)
}
res<-do.call(rbind,OUT)
write.csv(res,file.path(D,"conus_hwp_netflux.csv"),row.names=FALSE)

## summary: net change t0->t100 standing-only vs net (with HWP)
cat("\n[hwp] === CONUS 100-yr change: standing-only vs net (forest+HWP), Tg C ===\n")
for(sc in scn){ d<-res[res$scenario==sc,]; n<-nrow(d)
  cat(sprintf("  %-24s standing %+6.0f | +HWP buffer %5.0f | net %+6.0f\n",
    sc, d$standing_Tg[n]-d$standing_Tg[1], d$hwp_Tg[n], d$net_Tg[n]-d$net_Tg[1])) }

png(file.path(D,"conus_hwp_netflux.png"),width=900,height=560,res=120)
op<-par(mar=c(4,4.5,3,9),xpd=NA)
cols<-c(`reserve (no harvest)`="#1b7837",`managed (conservation)`="#5aae61",`managed (harvest)`="#d6604d",`managed (intensive)`="#b2182b")
ymax<-max(res$net_Tg)*1.05
plot(NA,xlim=range(yrs),ylim=c(0,ymax),xlab="Year",ylab="Net system carbon: forest + HWP (Tg C)",
     main="CONUS net carbon (standing live + harvested wood products)")
grid(col="grey88")
for(sc in scn){ d<-res[res$scenario==sc,]; lines(d$year,d$net_Tg,type="o",pch=19,lwd=2.4,col=cols[[sc]])
  lines(d$year,d$standing_Tg,lty=3,lwd=1.4,col=cols[[sc]]) }
legend(par("usr")[2],par("usr")[4],legend=c(names(cols),"(dotted = standing only)"),
       col=c(unlist(cols),NA),lwd=2.4,pch=c(19,19,19,19,NA),bty="n",cex=0.8)
par(op); dev.off()
cat("[hwp] wrote conus_hwp_netflux.csv + .png\n")
