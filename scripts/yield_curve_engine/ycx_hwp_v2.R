## ycx_hwp_v2.R  (HWP with landfill pool + substitution sensitivity)
##
## Extends ycx_hwp.R from an in-use-only pool to a coupled in-use + landfill
## (solid waste disposal site, SWDS) carbon-stock model, and reports a
## product-substitution avoided-emissions sensitivity SEPARATELY (it is an
## emissions credit, not a carbon stock, so it is not folded into net stock).
##
## Discrete decade-step pools, per product (sawtimber HL 35 yr, pulpwood 2 yr):
##   inflow(t)     = removed_C(t) * product_split
##   in_use(t)     = in_use(t-1)*exp(-k_iu*dt) + inflow(t)
##   outflow(t)    = in_use(t-1)*(1-exp(-k_iu*dt))           # retired from use
##   landfill(t)   = landfill(t-1)*exp(-k_lf*dt) + LF_FRAC*outflow(t)
## net carbon stock = standing_live + sum(in_use) + landfill
## substitution(t) (sensitivity) = DF * cumulative removed_C(t)   [avoided emissions]
##
## Params (defaults, documented in the methods note):
##   LF_FRAC = 0.30 (fraction of retired products to SWDS), HL_landfill = 100 yr
##   DF = 0.45 tC avoided per tC in harvested products (mid Sathre & O'Connor)
##
## Inputs (this dir): conus_scenarios_100yr.csv, conus_harvest_removed.csv,
##   hybrid_products/product_summary_by_state.csv
## Output: conus_hwp_v2_netflux.csv, conus_hwp_v2_netflux.png
##
## Usage: Rscript ycx_hwp_v2.R <dir>

args<-commandArgs(trailingOnly=TRUE); D<-if(length(args)>=1) args[1] else "."
HL_SAW<-35; HL_PULP<-2; HL_LF<-100; LF_FRAC<-0.30; DF<-0.45; dt<-10
k_saw<-log(2)/HL_SAW; k_pulp<-log(2)/HL_PULP; k_lf<-log(2)/HL_LF

st<-read.csv(file.path(D,"conus_scenarios_100yr.csv"),stringsAsFactors=FALSE)
rm<-read.csv(file.path(D,"conus_harvest_removed.csv"),stringsAsFactors=FALSE)
ps<-read.csv(file.path(D,"hybrid_products","product_summary_by_state.csv"),stringsAsFactors=FALSE)
saw_frac<-mean(ps$saw_vol_frac,na.rm=TRUE); pulp_frac<-1-saw_frac

standing<-aggregate(agc_Tg~scenario+year_offset,st,sum)
removed_cum<-aggregate(removed_cum_Tg~scenario+year_offset,rm,sum)
scn<-unique(standing$scenario); offs<-sort(unique(standing$year_offset)); yrs<-2022+offs

OUT<-list()
for(sc in scn){
  S<-standing[standing$scenario==sc,]; S<-S[order(S$year_offset),]
  stand<-setNames(S$agc_Tg,S$year_offset)[as.character(offs)]
  R<-removed_cum[removed_cum$scenario==sc,]; rc<-setNames(R$removed_cum_Tg,as.character(R$year_offset))[as.character(offs)]; rc[is.na(rc)]<-0
  rdec<-c(rc[1], diff(rc)); rdec[rdec<0]<-0                  # per-decade removed C
  iu_saw<-iu_pulp<-lf<-0; in_use<-landfill<-numeric(length(offs))
  for(j in seq_along(offs)){
    in_saw<-rdec[j]*saw_frac; in_pulp<-rdec[j]*pulp_frac
    out_saw <- iu_saw *(1-exp(-k_saw*dt)); iu_saw <- iu_saw *exp(-k_saw*dt)+in_saw
    out_pulp<- iu_pulp*(1-exp(-k_pulp*dt));iu_pulp<- iu_pulp*exp(-k_pulp*dt)+in_pulp
    lf <- lf*exp(-k_lf*dt) + LF_FRAC*(out_saw+out_pulp)
    in_use[j]<-iu_saw+iu_pulp; landfill[j]<-lf
  }
  net<-as.numeric(stand)+in_use+landfill
  subst<-DF*rc                                              # cumulative avoided emissions
  OUT[[sc]]<-data.frame(scenario=sc,year=yrs,
    standing_Tg=round(as.numeric(stand),0), in_use_Tg=round(in_use,0),
    landfill_Tg=round(landfill,0), net_stock_Tg=round(net,0),
    substitution_Tg=round(subst,0), net_plus_subst_Tg=round(net+subst,0), row.names=NULL)
}
res<-do.call(rbind,OUT); write.csv(res,file.path(D,"conus_hwp_v2_netflux.csv"),row.names=FALSE)

cat(sprintf("[hwp2] split saw %.2f/pulp %.2f | LF_FRAC %.2f HL_lf %d | DF %.2f\n",saw_frac,pulp_frac,LF_FRAC,HL_LF,DF))
cat("\n[hwp2] === CONUS 100-yr change (Tg C): standing -> net stock -> +substitution ===\n")
for(sc in scn){ d<-res[res$scenario==sc,]; n<-nrow(d)
  cat(sprintf("  %-24s standing %+6.0f | net stock %+6.0f (in-use %4.0f, landfill %4.0f) | +subst %+6.0f\n",
    sc, d$standing_Tg[n]-d$standing_Tg[1], d$net_stock_Tg[n]-d$net_stock_Tg[1],
    d$in_use_Tg[n], d$landfill_Tg[n], d$net_plus_subst_Tg[n]-d$net_plus_subst_Tg[1])) }

png(file.path(D,"conus_hwp_v2_netflux.png"),width=900,height=560,res=120)
op<-par(mar=c(4,4.5,3,9),xpd=NA)
cols<-c(`reserve (no harvest)`="#1b7837",`managed (conservation)`="#5aae61",`managed (harvest)`="#d6604d",`managed (intensive)`="#b2182b")
ymax<-max(res$net_stock_Tg)*1.05
plot(NA,xlim=range(yrs),ylim=c(0,ymax),xlab="Year",ylab="Net carbon stock: forest + in-use + landfill (Tg C)",
     main="CONUS net carbon stock (standing + HWP in-use + landfill)")
grid(col="grey88")
for(sc in scn){ d<-res[res$scenario==sc,]; lines(d$year,d$net_stock_Tg,type="o",pch=19,lwd=2.4,col=cols[[sc]])
  lines(d$year,d$standing_Tg,lty=3,lwd=1.3,col=cols[[sc]]) }
legend(par("usr")[2],par("usr")[4],legend=c(names(cols),"(dotted = standing only)"),
       col=c(unlist(cols),NA),lwd=2.4,pch=c(19,19,19,19,NA),bty="n",cex=0.78)
par(op); dev.off()
cat("[hwp2] wrote conus_hwp_v2_netflux.csv + .png\n")
