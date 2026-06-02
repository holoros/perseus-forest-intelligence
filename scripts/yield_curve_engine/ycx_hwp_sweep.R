## ycx_hwp_sweep.R
## Sensitivity sweep of the HWP net-carbon result over its uncertain parameters:
##   sawtimber half-life HL_saw   in {25, 35, 50} yr
##   pulpwood  half-life HL_pulp  in {2, 4} yr
##   landfill fraction   LF_FRAC  in {0.15, 0.30, 0.50}
##   landfill half-life  HL_lf    in {50, 100, 200} yr
##   substitution DF              in {0.0, 0.30, 0.45, 0.60, 0.90} tC/tC
## Reports, per scenario, the 100-year change range for net carbon STOCK
## (standing + in-use + landfill; excludes DF) and for net+substitution.
##
## Inputs (this dir): conus_scenarios_100yr.csv, conus_harvest_removed.csv,
##   hybrid_products/product_summary_by_state.csv
## Output: conus_hwp_sweep.csv (full grid CONUS t100 deltas), conus_hwp_sweep_summary.csv
##
## Usage: Rscript ycx_hwp_sweep.R <dir>

args<-commandArgs(trailingOnly=TRUE); D<-if(length(args)>=1) args[1] else "."
dt<-10
st<-read.csv(file.path(D,"conus_scenarios_100yr.csv"),stringsAsFactors=FALSE)
rm<-read.csv(file.path(D,"conus_harvest_removed.csv"),stringsAsFactors=FALSE)
ps<-read.csv(file.path(D,"hybrid_products","product_summary_by_state.csv"),stringsAsFactors=FALSE)
saw_frac<-mean(ps$saw_vol_frac,na.rm=TRUE)
standing<-aggregate(agc_Tg~scenario+year_offset,st,sum)
removed_cum<-aggregate(removed_cum_Tg~scenario+year_offset,rm,sum)
scn<-unique(standing$scenario); offs<-sort(unique(standing$year_offset))

net_change<-function(sc,HL_saw,HL_pulp,LF_FRAC,HL_lf,DF){
  S<-standing[standing$scenario==sc,]; S<-S[order(S$year_offset),]
  stand<-setNames(S$agc_Tg,S$year_offset)[as.character(offs)]
  R<-removed_cum[removed_cum$scenario==sc,]; rc<-setNames(R$removed_cum_Tg,as.character(R$year_offset))[as.character(offs)]; rc[is.na(rc)]<-0
  rdec<-c(rc[1],diff(rc)); rdec[rdec<0]<-0
  ks<-log(2)/HL_saw; kp<-log(2)/HL_pulp; klf<-log(2)/HL_lf
  iu_s<-iu_p<-lf<-0; net<-numeric(length(offs))
  for(j in seq_along(offs)){
    os<-iu_s*(1-exp(-ks*dt)); iu_s<-iu_s*exp(-ks*dt)+rdec[j]*saw_frac
    op<-iu_p*(1-exp(-kp*dt)); iu_p<-iu_p*exp(-kp*dt)+rdec[j]*(1-saw_frac)
    lf<-lf*exp(-klf*dt)+LF_FRAC*(os+op); net[j]<-stand[j]+iu_s+iu_p+lf }
  n<-length(offs)
  c(net_stock=unname(net[n]-net[1]), net_subst=unname((net[n]+DF*rc[n])-(net[1]+DF*rc[1])))
}

grid<-expand.grid(HL_saw=c(25,35,50),HL_pulp=c(2,4),LF_FRAC=c(0.15,0.30,0.50),
                  HL_lf=c(50,100,200),DF=c(0.0,0.30,0.45,0.60,0.90))
rows<-list()
for(sc in scn) for(i in seq_len(nrow(grid))){ g<-grid[i,]
  v<-net_change(sc,g$HL_saw,g$HL_pulp,g$LF_FRAC,g$HL_lf,g$DF)
  rows[[length(rows)+1]]<-data.frame(scenario=sc,g,net_stock_d=round(v["net_stock"],0),net_subst_d=round(v["net_subst"],0),row.names=NULL) }
res<-do.call(rbind,rows); write.csv(res,file.path(D,"conus_hwp_sweep.csv"),row.names=FALSE)

summ<-do.call(rbind,lapply(scn,function(sc){ d<-res[res$scenario==sc,]
  data.frame(scenario=sc,
    net_stock_min=min(d$net_stock_d),net_stock_max=max(d$net_stock_d),
    net_subst_min=min(d$net_subst_d),net_subst_max=max(d$net_subst_d),row.names=NULL) }))
write.csv(summ,file.path(D,"conus_hwp_sweep_summary.csv"),row.names=FALSE)
cat("[sweep] 100-yr change range across", nrow(grid), "param sets (Tg C):\n")
cat("  scenario                 net-stock [min, max]      net+subst [min, max]\n")
for(i in seq_len(nrow(summ))){ s<-summ[i,]
  cat(sprintf("  %-24s [%+6.0f, %+6.0f]   [%+6.0f, %+6.0f]\n",
    s$scenario,s$net_stock_min,s$net_stock_max,s$net_subst_min,s$net_subst_max)) }
cat("[sweep] wrote conus_hwp_sweep.csv + summary\n")
