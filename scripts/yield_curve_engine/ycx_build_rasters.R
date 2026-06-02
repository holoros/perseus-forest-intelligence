## ycx_build_rasters.R
## Build summarized CONUS raster overlays from the hybrid yield-curve projection,
## aligned to the PERSEUS explorer's EPSG:5070 Albers overlay grid. Uses FIA plot
## lat/lon (no GDAL/terra needed) projected to Albers in base R, binned to a
## ~20 km grid, rendered to transparent-background PNGs + bounds.json matching
## the conus_<layer>.png / conus_<layer>_bounds.json convention.
##
## Layers (reserve, hybrid engine, FIA-anchored x0.855):
##   conus_hybrid_agc2022   AG live carbon density 2022 (Mg C/ha)
##   conus_hybrid_dagc100   100-yr change in AG carbon density (Mg C/ha)
##   conus_sawtimber_share  sawtimber fraction of AG biomass (%)
##
## Usage: Rscript ycx_build_rasters.R <build_dir> <product_fractions_csv> <out_dir>

args<-commandArgs(trailingOnly=TRUE)
B  <-if(length(args)>=1) args[1] else "."
PF <-if(length(args)>=2) args[2] else file.path(B,"product_fractions_by_cell_age.csv")
OUT<-if(length(args)>=3) args[3] else file.path(B,"out"); dir.create(OUT,showWarnings=FALSE,recursive=TRUE)
LBAC_TO_MGHA<-0.00045359237*2.4710538; ANCHOR<-0.855
## standard CONUS Albers extent used by the explorer overlays (EPSG:5070)
X0<--2561585.0; Y1<-1714610.0; X1<-2463176.0; Y0<--1604872.736; RES<-20000
ncol<-ceiling((X1-X0)/RES); nrow<-ceiling((Y1-Y0)/RES)
cat(sprintf("[rast] grid %d x %d cells @ %d m\n",ncol,nrow,RES))

## ---- explorer's spherical Albers (SVGMap.jsx): radians x EARTH_R = bounds m ----
albers<-function(lon,lat){
  d2r<-pi/180; ER<-6378137
  PHI0<-38*d2r; PHI1<-29.5*d2r; PHI2<-45.5*d2r; LAM0<--96*d2r
  N<-(sin(PHI1)+sin(PHI2))/2; C<-cos(PHI1)^2+2*N*sin(PHI1); RHO0<-sqrt(C-2*N*sin(PHI0))/N
  phi<-lat*d2r; lam<-lon*d2r
  rho<-sqrt(pmax(0,C-2*N*sin(phi)))/N; theta<-N*(lam-LAM0)
  list(x=(rho*sin(theta))*ER, y=(RHO0-rho*cos(theta))*ER)
}

## ---- load data ----
m<-read.csv(file.path(B,"membership_slim.csv"),stringsAsFactors=FALSE)
m<-m[is.finite(m$LAT)&is.finite(m$LON)&is.finite(m$STDAGE)&m$STDAGE>0,]
f<-read.csv(file.path(B,"hybrid_carbon_fits.csv"),stringsAsFactors=FALSE)
H<-new.env()
for(i in seq_len(nrow(f))){ r<-f[i,]; id<-if(r$scope=="state") paste0(r$state,"@@state") else paste0(r$state,"@@",r$cell_key)
  if(is.null(H[[id]])) assign(id, c(r$A,r$k,r$p,r$d,r$Astar), envir=H) }
geth<-function(st,cell){ v<-mget(paste0(st,"@@",cell),H,ifnotfound=list(NULL))[[1]]; if(!is.null(v)) return(v); mget(paste0(st,"@@state"),H,ifnotfound=list(NULL))[[1]] }
hyb<-function(age,p) p[1]*(1-exp(-p[2]*age))^p[3]*exp(-p[4]*pmax(0,age-p[5]))

## product fractions: (state, ft|prov, ageclass) -> saw_bio_frac (+ fallbacks)
pf<-read.csv(PF,stringsAsFactors=FALSE)
AGE_BRK<-c(-Inf,40,80,Inf); AGE_LAB<-c("young<40","mature40-80","old80+")
FK<-paste(pf$state,pf$cell,pf$ageclass,sep="@@"); SAW<-setNames(pf$saw_bio_frac,FK)
cm<-aggregate(saw_bio_frac~state+cell,pf,mean); CMK<-setNames(cm$saw_bio_frac,paste(cm$state,cm$cell,sep="@@"))
sm<-aggregate(saw_bio_frac~state,pf,mean); SMK<-setNames(sm$saw_bio_frac,sm$state)

## ---- per-plot values ----
n<-nrow(m); agc0<-agc100<-saw<-rep(NA_real_,n)
cell<-paste(m$ft_group,m$prov_code,m$owner4,sep="|"); pcell<-paste(m$ft_group,m$prov_code,sep="|")
ac<-as.character(cut(m$STDAGE,AGE_BRK,labels=AGE_LAB))
for(i in seq_len(n)){
  p<-geth(m$state[i],cell[i]); if(is.null(p)) next
  d0<-hyb(m$STDAGE[i],p)*LBAC_TO_MGHA*ANCHOR; d1<-hyb(m$STDAGE[i]+100,p)*LBAC_TO_MGHA*ANCHOR
  if(is.finite(d0)){ agc0[i]<-max(d0,0); agc100[i]<-max(d1,0) }
  s<-SAW[paste(m$state[i],pcell[i],ac[i],sep="@@")]; if(is.na(s)) s<-CMK[paste(m$state[i],pcell[i],sep="@@")]; if(is.na(s)) s<-SMK[m$state[i]]
  saw[i]<-s
}
dagc<-agc100-agc0
xy<-albers(m$LON,m$LAT)
col<-floor((xy$x-X0)/RES)+1; row<-floor((Y1-xy$y)/RES)+1   # row 1 = north
ok<-col>=1&col<=ncol&row>=1&row<=nrow
cat(sprintf("[rast] plots in grid: %d / %d\n",sum(ok,na.rm=TRUE),n))

binmean<-function(val){ s<-matrix(0,nrow,ncol); c<-matrix(0L,nrow,ncol)
  g<-ok&is.finite(val); idx<-cbind(row[g],col[g]); v<-val[g]
  for(j in seq_along(v)){ r<-idx[j,1]; k<-idx[j,2]; s[r,k]<-s[r,k]+v[j]; c[r,k]<-c[r,k]+1L }
  out<-s/c; out[c==0]<-NA; out }

## ---- render a matrix to a transparent PNG with a color ramp ----
render<-function(mat,fname,lo,hi,pal,diverging=FALSE){
  rampf<-colorRamp(pal)
  v<-mat; v[v<lo]<-lo; v[v>hi]<-hi; t<-(v-lo)/(hi-lo)
  rgb<-rampf(ifelse(is.na(t),0,t))
  hex<-rep(NA_character_,length(t))
  good<-!is.na(t)
  hex[good]<-rgb(rgb[good,1],rgb[good,2],rgb[good,3],maxColorValue=255)
  colmat<-matrix(hex,nrow,ncol,byrow=FALSE)
  png(file.path(OUT,fname),width=ncol,height=nrow,bg="transparent")
  par(mar=c(0,0,0,0),xaxs="i",yaxs="i"); plot.new(); plot.window(c(0,1),c(0,1))
  rasterImage(as.raster(colmat),0,0,1,1,interpolate=FALSE); dev.off()
}
SEQG<-c("#f7fcf5","#c7e9c0","#74c476","#31a354","#006d2c")
DIV <-c("#b2182b","#ef8a62","#f7f7f7","#67a9cf","#1b7837")
SEQO<-c("#fff7ec","#fdbb84","#ef6548","#b30000","#7f0000")

render(binmean(agc0),  "conus_hybrid_agc2022.png", 0,250, SEQG)
render(binmean(dagc),  "conus_hybrid_dagc100.png", -60,60, DIV)
render(binmean(saw*100),"conus_sawtimber_share.png",0,90, SEQO)

bj<-sprintf('{"x0": %s, "y1": %s, "x1": %s, "y0": %s}',X0,Y1,X1,Y0)
for(nm in c("conus_hybrid_agc2022","conus_hybrid_dagc100","conus_sawtimber_share"))
  writeLines(bj, file.path(OUT,paste0(nm,"_bounds.json")))
cat("[rast] wrote 3 PNGs + bounds to",OUT,"\n")
## quick stats
cat(sprintf("[rast] agc2022 mean %.0f Mg/ha; dagc mean %.1f; sawtimber mean %.0f%%\n",
  mean(agc0,na.rm=TRUE),mean(dagc,na.rm=TRUE),100*mean(saw,na.rm=TRUE)))
