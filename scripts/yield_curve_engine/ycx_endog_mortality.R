## ycx_endog_mortality.R  (read-only)
##
## Mechanistic, fully-observed density-dependent decline for the no-harvest
## reserve, from the FIA GRM (growth-removal-mortality) annualized plot record.
## Instead of an imposed disturbance multiplier, mortality rises ENDOGENOUSLY as
## a stand accumulates carbon and crowds, so the trajectory self-limits and can
## decline once mortality overtakes gross growth.
##
## On unharvested (dCARB.REMV==0) forestland plots, bin by standing carbon and fit
##   g(C) = mean gross carbon increment (t/ha/yr)      [dCARB.GROSS.t.ha.yr]
##   m(C) = mean carbon mortality      (t/ha/yr)       [dCARB.MORT.t.ha.yr]
## The reserve dynamic is dC/dt = g(C) - m(C); equilibrium C* solves g=m.
## Project every TreeMap-2022 pixel from its current carbon for 100 yr under this
## dynamic (per-state g,m with national fallback) and roll to CONUS.
##
## Corroboration: the fitted CONUS gompit survival model (conus_mort, AUC 0.74)
## independently shows per-tree survival falling from 0.83 (open) to 0.78 (closed
## canopy) — the same crowding -> mortality mechanism, at the tree scale.
##
## Output: treemap/disturb/conus_endog_100yr.csv, endog_gm_curves.csv, endog_summary.txt
## Usage: Rscript ycx_endog_mortality.R [out_dir] [VAT] [GRM_PLT_csv]

suppressMessages({library(foreign)})
args<-commandArgs(TRUE)
out <- if(length(args)>=1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
VAT <- if(length(args)>=2) args[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
GRM <- if(length(args)>=3) args[3] else "/fs/scratch/PUOM0008/crsfaaron/RD_growth_GRM/run_10416499/GRM.PLT_20260524_job10416499.csv"
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dd<-file.path(td,"disturb")
dir.create(dd,showWarnings=FALSE,recursive=TRUE)
TM_BASE<-2022L; offs<-seq(0,100,10); LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
FIPS2ABBR<-setNames(names(ABBR2FIPS),as.character(ABBR2FIPS))
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))

## ---- GRM: standing carbon (t/ha) + gross & mort flux (t/ha/yr), unharvested ----
g<-read.csv(GRM,stringsAsFactors=FALSE)
num<-function(x) suppressWarnings(as.numeric(x))
g$Ct  <- num(g$CARB)*LBAC_TO_MGHA          # standing carbon Mg/ha (CARB is lb/ac)
g$gg  <- num(g$dCARB.GROSS.t.ha.yr)
g$mm  <- num(g$dCARB.MORT.t.ha.yr)
g$rmv <- num(g$dCARB.REMV.t.ha.yr)
g$rem <- num(g$REMPER)
g$abbr<- FIPS2ABBR[as.character(as.integer(g$STATECD))]
g<-g[is.finite(g$Ct)&g$Ct>0&is.finite(g$gg)&is.finite(g$mm)&is.finite(g$rmv)&
     is.finite(g$rem)&g$rem>=3&g$rem<=15 & g$rmv<=0.01 & !is.na(g$abbr),]   # unharvested
cat(sprintf("[endog] unharvested GRM plots: %d\n",nrow(g)))
cat(sprintf("[endog] CONUS mean: standing %.1f, gross %.3f, mort %.3f, net %.3f Mg C/ha/yr (mort = %.0f%% of gross)\n",
  mean(g$Ct),mean(g$gg),mean(g$mm),mean(g$gg-g$mm),100*mean(g$mm)/mean(g$gg)))

## binned g(C), m(C) -> approxfuns, per state (fallback national)
BR<-c(0,seq(10,300,by=20),Inf)
fitgm<-function(df){
  b<-cut(df$Ct,BR); mid<-tapply(df$Ct,b,mean); gg<-tapply(df$gg,b,mean); mm<-tapply(df$mm,b,mean)
  ok<-is.finite(mid)&is.finite(gg)&is.finite(mm); mid<-mid[ok]; gg<-gg[ok]; mm<-mm[ok]
  if(length(mid)<3) return(NULL)
  list(g=approxfun(mid,pmax(gg,0),rule=2), m=approxfun(mid,pmax(mm,0),rule=2),
       Cmax=max(df$Ct), n=nrow(df))
}
NAT<-fitgm(g); ST<-list()
for(s in unique(g$abbr)){x<-g[g$abbr==s,]; if(nrow(x)>=300){f<-fitgm(x); if(!is.null(f)) ST[[s]]<-f}}
getgm<-function(st){f<-ST[[st]]; if(is.null(f)) NAT else f}
## equilibrium carbon (national)
Cgrid<-seq(5,400,by=1); dnet<-NAT$g(Cgrid)-NAT$m(Cgrid)
Cstar<-if(any(dnet<=0)) Cgrid[which(dnet<=0)[1]] else NA
cat(sprintf("[endog] national equilibrium C* (g=m): %s Mg C/ha\n", ifelse(is.na(Cstar),">400",round(Cstar))))
## export g,m curves
gmc<-data.frame(C=Cgrid, g=round(NAT$g(Cgrid),4), m=round(NAT$m(Cgrid),4), net=round(dnet,4))
write.csv(gmc[gmc$C%%5==0,],file.path(dd,"endog_gm_curves.csv"),row.names=FALSE)

## ---- TreeMap pixels + hybrid t0 carbon ----
v<-read.dbf(VAT,as.is=TRUE); names(v)<-toupper(names(v)); v<-v[,intersect(c("PLT_CN","COUNT"),names(v))]
v$PLT_CN<-sub("\\.0+$","",format(v$PLT_CN,scientific=FALSE,trim=TRUE))
mf<-list.files(cfg,pattern="^ycx_membership_.*\\.csv$",full.names=TRUE)
mem<-do.call(rbind,lapply(mf,function(f){d<-read.csv(f,colClasses="character"); d[,c("PLT_CN","STATECD","ft_group","prov_code","owner4","STDAGE")]}))
mem<-mem[!duplicated(mem$PLT_CN),]; mem$STDAGE<-suppressWarnings(as.numeric(mem$STDAGE))
key<-match(v$PLT_CN,mem$PLT_CN); v<-v[!is.na(key),]; mm<-mem[key[!is.na(key)],]
v<-cbind(v,mm[,c("STATECD","ft_group","prov_code","owner4","STDAGE")]); v<-v[is.finite(v$STDAGE)&v$STDAGE>0,]
v$abbr<-FIPS2ABBR[as.character(as.integer(v$STATECD))]; v<-v[!is.na(v$abbr),]
v$cell<-paste(v$ft_group,v$prov_code,v$owner4,sep="|"); v$area_ha<-v$COUNT*PIX_HA
H<-list();for(st in unique(v$abbr)){fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp))next
  f<-read.csv(fp,stringsAsFactors=FALSE); if("response"%in%names(f))f<-f[f$response=="carbon_lbac",]
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key); if(is.null(H[[id]]))H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)}}
geth<-function(st,cell){k<-H[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); H[[paste0(st,"@@state")]]}
states<-sort(unique(v$abbr)); HOR<-100; oidx<-match(offs,0:HOR)

## ---- project carbon dynamic dC/dt = g(C) - MM*m(C), mortality-multiplier arms ----
## baseline reproduces observed dynamics; 1.5x/2x represent climate-amplified
## mortality (drought/insect/fire-driven) so m(C) can overtake g(C) -> decline.
MM<-c(baseline=1, mort_1p5x=1.5, mort_2x=2)
res<-lapply(MM,function(x) matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs))))
area<-setNames(numeric(length(states)),states)
declined<-setNames(numeric(length(states)),states); npix<-declined
for(i in seq_len(nrow(v))){h<-geth(v$abbr[i],v$cell[i]); if(is.null(h))next
  st<-v$abbr[i]; ar<-v$area_ha[i]; f<-getgm(st)
  C0<-hyb(v$STDAGE[i],h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; if(!is.finite(C0)||C0<0)C0<-0
  npix[st]<-npix[st]+1
  for(nm in names(MM)){mm<-MM[[nm]]; C<-numeric(HOR+1); C[1]<-C0
    for(t in 2:(HOR+1)){dC<-f$g(C[t-1])-mm*f$m(C[t-1]); C[t]<-max(0,C[t-1]+dC)}
    res[[nm]][st,]<-res[[nm]][st,]+C[oidx]*ar/1e6
    if(nm=="mort_2x" && C[HOR+1]<C0) declined[st]<-declined[st]+1}
  area[st]<-area[st]+ar
}
ct<-sapply(res,colSums)
cat("\n[endog] CONUS reserve by mortality arm (Tg C):\n")
for(nm in names(MM)){x<-ct[,nm]; cat(sprintf("  %-10s t0=%.0f t50=%.0f t100=%.0f (%+.1f%%)\n",nm,x[1],x[6],x[length(offs)],100*(x[length(offs)]/x[1]-1)))}

long<-do.call(rbind,lapply(names(MM),function(nm) data.frame(arm=nm,year=TM_BASE+offs,agc_Tg=round(ct[,nm],2),row.names=NULL)))
write.csv(long,file.path(dd,"conus_endog_100yr.csv"),row.names=FALSE)
sd<-data.frame(state=states,npix=npix,declined_2x=declined,pct_declined_2x=round(100*declined/pmax(npix,1),1),
  t0=round(res[["baseline"]][,1],1),base_t100=round(res[["baseline"]][,length(offs)],1),
  mort2x_t100=round(res[["mort_2x"]][,length(offs)],1),row.names=NULL)
write.csv(sd[order(-sd$pct_declined_2x),],file.path(dd,"endog_state_decline.csv"),row.names=FALSE)
ec<-ct[,"baseline"]

sink(file.path(dd,"endog_summary.txt"))
cat("Endogenous density-dependent mortality reserve (FIA GRM, unharvested plots)\n\n")
cat(sprintf("plots %d; carbon mortality = %.0f%% of gross growth nationally\n",nrow(g),100*mean(g$mm)/mean(g$gg)))
cat(sprintf("national equilibrium carbon C* (g=m): %s Mg C/ha (baseline mortality)\n",ifelse(is.na(Cstar),">400",round(Cstar))))
cat("CONUS reserve by mortality arm (Tg C):\n")
for(nm in names(MM)){x<-ct[,nm]; cat(sprintf("  %-10s t0=%.0f t100=%.0f (%+.1f%%)\n",nm,x[1],x[length(offs)],100*(x[length(offs)]/x[1]-1)))}
cat(sprintf("\nunder 2x mortality, %d of %d pixels end below current carbon\n",sum(declined),sum(npix)))
cat("\ng(C), m(C) at selected standing carbon (Mg C/ha):\n")
for(C in c(20,50,100,150,200,250)) cat(sprintf("  C=%3d  gross %.3f  mort %.3f  net@1x %+.3f  net@2x %+.3f\n",C,NAT$g(C),NAT$m(C),NAT$g(C)-NAT$m(C),NAT$g(C)-2*NAT$m(C)))
sink()
cat("[endog] wrote treemap/disturb/{conus_endog_100yr,endog_gm_curves,endog_state_decline,endog_summary}\n")
