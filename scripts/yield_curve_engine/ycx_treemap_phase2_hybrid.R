## ycx_treemap_phase2_hybrid.R
## Phase-2: make products + HWP net consistent with the hybrid carbon engine.
## One pass over TreeMap pixels per scenario, running the owner harvest regime
## on a shared age/knockdown path, evaluating BOTH hybrid curves:
##   carbon_lbac  -> carbon stock + carbon REMOVED (off-stump) per step
##   agb_tonac    -> biomass stock, split into sawtimber/pulpwood/residue by
##                   the per-cell x age-class product fractions
## Both curves are FIA-anchored per state (carbon to the production carbon
## baseline; biomass to the production product-total baseline). Partial cuts
## reduce both stocks by the removal fraction; clearcut resets age.
##
## Outputs (treemap/):
##   conus_products_scenarios_hybrid_100yr.csv  state x scenario x product x yr -> bio_Tg
##   conus_harvest_removed_hybrid.csv           state x scenario x yr -> removed_cum_Tg (carbon)
##
## Usage: Rscript ycx_treemap_phase2_hybrid.R [out_dir] [VAT] [carbon_base_csv] [prod_base_csv]

suppressMessages(library(foreign))
out<-if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); dir.create(td,showWarnings=FALSE,recursive=TRUE)
VAT<-if(length(commandArgs(TRUE))>=2) commandArgs(TRUE)[2] else "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"
CBASE<-if(length(commandArgs(TRUE))>=3) commandArgs(TRUE)[3] else file.path(td,"conus_scenarios_100yr.csv")            # peak-decline carbon baseline (reserve t0)
PBASE<-if(length(commandArgs(TRUE))>=4) commandArgs(TRUE)[4] else file.path(td,"conus_products_scenarios_100yr.csv")   # peak-decline product baseline (reserve t0 sum)

TM_BASE<-2022L; START<-TM_BASE; HORIZON<-100L; STEP<-5L; REGEN_AGE<-5L
years<-seq(START,START+HORIZON,by=STEP); offs<-seq(0,100,10); ocol<-match(offs,years-START)
LBAC_TO_MGHA<-0.00045359237*2.4710538; TONAC_TO_MGHA<-2.2417; PIX_HA<-0.09
AGE_BRK<-c(-Inf,40,80,Inf); AGE_LAB<-c("young<40","mature40-80","old80+"); PROD<-c("sawtimber","pulpwood","residue")
REG<-list(Industrial=list(type="clearcut",R=45),NIPF=list(type="partial",E=20,f=0.30),State=list(type="partial",E=25,f=0.25),`Public-Other`=list(type="partial",E=30,f=0.15)); DEF_REG<-"NIPF"
scale_reg<-function(reg,sr,sf) lapply(reg,function(x){ if(x$type=="clearcut") list(type="clearcut",R=max(10,round(x$R*sr))) else list(type="partial",E=max(5,round(x$E*sr)),f=min(0.9,x$f*sf)) })
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
v$cell<-paste(v$ft_group,v$prov_code,v$owner4,sep="|"); v$pcell<-paste(v$ft_group,v$prov_code,sep="|")
v$area_ha<-v$COUNT*PIX_HA; v$oreg<-ifelse(v$owner4 %in% names(REG),v$owner4,DEF_REG)

## hybrid fits: carbon + biomass, cell + state fallback
loadfit<-function(rv){ L<-list()
  for(st in unique(v$abbr)){ fp<-file.path(out,sprintf("ycx_%s_hybrid_fits.csv",st)); if(!file.exists(fp)) next
    f<-read.csv(fp,stringsAsFactors=FALSE); f<-f[f$response==rv,]
    for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key)
      if(is.null(L[[id]])) L[[id]]<-c(r$A,r$k,r$p,r$d,r$Astar)} }
  L }
HC<-loadfit("carbon_lbac"); HB<-loadfit("agb_tonac")
getf<-function(L,st,cell){k<-L[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); L[[paste0(st,"@@state")]]}

## product fractions (state, ft|prov, ageclass) -> saw/pulp/res biomass fracs
pf<-read.csv(file.path(out,"products","product_fractions_by_cell_age.csv"),stringsAsFactors=FALSE)
pf<-pf[is.finite(pf$saw_bio_frac+pf$pulp_bio_frac+pf$res_bio_frac),]
FR<-setNames(lapply(seq_len(nrow(pf)),function(i)c(pf$saw_bio_frac[i],pf$pulp_bio_frac[i],pf$res_bio_frac[i])),paste(pf$state,pf$cell,pf$ageclass,sep="@@"))
cm<-aggregate(cbind(saw_bio_frac,pulp_bio_frac,res_bio_frac)~state+cell,pf,mean); CM<-setNames(lapply(seq_len(nrow(cm)),function(i)as.numeric(cm[i,3:5])),paste(cm$state,cm$cell,sep="@@"))
sm<-aggregate(cbind(saw_bio_frac,pulp_bio_frac,res_bio_frac)~state,pf,mean); SM<-setNames(lapply(seq_len(nrow(sm)),function(i)as.numeric(sm[i,2:4])),sm$state)
getfrac<-function(st,pc,ac){f<-FR[[paste(st,pc,ac,sep="@@")]];if(!is.null(f))return(f); f<-CM[[paste(st,pc,sep="@@")]];if(!is.null(f))return(f); f<-SM[[st]];if(!is.null(f))return(f); c(.4,.3,.3)}

ny<-length(years)
## shared-regime projection: returns carbon stock, carbon removed, biomass stock, age, over years
proj<-function(age0,cc,bb,regset,owner){
  cs<-bs<-crem<-agev<-numeric(ny)
  Ac<-cc[1];kc<-cc[2];pc<-cc[3];dc<-cc[4];Asc<-cc[5]; Ab<-bb[1];kb<-bb[2];pb<-bb[3];db<-bb[4];Asb<-bb[5]
  C<-function(a) hyb(a,Ac,kc,pc,dc,Asc); B<-function(a) hyb(a,Ab,kb,pb,db,Asb)
  if(is.null(regset)){ agev<-age0+(years-START); cs<-C(agev); bs<-B(agev) }
  else { reg<-regset[[owner]]
    if(reg$type=="clearcut"){ age<-age0
      for(j in seq_len(ny)){ if(j>1){age<-age+STEP; if(age>=reg$R){ pre<-C(age); age<-REGEN_AGE+(age-reg$R); crem[j]<-max(pre-C(age),0)}}; agev[j]<-age; cs[j]<-C(age); bs[j]<-B(age) }
    } else { Sc<-C(age0); Sb<-B(age0)
      for(j in seq_len(ny)){ ra<-age0+(years[j]-START); agev[j]<-ra
        if(j>1){ Sc<-max(Sc+(C(ra)-C(ra-STEP)),0); Sb<-max(Sb+(B(ra)-B(ra-STEP)),0)
          if(floor(ra/reg$E)>floor((ra-STEP)/reg$E)){ preC<-Sc; Sc<-(1-reg$f)*Sc; crem[j]<-preC-Sc; Sb<-(1-reg$f)*Sb } }
        cs[j]<-Sc; bs[j]<-Sb } } }
  cs[!is.finite(cs)|cs<0]<-0; bs[!is.finite(bs)|bs<0]<-0; crem[!is.finite(crem)|crem<0]<-0
  list(cs=cs,bs=bs,crem=crem,age=agev)
}

states<-sort(unique(v$abbr)); scn<-names(SCEN)
PRODacc<-setNames(lapply(scn,function(.) array(0,dim=c(length(states),length(offs),3),dimnames=list(states,paste0("yr",offs),PROD))),scn)
CREMacc<-setNames(lapply(scn,function(.) matrix(0,length(states),length(offs),dimnames=list(states,paste0("yr",offs)))),scn)  # per-decade removed
CRES_t0<-setNames(numeric(length(states)),states)   # reserve carbon t0 (for anchor)
BRES_t0<-setNames(numeric(length(states)),states)   # reserve biomass t0 (for anchor)
n_noc<-0L
for(i in seq_len(nrow(v))){ cc<-getf(HC,v$abbr[i],v$cell[i]); bb<-getf(HB,v$abbr[i],v$cell[i]); if(is.null(cc)||is.null(bb)){n_noc<-n_noc+1L;next}
  si<-match(v$abbr[i],states); ar<-v$area_ha[i]; ow<-v$oreg[i]; pc<-v$pcell[i]; ag0<-v$STDAGE[i]
  for(sc in scn){ pj<-proj(ag0,cc,bb,SCEN[[sc]],ow)
    bio<-pj$bs[ocol]*TONAC_TO_MGHA*ar/1e6; ac<-as.character(cut(pj$age[ocol],AGE_BRK,labels=AGE_LAB))
    for(j in seq_along(offs)){ fr<-getfrac(v$abbr[i],pc,ac[j]); PRODacc[[sc]][si,j,]<-PRODacc[[sc]][si,j,]+bio[j]*fr }
    CREMacc[[sc]][si,]<-CREMacc[[sc]][si,]+pj$crem[ocol]*LBAC_TO_MGHA*ar/1e6
    if(sc=="reserve (no harvest)"){ CRES_t0[si]<-CRES_t0[si]+pj$cs[ocol][1]*LBAC_TO_MGHA*ar/1e6; BRES_t0[si]<-BRES_t0[si]+pj$bs[ocol][1]*TONAC_TO_MGHA*ar/1e6 } }
}
cat(sprintf("[phase2] projected %d imputations (no curve %d)\n",nrow(v)-n_noc,n_noc))

## anchoring scalars from reserve t0 vs baselines
cb<-read.csv(CBASE,stringsAsFactors=FALSE); cb<-cb[cb$scenario=="reserve (no harvest)"&cb$year_offset==0,]; cbt0<-setNames(cb$agc_Tg,cb$state)
pb<-read.csv(PBASE,stringsAsFactors=FALSE); pb<-pb[pb$scenario=="reserve (no harvest)"&pb$year_offset==0,]; pbt0<-tapply(pb$bio_Tg,pb$state,sum)
csc<-ifelse(CRES_t0>0, cbt0[states]/CRES_t0, 1); csc[is.na(csc)]<-1
bsc<-ifelse(BRES_t0>0, pbt0[states]/BRES_t0, 1); bsc[is.na(bsc)]<-1
cat(sprintf("[phase2] anchor scalars: carbon median %.3f, biomass median %.3f\n",median(csc,na.rm=TRUE),median(bsc,na.rm=TRUE)))

## apply anchoring + build outputs
prod_long<-list(); rem_long<-list()
for(sc in scn){ for(si in seq_along(states)){ st<-states[si]
  pr<-PRODacc[[sc]][si,,]*bsc[si]
  for(p in seq_along(PROD)) prod_long[[length(prod_long)+1]]<-data.frame(state=st,scenario=sc,product=PROD[p],year_offset=offs,bio_Tg=round(pr[,p],3),row.names=NULL)
  remc<-cumsum(CREMacc[[sc]][si,]*csc[si])
  rem_long[[length(rem_long)+1]]<-data.frame(state=st,scenario=sc,year_offset=offs,removed_cum_Tg=round(remc,3),row.names=NULL)
}}
write.csv(do.call(rbind,prod_long),file.path(td,"conus_products_scenarios_hybrid_100yr.csv"),row.names=FALSE)
write.csv(do.call(rbind,rem_long),file.path(td,"conus_harvest_removed_hybrid.csv"),row.names=FALSE)
cat("[phase2] wrote conus_products_scenarios_hybrid_100yr.csv + conus_harvest_removed_hybrid.csv\n")
