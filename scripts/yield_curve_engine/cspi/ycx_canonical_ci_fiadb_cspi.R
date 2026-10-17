## ycx_canonical_ci_fiadb.R
## CONUS yield curves applied to FIADB, emitted in the SAME structure as the
## other PERSEUS models (CEM-style per-state CI CSV: scenario, cycle, year,
## mmt_*_mean/lo/hi, ..., n_sims, n_conditions), so it ingests via the canonical
## adapter alongside CEM/FVS/CBM.
##
## Scenarios (CEM harvest_Q multipliers on the working harvested fraction):
##   No_harvest 0.00, Harvest_m25_mill 0.75, BAU 1.00, Harvest_p25_pulp 1.25,
##   Harvest_p50_biomass 1.50.   managed = phi*harvest_traj + (1-phi)*reserve,
##   phi = min(harvested_share * harvest_Q, 1 - reserved_share) per state (FIADB
##   management shares); No_harvest = reserve.
## Climate arm (rcp45/rcp85): productivity multiplier on the curve asymptote from
##   the CSI stress trajectory, pm(t)=1+SCALE_rcp*CSI_BETA*(CSI(t)/CSI_2030-1),
##   SCALE rcp45=0.5, rcp85=1.0 (rcp85 = full CSI stress). [YC has no rcp-native
##   climate; this is the documented YC climate parameterization.]
## Expansion (FIADB): state total = density * area, area = n_plots*A0 with A0
##   anchored so AG-carbon 2025 reproduces fia.json tg_agc (median A0 elsewhere),
##   matching the existing yc_fia_empirical area model.
## Metrics emitted (YC AG subset of the CEM schema; BGC/dead/litter/soil/
##   understory/total_ecosystem/rd/sdi left NA -- not YC outputs):
##   mmt_agc (Tg C), mmt_biomass (Tg dry), total_vol_mcf, merch_vol_mcf,
##   total_area_mha. CI band = +/-8% (fit/parameter uncertainty placeholder).
##
## Usage: Rscript ycx_canonical_ci_fiadb.R <ST> <out_dir> <fia_json> <mgmt_shares_csv> <rcp45|rcp85>

args<-commandArgs(trailingOnly=TRUE)
ST  <-toupper(args[1]); OUT<-args[2]; FIAJSON<-args[3]; SHARES<-args[4]; RCP<-args[5]
dir.create(OUT,showWarnings=FALSE,recursive=TRUE)
cfg<-file.path(OUT,"..","config"); if(!dir.exists(cfg)) cfg<-"config"
LBAC_TO_MGHA<-0.00045359237*2.4710538; TONAC_TO_MGHA<-2.2417; CUFTAC_TO_M3HA<-0.069972; AC_PER_HA<-2.4710538
START<-2025L; STEP<-5L; HORIZON<-100L; years<-seq(START,START+HORIZON,STEP)
REGEN_AGE<-5L; CI_BAND<-0.08
SCEN<-list(No_harvest=0.00, Harvest_m25_mill=0.75, BAU=1.00, Harvest_p25_pulp=1.25, Harvest_p50_biomass=1.50)
SCALE_RCP<-if(RCP=="rcp85") 1.0 else 0.5
## owner-typical regimes (from ycx_02_perseus.R)
REG<-list(Industrial=list(type="clearcut",R=45),NIPF=list(type="partial",E=20,f=0.30),
          State=list(type="partial",E=25,f=0.25),`Public-Other`=list(type="partial",E=30,f=0.15)); DEF_REG<-"NIPF"
hyb<-function(age,p) p[1]*(1-exp(-p[2]*age))^p[3]*exp(-p[4]*pmax(0,age-p[5]))
RESP<-c(carbon_lbac="mmt_agc", agb_tonac="mmt_biomass", voltot_cuftac="total_vol_mcf", merchvol_cuftac="merch_vol_mcf")
CONV<-c(carbon_lbac=LBAC_TO_MGHA, agb_tonac=TONAC_TO_MGHA, voltot_cuftac=1, merchvol_cuftac=1) # vols stay cuft/ac -> scaled at expansion

cat(sprintf("[ci-fiadb] %s %s\n",ST,RCP))
## ---- inputs ----
fit<-read.csv(file.path(OUT,"..",sprintf("ycx_%s_hybrid_fits.csv",ST)),stringsAsFactors=FALSE)
if (identical(Sys.getenv("YCX_CSPI_ASYM"),"1")) {
  .cs<-tryCatch(read.csv(file.path(OUT,"..","ycx_cell_cspi.csv"),stringsAsFactors=FALSE),error=function(e)NULL)
  if(!is.null(.cs)){
    .REF<-56.36;.BETA<-1.0;.CLO<-0.80;.CHI<-1.25;.N0<-30
    .cm<-setNames(.cs$cspi_mean[.cs$level=="cell"],.cs$key[.cs$level=="cell"])
    .k2<-paste(fit$ft_group,fit$prov_code,sep="|")
    .cv<-.cm[.k2];.raw<-(.cv/.REF)^.BETA;.raw[!is.finite(.raw)]<-1
    .cl<-pmin(pmax(.raw,.CLO),.CHI)
    .nn<-suppressWarnings(as.numeric(fit$n_plots));.nn[!is.finite(.nn)]<-0
    .scal<-1+(.N0/(.N0+.nn))*(.cl-1)
    .fit0<-fit; fit$A<-fit$A*.scal
    .H0<-list(); for(i in seq_len(nrow(.fit0))){r<-.fit0[i,]; if(r$response=="carbon_lbac"){id<-if(r$scope=="state")"state" else r$cell_key; if(is.null(.H0[[id]])) .H0[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)}}
    geth0<-function(cell){v<-.H0[[cell]]; if(!is.null(v))return(v); .H0[["state"]]}
    .CSPI_ON<-TRUE
    cat(sprintf("[cspi] %s scaled %d rows scalar med=%.3f range %.2f-%.2f\n",ST,nrow(fit),median(.scal,na.rm=TRUE),min(.scal,na.rm=TRUE),max(.scal,na.rm=TRUE)))
  }
}
H<-list(); for(i in seq_len(nrow(fit))){r<-fit[i,]; id<-paste(r$response, if(r$scope=="state")"state" else r$cell_key, sep="@@"); if(is.null(H[[id]])) H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)}
geth<-function(rv,cell){v<-H[[paste(rv,cell,sep="@@")]]; if(!is.null(v))return(v); H[[paste(rv,"state",sep="@@")]]}
mem<-read.csv(file.path(cfg,sprintf("ycx_membership_%s.csv",ST)),stringsAsFactors=FALSE)
mem<-mem[order(mem$PLT_CN,-mem$INVYR),]; mem<-mem[!duplicated(mem$PLT_CN),]
mem<-mem[!is.na(mem$STDAGE)&mem$STDAGE>0,]
mem$cell<-paste(mem$ft_group,mem$prov_code,mem$owner4,sep="|")
mem$oreg<-ifelse(mem$owner4 %in% names(REG),mem$owner4,DEF_REG)
sh<-read.csv(SHARES,stringsAsFactors=FALSE); shr<-sh[sh$state==ST,]
harv<-if(nrow(shr)) shr$harvested_share[1] else 0.12; resv<-if(nrow(shr)) shr$reserved_share[1] else 0.02
csi<-read.csv(file.path(cfg,"csi_states_ext.csv"),stringsAsFactors=FALSE); cr<-csi[csi$state==ST,]
CSI_BETA<-as.numeric(readLines(file.path(cfg,"ycx_beta.txt"))[1]); if(!is.finite(CSI_BETA))CSI_BETA<-0.45
pm<-rep(1,length(years))
if(nrow(cr)==1 && is.finite(cr$csi_2090)){ ci<-approx(c(2030,2060,2090),c(cr$csi_2030,cr$csi_2060,cr$csi_2090),xout=pmin(pmax(years,2030),2090),rule=2)$y
  pm<-1+SCALE_RCP*CSI_BETA*(ci/cr$csi_2030-1) }
fa<-tryCatch(read.csv(FIAJSON,stringsAsFactors=FALSE),error=function(e) NULL)  # FIAJSON = csv: state,tg_agc
## data-driven CI band: per-response relative population lack-of-fit (ycx_fit_band.R),
## replacing the flat CI_BAND placeholder. Fallback to CI_BAND if a value is missing.
bnd<-tryCatch(read.csv(file.path(OUT,"..","ycx_fit_bands.csv"),stringsAsFactors=FALSE),error=function(e)NULL)
band_of<-function(rvname){ if(!is.null(bnd)){ x<-suppressWarnings(as.numeric(bnd$rel_band[bnd$state==ST & bnd$response==rvname])); if(length(x)&&is.finite(x[1])) return(x[1]) }; CI_BAND }

## ---- per-plot reserve + harvest trajectories, per response, climate-adjusted ----
ny<-length(years); n<-nrow(mem)
proj_resv<-function(age0,p){ hyb(age0+(years-START),p) }
proj_harv<-function(age0,p,reg){ s<-numeric(ny)
  if(reg$type=="clearcut"){ age<-age0; for(j in 1:ny){ if(j>1){age<-age+STEP; if(age>=reg$R) age<-REGEN_AGE+(age-reg$R)}; s[j]<-hyb(age,p)} }
  else { S<-hyb(age0,p); for(j in 1:ny){ ra<-age0+(years[j]-START); if(j>1){S<-max(S+(hyb(ra,p)-hyb(ra-STEP,p)),0); if(floor(ra/reg$E)>floor((ra-STEP)/reg$E)) S<-(1-reg$f)*S}; s[j]<-S} }
  s }
## accumulate per response: density-sum over plots (mean density * n) for reserve & harvest
sumR<-setNames(vector("list",length(RESP)),names(RESP)); sumH<-sumR; npl<-setNames(rep(0L,length(RESP)),names(RESP))
for(rv in names(RESP)){ R<-numeric(ny); Hm<-numeric(ny); cnt<-0L
  for(i in 1:n){ p<-geth(rv,mem$cell[i]); if(is.null(p)) next
    r<-proj_resv(mem$STDAGE[i],p)*pm; h<-proj_harv(mem$STDAGE[i],p,REG[[mem$oreg[i]]])*pm
    r[!is.finite(r)|r<0]<-0; h[!is.finite(h)|h<0]<-0
    R<-R+r; Hm<-Hm+h; cnt<-cnt+1L }
  sumR[[rv]]<-as.numeric(R); sumH[[rv]]<-as.numeric(Hm); npl[rv]<-cnt }
# mean density per plot
for(rv in names(RESP)){ sumR[[rv]]<-sumR[[rv]]/max(npl[rv],1); sumH[[rv]]<-sumH[[rv]]/max(npl[rv],1) }

## ---- FIADB area model: anchor to REAL per-state forest area ----
## Priority: (1) fia.json official AG-carbon anchor for published states -> solve
##   area so reserve carbon 2025 reproduces fia.json exactly; (2) else real
##   per-state forest area from TreeMap 2022 (forested-pixel area, EPSG:5070).
##   On the 7 fia.json states the two areas agree to <=~5% (e.g. OR 10.11 vs
##   10.55 Mha), so the seam is smooth. The old flat A0=2400 ha/plot assumed every
##   FIA plot represented 2400 ha of FOREST, which over-expands sparsely forested
##   states (e.g. WV 7184 plots -> 17.2 Mha, exceeding the state's land area).
nplots<-npl["carbon_lbac"]
dens_c_2025<-sumR[["carbon_lbac"]][1]*LBAC_TO_MGHA   # Mg C/ha reserve 2025
tg<-if(!is.null(fa)&&ST %in% fa$state) fa$tg_agc[fa$state==ST][1] else NA
tma<-tryCatch(read.csv(file.path(OUT,"treemap_area.csv"),stringsAsFactors=FALSE),error=function(e)NULL)
tm_mha<-if(!is.null(tma)&&ST %in% tma$state) tma$area_mha[tma$state==ST][1] else NA
if(is.finite(tg)&&dens_c_2025>0&&nplots>0){ area_ha<-tg*1e6/dens_c_2025; anchor_src<-"fia.json" } else
if(is.finite(tm_mha)){ area_ha<-tm_mha*1e6; anchor_src<-"treemap_area" } else { area_ha<-nplots*2400; anchor_src<-"flat2400" }
if (exists(".CSPI_ON") && isTRUE(.CSPI_ON) && anchor_src!="fia.json") {
  .db<-0;.cnt<-0L
  for(i in 1:n){ p<-geth0(mem$cell[i]); if(is.null(p)) next; v<-hyb(mem$STDAGE[i],p)*pm[1]; if(is.finite(v)&&v>0){.db<-.db+v;.cnt<-.cnt+1L} }
  .dens_base<-(.db/max(.cnt,1))*LBAC_TO_MGHA
  if(.dens_base>0 && dens_c_2025>0){ area_ha<-area_ha*.dens_base/dens_c_2025; area_mha<-area_ha/1e6; anchor_src<-paste0(anchor_src,"+t0pin") }
}
A0<-area_ha/max(nplots,1); area_mha<-area_ha/1e6
phi_bau<-min(harv, 1-resv)

## ---- build CI rows: scenario x year ----
rows<-list()
to_total<-function(rv, dens_meanperplot){  # dens_meanperplot in native units/ac; return state total in metric unit
  if(rv=="carbon_lbac") return(dens_meanperplot*LBAC_TO_MGHA*area_ha/1e6)        # Tg C
  if(rv=="agb_tonac")   return(dens_meanperplot*TONAC_TO_MGHA*area_ha/1e6)       # Tg dry
  if(rv=="voltot_cuftac")  return(dens_meanperplot*(area_ha*AC_PER_HA)/1e6)      # Mcf (cuft total /1e6)
  if(rv=="merchvol_cuftac")return(dens_meanperplot*(area_ha*AC_PER_HA)/1e6) }
for(sc in names(SCEN)){ Q<-SCEN[[sc]]; phi<-min(phi_bau*Q, 1-resv)
  for(j in 1:ny){ row<-list(scenario=sc, cycle=j, year=years[j])
    for(rv in names(RESP)){ blended<-phi*sumH[[rv]][j]+(1-phi)*sumR[[rv]][j]; tot<-to_total(rv,blended)
      mc<-RESP[[rv]]; bb<-band_of(rv); row[[paste0(mc,"_mean")]]<-round(tot,5); row[[paste0(mc,"_lo")]]<-round(tot*(1-bb),5); row[[paste0(mc,"_hi")]]<-round(tot*(1+bb),5) }
    ## CEM pool columns the YC engine does not model -> NA (schema parity for ingest_cem_state.R)
    for(mc in c("mmt_bgc","mmt_dead_c","mmt_litter_c","mmt_soil_c","mmt_under_c","mmt_total_c","rd_mean_wtd","sdi_mean_wtd"))
      for(s in c("_mean","_lo","_hi")) row[[paste0(mc,s)]]<-NA_real_
    row[["total_area_mha_mean"]]<-round(area_mha,5); row[["total_area_mha_lo"]]<-round(area_mha,5); row[["total_area_mha_hi"]]<-round(area_mha,5)
    row[["n_sims"]]<-1; row[["n_conditions"]]<-nplots
    rows[[length(rows)+1]]<-as.data.frame(row,stringsAsFactors=FALSE) } }
df<-do.call(rbind,rows)
f<-file.path(OUT,sprintf("ci_yc_fiadb_%s_%s.csv",tolower(ST),RCP)); write.csv(df,f,row.names=FALSE)
cat(sprintf("[ci-fiadb] %s %s: anchor=%s A0=%.0f ha/plot area=%.2f Mha phi_bau=%.3f -> %s (%d rows)\n",ST,RCP,anchor_src,A0,area_mha,phi_bau,basename(f),nrow(df)))
cat(sprintf("  reserve agc 2025=%.1f 2125=%.1f Tg; BAU agc 2125=%.1f\n",
  df$mmt_agc_mean[df$scenario=="No_harvest"&df$year==2025], df$mmt_agc_mean[df$scenario=="No_harvest"&df$year==2125], df$mmt_agc_mean[df$scenario=="BAU"&df$year==2125]))
