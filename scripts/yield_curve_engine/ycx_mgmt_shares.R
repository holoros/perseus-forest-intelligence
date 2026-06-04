## ycx_mgmt_shares.R — FIADB-derived per-state management shares for the managed scenarios.
##   reserved_share  : RESERVCD area-weighted majority forested (protected, never harvested)
##   planted_share   : STDORGCD==1 area-weighted majority forested (plantations -> intensive)
##   harvested_share : membership treatment=="harvested" (observed working-forest harvest -> BAU)
## Joined to the projection's membership plot set. Output fia_mgmt_shares_bystate.csv.
ABBR<-c("AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY")
cfg<-"/users/PUOM0008/crsfaaron/yield_curves_conus/config"; FIA<-"/fs/scratch/PUOM0008/crsfaaron/FIA"
num<-function(x) suppressWarnings(as.numeric(x))
out<-list()
for(st in ABBR){
  mf<-file.path(cfg,sprintf("ycx_membership_%s.csv",st)); cf<-file.path(FIA,sprintf("%s_COND.csv",st))
  if(!file.exists(mf)||!file.exists(cf)) next
  mem<-read.csv(mf,colClasses="character"); mem<-mem[!duplicated(mem$PLT_CN),]
  hv<-mean(mem$treatment=="harvested",na.rm=TRUE)
  hdr<-gsub('"','',strsplit(readLines(cf,1),",")[[1]])
  want<-c("PLT_CN","COND_STATUS_CD","RESERVCD","STDORGCD","CONDPROP_UNADJ"); idx<-match(want,hdr)
  cc<-read.csv(cf,colClasses="character")[,idx]; names(cc)<-c("PLT_CN","CS","RES","ORG","PROP")
  cc$CS<-as.integer(cc$CS); cc$RES<-as.integer(cc$RES); cc$ORG<-as.integer(cc$ORG); cc$PROP<-num(cc$PROP)
  cc<-cc[!is.na(cc$CS)&cc$CS==1,]
  cc$pr<-ifelse(is.na(cc$PROP),0,cc$PROP)
  cc$rprop<-ifelse(!is.na(cc$RES)&cc$RES==1,1,0)*cc$pr
  cc$pprop<-ifelse(!is.na(cc$ORG)&cc$ORG==1,1,0)*cc$pr
  ag<-aggregate(cbind(rprop,pprop,pr)~PLT_CN,cc,sum)
  ag$reserved<-as.integer(ag$pr>0 & ag$rprop/ag$pr>=0.5)
  ag$planted <-as.integer(ag$pr>0 & ag$pprop/ag$pr>=0.5)
  rr<-setNames(ag$reserved,ag$PLT_CN); pp<-setNames(ag$planted,ag$PLT_CN)
  r<-mean(ifelse(is.na(rr[mem$PLT_CN]),0,rr[mem$PLT_CN]))
  p<-mean(ifelse(is.na(pp[mem$PLT_CN]),0,pp[mem$PLT_CN]))
  out[[st]]<-data.frame(state=st,n=nrow(mem),reserved_share=round(r,4),planted_share=round(p,4),harvested_share=round(hv,4))
}
O<-do.call(rbind,out); write.csv(O,"/fs/scratch/PUOM0008/crsfaaron/fia_mgmt_shares_bystate.csv",row.names=FALSE)
cat(sprintf("CONUS (plot-mean): reserved %.3f  planted %.3f  harvested %.3f\n",
  weighted.mean(O$reserved_share,O$n),weighted.mean(O$planted_share,O$n),weighted.mean(O$harvested_share,O$n)))
cat("Top planted-share states:\n"); print(head(O[order(-O$planted_share),c("state","planted_share","harvested_share","reserved_share")],10),row.names=FALSE)
cat("Top harvested-share states:\n"); print(head(O[order(-O$harvested_share),c("state","harvested_share","planted_share","reserved_share")],10),row.names=FALSE)
