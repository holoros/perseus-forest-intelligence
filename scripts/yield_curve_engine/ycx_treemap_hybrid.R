## ycx_treemap_hybrid.R
## CONUS reserve carbon projection using the HYBRID fits (ycx_hybrid_fit.R),
## parallel to the peak-decline yc_treemap_spatial_v1. Applies the hybrid curve
## to TreeMap 2022 pixels (no harvest) and rolls carbon to state + CONUS, with
## a side-by-side comparison to the peak-decline projection.
##
## Output: treemap/conus_hybrid_100yr.csv (state, year_offset, agc_Tg, area_Mha)
##         treemap/hybrid_vs_peakdecline_conus.csv
## Usage: Rscript ycx_treemap_hybrid.R [out_dir] [VAT_path]

suppressMessages({library(foreign)})
out <- if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dir.create(td,showWarnings=FALSE,recursive=TRUE)
VAT <- if(length(commandArgs(TRUE))>=2) commandArgs(TRUE)[2] else
  "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
TM_BASE<-2022L; offs<-seq(0,100,10); LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09
FIPS2ABBR <- c("1"="AL","4"="AZ","5"="AR","6"="CA","8"="CO","9"="CT","10"="DE","12"="FL","13"="GA","16"="ID",
 "17"="IL","18"="IN","19"="IA","20"="KS","21"="KY","22"="LA","23"="ME","24"="MD","25"="MA","26"="MI","27"="MN",
 "28"="MS","29"="MO","30"="MT","31"="NE","32"="NV","33"="NH","34"="NJ","35"="NM","36"="NY","37"="NC","38"="ND",
 "39"="OH","40"="OK","41"="OR","42"="PA","44"="RI","45"="SC","46"="SD","47"="TN","48"="TX","49"="UT","50"="VT",
 "51"="VA","53"="WA","54"="WV","55"="WI","56"="WY")
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))

v<-read.dbf(VAT,as.is=TRUE); names(v)<-toupper(names(v)); v<-v[,intersect(c("PLT_CN","COUNT"),names(v))]
v$PLT_CN<-sub("\\.0+$","",format(v$PLT_CN,scientific=FALSE,trim=TRUE))
mf<-list.files(cfg,pattern="^ycx_membership_.*\\.csv$",full.names=TRUE)
mem<-do.call(rbind,lapply(mf,function(f){d<-read.csv(f,colClasses="character"); d[,c("PLT_CN","STATECD","ft_group","prov_code","owner4","STDAGE")]}))
mem<-mem[!duplicated(mem$PLT_CN),]; mem$STDAGE<-suppressWarnings(as.numeric(mem$STDAGE))
key<-match(v$PLT_CN,mem$PLT_CN); v<-v[!is.na(key),]; mm<-mem[key[!is.na(key)],]
v<-cbind(v,mm[,c("STATECD","ft_group","prov_code","owner4","STDAGE")]); v<-v[is.finite(v$STDAGE)&v$STDAGE>0,]
v$abbr<-FIPS2ABBR[as.character(as.integer(v$STATECD))]; v<-v[!is.na(v$abbr),]
v$cell<-paste(v$ft_group,v$prov_code,v$owner4,sep="|"); v$area_ha<-v$COUNT*PIX_HA

## hybrid fits per state
H<-list()
for(st in unique(v$abbr)){ fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp)) next
  f<-read.csv(fp,stringsAsFactors=FALSE)
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key)
    if(is.null(H[[id]])) H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)} }
geth<-function(st,cell){k<-H[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); H[[paste0(st,"@@state")]]}

states<-sort(unique(v$abbr)); res<-matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs)))
area<-setNames(numeric(length(states)),states); n_noc<-0L
for(i in seq_len(nrow(v))){ h<-geth(v$abbr[i],v$cell[i]); if(is.null(h)){n_noc<-n_noc+1L;next}
  dens<-hyb(v$STDAGE[i]+offs,h[1],h[2],h[3],h[4],h[5])*LBAC_TO_MGHA; dens[!is.finite(dens)|dens<0]<-0
  res[v$abbr[i],]<-res[v$abbr[i],]+dens*v$area_ha[i]/1e6; area[v$abbr[i]]<-area[v$abbr[i]]+v$area_ha[i] }
cat(sprintf("[hyb-tm] projected %d imputations (no curve %d)\n", nrow(v)-n_noc, n_noc))

long<-do.call(rbind,lapply(states,function(st) data.frame(state=st,year_offset=offs,
  agc_Tg=round(res[st,],3),area_Mha=round(area[st]/1e6,4),row.names=NULL)))
write.csv(long,file.path(td,"conus_hybrid_100yr.csv"),row.names=FALSE)
conus<-colSums(res); cat(sprintf("[hyb-tm] CONUS hybrid reserve: t0=%.0f t100=%.0f Tg (%+.1f%%)\n",
  conus[1],conus[length(offs)],100*(conus[length(offs)]/conus[1]-1)))

## compare to peak-decline projection if present
pd_path<-file.path(td,"conus_noharvest_100yr.csv")
if(file.exists(pd_path)){ pdc<-read.csv(pd_path); pds<-aggregate(agc_Tg~year_offset,pdc,sum)
  cmp<-data.frame(year=TM_BASE+offs, peakdecline_Tg=round(pds$agc_Tg,0), hybrid_Tg=round(conus,0))
  cmp$diff_pct<-round(100*(cmp$hybrid_Tg/cmp$peakdecline_Tg-1),1)
  write.csv(cmp,file.path(td,"hybrid_vs_peakdecline_conus.csv"),row.names=FALSE)
  cat("\n[hyb-tm] === hybrid vs peak-decline CONUS reserve ===\n"); print(cmp,row.names=FALSE) }
cat("[hyb-tm] wrote conus_hybrid_100yr.csv\n")
