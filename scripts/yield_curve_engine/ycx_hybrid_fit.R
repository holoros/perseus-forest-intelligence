## ycx_hybrid_fit.R  (production hybrid yield-curve fitter)
##
## Fits the HYBRID carbon yield form per forest-type x ecoregion x owner cell:
##   y = A*(1-exp(-k*age))^p * exp(-d * max(0, age - Astar))
## i.e. Chapman-Richards growth with an exponential decline tail beyond the
## empirical culmination breakpoint Astar (per cell). Chosen after a 48-state
## 5-fold CV showed CR best and the hybrid CR-equivalent where no decline, with
## real senescence where forests culminate within the chronosequence.
##
## Fits per cell where n >= MIN_FIT, with fallback chain cell -> ft_group ->
## state (a state-scope hybrid is always emitted). Output parallels ycx_01:
##   ycx_<ST>_hybrid_fits.csv  (scope, cell_key, ft_group, prov_code, owner,
##                              response, A, k, p, d, Astar, n_plots)
##
## Usage: Rscript ycx_hybrid_fit.R <ST> [out_dir] [fia_dir]

args <- commandArgs(trailingOnly=TRUE)
ST  <- if (length(args)>=1) toupper(args[1]) else stop("need state abbr")
out <- if (length(args)>=2) args[2] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
fia <- if (length(args)>=3) args[3] else file.path(Sys.getenv("HOME"),"fia_data")
cfg <- file.path(out,"config")
MIN_FIT <- 30L; AGE_BIN <- 10L; ASTAR_MIN <- 30; ASTAR_MAX <- 200
SCRATCH_FIA <- "/fs/scratch/PUOM0008/crsfaaron/FIA"
set.seed(20260531)
cat(sprintf("[hfit] state=%s\n", ST))

resolve_tree <- function(ST, need){
  for (i in seq_along(c1<-c(file.path(fia,sprintf("%s_TREE.csv",ST)), file.path(SCRATCH_FIA,sprintf("%s_TREE.csv",ST))))){
    tf<-c1[i]; if(!file.exists(tf)) next
    hdr<-gsub('"','',strsplit(readLines(tf,n=1),",")[[1]])
    if (all(need %in% hdr)){ if(i>1) cat("  [fallback] scratch FIADB copy\n"); return(tf) }
  }; stop("no TREE file with cols for ",ST)
}

mem <- read.csv(file.path(cfg,sprintf("ycx_membership_%s.csv",ST)),stringsAsFactors=FALSE)
mem <- mem[order(mem$PLT_CN,-mem$INVYR),]; mem <- mem[!duplicated(mem$PLT_CN),]
need <- c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ")
tf <- resolve_tree(ST, need)
hdr <- gsub('"','',strsplit(readLines(tf,n=1),",")[[1]]); idx <- match(need,hdr)
slim <- file.path(out, sprintf(".tmp_hfit_%s.csv",ST))
system(sprintf("cut -d, -f%s '%s' > '%s'", paste(idx,collapse=","), tf, slim))
tr <- read.csv(slim,stringsAsFactors=FALSE); unlink(slim)
tr$CARBON_AG<-suppressWarnings(as.numeric(tr$CARBON_AG)); tr$TPA_UNADJ<-suppressWarnings(as.numeric(tr$TPA_UNADJ))
tr$STATUSCD<-suppressWarnings(as.integer(tr$STATUSCD)); tr<-tr[!is.na(tr$STATUSCD)&tr$STATUSCD==1,]
cb <- aggregate(I(CARBON_AG*TPA_UNADJ)~PLT_CN, tr, sum, na.rm=TRUE); names(cb)[2]<-"carbon_lbac"
pd <- merge(cb, mem[,c("PLT_CN","ft_group","prov_code","owner4","STDAGE","treatment")], by="PLT_CN")
pd <- pd[pd$treatment=="untreated" & !is.na(pd$STDAGE) & pd$STDAGE>0 & is.finite(pd$carbon_lbac) & pd$carbon_lbac>0,]
pd$cell <- paste(pd$ft_group,pd$prov_code,pd$owner4,sep="|")
cat(sprintf("  %d untreated plots, %d cells\n", nrow(pd), length(unique(pd$cell))))

culm <- function(age,y){ if(length(age)<10) return(NA_real_)
  b<-AGE_BIN*(age%/%AGE_BIN)+AGE_BIN/2; m<-tapply(y,b,mean,na.rm=TRUE); ab<-as.numeric(names(m))
  ok<-ab>=ASTAR_MIN-AGE_BIN & ab<=ASTAR_MAX+AGE_BIN; if(!any(ok)) return(NA_real_); m<-m[ok]; ab<-ab[ok]
  if(length(m)<3) return(NA_real_); ms<-stats::filter(m,rep(1/3,3)); ms[is.na(ms)]<-m[is.na(ms)]
  min(max(ab[which.max(ms)],ASTAR_MIN),ASTAR_MAX) }
chap <- function(age,A,k,p) A*(1-exp(-k*age))^p
fit_hyb <- function(age,y,Astar){
  ok<-is.finite(age)&is.finite(y)&y>0&age>0; age<-age[ok]; y<-y[ok]; if(length(y)<MIN_FIT) return(NULL)
  if(!is.finite(Astar)) Astar<-ASTAR_MAX
  hf<-function(age,A,k,p,d) chap(age,A,k,p)*exp(-d*pmax(0,age-Astar))
  m<-tryCatch(nls(y~hf(age,A,k,p,d), start=list(A=max(y)*1.1,k=0.03,p=3,d=0.005),
       lower=c(A=0,k=1e-4,p=0.3,d=0), algorithm="port",
       control=nls.control(maxiter=300,warnOnly=TRUE)), error=function(e) NULL)
  if(is.null(m)) return(NULL); co<-coef(m); if(any(!is.finite(co))||co["A"]<=0) return(NULL)
  list(A=unname(co["A"]),k=unname(co["k"]),p=unname(co["p"]),d=unname(co["d"]),Astar=Astar,n=length(y))
}
emit <- function(scope,key,ft,prov,own,fitres){
  if(is.null(fitres)) return(NULL)
  data.frame(scope=scope,cell_key=key,ft_group=ft,prov_code=prov,owner=own,response="carbon_lbac",
    A=round(fitres$A,4),k=round(fitres$k,6),p=round(fitres$p,5),d=round(fitres$d,6),
    Astar=round(fitres$Astar,0),n_plots=fitres$n,stringsAsFactors=FALSE)
}

ROWS<-list()
## state-scope (always) + ft-group fallback fits
st_astar<-culm(pd$STDAGE,pd$carbon_lbac)
ROWS[[length(ROWS)+1]]<-emit("state",ST,NA,NA,NA,fit_hyb(pd$STDAGE,pd$carbon_lbac,st_astar))
ft_fit<-list(); ft_astar<-list()
for(ft in unique(pd$ft_group)){ d<-pd[pd$ft_group==ft,]; a<-culm(d$STDAGE,d$carbon_lbac); if(!is.finite(a))a<-st_astar
  ft_astar[[ft]]<-a; f<-fit_hyb(d$STDAGE,d$carbon_lbac,a); ft_fit[[ft]]<-f }
## cell-scope fits (fallback to ft fit if cell sparse/failed)
for(cl in unique(pd$cell)){ d<-pd[pd$cell==cl,]; ft<-d$ft_group[1]
  a<-if(nrow(d)>=MIN_FIT) culm(d$STDAGE,d$carbon_lbac) else NA; if(!is.finite(a)) a<-ft_astar[[ft]]
  f<-if(nrow(d)>=MIN_FIT) fit_hyb(d$STDAGE,d$carbon_lbac,a) else NULL
  if(is.null(f)) f<-ft_fit[[ft]]
  ROWS[[length(ROWS)+1]]<-emit("cell",cl,ft,d$prov_code[1],d$owner4[1],f) }

fits<-do.call(rbind,ROWS); fits<-fits[!is.na(fits$A),]
write.csv(fits, file.path(out,sprintf("ycx_%s_hybrid_fits.csv",ST)), row.names=FALSE)
cat(sprintf("[hfit] %s: %d hybrid fits (%d cell, %d state) -> ycx_%s_hybrid_fits.csv\n",
    ST, nrow(fits), sum(fits$scope=="cell"), sum(fits$scope=="state"), ST))
