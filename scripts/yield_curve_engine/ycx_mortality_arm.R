## ycx_mortality_arm.R  (read-only)
##
## First-class ENDOGENOUS mortality-stressed reserve arm. Unlike the exogenous
## disturbance scenario (imposed fire/insect frequency), this drives decline from
## the FIA GRM density-dependent mortality m(C): as a reserve accumulates carbon,
## per-area mortality rises, and climate-amplified mortality (MULT>1) can pull the
## stock down. Age structure / absolute levels come from the recalibrated reserve
## (no carbon-space overshoot); only EXCESS mortality above the historical baseline
## already embedded in g_obs is applied:
##   dens(t) = dens(t-1) + recal_increment(t) - (MULT-1)*m(dens(t-1))
## MULT=1 reproduces the production recalibrated reserve exactly.
##
## Output: treemap/disturb/mortarm_bystate_100yr.csv (state,arm,year,agc_Tg),
##         treemap/disturb/conus_mortarm_100yr.csv, mortarm_summary.txt
## Usage: Rscript ycx_mortality_arm.R [out_dir] [VAT] [GRM_PLT_csv]

suppressMessages({library(foreign)})
args<-commandArgs(TRUE)
out <- if(length(args)>=1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
VAT <- if(length(args)>=2) args[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
GRM <- if(length(args)>=3) args[3] else "/fs/scratch/PUOM0008/crsfaaron/RD_growth_GRM/run_10416499/GRM.PLT_20260524_job10416499.csv"
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dd<-file.path(td,"disturb"); dir.create(dd,showWarnings=FALSE,recursive=TRUE)
fia<-"/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
TM_BASE<-2022L; offs<-seq(0,100,10); LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09
BIN<-10L; MIN_CELL<-50L; MIN_FT<-80L; MIN_ST<-200L
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
FIPS2ABBR<-setNames(names(ABBR2FIPS),as.character(ABBR2FIPS))
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))

## ---- g_obs cell kernel + ceiling (recal reserve) ----
rm<-read.csv(file.path(fia,"plot_remeas.csv"),colClasses="character"); rm$REMPER<-suppressWarnings(as.numeric(rm$REMPER))
agc_of<-function(fips){fp<-file.path(fia,sprintf("%d_TREE.csv",fips)); if(!file.exists(fp))return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); idx<-match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"),hdr)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp)); t<-read.csv(tmp); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD)); for(c0 in c("CARBON_AG","TPA_UNADJ"))t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t<-t[!is.na(t$STATUSCD)&t$STATUSCD==1,]; a<-aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN,t,sum,na.rm=TRUE); names(a)[2]<-"agc"; a$PLT_CN<-as.character(a$PLT_CN); a}
incr<-list()
for(st in names(ABBR2FIPS)){mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); if(!file.exists(mf))next
  mem<-read.csv(mf,colClasses="character"); ft<-setNames(mem$ft_group,mem$PLT_CN); pv<-setNames(mem$prov_code,mem$PLT_CN); ow<-setNames(mem$owner4,mem$PLT_CN)
  trt<-setNames(mem$treatment,mem$PLT_CN); age<-setNames(suppressWarnings(as.numeric(mem$STDAGE)),mem$PLT_CN)
  ac<-agc_of(ABBR2FIPS[[st]]); if(is.null(ac))next; ci<-setNames(ac$agc,ac$PLT_CN)
  d<-rm[rm$STATECD==as.character(ABBR2FIPS[[st]]),]; d$c1<-ci[d$PREV_PLT_CN]; d$c2<-ci[d$CN]; d$age<-age[d$CN]; d$trt<-trt[d$CN]
  d<-d[is.finite(d$c1)&is.finite(d$c2)&is.finite(d$REMPER)&d$REMPER>=3&d$REMPER<=15&d$c1>0&d$trt=="untreated"&is.finite(d$age)&d$age>0,]
  if(nrow(d))incr[[st]]<-data.frame(state=st,cell=paste(ft[d$CN],pv[d$CN],ow[d$CN],sep="|"),ft=ft[d$CN],age=d$age,grow=(d$c2-d$c1)/d$REMPER*LBAC_TO_MGHA,stand=d$c1*LBAC_TO_MGHA,stringsAsFactors=FALSE)}
INC<-do.call(rbind,incr)
binfit<-function(age,grow){b<-BIN*(age%/%BIN)+BIN/2; m<-tapply(grow,b,mean,na.rm=TRUE); ab<-as.numeric(names(m)); o<-order(ab); ab<-ab[o]; m<-as.numeric(m[o]); if(length(m)>=3){ms<-stats::filter(m,rep(1/3,3));ms[is.na(ms)]<-m[is.na(ms)];m<-as.numeric(ms)}; approxfun(ab,pmax(m,0),rule=2)}
M<-local({nat<-binfit(INC$age,INC$grow); st<-list();for(s in unique(INC$state)){x<-INC[INC$state==s,];if(nrow(x)>=MIN_ST)st[[s]]<-binfit(x$age,x$grow)}; ft<-list();for(f in unique(INC$ft)){x<-INC[INC$ft==f,];if(nrow(x)>=MIN_FT)ft[[f]]<-binfit(x$age,x$grow)}; ce<-list();ct<-table(INC$cell);for(c0 in names(ct)[ct>=MIN_CELL]){x<-INC[INC$cell==c0,];ce[[c0]]<-binfit(x$age,x$grow)}; list(nat=nat,st=st,ft=ft,ce=ce)})
gp<-function(cell,ftg,st,a){f<-M$ce[[cell]];if(!is.null(f))return(f(a));f<-M$ft[[ftg]];if(!is.null(f))return(f(a));f<-M$st[[st]];if(!is.null(f))return(f(a));M$nat(a)}
q95<-function(x)as.numeric(quantile(x,0.95,na.rm=TRUE))
CEce<-tapply(INC$stand,INC$cell,q95); CEft<-tapply(INC$stand,INC$ft,q95); CEst<-tapply(INC$stand,INC$state,q95); CEna<-q95(INC$stand)
cap_of<-function(cell,ftg,st){v<-CEce[cell];if(is.na(v))v<-CEft[ftg];if(is.na(v))v<-CEst[st];if(is.na(v))v<-CEna;as.numeric(v)}

## ---- GRM density-dependent mortality m(C) per state ----
g<-read.csv(GRM,stringsAsFactors=FALSE); num<-function(x)suppressWarnings(as.numeric(x))
g$Ct<-num(g$CARB)*LBAC_TO_MGHA; g$mm<-num(g$dCARB.MORT.t.ha.yr); g$rmv<-num(g$dCARB.REMV.t.ha.yr); g$rem<-num(g$REMPER); g$abbr<-FIPS2ABBR[as.character(as.integer(g$STATECD))]
g<-g[is.finite(g$Ct)&g$Ct>0&is.finite(g$mm)&is.finite(g$rmv)&is.finite(g$rem)&g$rem>=3&g$rem<=15&g$rmv<=0.01&!is.na(g$abbr),]
BR<-c(0,seq(10,300,by=20),Inf)
fitm<-function(df){b<-cut(df$Ct,BR); mid<-tapply(df$Ct,b,mean); mm<-tapply(df$mm,b,mean); ok<-is.finite(mid)&is.finite(mm); if(sum(ok)<3)return(NULL); approxfun(mid[ok],pmax(mm[ok],0),rule=2)}
mNAT<-fitm(g); mST<-list(); for(s in unique(g$abbr)){x<-g[g$abbr==s,]; if(nrow(x)>=300){f<-fitm(x); if(!is.null(f))mST[[s]]<-f}}
getm<-function(st){f<-mST[[st]]; if(is.null(f))mNAT else f}

## ---- TreeMap pixels + hybrid fits ----
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

## ---- project recal reserve + mortality-stressed arms ----
MULT<-c(baseline=1, mort_1p5x=1.5, mort_2x=2)
res<-lapply(MULT,function(x) matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs))))
area<-setNames(numeric(length(states)),states); declined<-setNames(numeric(length(states)),states); npix<-declined
for(i in seq_len(nrow(v))){h<-geth(v$abbr[i],v$cell[i]); if(is.null(h))next
  st<-v$abbr[i]; a0<-v$STDAGE[i]; Astar<-h[5]; ar<-v$area_ha[i]; ftg<-v$ft_group[i]; cl<-v$cell[i]; mf2<-getm(st)
  ages<-a0+(0:HOR)
  dh<-hyb(ages,h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; dh[!is.finite(dh)|dh<0]<-0; hinc<-diff(dh)
  go<-gp(cl,ftg,st,ages[-1]); w<-pmax(0,pmin(1,(Astar-ages[-1])/Astar)); rinc<-pmax(w*go+(1-w)*hinc,0)
  cap<-cap_of(cl,ftg,st)
  npix[st]<-npix[st]+1
  for(nm in names(MULT)){ex<-MULT[[nm]]-1; C<-numeric(HOR+1); C[1]<-min(dh[1],cap)
    for(t in 2:(HOR+1)){C[t]<-C[t-1]+rinc[t-1]-ex*mf2(C[t-1]); C[t]<-max(0,min(C[t],cap))}
    res[[nm]][st,]<-res[[nm]][st,]+C[oidx]*ar/1e6
    if(nm=="mort_2x" && C[HOR+1]<C[1]) declined[st]<-declined[st]+1}
  area[st]<-area[st]+ar
}
ct<-sapply(res,colSums)
cat("\n[mortarm] CONUS reserve by mortality-stress arm (Tg C):\n")
for(nm in names(MULT)){x<-ct[,nm]; cat(sprintf("  %-10s t0=%.0f t50=%.0f t100=%.0f (%+.1f%%)\n",nm,x[1],x[6],x[length(offs)],100*(x[length(offs)]/x[1]-1)))}

bystate<-do.call(rbind,lapply(names(MULT),function(nm) do.call(rbind,lapply(states,function(st)
  data.frame(state=st,arm=nm,year=TM_BASE+offs,agc_Tg=round(res[[nm]][st,],3),row.names=NULL)))))
write.csv(bystate,file.path(dd,"mortarm_bystate_100yr.csv"),row.names=FALSE)
write.csv(do.call(rbind,lapply(names(MULT),function(nm) data.frame(arm=nm,year=TM_BASE+offs,agc_Tg=round(ct[,nm],2),row.names=NULL))),
  file.path(dd,"conus_mortarm_100yr.csv"),row.names=FALSE)
sink(file.path(dd,"mortarm_summary.txt"))
cat("Endogenous mortality-stressed reserve (GRM density-dependent m(C) on recalibrated reserve)\n\n")
for(nm in names(MULT)){x<-ct[,nm]; cat(sprintf("  %-10s t0=%.0f t100=%.0f (%+.1f%%)\n",nm,x[1],x[length(offs)],100*(x[length(offs)]/x[1]-1)))}
cat(sprintf("\nunder 2x mortality, %d of %d pixels end below current carbon\n",sum(declined),sum(npix)))
sink()
cat("[mortarm] wrote treemap/disturb/{mortarm_bystate_100yr,conus_mortarm_100yr,mortarm_summary}\n")
