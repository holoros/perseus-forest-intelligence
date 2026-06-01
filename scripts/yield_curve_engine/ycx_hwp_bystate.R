## ycx_hwp_bystate.R
## Per-state net carbon stock (standing live + HWP in-use + landfill) by
## scenario and year, for publishing net_forest_hwp_c as a metric. Same
## coupled pool model as ycx_hwp_v2.R, run independently per state (pools are
## linear, so per-state nets sum to the CONUS total). Substitution is a separate
## sensitivity and is intentionally NOT included in this carbon-stock metric.
##
## Inputs (this dir): conus_scenarios_100yr.csv, conus_harvest_removed.csv,
##   hybrid_products/product_summary_by_state.csv
## Output: conus_hwp_netstock_bystate.csv (state, scenario, year_offset, net_stock_Tg)
##
## Usage: Rscript ycx_hwp_bystate.R <dir>

args<-commandArgs(trailingOnly=TRUE); D<-if(length(args)>=1) args[1] else "."
HL_SAW<-35; HL_PULP<-2; HL_LF<-100; LF_FRAC<-0.30; dt<-10
k_saw<-log(2)/HL_SAW; k_pulp<-log(2)/HL_PULP; k_lf<-log(2)/HL_LF

st<-read.csv(file.path(D,"conus_scenarios_100yr.csv"),stringsAsFactors=FALSE)
rm<-read.csv(file.path(D,"conus_harvest_removed.csv"),stringsAsFactors=FALSE)
ps<-read.csv(file.path(D,"hybrid_products","product_summary_by_state.csv"),stringsAsFactors=FALSE)
sawf<-setNames(ps$saw_vol_frac, ps$state)                 # per-state saw fraction of merch
def_saw<-mean(ps$saw_vol_frac,na.rm=TRUE)

offs<-sort(unique(st$year_offset))
pool_net<-function(stand, rc, sf){                        # stand,rc vectors over offs
  rdec<-c(rc[1],diff(rc)); rdec[rdec<0]<-0
  iu_s<-iu_p<-lf<-0; net<-numeric(length(offs))
  for(j in seq_along(offs)){
    os<-iu_s*(1-exp(-k_saw*dt));  iu_s<-iu_s*exp(-k_saw*dt)+rdec[j]*sf
    op<-iu_p*(1-exp(-k_pulp*dt)); iu_p<-iu_p*exp(-k_pulp*dt)+rdec[j]*(1-sf)
    lf<-lf*exp(-k_lf*dt)+LF_FRAC*(os+op)
    net[j]<-stand[j]+iu_s+iu_p+lf
  }
  net
}

ROWS<-list()
for(sc in unique(st$scenario)){
  ss<-st[st$scenario==sc,]; rr<-rm[rm$scenario==sc,]
  for(state in unique(ss$state)){
    d<-ss[ss$state==state,]; d<-d[order(d$year_offset),]
    stand<-setNames(d$agc_Tg,d$year_offset)[as.character(offs)]
    rd<-rr[rr$state==state,]; rc<-setNames(rd$removed_cum_Tg,as.character(rd$year_offset))[as.character(offs)]; rc[is.na(rc)]<-0
    sf<-sawf[[state]]; if(is.null(sf)||is.na(sf)) sf<-def_saw
    net<-pool_net(as.numeric(stand), as.numeric(rc), sf)
    ROWS[[length(ROWS)+1]]<-data.frame(state=state,scenario=sc,year_offset=offs,net_stock_Tg=round(net,3),row.names=NULL)
  }
}
out<-do.call(rbind,ROWS)
write.csv(out,file.path(D,"conus_hwp_netstock_bystate.csv"),row.names=FALSE)
## sanity: CONUS sum per scenario t0/t100
ag<-aggregate(net_stock_Tg~scenario+year_offset,out,sum)
cat("[hwp-bystate] CONUS net stock by scenario (t0 -> t100):\n")
for(sc in unique(ag$scenario)){a<-ag[ag$scenario==sc,]
  cat(sprintf("  %-24s %.0f -> %.0f\n",sc,a$net_stock_Tg[a$year_offset==0],a$net_stock_Tg[a$year_offset==100]))}
cat(sprintf("[hwp-bystate] wrote conus_hwp_netstock_bystate.csv (%d rows)\n",nrow(out)))
