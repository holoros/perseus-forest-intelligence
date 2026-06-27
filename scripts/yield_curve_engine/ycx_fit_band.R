## ycx_fit_band.R  -- data-driven CI band for the canonical YC producers.
## For each state x response, computes the relative population-level lack-of-fit of the
## fitted hybrid curve: bin the untreated plots by stand age, take the mean observed
## response per bin, compare to the STATE-scope fitted curve at the bin centre, and form
## relRMSE = sqrt(mean((binmean - pred)^2)) / mean(binmean). This is the systematic
## curve-form uncertainty relevant to a STATE TOTAL (not stand-level scatter, which a sum
## averages out, and not sampling SE of the mean, which understates structural error).
## Replaces the flat +/-8% placeholder with a metric- and state-specific band.
## Output (appended to ycx_fit_bands.csv): state,response,rel_band,n_bins,n_plots,raw_relrmse
## Usage: Rscript ycx_fit_band.R <ST> <out_dir> [fia_dir]
args<-commandArgs(trailingOnly=TRUE)
ST<-toupper(args[1]); out<-if(length(args)>=2)args[2] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
fia<-if(length(args)>=3)args[3] else file.path(Sys.getenv("HOME"),"fia_data")
cfg<-file.path(out,"config"); SCRATCH_FIA<-"/fs/scratch/PUOM0008/crsfaaron/FIA"
AGE_BIN<-10L; BAND_MIN<-0.03; BAND_MAX<-0.30; MIN_BINS<-3L
RESP<-c("carbon_lbac","agb_tonac","voltot_cuftac","merchvol_cuftac")
hyb<-function(age,p) p[1]*(1-exp(-p[2]*age))^p[3]*exp(-p[4]*pmax(0,age-p[5]))

resolve_tree<-function(ST,need){
  for(tf in c(file.path(fia,sprintf("%s_TREE.csv",ST)),file.path(SCRATCH_FIA,sprintf("%s_TREE.csv",ST)))){
    if(!file.exists(tf)) next
    hdr<-gsub('"','',strsplit(readLines(tf,n=1),",")[[1]]); if(all(need %in% hdr)) return(tf)
  }; stop("no TREE file for ",ST) }
mem<-read.csv(file.path(cfg,sprintf("ycx_membership_%s.csv",ST)),stringsAsFactors=FALSE)
mem<-mem[order(mem$PLT_CN,-mem$INVYR),]; mem<-mem[!duplicated(mem$PLT_CN),]
need<-c("PLT_CN","STATUSCD","CARBON_AG","DRYBIO_AG","TPA_UNADJ","VOLTSGRS","VOLCFNET")
tf<-resolve_tree(ST,need); hdr<-gsub('"','',strsplit(readLines(tf,n=1),",")[[1]]); idx<-match(need,hdr)
slim<-file.path(out,sprintf(".tmp_band_%s.csv",ST)); system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),tf,slim))
tr<-read.csv(slim,stringsAsFactors=FALSE); unlink(slim)
for(c0 in c("CARBON_AG","DRYBIO_AG","TPA_UNADJ","VOLTSGRS","VOLCFNET")) tr[[c0]]<-suppressWarnings(as.numeric(tr[[c0]]))
tr$STATUSCD<-suppressWarnings(as.integer(tr$STATUSCD)); tr<-tr[!is.na(tr$STATUSCD)&tr$STATUSCD==1,]
cb<-aggregate(cbind(carbon_lbac=CARBON_AG*TPA_UNADJ, agb_raw=DRYBIO_AG*TPA_UNADJ,
                    voltot_cuftac=VOLTSGRS*TPA_UNADJ, merchvol_cuftac=VOLCFNET*TPA_UNADJ)~PLT_CN,tr,sum,na.rm=TRUE)
cb$agb_tonac<-cb$agb_raw/2000
pd<-merge(cb,mem[,c("PLT_CN","ft_group","prov_code","owner4","STDAGE","treatment")],by="PLT_CN")
pd<-pd[pd$treatment=="untreated" & !is.na(pd$STDAGE)&pd$STDAGE>0,]

fit<-read.csv(file.path(out,sprintf("ycx_%s_hybrid_fits.csv",ST)),stringsAsFactors=FALSE)
band<-function(rv){
  fr<-fit[fit$scope=="state" & fit$response==rv,]
  d0<-pd[is.finite(pd[[rv]])&pd[[rv]]>0,]
  if(nrow(fr)<1 || nrow(d0)<30) return(c(NA,0,nrow(d0),NA))
  p<-c(fr$A[1],fr$k[1],fr$p[1],fr$d[1],fr$Astar[1])
  b<-AGE_BIN*(d0$STDAGE%/%AGE_BIN)+AGE_BIN/2
  bm<-tapply(d0[[rv]],b,mean,na.rm=TRUE); bn<-tapply(d0[[rv]],b,length); ab<-as.numeric(names(bm))
  pred<-hyb(ab,p); ok<-is.finite(bm)&is.finite(pred)&bn>=5  # drop bins with <5 plots (noisy)
  if(sum(ok)<MIN_BINS) return(c(NA,sum(ok),nrow(d0),NA))
  w<-bn[ok]/sum(bn[ok])                                     # plot-count weighted (representative)
  raw<-sqrt(sum(w*(bm[ok]-pred[ok])^2))/sum(w*bm[ok])
  c(min(max(raw,BAND_MIN),BAND_MAX), sum(ok), nrow(d0), raw) }

outf<-file.path(out,"ycx_fit_bands.csv")
if(!file.exists(outf)) cat("state,response,rel_band,n_bins,n_plots,raw_relrmse\n",file=outf)
for(rv in RESP){ r<-band(rv)
  cat(sprintf("%s,%s,%s,%d,%d,%s\n",ST,rv,
      ifelse(is.na(r[1]),"NA",formatC(r[1],format="f",digits=4)),as.integer(r[2]),as.integer(r[3]),
      ifelse(is.na(r[4]),"NA",formatC(r[4],format="f",digits=4))),file=outf,append=TRUE) }
cat(sprintf("[band] %s done\n",ST))
