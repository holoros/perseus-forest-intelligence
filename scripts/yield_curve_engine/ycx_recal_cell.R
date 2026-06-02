## ycx_recal_cell.R  (cell-level production recalibration + stress tests; read-only)
##
## Production version of the ADR-0002 recalibration: fit the observed FIA
## longitudinal net-increment-vs-age g_obs at the ft x eco x owner CELL level
## (fallback cell -> ft_group -> state -> national), re-project the TreeMap-2022
## reserve, and run the robustness battery the prototype did not:
##   (A) 5-fold CV of g_obs vs the hybrid chronosequence increment on held-out plots
##   (B) weight-scheme sensitivity: age-distance / time-gated-20yr / full-to-Astar
##   (C) physical ceiling: corrected standing density capped at the cell's
##       95th-percentile observed standing AGC (no projecting beyond what FIA sees)
##   (D) senescence-preservation check: pixels with age >= Astar must be unchanged
##   (E) bootstrap uncertainty band on CONUS t100 (resample plots, refit, reproject)
##
## Writes ONLY to treemap/recal_cell/. No production series / fia.json / merge.
## Usage: Rscript ycx_recal_cell.R [out_dir] [VAT_path] [n_boot]

suppressMessages({library(foreign)})
args<-commandArgs(TRUE)
out <- if(length(args)>=1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
VAT <- if(length(args)>=2) args[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
NB  <- if(length(args)>=3) as.integer(args[3]) else 40L
cfg <- file.path(out,"config"); td <- file.path(out,"treemap")
rd  <- file.path(td,"recal_cell"); dir.create(rd,showWarnings=FALSE,recursive=TRUE)
fia <- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
TM_BASE<-2022L; offs<-seq(0,100,10); LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09
set.seed(20260602)
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
FIPS2ABBR <- setNames(names(ABBR2FIPS), as.character(ABBR2FIPS))
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))
BIN<-10L; MIN_CELL<-50L; MIN_FT<-80L; MIN_ST<-200L

## ---------- remeasurement increments WITH cell keys ----------
rm <- read.csv(file.path(fia,"plot_remeas.csv"), colClasses="character"); rm$REMPER<-suppressWarnings(as.numeric(rm$REMPER))
agc_of <- function(abbr){
  fp<-file.path(fia,sprintf("%d_TREE.csv",ABBR2FIPS[[abbr]])); if(!file.exists(fp)) return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); idx<-match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"),hdr)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp))
  t<-read.csv(tmp,stringsAsFactors=FALSE); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD)); for(c0 in c("CARBON_AG","TPA_UNADJ")) t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t<-t[!is.na(t$STATUSCD)&t$STATUSCD==1,]
  a<-aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN,data=t,FUN=sum,na.rm=TRUE); names(a)[2]<-"agc"; a$PLT_CN<-as.character(a$PLT_CN); a
}
incr<-list()
for (st in names(ABBR2FIPS)) {
  mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); if(!file.exists(mf)) next
  mem<-read.csv(mf,colClasses="character")
  ft<-setNames(mem$ft_group,mem$PLT_CN); pv<-setNames(mem$prov_code,mem$PLT_CN); ow<-setNames(mem$owner4,mem$PLT_CN)
  trt<-setNames(mem$treatment,mem$PLT_CN); age<-setNames(suppressWarnings(as.numeric(mem$STDAGE)),mem$PLT_CN)
  ac<-agc_of(st); if(is.null(ac)) next; ci<-setNames(ac$agc,ac$PLT_CN)
  d<-rm[rm$STATECD==as.character(ABBR2FIPS[[st]]),]
  d$c1<-ci[d$PREV_PLT_CN]; d$c2<-ci[d$CN]; d$age<-age[d$CN]; d$trt<-trt[d$CN]
  d<-d[is.finite(d$c1)&is.finite(d$c2)&is.finite(d$REMPER)&d$REMPER>=3&d$REMPER<=15 & d$c1>0 & d$trt=="untreated" & is.finite(d$age) & d$age>0,]
  if(nrow(d)){
    cell<-paste(ft[d$CN],pv[d$CN],ow[d$CN],sep="|")
    incr[[st]]<-data.frame(state=st,cell=cell,ft=ft[d$CN],age=d$age,
       grow=(d$c2-d$c1)/d$REMPER*LBAC_TO_MGHA, stand=d$c1*LBAC_TO_MGHA, stringsAsFactors=FALSE)
  }
}
INC<-do.call(rbind,incr); rownames(INC)<-NULL
cat(sprintf("[cell] increments: %d plots, %d cells, %d ft-groups, %d states\n",
  nrow(INC),length(unique(INC$cell)),length(unique(INC$ft)),length(unique(INC$state))))

## ---------- hierarchical binned smoother builder ----------
binfit <- function(age,grow){
  b<-BIN*(age%/%BIN)+BIN/2; m<-tapply(grow,b,mean,na.rm=TRUE); ab<-as.numeric(names(m))
  o<-order(ab); ab<-ab[o]; m<-as.numeric(m[o])
  if(length(m)>=3){ ms<-stats::filter(m,rep(1/3,3)); ms[is.na(ms)]<-m[is.na(ms)]; m<-as.numeric(ms) }
  approxfun(ab, pmax(m,0), rule=2)
}
build_models <- function(df){
  nat<-binfit(df$age,df$grow)
  st<-list(); for(s in unique(df$state)){x<-df[df$state==s,]; if(nrow(x)>=MIN_ST) st[[s]]<-binfit(x$age,x$grow)}
  ft<-list(); for(f in unique(df$ft)){x<-df[df$ft==f,]; if(nrow(x)>=MIN_FT) ft[[f]]<-binfit(x$age,x$grow)}
  ce<-list(); ct<-table(df$cell); big<-names(ct)[ct>=MIN_CELL]
  for(c0 in big){x<-df[df$cell==c0,]; ce[[c0]]<-binfit(x$age,x$grow)}
  list(nat=nat,st=st,ft=ft,ce=ce)
}
gpred <- function(M,cell,ftg,st,a){
  f<-M$ce[[cell]]; if(!is.null(f)) return(f(a))
  f<-M$ft[[ftg]];  if(!is.null(f)) return(f(a))
  f<-M$st[[st]];   if(!is.null(f)) return(f(a))
  M$nat(a)
}
M<-build_models(INC)
cat(sprintf("[cell] g_obs models: %d cell, %d ft, %d state, +national\n",length(M$ce),length(M$ft),length(M$st)))

## physical ceiling per cell (95th pct observed standing AGC), fallback ft/state/national
ceil_of <- function(df){
  q<-function(x) as.numeric(quantile(x,0.95,na.rm=TRUE))
  ce<-tapply(df$stand,df$cell,q); ft<-tapply(df$stand,df$ft,q); st<-tapply(df$stand,df$state,q); na<-q(df$stand)
  list(ce=ce,ft=ft,st=st,na=na)
}
CEIL<-ceil_of(INC)
cap_of<-function(cell,ftg,st){ v<-CEIL$ce[cell]; if(is.na(v))v<-CEIL$ft[ftg]; if(is.na(v))v<-CEIL$st[st]; if(is.na(v))v<-CEIL$na; as.numeric(v) }

## ---------- (A) 5-fold CV: g_obs cell-pred vs hybrid increment ----------
## hybrid increment proxy at age a = analytic dC/da of the cell's hybrid fit
H<-list()
for(st in unique(INC$state)){ fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp)) next
  f<-read.csv(fp,stringsAsFactors=FALSE); if("response"%in%names(f)) f<-f[f$response=="carbon_lbac",]
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key)
    if(is.null(H[[id]])) H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)} }
geth<-function(st,cell){k<-H[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); H[[paste0(st,"@@state")]]}
hinc_at<-function(st,cell,a){h<-geth(st,cell); if(is.null(h))return(NA_real_)
  (hyb(a+0.5,h[1],h[2],h[3],h[4],h[5])-hyb(a-0.5,h[1],h[2],h[3],h[4],h[5]))*LBAC_TO_MGHA}
fold<-sample(rep(1:5,length.out=nrow(INC)))
se_g<-se_h<-0; n_cv<-0L
for(k in 1:5){
  tr<-INC[fold!=k,]; te<-INC[fold==k,]; Mk<-build_models(tr)
  pg<-mapply(function(c0,fg,s,a) gpred(Mk,c0,fg,s,a), te$cell,te$ft,te$state,te$age)
  ph<-mapply(function(s,c0,a) hinc_at(s,c0,a), te$state,te$cell,te$age)
  ok<-is.finite(pg)&is.finite(ph)&is.finite(te$grow)
  se_g<-se_g+sum((pg[ok]-te$grow[ok])^2); se_h<-se_h+sum((ph[ok]-te$grow[ok])^2); n_cv<-n_cv+sum(ok)
}
rmse_g<-sqrt(se_g/n_cv); rmse_h<-sqrt(se_h/n_cv)
cat(sprintf("\n[A][CV] held-out increment RMSE (MgC/ha/yr): g_obs %.3f  vs hybrid-chronoseq %.3f  (%.0f%% lower)\n",
  rmse_g,rmse_h,100*(1-rmse_g/rmse_h)))

## ---------- load TreeMap pixels + memberships ----------
v<-read.dbf(VAT,as.is=TRUE); names(v)<-toupper(names(v)); v<-v[,intersect(c("PLT_CN","COUNT"),names(v))]
v$PLT_CN<-sub("\\.0+$","",format(v$PLT_CN,scientific=FALSE,trim=TRUE))
mf<-list.files(cfg,pattern="^ycx_membership_.*\\.csv$",full.names=TRUE)
mem<-do.call(rbind,lapply(mf,function(f){d<-read.csv(f,colClasses="character"); d[,c("PLT_CN","STATECD","ft_group","prov_code","owner4","STDAGE")]}))
mem<-mem[!duplicated(mem$PLT_CN),]; mem$STDAGE<-suppressWarnings(as.numeric(mem$STDAGE))
key<-match(v$PLT_CN,mem$PLT_CN); v<-v[!is.na(key),]; mm<-mem[key[!is.na(key)],]
v<-cbind(v,mm[,c("STATECD","ft_group","prov_code","owner4","STDAGE")]); v<-v[is.finite(v$STDAGE)&v$STDAGE>0,]
v$abbr<-FIPS2ABBR[as.character(as.integer(v$STATECD))]; v<-v[!is.na(v$abbr),]
v$cell<-paste(v$ft_group,v$prov_code,v$owner4,sep="|"); v$area_ha<-v$COUNT*PIX_HA
states<-sort(unique(v$abbr)); HOR<-100; oidx<-match(offs,0:HOR)

## ---------- projection engine (returns state x offs matrices) ----------
project <- function(M, weight=c("agedist","time20","full"), use_ceiling=FALSE){
  weight<-match.arg(weight)
  res_h<-matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs)))
  res_r<-res_h; area<-setNames(numeric(length(states)),states)
  for(i in seq_len(nrow(v))){
    h<-geth(v$abbr[i],v$cell[i]); if(is.null(h)) next
    st<-v$abbr[i]; a0<-v$STDAGE[i]; Astar<-h[5]; ar<-v$area_ha[i]; ftg<-v$ft_group[i]; cl<-v$cell[i]
    ages<-a0+(0:HOR)
    dens_h<-hyb(ages,h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; dens_h[!is.finite(dens_h)|dens_h<0]<-0
    hinc<-diff(dens_h)
    go<-gpred(M,cl,ftg,st,ages[-1])
    ga<-ages[-1]
    w <- switch(weight,
      agedist = pmax(0,pmin(1,(Astar-ga)/Astar)),
      time20  = pmax(0,pmin(1,(20-(0:(HOR-1)))/20)) * as.numeric(ga<Astar),
      full    = as.numeric(ga<Astar))
    cinc<-pmax(w*go+(1-w)*hinc, 0)
    dens_r<-c(dens_h[1], dens_h[1]+cumsum(cinc))
    if(use_ceiling){cap<-cap_of(cl,ftg,st); dens_r<-pmin(dens_r,cap)}
    res_h[st,]<-res_h[st,]+dens_h[oidx]*ar/1e6
    res_r[st,]<-res_r[st,]+dens_r[oidx]*ar/1e6
    area[st]<-area[st]+ar
  }
  list(h=res_h,r=res_r,area=area)
}

obs<-read.csv(file.path(td,"obs_growth_by_state.csv"),stringsAsFactors=FALSE)
score<-function(P){
  ch<-colSums(P$h); cr<-colSums(P$r)
  gh<-(P$h[,2]-P$h[,1])/10/P$h[,1]*100; gr<-(P$r[,2]-P$r[,1])/10/P$r[,1]*100
  m<-merge(obs[,c("state","growth_pct_yr")],data.frame(state=states,gh=gh,gr=gr),by="state")
  list(t0=ch[1],t100h=ch[length(offs)],t100r=cr[length(offs)],
       bias_h=mean(m$gh-m$growth_pct_yr),bias_r=mean(m$gr-m$growth_pct_yr),
       r_h=cor(m$gh,m$growth_pct_yr),r_r=cor(m$gr,m$growth_pct_yr),
       cr=cr,ch=ch)
}

## ---------- (B) weight sensitivity + (C) ceiling + (D) senescence ----------
variants<-list(
  agedist        = project(M,"agedist",FALSE),
  agedist_capped = project(M,"agedist",TRUE),
  time20         = project(M,"time20",FALSE),
  full           = project(M,"full",FALSE))
cat("\n[B/C] weight & ceiling sensitivity (CONUS reserve, Tg C):\n")
cat(sprintf("  %-16s  t0     t100h   t100r   gain_r%%  bias_r  r_r\n",""))
S<-list()
for(nm in names(variants)){ s<-score(variants[[nm]]); S[[nm]]<-s
  cat(sprintf("  %-16s  %5.0f  %6.0f  %6.0f  %+6.1f  %+5.2f  %.2f\n",
    nm,s$t0,s$t100h,s$t100r,100*(s$t100r/s$t0-1),s$bias_r,s$r_r)) }
cat(sprintf("  %-16s  %5.0f  %6.0f  %6s  %+6.1f  %+5.2f  %.2f   (uncorrected hybrid)\n",
  "hybrid",S[["agedist"]]$t0,S[["agedist"]]$t100h,"-",100*(S[["agedist"]]$t100h/S[["agedist"]]$t0-1),
  S[["agedist"]]$bias_h,S[["agedist"]]$r_h))

## (D) senescence preservation: any pixel age>=Astar must have dens_r==dens_h
nbad<-0L; ntest<-0L
for(i in sample(seq_len(nrow(v)), min(20000,nrow(v)))){
  h<-geth(v$abbr[i],v$cell[i]); if(is.null(h)) next
  a0<-v$STDAGE[i]; Astar<-h[5]; if(a0<Astar) next; ntest<-ntest+1L
  ages<-a0+(0:HOR); dens_h<-hyb(ages,h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; dens_h[!is.finite(dens_h)|dens_h<0]<-0
  hinc<-diff(dens_h); go<-gpred(M,v$cell[i],v$ft_group[i],v$abbr[i],ages[-1])
  w<-pmax(0,pmin(1,(Astar-ages[-1])/Astar)); cinc<-pmax(w*go+(1-w)*hinc,0)
  dens_r<-c(dens_h[1],dens_h[1]+cumsum(cinc)); if(max(abs(dens_r-dens_h))>1e-9) nbad<-nbad+1L
}
cat(sprintf("\n[D] senescence preservation: %d/%d already-culminated pixels unchanged (bad=%d)\n",ntest-nbad,ntest,nbad))

## ---------- (E) bootstrap CONUS t100 band (agedist, primary) ----------
plots<-seq_len(nrow(INC)); bt<-numeric(NB)
for(b in 1:NB){
  idx<-sample(plots,replace=TRUE); Mb<-build_models(INC[idx,])
  Pb<-project(Mb,"agedist",FALSE); bt[b]<-sum(Pb$r[,length(offs)])
}
qb<-quantile(bt,c(0.025,0.5,0.975))
cat(sprintf("\n[E] bootstrap CONUS reserve t100 (NB=%d): median %.0f  95%% CI [%.0f, %.0f] Tg C\n",NB,qb[2],qb[1],qb[3]))

## ---------- write primary outputs (agedist) ----------
P<-variants[["agedist"]]; sp<-score(P)
long<-do.call(rbind,lapply(states,function(st) data.frame(state=st,year=TM_BASE+offs,
  hybrid_Tg=round(P$h[st,],3),recal_Tg=round(P$r[st,],3),area_Mha=round(P$area[st]/1e6,4),row.names=NULL)))
write.csv(long,file.path(rd,"conus_recal_cell_100yr.csv"),row.names=FALSE)
sd<-data.frame(state=states,hybrid_t100=round(P$h[,length(offs)],1),recal_t100=round(P$r[,length(offs)],1),
  delta_Tg=round(P$r[,length(offs)]-P$h[,length(offs)],1),delta_pct=round(100*(P$r[,length(offs)]/P$h[,length(offs)]-1),1),row.names=NULL)
write.csv(sd[order(-sd$delta_Tg),],file.path(rd,"recal_cell_state_delta.csv"),row.names=FALSE)
val<-merge(obs[,c("state","growth_pct_yr")],data.frame(state=states,
  hybrid_pctyr=round((P$h[,2]-P$h[,1])/10/P$h[,1]*100,3),recal_pctyr=round((P$r[,2]-P$r[,1])/10/P$r[,1]*100,3)),by="state")
names(val)[2]<-"observed_pctyr"; write.csv(val,file.path(rd,"recal_cell_validation.csv"),row.names=FALSE)

## summary report
sink(file.path(rd,"recal_cell_report.txt"))
cat("ADR-0002 cell-level recalibration — stress-test report\n")
cat(sprintf("increments: %d plots; g_obs models: %d cell / %d ft / %d state / national\n",nrow(INC),length(M$ce),length(M$ft),length(M$st)))
cat(sprintf("[A] held-out increment RMSE: g_obs %.3f vs hybrid %.3f (%.0f%% lower)\n",rmse_g,rmse_h,100*(1-rmse_g/rmse_h)))
cat("[B/C] CONUS reserve by variant:\n")
for(nm in names(S)){s<-S[[nm]];cat(sprintf("  %-16s t0=%.0f t100=%.0f gain=%+.1f%% bias=%+.2f r=%.2f\n",nm,s$t0,s$t100r,100*(s$t100r/s$t0-1),s$bias_r,s$r_r))}
cat(sprintf("  hybrid           t0=%.0f t100=%.0f gain=%+.1f%% bias=%+.2f r=%.2f\n",S[["agedist"]]$t0,S[["agedist"]]$t100h,100*(S[["agedist"]]$t100h/S[["agedist"]]$t0-1),S[["agedist"]]$bias_h,S[["agedist"]]$r_h))
cat(sprintf("[D] senescence preserved: %d/%d (bad=%d)\n",ntest-nbad,ntest,nbad))
cat(sprintf("[E] bootstrap t100 median %.0f CI [%.0f, %.0f] Tg\n",qb[2],qb[1],qb[3]))
sink()
cat("\n[cell] wrote treemap/recal_cell/{conus_recal_cell_100yr,recal_cell_state_delta,recal_cell_validation,recal_cell_report}\n")
