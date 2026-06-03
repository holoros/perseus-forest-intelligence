## ycx_fia_hybrid_fullseries_vec.R
## Vectorized rewrite of ycx_fia_hybrid_fullseries.R. Identical numeric semantics
## (hybrid form, agedist+ceiling recal kernel, raster disturbance + GRM mortality,
## owner-rotation harvest, uniform-grid A0 anchoring) but every regime x arm pass is a
## fully vectorized 100-year march over the CONUS plot vector instead of a per-plot
## scalar loop. Produces the same 12-bucket per-state AGC series on the FIA-plot basis.
## Output: treemap/recal_cell/fia_hybrid_fullseries_agc.csv (state,scenario,year,value,lo,hi)
## Usage: Rscript ycx_fia_hybrid_fullseries_vec.R [out_dir] [fia_tgagc.csv] [GRM_PLT]
out <- if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
TGF <- if(length(commandArgs(TRUE))>=2) commandArgs(TRUE)[2] else file.path(out,"fia_tgagc.csv")
GRM <- if(length(commandArgs(TRUE))>=3) commandArgs(TRUE)[3] else "/fs/scratch/PUOM0008/crsfaaron/RD_growth_GRM/run_10416499/GRM.PLT_20260524_job10416499.csv"
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); rd<-file.path(td,"recal_cell"); dd<-file.path(td,"disturb"); dir.create(rd,showWarnings=FALSE,recursive=TRUE)
fia<-"/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
offs<-seq(0,100,10); TM_BASE<-2025L; LBAC_TO_MGHA<-0.00045359237*2.4710538; BIN<-10L; MIN_CELL<-50L; MIN_FT<-80L; MIN_ST<-200L; REGEN_AGE<-5L; HOR<-100L
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
FIPS2ABBR<-setNames(names(ABBR2FIPS),as.character(ABBR2FIPS))
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))
REG<-list(Industrial=list(type="clearcut",R=45),NIPF=list(type="partial",E=20,f=0.30),State=list(type="partial",E=25,f=0.25),`Public-Other`=list(type="partial",E=30,f=0.15)); DEF_REG<-"NIPF"
scale_reg<-function(reg,sr,sf) lapply(reg,function(x){ if(x$type=="clearcut") list(type="clearcut",R=max(10,round(x$R*sr))) else list(type="partial",E=max(5,round(x$E*sr)),f=min(0.9,x$f*sf)) })
SCEN<-list(reserve=NULL, harvest=REG, intensive=scale_reg(REG,0.7,1.3), conservation=scale_reg(REG,1.6,0.5))
t0<-Sys.time(); pc<-function(...){cat(sprintf("[%5.0fs] ",as.numeric(difftime(Sys.time(),t0,units="secs"))));cat(sprintf(...));flush(stdout())}

## ---- g_obs kernel + ceiling (identical to loop version) ----
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
INC<-do.call(rbind,incr); pc("kernel data: %d remeas rows\n",nrow(INC))
binfit<-function(age,grow){b<-BIN*(age%/%BIN)+BIN/2; m<-tapply(grow,b,mean,na.rm=TRUE); ab<-as.numeric(names(m)); o<-order(ab); ab<-ab[o]; m<-as.numeric(m[o]); if(length(m)>=3){ms<-stats::filter(m,rep(1/3,3));ms[is.na(ms)]<-m[is.na(ms)];m<-as.numeric(ms)}; approxfun(ab,pmax(m,0),rule=2)}
M<-local({nat<-binfit(INC$age,INC$grow); st<-list();for(s in unique(INC$state)){x<-INC[INC$state==s,];if(nrow(x)>=MIN_ST)st[[s]]<-binfit(x$age,x$grow)}; ft<-list();for(f in unique(INC$ft)){x<-INC[INC$ft==f,];if(nrow(x)>=MIN_FT)ft[[f]]<-binfit(x$age,x$grow)}; ce<-list();ct<-table(INC$cell);for(c0 in names(ct)[ct>=MIN_CELL]){x<-INC[INC$cell==c0,];ce[[c0]]<-binfit(x$age,x$grow)}; list(nat=nat,st=st,ft=ft,ce=ce)})
q95<-function(x)as.numeric(quantile(x,0.95,na.rm=TRUE))
CEce<-tapply(INC$stand,INC$cell,q95); CEft<-tapply(INC$stand,INC$ft,q95); CEst<-tapply(INC$stand,INC$state,q95); CEna<-q95(INC$stand)
cap_of<-function(cell,ftg,st){v<-CEce[cell];if(is.na(v))v<-CEft[ftg];if(is.na(v))v<-CEst[st];if(is.na(v))v<-CEna;as.numeric(v)}
## disturbance params (raster) + GRM m(C)
rp<-read.csv(file.path(dd,"disturb_params_raster.csv"),stringsAsFactors=FALSE); rp$k<-paste(rp$prov,rp$ft,sep="|")
DP<-setNames(rp$p_dist_ann,rp$k); DS<-setNames(rp$sev,rp$k); p_nat<-mean(rp$p_dist_ann); s_nat<-mean(rp$sev)
getp<-function(k){v<-as.numeric(DP[k]);v[is.na(v)]<-p_nat;v}; gets<-function(k){v<-as.numeric(DS[k]);v[is.na(v)]<-s_nat;v}
g<-read.csv(GRM,stringsAsFactors=FALSE); num<-function(x)suppressWarnings(as.numeric(x))
g$Ct<-num(g$CARB)*LBAC_TO_MGHA; g$mm<-num(g$dCARB.MORT.t.ha.yr); g$rmv<-num(g$dCARB.REMV.t.ha.yr); g$rem<-num(g$REMPER); g$abbr<-FIPS2ABBR[as.character(as.integer(g$STATECD))]
g<-g[is.finite(g$Ct)&g$Ct>0&is.finite(g$mm)&is.finite(g$rmv)&is.finite(g$rem)&g$rem>=3&g$rem<=15&g$rmv<=0.01&!is.na(g$abbr),]
BRm<-c(0,seq(10,300,by=20),Inf); fitm<-function(df){b<-cut(df$Ct,BRm); mid<-tapply(df$Ct,b,mean); mm<-tapply(df$mm,b,mean); ok<-is.finite(mid)&is.finite(mm); if(sum(ok)<3)return(NULL); approxfun(mid[ok],pmax(mm[ok],0),rule=2)}
mNAT<-fitm(g); mST<-list(); for(s in unique(g$abbr)){x<-g[g$abbr==s,]; if(nrow(x)>=300){f<-fitm(x); if(!is.null(f))mST[[s]]<-f}}
## hybrid fits
H<-list();for(st in names(ABBR2FIPS)){fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp))next
  f<-read.csv(fp,stringsAsFactors=FALSE); if("response"%in%names(f))f<-f[f$response=="carbon_lbac",]
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key); if(is.null(H[[id]]))H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)}}
geth<-function(st,cell){k<-H[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); H[[paste0(st,"@@state")]]}
pc("kernels built; assembling plot table\n")

## ---- assemble global per-plot vectors ----
acc<-list()
for(st in names(ABBR2FIPS)){mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); if(!file.exists(mf))next
  mem<-read.csv(mf,colClasses="character"); mem$STDAGE<-suppressWarnings(as.numeric(mem$STDAGE)); mem<-mem[!duplicated(mem$PLT_CN)&is.finite(mem$STDAGE)&mem$STDAGE>0,]
  if(!nrow(mem))next
  cl<-paste(mem$ft_group,mem$prov_code,mem$owner4,sep="|"); ftg<-mem$ft_group
  hp<-lapply(seq_len(nrow(mem)),function(i)geth(st,cl[i])); ok<-!vapply(hp,is.null,logical(1))
  if(!any(ok))next; mem<-mem[ok,,drop=FALSE]; cl<-cl[ok]; ftg<-ftg[ok]; hm<-do.call(rbind,hp[ok])
  gk<-ifelse(cl%in%names(M$ce),paste0("ce|",cl), ifelse(ftg%in%names(M$ft),paste0("ft|",ftg), ifelse(st%in%names(M$st),paste0("st|",st),"nat")))
  mk<-if(!is.null(mST[[st]]))st else "@nat"
  ow<-ifelse(mem$owner4%in%names(REG),mem$owner4,DEF_REG)
  capv<-vapply(seq_len(nrow(mem)),function(i)cap_of(cl[i],ftg[i],st),numeric(1))
  kk<-paste(mem$prov_code,ftg,sep="|")
  acc[[st]]<-data.frame(state=st,a0=mem$STDAGE,A=hm[,1],k=hm[,2],p=hm[,3],d=hm[,4],As=hm[,5],
    cap=capv,pdist=getp(kk),sev=gets(kk),gkey=gk,mkey=mk,own=ow,stringsAsFactors=FALSE)}
P<-do.call(rbind,acc); rm(acc,incr); NP<-nrow(P); pc("plot table: %d plots, %d states\n",NP,length(unique(P$state)))

## ---- precompute lookup grids ----
MAXAGE<-as.integer(max(P$a0)+HOR+2L)
gkeys<-sort(unique(P$gkey)); GG<-matrix(0,length(gkeys),MAXAGE,dimnames=list(gkeys,NULL))
gres<-function(gk){ if(gk=="nat")return(M$nat); pr<-substr(gk,1,2); v<-sub("^..\\|","",gk)
  if(pr=="ce")M$ce[[v]] else if(pr=="ft")M$ft[[v]] else M$st[[v]] }
for(gk in gkeys){f<-gres(gk); GG[gk,]<-f(1:MAXAGE)}
P$gid<-match(P$gkey,gkeys)
mkeys<-sort(unique(P$mkey)); CMAX<-800L; MG<-matrix(0,length(mkeys),CMAX+1L,dimnames=list(mkeys,NULL))
for(mk in mkeys){f<-if(mk=="@nat")mNAT else mST[[mk]]; MG[mk,]<-f(0:CMAX)}
P$mid<-match(P$mkey,mkeys)
states<-sort(unique(P$state)); P$sid<-match(P$state,states); NST<-length(states)
## per-plot static vectors
a0<-P$a0; Av<-P$A; kv<-P$k; pv<-P$p; dv<-P$d; Asv<-P$As; capv<-P$cap; pdistv<-P$pdist; sevv<-P$sev
gid<-P$gid; mid<-P$mid; sid<-P$sid; ownv<-P$own
C0<-pmax(hyb(a0,Av,kv,pv,dv,Asv)*LBAC_TO_MGHA,0)         # t0 density (Mg/ha)
Hregen<-pmax(hyb(REGEN_AGE,Av,kv,pv,dv,Asv)*LBAC_TO_MGHA,0)
sidf<-factor(sid,levels=1:NST)
pc("grids: MAXAGE=%d, %d gfuncs, %d mfuncs\n",MAXAGE,length(gkeys),length(mkeys))

## helper: per-plot regime param vectors for a regime list
regvecs<-function(rg){ R<-rep(NA_real_,NP); E<-rep(NA_real_,NP); f<-rep(0,NP); ty<-rep("none",NP)
  if(is.null(SCEN[[rg]]))return(list(ty=ty,R=R,E=E,f=f))
  for(o in names(REG)){ix<-ownv==o; rr<-SCEN[[rg]][[o]]; if(rr$type=="clearcut"){ty[ix]<-"clearcut";R[ix]<-rr$R}else{ty[ix]<-"partial";E[ix]<-rr$E;f[ix]<-rr$f}}
  list(ty=ty,R=R,E=E,f=f) }

ARMS<-c("base","distmod","distsev","mort15","mort20"); REGIMES<-names(SCEN)
oset<-offs                 # capture years 0,10,...,100
SUMG<-array(0,dim=c(NST,length(REGIMES)*length(ARMS),length(offs)))
keyidx<-as.vector(outer(REGIMES,ARMS,function(a,b)paste(a,b,sep="@"))); dimnames(SUMG)<-list(states,keyidx,NULL)

## vectorized projection of one (regime,arm) pass over all plots
project<-function(rg,arm){
  rv<-regvecs(rg); ty<-rv$ty; Rc<-rv$R; Ec<-rv$E; fc<-rv$f
  isC<-ty=="clearcut"; isP<-ty=="partial"
  C<-C0; age<-a0; capt<-matrix(0,NP,length(offs)); capt[,1]<-C; oi<-2L
  for(t in 1:HOR){ age<-age+1
    ai<-pmin(pmax(age,1L),MAXAGE)
    gob<-GG[cbind(gid,ai)]
    hin<-hyb(age,Av,kv,pv,dv,Asv)*LBAC_TO_MGHA - hyb(age-1,Av,kv,pv,dv,Asv)*LBAC_TO_MGHA
    w<-pmax(0,pmin(1,(Asv-age)/Asv)); ginc<-pmax(w*gob+(1-w)*hin,0)
    drag<-switch(arm,
      base=0,
      distmod=2*pdistv*sevv*C,
      distsev=3*pdistv*sevv*C,
      mort15=0.5*MG[cbind(mid,pmin(pmax(round(C),0),CMAX)+1L)],
      mort20=1.0*MG[cbind(mid,pmin(pmax(round(C),0),CMAX)+1L)])
    C<-C+ginc-drag; C[C<0]<-0; ov<-C>capv; C[ov]<-capv[ov]
    if(any(isC)){ hit<-isC & age>=Rc; if(any(hit)){C[hit]<-Hregen[hit]; age[hit]<-REGEN_AGE} }
    if(any(isP)){ hp<-isP & (age%%Ec==0); if(any(hp))C[hp]<-(1-fc[hp])*C[hp] }
    if(t%%10==0){ capt[,oi]<-C; oi<-oi+1L } }
  ## sum density by state at each offset
  apply(capt,2,function(col)as.numeric(rowsum(col,sidf,reorder=FALSE)))
}
for(rg in REGIMES){ for(arm in ARMS){ key<-paste(rg,arm,sep="@")
  SUMG[,key,]<-project(rg,arm); pc("done %s\n",key) } }

## ---- A0 anchoring (reserve@base t0) ----
tg<-read.csv(TGF,stringsAsFactors=FALSE); TG<-setNames(tg$tg_agc,tg$state)
d0<-SUMG[,"reserve@base",1]; names(d0)<-states
A0<-rep(NA_real_,NST); names(A0)<-states
for(st in states){if(!is.na(TG[st])&&d0[st]>0)A0[st]<-TG[st]*1e6/d0[st]}
A0med<-median(A0,na.rm=TRUE); A0f<-ifelse(is.na(A0),A0med,A0)
pc("A0: %d anchored states, median %.0f ha/plot\n",sum(!is.na(A0)),A0med)

## ---- assemble 12 buckets per state, AGC Tg ----
BUCK<-list(
 "reserve (no harvest)"=c("reserve@base","reserve@base","reserve@base"),
 "reserve (no harvest, disturbance-exposed)"=c("reserve@distmod","reserve@distsev","reserve@base"),
 "reserve (no harvest, mortality-stressed)"=c("reserve@mort15","reserve@mort20","reserve@base"),
 "managed (harvest)"=c("harvest@base","harvest@base","harvest@base"),
 "managed (harvest, disturbance-exposed)"=c("harvest@distmod","harvest@distsev","harvest@base"),
 "managed (harvest, mortality-stressed)"=c("harvest@mort15","harvest@mort20","harvest@base"),
 "managed (intensive)"=c("intensive@base","intensive@base","intensive@base"),
 "managed (intensive, disturbance-exposed)"=c("intensive@distmod","intensive@distsev","intensive@base"),
 "managed (intensive, mortality-stressed)"=c("intensive@mort15","intensive@mort20","intensive@base"),
 "managed (conservation)"=c("conservation@base","conservation@base","conservation@base"),
 "managed (conservation, disturbance-exposed)"=c("conservation@distmod","conservation@distsev","conservation@base"),
 "managed (conservation, mortality-stressed)"=c("conservation@mort15","conservation@mort20","conservation@base"))
rows<-list()
for(si in seq_along(states)){st<-states[si]; a0s<-A0f[st]
  for(bk in names(BUCK)){kk<-BUCK[[bk]]
    v<-SUMG[si,kk[1],]*a0s/1e6; lo<-SUMG[si,kk[2],]*a0s/1e6; hi<-SUMG[si,kk[3],]*a0s/1e6
    rows[[length(rows)+1]]<-data.frame(state=st,scenario=bk,year=TM_BASE+offs,value=round(v,4),lo=round(lo,4),hi=round(hi,4),row.names=NULL)}}
res<-do.call(rbind,rows); write.csv(res,file.path(rd,"fia_hybrid_fullseries_agc.csv"),row.names=FALSE)
rr<-aggregate(value~scenario+year,res,sum); r0<-rr[rr$year==2025,]; r100<-rr[rr$year==2125,]
cat("[full] CONUS AGC hybrid+recal by scenario (t0 -> t100 Tg, %):\n")
for(bk in names(BUCK)){a<-r0$value[r0$scenario==bk]; b<-r100$value[r100$scenario==bk]; cat(sprintf("  %-46s %6.0f -> %6.0f  %+6.1f%%\n",bk,a,b,100*(b/a-1)))}
pc("wrote fia_hybrid_fullseries_agc.csv (%d rows)\n",nrow(res))
