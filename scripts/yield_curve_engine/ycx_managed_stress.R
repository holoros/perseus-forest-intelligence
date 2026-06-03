## ycx_managed_stress.R  (read-only, v2: raster-driven params + 3 regimes + fast)
##
## In-loop climate-stress decline for ALL THREE management regimes (harvest BAU,
## intensive, conservation). Per pixel, annual step under the owner harvest regime:
##   C += recal_growth_increment(age) - drag(C, age); harvest events; cap at observed ceiling.
## drag uses SPATIALLY-EXPLICIT disturbance params sampled from the v5 CONUS rasters
## (disturb_params_raster.csv, FIA-calibrated) and the FIA GRM density mortality m(C).
## Harvest age-resets correctly lower exposure (young low-carbon stands lose little).
## Output: treemap/disturb/managed_stress_ratio_bystate.csv
##   (state, regime, year, dist_moderate, dist_severe, mort_1p5x, mort_2x) = stressed/baseline
## Usage: Rscript ycx_managed_stress.R [out_dir] [VAT] [GRM_PLT_csv]

suppressMessages({library(foreign)})
args<-commandArgs(TRUE)
out <- if(length(args)>=1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
VAT <- if(length(args)>=2) args[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
GRM <- if(length(args)>=3) args[3] else "/fs/scratch/PUOM0008/crsfaaron/RD_growth_GRM/run_10416499/GRM.PLT_20260524_job10416499.csv"
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dd<-file.path(td,"disturb"); dir.create(dd,showWarnings=FALSE,recursive=TRUE)
fia<-"/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09; offs<-seq(0,100,10); TM_BASE<-2022L
BIN<-10L; MIN_CELL<-50L; MIN_FT<-80L; MIN_ST<-200L; REGEN_AGE<-5L; HOR<-100L
REG<-list(Industrial=list(type="clearcut",R=45),NIPF=list(type="partial",E=20,f=0.30),
          State=list(type="partial",E=25,f=0.25),`Public-Other`=list(type="partial",E=30,f=0.15)); DEF_REG<-"NIPF"
scale_reg<-function(reg,sr,sf) lapply(reg,function(x){ if(x$type=="clearcut") list(type="clearcut",R=max(10,round(x$R*sr))) else list(type="partial",E=max(5,round(x$E*sr)),f=min(0.9,x$f*sf)) })
SCEN<-list(harvest=REG, intensive=scale_reg(REG,0.7,1.3), conservation=scale_reg(REG,1.6,0.5))
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
FIPS2ABBR<-setNames(names(ABBR2FIPS),as.character(ABBR2FIPS))
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))

## ---- g_obs growth kernel + ceiling (undisturbed increments) ----
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
gpv<-function(cell,ftg,st,a){f<-M$ce[[cell]];if(!is.null(f))return(f(a));f<-M$ft[[ftg]];if(!is.null(f))return(f(a));f<-M$st[[st]];if(!is.null(f))return(f(a));M$nat(a)}
q95<-function(x)as.numeric(quantile(x,0.95,na.rm=TRUE))
CEce<-tapply(INC$stand,INC$cell,q95); CEft<-tapply(INC$stand,INC$ft,q95); CEst<-tapply(INC$stand,INC$state,q95); CEna<-q95(INC$stand)
cap_of<-function(cell,ftg,st){v<-CEce[cell];if(is.na(v))v<-CEft[ftg];if(is.na(v))v<-CEst[st];if(is.na(v))v<-CEna;as.numeric(v)}

## ---- disturbance params: raster-driven (FIA-calibrated) ----
rpf<-file.path(dd,"disturb_params_raster.csv"); stopifnot(file.exists(rpf))
rp<-read.csv(rpf,stringsAsFactors=FALSE); rp$k<-paste(rp$prov,rp$ft,sep="|")
DP<-setNames(rp$p_dist_ann,rp$k); DS<-setNames(rp$sev,rp$k); p_nat<-mean(rp$p_dist_ann); s_nat<-mean(rp$sev)
getp<-function(k){v<-DP[k];if(is.na(v))p_nat else v}; gets<-function(k){v<-DS[k];if(is.na(v))s_nat else v}

## ---- GRM m(C) ----
g<-read.csv(GRM,stringsAsFactors=FALSE); num<-function(x)suppressWarnings(as.numeric(x))
g$Ct<-num(g$CARB)*LBAC_TO_MGHA; g$mm<-num(g$dCARB.MORT.t.ha.yr); g$rmv<-num(g$dCARB.REMV.t.ha.yr); g$rem<-num(g$REMPER); g$abbr<-FIPS2ABBR[as.character(as.integer(g$STATECD))]
g<-g[is.finite(g$Ct)&g$Ct>0&is.finite(g$mm)&is.finite(g$rmv)&is.finite(g$rem)&g$rem>=3&g$rem<=15&g$rmv<=0.01&!is.na(g$abbr),]
BRm<-c(0,seq(10,300,by=20),Inf)
fitm<-function(df){b<-cut(df$Ct,BRm); mid<-tapply(df$Ct,b,mean); mm<-tapply(df$mm,b,mean); ok<-is.finite(mid)&is.finite(mm); if(sum(ok)<3)return(NULL); approxfun(mid[ok],pmax(mm[ok],0),rule=2)}
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
v$own<-ifelse(v$owner4%in%names(REG),v$owner4,DEF_REG)
H<-list();for(st in unique(v$abbr)){fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp))next
  f<-read.csv(fp,stringsAsFactors=FALSE); if("response"%in%names(f))f<-f[f$response=="carbon_lbac",]
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key); if(is.null(H[[id]]))H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)}}
geth<-function(st,cell){k<-H[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); H[[paste0(st,"@@state")]]}
states<-sort(unique(v$abbr)); oidx<-match(offs,0:HOR)

## ---- project: 3 regimes x 5 arms, precomputed grids ----
REGIMES<-names(SCEN); ARMS<-c("baseline","dist_mod","dist_sev","mort15","mort20")
res<-list(); for(rg in REGIMES) for(a in ARMS) res[[paste(rg,a,sep="@")]]<-matrix(0,length(states),length(offs),dimnames=list(states,NULL))
area<-setNames(numeric(length(states)),states)
run<-function(GINCG,Astarconv,reg,cap,pdist,sev,mfun,arm,a0){
  C<-GINCG$hyb[a0]; age<-a0; tr<-numeric(HOR+1); tr[1]<-C; mult<-switch(arm,dist_mod=2,dist_sev=3,0)
  for(t in 1:HOR){age<-age+1
    drag<-switch(arm, baseline=0, dist_mod=mult*pdist*sev*C, dist_sev=mult*pdist*sev*C, mort15=0.5*mfun(C), mort20=1.0*mfun(C))
    C<-C+GINCG$ginc[age]-drag; if(C<0)C<-0; if(C>cap)C<-cap
    if(reg$type=="clearcut"){ if(age>=reg$R){C<-GINCG$hyb[REGEN_AGE]; age<-REGEN_AGE} }
    else { if(floor(age/reg$E)>floor((age-1)/reg$E)) C<-(1-reg$f)*C }
    tr[t+1]<-C }
  tr[oidx]
}
for(i in seq_len(nrow(v))){h<-geth(v$abbr[i],v$cell[i]); if(is.null(h))next
  st<-v$abbr[i]; a0<-v$STDAGE[i]; Astar<-h[5]; ar<-v$area_ha[i]; ftg<-v$ft_group[i]; cl<-v$cell[i]
  cap<-cap_of(cl,ftg,st); mfun<-getm(st); k<-paste(v$prov_code[i],ftg,sep="|"); pdist<-getp(k); sev<-gets(k)
  maxage<-a0+HOR; AG<-1:maxage
  HYBG<-hyb(AG,h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; HYBG[!is.finite(HYBG)|HYBG<0]<-0
  HINCG<-c(HYBG[1],diff(HYBG)); GOBSG<-gpv(cl,ftg,st,AG); W<-pmax(0,pmin(1,(Astar-AG)/Astar))
  GINCG<-list(hyb=HYBG, ginc=pmax(W*GOBSG+(1-W)*HINCG,0))
  for(rg in REGIMES){reg<-SCEN[[rg]][[v$own[i]]]
    for(a in ARMS){ res[[paste(rg,a,sep="@")]][st,]<-res[[paste(rg,a,sep="@")]][st,]+run(GINCG,Astar,reg,cap,pdist,sev,mfun,a,a0)*ar/1e6 } }
  area[st]<-area[st]+ar
}
## ratios
outl<-list()
for(rg in REGIMES){base<-res[[paste(rg,"baseline",sep="@")]]
  for(si in seq_along(states)){st<-states[si]; b<-base[si,]
    outl[[length(outl)+1]]<-data.frame(state=st,regime=rg,year=TM_BASE+offs,
      dist_moderate=round(ifelse(b>0,res[[paste(rg,"dist_mod",sep="@")]][si,]/b,1),5),
      dist_severe  =round(ifelse(b>0,res[[paste(rg,"dist_sev",sep="@")]][si,]/b,1),5),
      mort_1p5x    =round(ifelse(b>0,res[[paste(rg,"mort15",sep="@")]][si,]/b,1),5),
      mort_2x      =round(ifelse(b>0,res[[paste(rg,"mort20",sep="@")]][si,]/b,1),5),row.names=NULL)}}
ratio<-do.call(rbind,outl); write.csv(ratio,file.path(dd,"managed_stress_ratio_bystate.csv"),row.names=FALSE)
cat("[mgmt] CONUS by regime (baseline t100 Tg, dist2x %, mort2x %):\n")
for(rg in REGIMES){b<-sum(res[[paste(rg,"baseline",sep="@")]][,length(offs)]); d<-sum(res[[paste(rg,"dist_mod",sep="@")]][,length(offs)]); m<-sum(res[[paste(rg,"mort20",sep="@")]][,length(offs)])
  cat(sprintf("  %-12s base=%.0f  dist2x=%+.1f%%  mort2x=%+.1f%%\n",rg,b,100*(d/b-1),100*(m/b-1)))}
cat("[mgmt] wrote managed_stress_ratio_bystate.csv (3 regimes)\n")
