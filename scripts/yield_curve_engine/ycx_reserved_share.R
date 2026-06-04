## ycx_reserved_share.R — FIA reserved-status share per state, joined to membership plots.
## A plot is "reserved" if the forested-area-weighted majority of its forested conditions
## have RESERVCD==1 (legally protected from harvest). Outputs per-state reserved share and
## a per-plot reserved flag for the projector.
ABBR<-c("AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY")
cfg<-"/users/PUOM0008/crsfaaron/yield_curves_conus/config"; FIA<-"/fs/scratch/PUOM0008/crsfaaron/FIA"
num<-function(x) suppressWarnings(as.numeric(x))
out<-list(); flagall<-list()
for(st in ABBR){
  mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); cf<-file.path(FIA,sprintf("%s_COND.csv",st))
  if(!file.exists(mf)||!file.exists(cf)) next
  mem<-read.csv(mf,colClasses="character"); mem<-mem[!duplicated(mem$PLT_CN),]
  hdr<-gsub('"','',strsplit(readLines(cf,1),",")[[1]])
  want<-c("PLT_CN","COND_STATUS_CD","RESERVCD","CONDPROP_UNADJ"); idx<-match(want,hdr)
  cc<-read.csv(cf,colClasses="character")[,idx]; names(cc)<-c("PLT_CN","CS","RES","PROP")
  cc$CS<-as.integer(cc$CS); cc$RES<-as.integer(cc$RES); cc$PROP<-num(cc$PROP)
  cc<-cc[!is.na(cc$CS)&cc$CS==1,]                       # forested conditions only
  cc$rprop<-ifelse(!is.na(cc$RES)&cc$RES==1,1,0)*ifelse(is.na(cc$PROP),0,cc$PROP)
  cc$tprop<-ifelse(is.na(cc$PROP),0,cc$PROP)
  ag<-aggregate(cbind(rprop,tprop)~PLT_CN,cc,sum)
  ag$reserved<-as.integer(ag$tprop>0 & (ag$rprop/ag$tprop)>=0.5)
  res<-setNames(ag$reserved,ag$PLT_CN)
  mem$reserved<-res[mem$PLT_CN]; mem$reserved[is.na(mem$reserved)]<-0L
  out[[st]]<-data.frame(state=st,n=nrow(mem),reserved_share=round(mean(mem$reserved),4))
  flagall[[st]]<-data.frame(state=st,PLT_CN=mem$PLT_CN,reserved=mem$reserved)
}
O<-do.call(rbind,out); write.csv(O,"/fs/scratch/PUOM0008/crsfaaron/reserved_share_bystate.csv",row.names=FALSE)
F<-do.call(rbind,flagall); write.csv(F,"/users/PUOM0008/crsfaaron/yield_curves_conus/reserved_flag_byplot.csv",row.names=FALSE)
cat(sprintf("CONUS reserved share (plot-mean, area-weighted maj): %.3f\n",weighted.mean(O$reserved_share,O$n)))
cat("Top reserved-share states:\n"); print(head(O[order(-O$reserved_share),],12),row.names=FALSE)
