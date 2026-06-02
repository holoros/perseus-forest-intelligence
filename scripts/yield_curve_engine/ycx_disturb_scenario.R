## ycx_disturb_scenario.R  (read-only)
##
## "Reserve (no harvest) WITH disturbance" decline scenario for the TreeMap-2022
## CONUS inventory. Decomposes growth into a clean UNDISTURBED kernel g_undist(age)
## (cell-level, fallback cell->ft->state->national) minus an explicit, dial-able
## disturbance carbon drag, so the no-management trajectory can plateau or DECLINE.
##
## Disturbance drag per pixel-year = p_dist(stratum) * MULT_freq * sev_live * density
##   p_dist     annual disturbance probability per ecoregion x ft (FIA COND)
##   sev_live   live-AGC fraction killed per event. Two settings:
##                obs  = FIA net-increment impact (very mild, conservative floor)
##                type = type-share-weighted live mortality (fire .55 insect .35
##                       disease .20 weather .15 animal .03 other .10)  [scenario]
##   MULT_freq  climate frequency multiplier (1 recent, 2, 3)
##
## Arms:
##   gross            no disturbance at all (pure undisturbed growth ceiling)
##   recent           MULT 1, sev obs    (reproduces observed all-plot net growth)
##   moderate(2x,type) MULT 2, sev type
##   severe(3x,type)   MULT 3, sev type
##
## Output: treemap/disturb/conus_disturb_arms_100yr.csv, disturb_state_netneg.csv,
##         disturb_scenario_summary.txt
## Usage: Rscript ycx_disturb_scenario.R [out_dir] [VAT]

suppressMessages({library(foreign)})
args<-commandArgs(TRUE)
out <- if(length(args)>=1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
VAT <- if(length(args)>=2) args[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dd<-file.path(td,"disturb")
fia<-"/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
TM_BASE<-2022L; offs<-seq(0,100,10); LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09
BIN<-10L; MIN_CELL<-50L; MIN_FT<-80L; MIN_ST<-200L
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
FIPS2ABBR<-setNames(names(ABBR2FIPS),as.character(ABBR2FIPS))
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))
dtype<-function(cd){cd<-as.integer(cd); ifelse(is.na(cd)|cd==0,"none",ifelse(cd<20,"insect",ifelse(cd<30,"disease",ifelse(cd<40,"fire",ifelse(cd<50,"animal",ifelse(cd<60,"weather","other"))))))}
SEV_TYPE<-c(fire=0.55,insect=0.35,disease=0.20,weather=0.15,animal=0.03,other=0.10)

## ---- remeasurement increments with disturbance flag + cell keys ----
rm<-read.csv(file.path(fia,"plot_remeas.csv"),colClasses="character"); rm$REMPER<-suppressWarnings(as.numeric(rm$REMPER))
agc_of<-function(fips){fp<-file.path(fia,sprintf("%d_TREE.csv",fips)); if(!file.exists(fp))return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); idx<-match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"),hdr)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp)); t<-read.csv(tmp); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD)); for(c0 in c("CARBON_AG","TPA_UNADJ"))t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t<-t[!is.na(t$STATUSCD)&t$STATUSCD==1,]; a<-aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN,t,sum,na.rm=TRUE); names(a)[2]<-"agc"; a$PLT_CN<-as.character(a$PLT_CN); a}
cond_of<-function(fips){fp<-file.path(fia,sprintf("%d_COND.csv",fips)); if(!file.exists(fp))return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); idx<-match(c("PLT_CN","CONDPROP_UNADJ","DSTRBCD1"),hdr); if(any(is.na(idx)))return(NULL)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp)); c<-read.csv(tmp); unlink(tmp)
  c$CONDPROP_UNADJ<-suppressWarnings(as.numeric(c$CONDPROP_UNADJ)); c$DSTRBCD1<-suppressWarnings(as.integer(c$DSTRBCD1))
  c<-c[is.finite(c$CONDPROP_UNADJ),]; c<-c[order(c$PLT_CN,-c$CONDPROP_UNADJ),]; c<-c[!duplicated(c$PLT_CN),]
  setNames(ifelse(is.na(c$DSTRBCD1),0L,c$DSTRBCD1),as.character(c$PLT_CN))}
incr<-list()
for(st in names(ABBR2FIPS)){mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); if(!file.exists(mf))next
  fips<-ABBR2FIPS[[st]]; mem<-read.csv(mf,colClasses="character")
  ft<-setNames(mem$ft_group,mem$PLT_CN); pv<-setNames(mem$prov_code,mem$PLT_CN); ow<-setNames(mem$owner4,mem$PLT_CN)
  trt<-setNames(mem$treatment,mem$PLT_CN); age<-setNames(suppressWarnings(as.numeric(mem$STDAGE)),mem$PLT_CN)
  ac<-agc_of(fips); if(is.null(ac))next; ci<-setNames(ac$agc,ac$PLT_CN); dc<-cond_of(fips)
  d<-rm[rm$STATECD==as.character(fips),]; d$c1<-ci[d$PREV_PLT_CN]; d$c2<-ci[d$CN]; d$age<-age[d$CN]; d$trt<-trt[d$CN]
  d$dcode<-if(is.null(dc))0L else dc[d$CN]; d$dcode[is.na(d$dcode)]<-0L
  d<-d[is.finite(d$c1)&is.finite(d$c2)&is.finite(d$REMPER)&d$REMPER>=3&d$REMPER<=15&d$c1>0&d$trt=="untreated"&is.finite(d$age)&d$age>0,]
  if(nrow(d))incr[[st]]<-data.frame(state=st,cell=paste(ft[d$CN],pv[d$CN],ow[d$CN],sep="|"),ft=ft[d$CN],prov=pv[d$CN],
    age=d$age,grow=(d$c2-d$c1)/d$REMPER*LBAC_TO_MGHA,stand=d$c1*LBAC_TO_MGHA,remper=d$REMPER,disturbed=as.integer(d$dcode>0),dtype=dtype(d$dcode),stringsAsFactors=FALSE)}
INC<-do.call(rbind,incr); rownames(INC)<-NULL
UND<-INC[INC$disturbed==0,]
cat(sprintf("[scn] increments %d (undisturbed %d)\n",nrow(INC),nrow(UND)))

binfit<-function(age,grow){b<-BIN*(age%/%BIN)+BIN/2; m<-tapply(grow,b,mean,na.rm=TRUE); ab<-as.numeric(names(m)); o<-order(ab); ab<-ab[o]; m<-as.numeric(m[o])
  if(length(m)>=3){ms<-stats::filter(m,rep(1/3,3)); ms[is.na(ms)]<-m[is.na(ms)]; m<-as.numeric(ms)}; approxfun(ab,pmax(m,0),rule=2)}
build<-function(df){nat<-binfit(df$age,df$grow)
  st<-list();for(s in unique(df$state)){x<-df[df$state==s,]; if(nrow(x)>=MIN_ST)st[[s]]<-binfit(x$age,x$grow)}
  ft<-list();for(f in unique(df$ft)){x<-df[df$ft==f,]; if(nrow(x)>=MIN_FT)ft[[f]]<-binfit(x$age,x$grow)}
  ce<-list();ct<-table(df$cell);for(c0 in names(ct)[ct>=MIN_CELL]){x<-df[df$cell==c0,];ce[[c0]]<-binfit(x$age,x$grow)}
  list(nat=nat,st=st,ft=ft,ce=ce)}
gp<-function(M,cell,ftg,st,a){f<-M$ce[[cell]];if(!is.null(f))return(f(a));f<-M$ft[[ftg]];if(!is.null(f))return(f(a));f<-M$st[[st]];if(!is.null(f))return(f(a));M$nat(a)}
Mg<-build(UND)   # GROSS undisturbed kernel
cat(sprintf("[scn] g_undist models: %d cell %d ft %d state\n",length(Mg$ce),length(Mg$ft),length(Mg$st)))

## disturbance params per ecoregion x ft (p_dist annual; type-weighted severity)
dp<-do.call(rbind,lapply(split(INC,interaction(INC$prov,INC$ft,drop=TRUE)),function(x){if(nrow(x)<30)return(NULL)
  ts<-prop.table(table(factor(x$dtype[x$disturbed==1],levels=names(SEV_TYPE))))
  sev<-sum(ts*SEV_TYPE[names(ts)],na.rm=TRUE)
  data.frame(prov=x$prov[1],ft=x$ft[1],p=mean(x$disturbed)/mean(x$remper),sev=ifelse(is.finite(sev)&sev>0,sev,0.25))}))
dkey<-function(prov,ft)paste(prov,ft,sep="|"); DP<-setNames(dp$p,dkey(dp$prov,dp$ft)); DS<-setNames(dp$sev,dkey(dp$prov,dp$ft))
p_nat<-mean(INC$disturbed)/mean(INC$remper)
getp<-function(prov,ft){v<-DP[dkey(prov,ft)]; if(is.na(v))p_nat else v}
gets<-function(prov,ft){v<-DS[dkey(prov,ft)]; if(is.na(v))0.25 else v}

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

## arms: list(mult_freq, sev_mode)  sev_mode: "none","obs","type"
ARMS<-list(gross=c(0,0), recent=c(1,1), moderate=c(2,2), severe=c(3,2))  # sev: 1=obs(floor .01), 2=type
SEV_OBS<-0.01
res<-lapply(ARMS,function(a) matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs))))
area<-setNames(numeric(length(states)),states); netneg<-setNames(numeric(length(states)),states); npix<-netneg
for(i in seq_len(nrow(v))){h<-geth(v$abbr[i],v$cell[i]); if(is.null(h))next
  st<-v$abbr[i]; a0<-v$STDAGE[i]; Astar<-h[5]; ar<-v$area_ha[i]; ftg<-v$ft_group[i]; cl<-v$cell[i]; prov<-v$prov_code[i]
  ages<-a0+(0:HOR); ga<-ages[-1]
  dens_h<-hyb(ages,h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; dens_h[!is.finite(dens_h)|dens_h<0]<-0; hinc<-diff(dens_h)
  go<-gp(Mg,cl,ftg,st,ga)                                   # gross undisturbed increment (blended to hybrid past A*)
  w<-pmax(0,pmin(1,(Astar-ga)/Astar)); gross<-pmax(w*go+(1-w)*hinc,0)
  p<-getp(prov,ftg); sev_t<-gets(prov,ftg)
  npix[st]<-npix[st]+1
  for(nm in names(ARMS)){mult<-ARMS[[nm]][1]; smode<-ARMS[[nm]][2]
    sev<-if(mult==0)0 else if(smode==1)SEV_OBS else sev_t
    drag<-mult*p*sev*dens_h[-1]                             # MgC/ha/yr lost, ~ standing density
    net<-gross-drag
    dens<-c(dens_h[1], dens_h[1]+cumsum(net)); dens[dens<0]<-0
    res[[nm]][st,]<-res[[nm]][st,]+dens[oidx]*ar/1e6
    if(nm=="severe" && (dens[length(dens)]<dens[1])) netneg[st]<-netneg[st]+1
  }
  area[st]<-area[st]+ar
}

ct<-sapply(res,colSums)            # offs x arms
cat("\n[scn] CONUS reserve carbon by disturbance arm (Tg C):\n")
cat(sprintf("  %-18s t0     t50    t100   gain%%\n",""))
for(nm in names(ARMS)){x<-ct[,nm]; cat(sprintf("  %-18s %5.0f  %5.0f  %5.0f  %+5.1f\n",nm,x[1],x[6],x[length(offs)],100*(x[length(offs)]/x[1]-1)))}

long<-do.call(rbind,lapply(names(ARMS),function(nm) data.frame(arm=nm,year=TM_BASE+offs,agc_Tg=round(ct[,nm],2),row.names=NULL)))
write.csv(long,file.path(dd,"conus_disturb_arms_100yr.csv"),row.names=FALSE)
nn<-data.frame(state=states,pix=npix,severe_netneg=netneg,pct_netneg=round(100*netneg/pmax(npix,1),1),
  recent_t100=round(res$recent[,length(offs)],1),severe_t100=round(res$severe[,length(offs)],1),row.names=NULL)
write.csv(nn[order(-nn$pct_netneg),],file.path(dd,"disturb_state_netneg.csv"),row.names=FALSE)

sink(file.path(dd,"disturb_scenario_summary.txt"))
cat("Reserve-with-disturbance decline scenario (TreeMap-2022, CONUS)\n\n")
cat("CONUS reserve carbon (Tg C):\n"); for(nm in names(ARMS)){x<-ct[,nm]; cat(sprintf("  %-18s t0=%.0f t100=%.0f (%+.1f%%)\n",nm,x[1],x[length(offs)],100*(x[length(offs)]/x[1]-1)))}
cat(sprintf("\nUnder severe (3x freq, type severity), %d of %d CONUS forest pixels-strata end below t0.\n",sum(netneg),sum(npix)))
cat("states with most net-carbon-loss area under severe disturbance:\n")
print(head(nn[order(-nn$pct_netneg),c("state","pct_netneg","recent_t100","severe_t100")],12),row.names=FALSE)
sink()
cat("[scn] wrote treemap/disturb/{conus_disturb_arms_100yr,disturb_state_netneg,disturb_scenario_summary}\n")
print(head(nn[order(-nn$pct_netneg),],10),row.names=FALSE)
