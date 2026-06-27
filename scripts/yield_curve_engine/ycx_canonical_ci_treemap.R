## ycx_canonical_ci_treemap.R
## CONUS yield curves applied to TreeMap 2022, emitted in the SAME structure as
## the other PERSEUS models (CEM-style per-state CI CSV). Identical scenarios,
## climate arms, and metric schema as ycx_canonical_ci_fiadb.R, but expanded by
## actual TreeMap 30 m pixel area per FIA-imputed plot (not the FIADB A0 model),
## anchored per state so reserve t0 matches the production carbon baseline.
## Loads the VAT once and writes all 48 states for one climate arm.
##
## Usage: Rscript ycx_canonical_ci_treemap.R <out_root> <rcp45|rcp85> [VAT] [carbon_base_csv]

suppressMessages(library(foreign))
ROOT<-commandArgs(TRUE)[1]; RCP<-commandArgs(TRUE)[2]
VAT<-if(length(commandArgs(TRUE))>=3) commandArgs(TRUE)[3] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
CBASE<-if(length(commandArgs(TRUE))>=4) commandArgs(TRUE)[4] else file.path(ROOT,"treemap","conus_scenarios_100yr.csv")
cfg<-file.path(ROOT,"config"); OUT<-file.path(ROOT,"canonical"); dir.create(OUT,showWarnings=FALSE,recursive=TRUE)
LBAC_TO_MGHA<-0.00045359237*2.4710538; TONAC_TO_MGHA<-2.2417; PIX_HA<-0.09; AC_PER_HA<-2.4710538
START<-2025L; STEP<-5L; HORIZON<-100L; years<-seq(START,START+HORIZON,STEP); ny<-length(years); REGEN_AGE<-5L; CI_BAND<-0.08
SCEN<-list(No_harvest=0.00,Harvest_m25_mill=0.75,BAU=1.00,Harvest_p25_pulp=1.25,Harvest_p50_biomass=1.50)
SCALE_RCP<-if(RCP=="rcp85")1.0 else 0.5
REG<-list(Industrial=list(type="clearcut",R=45),NIPF=list(type="partial",E=20,f=0.30),State=list(type="partial",E=25,f=0.25),`Public-Other`=list(type="partial",E=30,f=0.15)); DEF_REG<-"NIPF"
RESP<-c(carbon_lbac="mmt_agc",agb_tonac="mmt_biomass",voltot_cuftac="total_vol_mcf",merchvol_cuftac="merch_vol_mcf")
hyb<-function(age,p) p[1]*(1-exp(-p[2]*age))^p[3]*exp(-p[4]*pmax(0,age-p[5]))
FIPS2ABBR<-c("1"="AL","4"="AZ","5"="AR","6"="CA","8"="CO","9"="CT","10"="DE","12"="FL","13"="GA","16"="ID","17"="IL","18"="IN","19"="IA","20"="KS","21"="KY","22"="LA","23"="ME","24"="MD","25"="MA","26"="MI","27"="MN","28"="MS","29"="MO","30"="MT","31"="NE","32"="NV","33"="NH","34"="NJ","35"="NM","36"="NY","37"="NC","38"="ND","39"="OH","40"="OK","41"="OR","42"="PA","44"="RI","45"="SC","46"="SD","47"="TN","48"="TX","49"="UT","50"="VT","51"="VA","53"="WA","54"="WV","55"="WI","56"="WY")

## VAT + membership
v<-read.dbf(VAT,as.is=TRUE); names(v)<-toupper(names(v)); v<-v[,intersect(c("PLT_CN","COUNT"),names(v))]
v$PLT_CN<-sub("\\.0+$","",format(v$PLT_CN,scientific=FALSE,trim=TRUE))
mf<-list.files(cfg,pattern="^ycx_membership_.*\\.csv$",full.names=TRUE)
mem<-do.call(rbind,lapply(mf,function(f){d<-read.csv(f,colClasses="character"); d[,c("PLT_CN","STATECD","ft_group","prov_code","owner4","STDAGE")]}))
mem<-mem[!duplicated(mem$PLT_CN),]; mem$STDAGE<-suppressWarnings(as.numeric(mem$STDAGE))
key<-match(v$PLT_CN,mem$PLT_CN); v<-v[!is.na(key),]; mm<-mem[key[!is.na(key)],]
v<-cbind(v,mm[,c("STATECD","ft_group","prov_code","owner4","STDAGE")]); v<-v[is.finite(v$STDAGE)&v$STDAGE>0,]
v$abbr<-FIPS2ABBR[as.character(as.integer(v$STATECD))]; v<-v[!is.na(v$abbr),]
v$cell<-paste(v$ft_group,v$prov_code,v$owner4,sep="|"); v$area_ha<-v$COUNT*PIX_HA
v$oreg<-ifelse(v$owner4 %in% names(REG),v$owner4,DEF_REG)
cat(sprintf("[ci-tm %s] imputations: %d\n",RCP,nrow(v)))

## hybrid fits per state, per response
HF<-list()
for(st in unique(v$abbr)){ fp<-file.path(ROOT,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp)) next
  f<-read.csv(fp,stringsAsFactors=FALSE)
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-paste(st,r$response,if(r$scope=="state")"state" else r$cell_key,sep="@@"); if(is.null(HF[[id]])) HF[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)} }
geth<-function(st,rv,cell){v<-HF[[paste(st,rv,cell,sep="@@")]]; if(!is.null(v))return(v); HF[[paste(st,rv,"state",sep="@@")]]}
## mgmt shares + climate
sh<-read.csv("~/zenodo_staging/perseus-yield-curves/zenodo_upload/fia_mgmt_shares_bystate.csv",stringsAsFactors=FALSE)
csi<-read.csv(file.path(cfg,"csi_states_ext.csv"),stringsAsFactors=FALSE)
CSI_BETA<-as.numeric(readLines(file.path(cfg,"ycx_beta.txt"))[1]); if(!is.finite(CSI_BETA))CSI_BETA<-0.45
bnd<-tryCatch(read.csv(file.path(ROOT,"ycx_fit_bands.csv"),stringsAsFactors=FALSE),error=function(e)NULL)
band_of<-function(stt,rvname){ if(!is.null(bnd)){ x<-suppressWarnings(as.numeric(bnd$rel_band[bnd$state==stt & bnd$response==rvname])); if(length(x)&&is.finite(x[1])) return(x[1]) }; CI_BAND }
pm_state<-function(st){ cr<-csi[csi$state==st,]; if(nrow(cr)==1 && is.finite(cr$csi_2090)){ ci<-approx(c(2030,2060,2090),c(cr$csi_2030,cr$csi_2060,cr$csi_2090),xout=pmin(pmax(years,2030),2090),rule=2)$y; 1+SCALE_RCP*CSI_BETA*(ci/cr$csi_2030-1) } else rep(1,ny) }

proj_resv<-function(a0,p) hyb(a0+(years-START),p)
proj_harv<-function(a0,p,reg){ s<-numeric(ny)
  if(reg$type=="clearcut"){age<-a0;for(j in 1:ny){if(j>1){age<-age+STEP;if(age>=reg$R)age<-REGEN_AGE+(age-reg$R)};s[j]<-hyb(age,p)}}
  else {S<-hyb(a0,p);for(j in 1:ny){ra<-a0+(years[j]-START);if(j>1){S<-max(S+(hyb(ra,p)-hyb(ra-STEP,p)),0);if(floor(ra/reg$E)>floor((ra-STEP)/reg$E))S<-(1-reg$f)*S};s[j]<-S}}
  s }

states<-sort(unique(v$abbr))
## accumulate per state: reserve & harvest area-weighted totals per response (native units * area)
RES<-setNames(lapply(states,function(.) matrix(0,ny,length(RESP),dimnames=list(NULL,names(RESP)))),states)
HAR<-setNames(lapply(states,function(.) matrix(0,ny,length(RESP),dimnames=list(NULL,names(RESP)))),states)
PMc<-setNames(lapply(states,pm_state),states)
n_noc<-0L
for(i in seq_len(nrow(v))){ st<-v$abbr[i]; pmv<-PMc[[st]]; ar<-v$area_ha[i]; reg<-REG[[v$oreg[i]]]; a0<-v$STDAGE[i]
  ok<-FALSE
  for(rv in names(RESP)){ p<-geth(st,rv,v$cell[i]); if(is.null(p)) next; ok<-TRUE
    r<-proj_resv(a0,p)*pmv; h<-proj_harv(a0,p,reg)*pmv; r[!is.finite(r)|r<0]<-0; h[!is.finite(h)|h<0]<-0
    # native unit * area -> per-response total contribution (carbon lb/ac->Tg etc done later)
    RES[[st]][,rv]<-RES[[st]][,rv]+r*ar; HAR[[st]][,rv]<-HAR[[st]][,rv]+h*ar }
  if(!ok) n_noc<-n_noc+1L }
cat(sprintf("[ci-tm %s] no-curve imputations: %d\n",RCP,n_noc))

## anchor: scale carbon so reserve t0 matches production baseline (conus_scenarios_100yr reserve yr0)
bl<-read.csv(CBASE,stringsAsFactors=FALSE); bl<-bl[bl$scenario=="reserve (no harvest)"&bl$year_offset==0,]; blt0<-setNames(bl$agc_Tg,bl$state)
unit_tot<-function(rv,vec_native_x_area){ # vec already native*area summed
  if(rv=="carbon_lbac") return(vec_native_x_area*LBAC_TO_MGHA/1e6)   # Tg C
  if(rv=="agb_tonac")   return(vec_native_x_area*TONAC_TO_MGHA/1e6)  # Tg dry
  return(vec_native_x_area*AC_PER_HA/1e6) }                          # vols: cuft/ac*ha*ac/ha=cuft total /1e6 = Mcf
NA_POOLS<-c("mmt_bgc","mmt_dead_c","mmt_litter_c","mmt_soil_c","mmt_under_c","mmt_total_c","rd_mean_wtd","sdi_mean_wtd")
rows<-list()
for(st in states){ sh_r<-sh[sh$state==st,]; harv<-if(nrow(sh_r))sh_r$harvested_share[1] else 0.12; resv<-if(nrow(sh_r))sh_r$reserved_share[1] else 0.02
  phi_bau<-min(harv,1-resv)
  res_c_t0<-unit_tot("carbon_lbac",RES[[st]][1,"carbon_lbac"]); scal<-if(!is.na(blt0[st])&&res_c_t0>0) blt0[st]/res_c_t0 else 1
  area_mha<-sum(v$area_ha[v$abbr==st])/1e6; ncond<-sum(v$abbr==st)
  for(sc in names(SCEN)){ Q<-SCEN[[sc]]; phi<-min(phi_bau*Q,1-resv)
    for(j in 1:ny){ row<-list(scenario=sc,cycle=j,year=years[j])
      for(rv in names(RESP)){ blended<-phi*HAR[[st]][j,rv]+(1-phi)*RES[[st]][j,rv]; tot<-unit_tot(rv,blended)*scal
        mc<-RESP[[rv]]; bb<-band_of(st,rv); row[[paste0(mc,"_mean")]]<-round(tot,5); row[[paste0(mc,"_lo")]]<-round(tot*(1-bb),5); row[[paste0(mc,"_hi")]]<-round(tot*(1+bb),5) }
      for(mc in NA_POOLS) for(s in c("_mean","_lo","_hi")) row[[paste0(mc,s)]]<-NA_real_
      row[["total_area_mha_mean"]]<-round(area_mha,5); row[["total_area_mha_lo"]]<-round(area_mha,5); row[["total_area_mha_hi"]]<-round(area_mha,5)
      row[["n_sims"]]<-1; row[["n_conditions"]]<-ncond
      rows[[length(rows)+1]]<-c(state=st,row) } } }
df<-do.call(rbind,lapply(rows,as.data.frame,stringsAsFactors=FALSE))
for(st in states){ f<-file.path(OUT,sprintf("ci_yc_treemap_%s_%s.csv",tolower(st),RCP)); write.csv(df[df$state==st,setdiff(names(df),"state")],f,row.names=FALSE) }
cat(sprintf("[ci-tm %s] wrote %d state files. CONUS reserve agc 2025=%.0f 2125=%.0f Tg\n",RCP,length(states),
  sum(sapply(states,function(s){d<-df[df$state==s&df$scenario=="No_harvest"&df$year==2025,];as.numeric(d$mmt_agc_mean)})),
  sum(sapply(states,function(s){d<-df[df$state==s&df$scenario=="No_harvest"&df$year==2125,];as.numeric(d$mmt_agc_mean)}))))
