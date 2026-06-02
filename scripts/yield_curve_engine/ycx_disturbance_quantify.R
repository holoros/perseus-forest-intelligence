## ycx_disturbance_quantify.R  (read-only)
##
## Quantify natural disturbance on UNTREATED FIA remeasurement plots, to (a) prove
## that the all-plots g_obs used in the recalibration is already disturbance-
## discounted, and (b) yield a clean UNDISTURBED growth kernel plus a dial-able
## disturbance drag for the no-management decline scenario.
##
## A remeasurement interval is "disturbed" if the t2 condition carries DSTRBCD1>0
## (FIA records disturbance since the prior measurement). Type from the code decade:
##   10s insect | 20s disease | 30s fire | 40s animal | 50s weather | >=60 other.
##
## Per ecoregion(prov) x forest-type group, on untreated plots:
##   p_dist_ann   annual disturbance probability  = (#disturbed/total)/mean(REMPER)
##   g_undist     mean net AGC increment, undisturbed plots (Mg C/ha/yr)  [gross kernel]
##   g_dist       mean net AGC increment, disturbed plots   (often <0)
##   g_all        mean over all untreated plots             [= current recal kernel]
##   sev_frac     fractional standing-AGC loss attributable to a disturbance event
##   type shares  fraction of disturbed plots by agent
##
## Output: treemap/disturb/disturb_params.csv, disturb_by_type.csv, disturb_summary.txt
## Usage: Rscript ycx_disturbance_quantify.R [out_dir]

out <- if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg <- file.path(out,"config"); td<-file.path(out,"treemap"); dd<-file.path(td,"disturb")
dir.create(dd,showWarnings=FALSE,recursive=TRUE)
fia <- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
COND<- "/fs/scratch/PUOM0008/crsfaaron/fia_by_state"   # <ST_fips>_COND.csv
LBAC_TO_MGHA<-0.00045359237*2.4710538
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)
dtype <- function(cd){ cd<-as.integer(cd); ifelse(is.na(cd)|cd==0,"none",
  ifelse(cd<20,"insect",ifelse(cd<30,"disease",ifelse(cd<40,"fire",
  ifelse(cd<50,"animal",ifelse(cd<60,"weather","other")))))) }

rm <- read.csv(file.path(fia,"plot_remeas.csv"), colClasses="character"); rm$REMPER<-suppressWarnings(as.numeric(rm$REMPER))
agc_of <- function(fips){
  fp<-file.path(fia,sprintf("%d_TREE.csv",fips)); if(!file.exists(fp)) return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); idx<-match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"),hdr)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp))
  t<-read.csv(tmp,stringsAsFactors=FALSE); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD)); for(c0 in c("CARBON_AG","TPA_UNADJ")) t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t<-t[!is.na(t$STATUSCD)&t$STATUSCD==1,]
  a<-aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN,data=t,FUN=sum,na.rm=TRUE); names(a)[2]<-"agc"; a$PLT_CN<-as.character(a$PLT_CN); a
}
cond_of <- function(fips){
  fp<-file.path(COND,sprintf("%d_COND.csv",fips)); if(!file.exists(fp)) return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); need<-c("PLT_CN","CONDID","CONDPROP_UNADJ","DSTRBCD1")
  idx<-match(need,hdr); if(any(is.na(idx))) return(NULL)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp))
  c<-read.csv(tmp,stringsAsFactors=FALSE); unlink(tmp)
  c$CONDPROP_UNADJ<-suppressWarnings(as.numeric(c$CONDPROP_UNADJ)); c$DSTRBCD1<-suppressWarnings(as.integer(c$DSTRBCD1))
  c<-c[is.finite(c$CONDPROP_UNADJ),]; c<-c[order(c$PLT_CN,-c$CONDPROP_UNADJ),]; c<-c[!duplicated(c$PLT_CN),]
  data.frame(PLT_CN=as.character(c$PLT_CN), dcode=ifelse(is.na(c$DSTRBCD1),0L,c$DSTRBCD1), stringsAsFactors=FALSE)
}

ALL<-list()
for (st in names(ABBR2FIPS)) {
  mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); if(!file.exists(mf)) next
  fips<-ABBR2FIPS[[st]]; mem<-read.csv(mf,colClasses="character")
  ft<-setNames(mem$ft_group,mem$PLT_CN); pv<-setNames(mem$prov_code,mem$PLT_CN)
  trt<-setNames(mem$treatment,mem$PLT_CN); age<-setNames(suppressWarnings(as.numeric(mem$STDAGE)),mem$PLT_CN)
  ac<-agc_of(fips); if(is.null(ac)) next; ci<-setNames(ac$agc,ac$PLT_CN)
  cd<-cond_of(fips); dc<-if(is.null(cd)) setNames(integer(0),character(0)) else setNames(cd$dcode,cd$PLT_CN)
  d<-rm[rm$STATECD==as.character(fips),]
  d$c1<-ci[d$PREV_PLT_CN]; d$c2<-ci[d$CN]; d$age<-age[d$CN]; d$trt<-trt[d$CN]
  d$dcode<-dc[d$CN]; d$dcode[is.na(d$dcode)]<-0L
  d<-d[is.finite(d$c1)&is.finite(d$c2)&is.finite(d$REMPER)&d$REMPER>=3&d$REMPER<=15 &
       d$c1>0 & d$trt=="untreated" & is.finite(d$age) & d$age>0,]
  if(nrow(d)) ALL[[st]]<-data.frame(state=st, prov=pv[d$CN], ft=ft[d$CN], age=d$age,
      c1=d$c1*LBAC_TO_MGHA, grow=(d$c2-d$c1)/d$REMPER*LBAC_TO_MGHA, remper=d$REMPER,
      dcode=d$dcode, dtype=dtype(d$dcode), disturbed=as.integer(d$dcode>0), stringsAsFactors=FALSE)
}
D<-do.call(rbind,ALL); rownames(D)<-NULL
cat(sprintf("[dist] untreated remeasurement plots: %d  (disturbed %d = %.1f%%)\n",
  nrow(D),sum(D$disturbed),100*mean(D$disturbed)))

## overall growth split
g_all<-mean(D$grow); g_un<-mean(D$grow[D$disturbed==0]); g_di<-mean(D$grow[D$disturbed==1])
p_ann<-mean(D$disturbed)/mean(D$remper)
cat(sprintf("[dist] net increment (MgC/ha/yr): undisturbed %.3f  disturbed %.3f  all %.3f\n",g_un,g_di,g_all))
cat(sprintf("[dist] annual disturbance probability (CONUS untreated): %.4f /yr  (~1-in-%.0f-yr)\n",p_ann,1/p_ann))
## severity: average standing-AGC fraction lost per disturbance event
##   on disturbed plots, the increment deficit vs undisturbed, times the interval,
##   relative to standing stock -> fractional loss per event
sev_event <- with(D[D$disturbed==1,], mean((g_un - grow)*remper / c1, na.rm=TRUE))
cat(sprintf("[dist] mean fractional AGC loss per disturbance event: %.3f  (of standing stock)\n",sev_event))

## type shares among disturbed
tt<-prop.table(table(D$dtype[D$disturbed==1]))
typ<-data.frame(type=names(tt), share=round(as.numeric(tt),4))
write.csv(typ,file.path(dd,"disturb_by_type.csv"),row.names=FALSE)

## per ecoregion x ft params
key<-interaction(D$prov,D$ft,drop=TRUE)
agg<-do.call(rbind,lapply(split(D,key),function(x){
  if(nrow(x)<40) return(NULL)
  gu<-mean(x$grow[x$disturbed==0]); gd<-mean(x$grow[x$disturbed==1])
  pa<-mean(x$disturbed)/mean(x$remper)
  sev<-if(any(x$disturbed==1)) mean((gu - x$grow[x$disturbed==1])*x$remper[x$disturbed==1]/x$c1[x$disturbed==1],na.rm=TRUE) else 0
  data.frame(prov=x$prov[1],ft=x$ft[1],n=nrow(x),n_dist=sum(x$disturbed),
    p_dist_ann=round(pa,5), g_undist=round(gu,3), g_dist=round(ifelse(is.nan(gd),NA,gd),3),
    g_all=round(mean(x$grow),3), sev_frac=round(ifelse(is.finite(sev),sev,NA),4),
    drag=round(pa*ifelse(is.finite(sev),sev,0)*mean(x$c1),4))   # expected annual MgC/ha loss
}))
write.csv(agg[order(-agg$p_dist_ann),],file.path(dd,"disturb_params.csv"),row.names=FALSE)

sink(file.path(dd,"disturb_summary.txt"))
cat("FIA natural-disturbance quantification (untreated remeasurement plots)\n")
cat(sprintf("plots %d, disturbed %.1f%%, annual p_dist %.4f (1-in-%.0f-yr)\n",nrow(D),100*mean(D$disturbed),p_ann,1/p_ann))
cat(sprintf("net increment MgC/ha/yr: undisturbed %.3f | disturbed %.3f | all %.3f\n",g_un,g_di,g_all))
cat(sprintf("=> all-plot kernel sits %.1f%% below the undisturbed kernel: disturbance drag is already embedded\n",100*(1-g_all/g_un)))
cat(sprintf("mean fractional AGC loss per event: %.3f\n\n",sev_event))
cat("disturbance type shares (of disturbed):\n"); print(typ,row.names=FALSE)
cat(sprintf("\nstrata with params: %d ecoregion x ft cells\n",nrow(agg)))
cat("highest annual disturbance probability strata:\n"); print(head(agg[order(-agg$p_dist_ann),c("prov","ft","n","p_dist_ann","g_undist","g_all","drag")],12),row.names=FALSE)
sink()
cat("[dist] wrote treemap/disturb/{disturb_params,disturb_by_type,disturb_summary}\n")
print(head(agg[order(-agg$p_dist_ann),],10),row.names=FALSE)
