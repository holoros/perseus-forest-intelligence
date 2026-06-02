## ycx_treemap_scenarios_hybrid.R
## Production-candidate: 4-scenario CONUS carbon projection using the HYBRID
## carbon curve (ycx_hybrid_fit2.R) instead of peak-decline, FIA-anchored
## per state so reserve t0 matches the production baseline. Same owner harvest
## regimes as ycx_treemap_scenarios.R. Built-in cross-check: anchored reserve
## should reproduce CONUS 10,002 -> 11,794 Tg.
##
## Output: treemap/conus_scenarios_hybrid_100yr.csv  (state x scenario x year -> agc_Tg)
##         treemap/conus_scenario_hybrid_summary.csv
## Usage: Rscript ycx_treemap_scenarios_hybrid.R [out_dir] [VAT] [baseline_scenarios_csv]

suppressMessages(library(foreign))
out<-if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dir.create(td,showWarnings=FALSE,recursive=TRUE)
VAT<-if(length(commandArgs(TRUE))>=2) commandArgs(TRUE)[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
BASE<-if(length(commandArgs(TRUE))>=3) commandArgs(TRUE)[3] else file.path(td,"conus_scenarios_100yr.csv")  # peak-decline baseline for anchoring

TM_BASE<-2022L; START<-TM_BASE; HORIZON<-100L; STEP<-5L; REGEN_AGE<-5L
years<-seq(START,START+HORIZON,by=STEP); offs<-seq(0,100,10); ocol<-match(offs,years-START)
LBAC_TO_MGHA<-0.00045359237*2.4710538; PIX_HA<-0.09
REG<-list(Industrial=list(type="clearcut",R=45),NIPF=list(type="partial",E=20,f=0.30),
          State=list(type="partial",E=25,f=0.25),`Public-Other`=list(type="partial",E=30,f=0.15)); DEF_REG<-"NIPF"
scale_reg<-function(reg,sr,sf) lapply(reg,function(x){ if(x$type=="clearcut") list(type="clearcut",R=max(10,round(x$R*sr)))
  else list(type="partial",E=max(5,round(x$E*sr)),f=min(0.9,x$f*sf)) })
SCEN<-list(`reserve (no harvest)`=NULL,`managed (harvest)`=REG,`managed (intensive)`=scale_reg(REG,0.7,1.3),`managed (conservation)`=scale_reg(REG,1.6,0.5))
FIPS2ABBR<-c("1"="AL","4"="AZ","5"="AR","6"="CA","8"="CO","9"="CT","10"="DE","12"="FL","13"="GA","16"="ID","17"="IL","18"="IN","19"="IA","20"="KS","21"="KY","22"="LA","23"="ME","24"="MD","25"="MA","26"="MI","27"="MN","28"="MS","29"="MO","30"="MT","31"="NE","32"="NV","33"="NH","34"="NJ","35"="NM","36"="NY","37"="NC","38"="ND","39"="OH","40"="OK","41"="OR","42"="PA","44"="RI","45"="SC","46"="SD","47"="TN","48"="TX","49"="UT","50"="VT","51"="VA","53"="WA","54"="WV","55"="WI","56"="WY")
hyb<-function(age,A,k,p,d,As) A*(1-exp(-k*age))^p*exp(-d*pmax(0,age-As))

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

## hybrid carbon fits (response carbon_lbac): cell + state fallback
H<-list()
for(st in unique(v$abbr)){ fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp)) next
  f<-read.csv(fp,stringsAsFactors=FALSE); f<-f[f$response=="carbon_lbac",]
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key)
    if(is.null(H[[id]])) H[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)} }
geth<-function(st,cell){k<-H[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); H[[paste0(st,"@@state")]]}

ny<-length(years)
proj<-function(age0,abc,regset,owner){ A<-abc[1];k<-abc[2];p<-abc[3];dd<-abc[4];As<-abc[5]
  stock<-numeric(ny)
  if(is.null(regset)){ stock<-hyb(age0+(years-START),A,k,p,dd,As); stock[!is.finite(stock)|stock<0]<-0; return(stock) }
  reg<-regset[[owner]]
  if(reg$type=="clearcut"){ age<-age0
    for(j in seq_len(ny)){ if(j>1){age<-age+STEP; if(age>=reg$R) age<-REGEN_AGE+(age-reg$R)}; stock[j]<-hyb(age,A,k,p,dd,As) }
  } else { S<-hyb(age0,A,k,p,dd,As)
    for(j in seq_len(ny)){ ra<-age0+(years[j]-START)
      if(j>1){ S<-max(S+(hyb(ra,A,k,p,dd,As)-hyb(ra-STEP,A,k,p,dd,As)),0)
        if(floor(ra/reg$E)>floor((ra-STEP)/reg$E)) S<-(1-reg$f)*S }
      stock[j]<-S } }
  stock[!is.finite(stock)|stock<0]<-0; stock }

states<-sort(unique(v$abbr)); scn<-names(SCEN)
acc<-setNames(lapply(scn,function(.) matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs)))),scn)
n_noc<-0L
for(i in seq_len(nrow(v))){ abc<-geth(v$abbr[i],v$cell[i]); if(is.null(abc)){n_noc<-n_noc+1L;next}
  si<-match(v$abbr[i],states); ar<-v$area_ha[i]; ow<-v$oreg[i]
  for(sc in scn){ stock<-proj(v$STDAGE[i],abc,SCEN[[sc]],ow)[ocol]*LBAC_TO_MGHA*ar/1e6; acc[[sc]][si,]<-acc[[sc]][si,]+stock } }
cat(sprintf("[scn-hyb] projected %d imputations (no curve %d)\n",nrow(v)-n_noc,n_noc))

## per-state anchoring scalar from reserve t0 vs production baseline reserve t0
bl<-read.csv(BASE,stringsAsFactors=FALSE); bl<-bl[bl$scenario=="reserve (no harvest)" & bl$year_offset==0,]
bl_t0<-setNames(bl$agc_Tg,bl$state)
res_t0<-acc[["reserve (no harvest)"]][,"yr0"]
scal<-ifelse(res_t0>0, bl_t0[states]/res_t0, 1); scal[is.na(scal)]<-1
for(sc in scn) acc[[sc]]<-acc[[sc]]*scal
cat(sprintf("[scn-hyb] anchoring: median per-state scalar %.3f\n", median(scal,na.rm=TRUE)))

long<-do.call(rbind,lapply(scn,function(sc) do.call(rbind,lapply(states,function(st)
  data.frame(state=st,scenario=sc,year_offset=offs,agc_Tg=round(acc[[sc]][st,],3),row.names=NULL)))))
write.csv(long,file.path(td,"conus_scenarios_hybrid_100yr.csv"),row.names=FALSE)
summ<-do.call(rbind,lapply(scn,function(sc){cs<-colSums(acc[[sc]])
  data.frame(scenario=sc,t0=round(cs["yr0"],0),t100=round(cs["yr100"],0),pct=round(100*(cs["yr100"]/cs["yr0"]-1),1),row.names=NULL)}))
write.csv(summ,file.path(td,"conus_scenario_hybrid_summary.csv"),row.names=FALSE)
cat("\n[scn-hyb] === CONUS hybrid scenarios (anchored, Tg C) ===\n"); print(summ,row.names=FALSE)
cat(sprintf("[scn-hyb] reserve cross-check: t0=%.0f t100=%.0f (expect ~10002 / ~11794)\n",
    summ$t0[summ$scenario=="reserve (no harvest)"], summ$t100[summ$scenario=="reserve (no harvest)"]))
