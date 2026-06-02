## ycx_hybrid_fit2.R  (production hybrid fitter, multi-response)
##
## Generalizes ycx_hybrid_fit.R to fit the hybrid form
##   y = A*(1-exp(-k*age))^p * exp(-d*max(0, age - Astar))
## for BOTH production responses that drive the live TreeMap engine:
##   carbon_lbac  (AG carbon, lb/ac)  -> carbon trajectory + scenarios
##   agb_tonac    (AG dry biomass, tons/ac) -> product-resolved biomass
## per forest-type x ecoregion x owner cell (fallback cell -> ft -> state),
## Astar = empirical culmination age per grouping.
##
## Output: ycx_<ST>_hybrid_fits.csv (scope, cell_key, ft_group, prov_code,
##         owner, response, A, k, p, d, Astar, n_plots)  -- now multi-response.
##
## Usage: Rscript ycx_hybrid_fit2.R <ST> [out_dir] [fia_dir]

args<-commandArgs(trailingOnly=TRUE)
ST <-if(length(args)>=1) toupper(args[1]) else stop("need state")
out<-if(length(args)>=2) args[2] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
fia<-if(length(args)>=3) args[3] else file.path(Sys.getenv("HOME"),"fia_data")
cfg<-file.path(out,"config")
MIN_FIT<-30L; AGE_BIN<-10L; ASTAR_MIN<-30; ASTAR_MAX<-200
SCRATCH_FIA<-"/fs/scratch/PUOM0008/crsfaaron/FIA"; set.seed(20260531)
RESP<-c("carbon_lbac","agb_tonac")
cat(sprintf("[hfit2] state=%s responses=%s\n",ST,paste(RESP,collapse=",")))

resolve_tree<-function(ST,need){
  for(i in seq_along(c1<-c(file.path(fia,sprintf("%s_TREE.csv",ST)),file.path(SCRATCH_FIA,sprintf("%s_TREE.csv",ST))))){
    tf<-c1[i]; if(!file.exists(tf)) next
    hdr<-gsub('"','',strsplit(readLines(tf,n=1),",")[[1]])
    if(all(need %in% hdr)){ if(i>1) cat("  [fallback] scratch FIADB copy\n"); return(tf) }
  }; stop("no TREE file with cols for ",ST)
}
mem<-read.csv(file.path(cfg,sprintf("ycx_membership_%s.csv",ST)),stringsAsFactors=FALSE)
mem<-mem[order(mem$PLT_CN,-mem$INVYR),]; mem<-mem[!duplicated(mem$PLT_CN),]
need<-c("PLT_CN","STATUSCD","CARBON_AG","DRYBIO_AG","TPA_UNADJ")
tf<-resolve_tree(ST,need); hdr<-gsub('"','',strsplit(readLines(tf,n=1),",")[[1]]); idx<-match(need,hdr)
slim<-file.path(out,sprintf(".tmp_hfit2_%s.csv",ST))
system(sprintf("cut -d, -f%s '%s' > '%s'",paste(idx,collapse=","),tf,slim))
tr<-read.csv(slim,stringsAsFactors=FALSE); unlink(slim)
for(c0 in c("CARBON_AG","DRYBIO_AG","TPA_UNADJ")) tr[[c0]]<-suppressWarnings(as.numeric(tr[[c0]]))
tr$STATUSCD<-suppressWarnings(as.integer(tr$STATUSCD)); tr<-tr[!is.na(tr$STATUSCD)&tr$STATUSCD==1,]
cb<-aggregate(cbind(carbon_lbac=CARBON_AG*TPA_UNADJ, agb_raw=DRYBIO_AG*TPA_UNADJ)~PLT_CN,tr,sum,na.rm=TRUE)
cb$agb_tonac<-cb$agb_raw/2000
pd<-merge(cb,mem[,c("PLT_CN","ft_group","prov_code","owner4","STDAGE","treatment")],by="PLT_CN")
pd<-pd[pd$treatment=="untreated" & !is.na(pd$STDAGE)&pd$STDAGE>0,]
pd$cell<-paste(pd$ft_group,pd$prov_code,pd$owner4,sep="|")
cat(sprintf("  %d untreated plots, %d cells\n",nrow(pd),length(unique(pd$cell))))

culm<-function(age,y){ ok<-is.finite(age)&is.finite(y)&y>0; age<-age[ok]; y<-y[ok]; if(length(age)<10) return(NA_real_)
  b<-AGE_BIN*(age%/%AGE_BIN)+AGE_BIN/2; m<-tapply(y,b,mean,na.rm=TRUE); ab<-as.numeric(names(m))
  k<-ab>=ASTAR_MIN-AGE_BIN&ab<=ASTAR_MAX+AGE_BIN; if(!any(k))return(NA_real_); m<-m[k]; ab<-ab[k]
  if(length(m)<3)return(NA_real_); ms<-stats::filter(m,rep(1/3,3)); ms[is.na(ms)]<-m[is.na(ms)]
  min(max(ab[which.max(ms)],ASTAR_MIN),ASTAR_MAX) }
chap<-function(age,A,k,p) A*(1-exp(-k*age))^p
fit_hyb<-function(age,y,Astar){ ok<-is.finite(age)&is.finite(y)&y>0&age>0; age<-age[ok]; y<-y[ok]
  if(length(y)<MIN_FIT) return(NULL); if(!is.finite(Astar)) Astar<-ASTAR_MAX
  hf<-function(age,A,k,p,d) chap(age,A,k,p)*exp(-d*pmax(0,age-Astar))
  m<-tryCatch(nls(y~hf(age,A,k,p,d),start=list(A=max(y)*1.1,k=0.03,p=3,d=0.005),
    lower=c(A=0,k=1e-4,p=0.3,d=0),algorithm="port",control=nls.control(maxiter=300,warnOnly=TRUE)),error=function(e)NULL)
  if(is.null(m))return(NULL); co<-coef(m); if(any(!is.finite(co))||co["A"]<=0) return(NULL)
  list(A=unname(co["A"]),k=unname(co["k"]),p=unname(co["p"]),d=unname(co["d"]),Astar=Astar,n=length(y)) }
emit<-function(rv,scope,key,ft,prov,own,f){ if(is.null(f))return(NULL)
  data.frame(scope=scope,cell_key=key,ft_group=ft,prov_code=prov,owner=own,response=rv,
    A=round(f$A,4),k=round(f$k,6),p=round(f$p,5),d=round(f$d,6),Astar=round(f$Astar,0),n_plots=f$n,stringsAsFactors=FALSE) }

ROWS<-list()
for(rv in RESP){
  d0<-pd[is.finite(pd[[rv]])&pd[[rv]]>0,]
  st_a<-culm(d0$STDAGE,d0[[rv]])
  ROWS[[length(ROWS)+1]]<-emit(rv,"state",ST,NA,NA,NA,fit_hyb(d0$STDAGE,d0[[rv]],st_a))
  ftfit<-list(); ftA<-list()
  for(ft in unique(d0$ft_group)){ dd<-d0[d0$ft_group==ft,]; a<-culm(dd$STDAGE,dd[[rv]]); if(!is.finite(a))a<-st_a
    ftA[[ft]]<-a; ftfit[[ft]]<-fit_hyb(dd$STDAGE,dd[[rv]],a) }
  for(cl in unique(d0$cell)){ dd<-d0[d0$cell==cl,]; ft<-dd$ft_group[1]
    a<-if(nrow(dd)>=MIN_FIT) culm(dd$STDAGE,dd[[rv]]) else NA; if(!is.finite(a)) a<-ftA[[ft]]
    f<-if(nrow(dd)>=MIN_FIT) fit_hyb(dd$STDAGE,dd[[rv]],a) else NULL; if(is.null(f)) f<-ftfit[[ft]]
    ROWS[[length(ROWS)+1]]<-emit(rv,"cell",cl,ft,dd$prov_code[1],dd$owner4[1],f) }
}
fits<-do.call(rbind,ROWS); fits<-fits[!is.na(fits$A),]
write.csv(fits,file.path(out,sprintf("ycx_%s_hybrid_fits.csv",ST)),row.names=FALSE)
cat(sprintf("[hfit2] %s: %d fits across %d responses -> ycx_%s_hybrid_fits.csv\n",
    ST,nrow(fits),length(unique(fits$response)),ST))
