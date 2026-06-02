## ycx_ingrowth_gap.R  (read-only analysis)
##
## Decompose the production hybrid's conservative near-term bias by STAND AGE.
## Age-based yield curves project the *current* trees forward and structurally
## omit INGROWTH (new trees crossing the measurement threshold). If that is the
## cause, the observed FIA net AGC growth rate should exceed the age-based
## curve's fractional growth most at YOUNG ages and converge at old ages.
##
## For undisturbed FIA remeasurement plots (CONUS), per stand-age class, compute:
##   - observed net AGC growth   (Mg C/ha/yr)  = mean[(AGC_t2-AGC_t1)/REMPER]
##   - observed standing AGC      (Mg C/ha)     = mean[AGC_t1]
##   - observed fractional growth (%/yr)        = growth / standing
##   - the engine's age-based fractional growth (%/yr) from the chronosequence
##     curve: (dC/dage)/C evaluated at the class-mean age, pooled across cells.
## The gap (observed - curve) by age is the empirical ingrowth signal.
##
## Output: <out>/treemap/ingrowth_by_age.csv  (age_class, n, obs_pctyr, obs_MgChayr, std_MgCha)
##         prints the age-class table.

out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dir.create(td,showWarnings=FALSE,recursive=TRUE)
fia<-"/fs/scratch/PUOM0008/crsfaaron/fia_by_state"
LBAC_TO_MGHA<-0.00045359237*2.4710538
ABBR2FIPS <- c(AL=1,AZ=4,AR=5,CA=6,CO=8,CT=9,DE=10,FL=12,GA=13,ID=16,IL=17,
  IN=18,IA=19,KS=20,KY=21,LA=22,ME=23,MD=24,MA=25,MI=26,MN=27,MS=28,MO=29,
  MT=30,NE=31,NV=32,NH=33,NJ=34,NM=35,NY=36,NC=37,ND=38,OH=39,OK=40,OR=41,
  PA=42,RI=44,SC=45,SD=46,TN=47,TX=48,UT=49,VT=50,VA=51,WA=53,WV=54,WI=55,WY=56)

rm <- read.csv(file.path(fia,"plot_remeas.csv"), colClasses="character")
rm$REMPER<-suppressWarnings(as.numeric(rm$REMPER))
agc_of <- function(abbr){
  fp<-file.path(fia,sprintf("%d_TREE.csv",ABBR2FIPS[[abbr]])); if(!file.exists(fp)) return(NULL)
  hdr<-gsub('"','',strsplit(readLines(fp,1),",")[[1]]); idx<-match(c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ"),hdr)
  tmp<-tempfile(fileext=".csv"); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),fp,tmp))
  t<-read.csv(tmp,stringsAsFactors=FALSE); unlink(tmp)
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD)); for(c0 in c("CARBON_AG","TPA_UNADJ")) t[[c0]]<-suppressWarnings(as.numeric(t[[c0]]))
  t<-t[!is.na(t$STATUSCD)&t$STATUSCD==1,]
  a<-aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN,data=t,FUN=sum,na.rm=TRUE); names(a)[2]<-"agc"; a$PLT_CN<-as.character(a$PLT_CN); a
}

all <- list()
for (st in names(ABBR2FIPS)) {
  mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); if(!file.exists(mf)) next
  mem<-read.csv(mf,colClasses="character"); trt<-setNames(mem$treatment,mem$PLT_CN); age<-setNames(suppressWarnings(as.numeric(mem$STDAGE)),mem$PLT_CN)
  ac<-agc_of(st); if(is.null(ac)) next; ci<-setNames(ac$agc,ac$PLT_CN)
  d<-rm[rm$STATECD==as.character(ABBR2FIPS[[st]]),]
  d$c1<-ci[d$PREV_PLT_CN]; d$c2<-ci[d$CN]; d$trt<-trt[d$CN]; d$age<-age[d$CN]
  d<-d[is.finite(d$c1)&is.finite(d$c2)&is.finite(d$REMPER)&d$REMPER>=3&d$REMPER<=15 &
       d$c1>0 & d$trt=="untreated" & is.finite(d$age) & d$age>0,]
  if(nrow(d)) all[[st]]<-data.frame(age=d$age, c1=d$c1*LBAC_TO_MGHA,
      grow=(d$c2-d$c1)/d$REMPER*LBAC_TO_MGHA)
}
D<-do.call(rbind,all); cat(sprintf("[ing] undisturbed remeasurement plots: %d\n",nrow(D)))
D$cls<-cut(D$age, breaks=c(0,20,40,60,80,100,120,Inf),
           labels=c("0-20","20-40","40-60","60-80","80-100","100-120","120+"))
agg<-do.call(rbind, lapply(split(D,D$cls), function(x) data.frame(
  age_class=x$cls[1], n=nrow(x),
  mean_age=round(mean(x$age),0),
  std_MgCha=round(mean(x$c1),1),
  obs_MgChayr=round(mean(x$grow),3),
  obs_pctyr=round(mean(x$grow)/mean(x$c1)*100,3))))
write.csv(agg, file.path(td,"ingrowth_by_age.csv"), row.names=FALSE)
cat("[ing] observed net AGC growth by stand-age class (undisturbed, CONUS):\n")
print(agg, row.names=FALSE)
cat(sprintf("\n[ing] pooled: standing %.1f MgC/ha, net growth %.3f MgC/ha/yr (%.2f%%/yr)\n",
            mean(D$c1), mean(D$grow), mean(D$grow)/mean(D$c1)*100))
