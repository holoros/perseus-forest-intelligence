## ycx_treemap_products_scenarios.R
##
## Product-resolved standing biomass under ALL FOUR management scenarios
## (reserve / conservation / harvest / intensive). Extends ycx_treemap_products.R
## (reserve only) by running the owner-specific harvest regimes from
## ycx_02_perseus.R on the AG-biomass curve, and splitting each year's standing
## biomass into sawtimber / pulpwood / residue using the per-cell x age-class
## product fractions. The stand age each year (which sets the age class, hence
## the product mix) follows the regime: clearcut resets age to regen; partial
## and reserve let age advance.
##
## Output (treemap/):
##   conus_products_scenarios_100yr.csv   state x scenario x product x year_offset -> bio_Tg
##   conus_products_scenarios_summary.csv scenario x product CONUS t0/t100 + shares
## Figure: treemap_conus_products_scenarios.png
##
## Usage: Rscript ycx_treemap_products_scenarios.R [out_dir] [VAT_path]

suppressMessages({ library(foreign) })
out <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
cfg<-file.path(out,"config"); td<-file.path(out,"treemap"); figd<-file.path(out,"figures")
dir.create(td,showWarnings=FALSE,recursive=TRUE)
VAT <- if (length(commandArgs(TRUE))>=2) commandArgs(TRUE)[2] else
  "/fs/scratch/PUOM0008/crsfaaron/TREEMAP_restore/TM2022/TreeMap2022_CONUS.tif.vat.dbf"

TM_BASE<-2022L; START<-TM_BASE; HORIZON<-100L; STEP<-5L; REGEN_AGE<-5L
years<-seq(START,START+HORIZON,by=STEP); offs<-seq(0,100,10); ocol<-match(offs, years-START)
TONAC_TO_MGHA<-2.2417; PIX_HA<-0.09
AGE_BRK<-c(-Inf,40,80,Inf); AGE_LAB<-c("young<40","mature40-80","old80+")
PROD<-c("sawtimber","pulpwood","residue")
REG <- list(Industrial=list(type="clearcut",R=45), NIPF=list(type="partial",E=20,f=0.30),
            State=list(type="partial",E=25,f=0.25), `Public-Other`=list(type="partial",E=30,f=0.15))
DEF_REG<-"NIPF"
scale_reg<-function(reg,sr,sf) lapply(reg,function(x){ if(x$type=="clearcut") list(type="clearcut",R=max(10,round(x$R*sr)))
  else list(type="partial",E=max(5,round(x$E*sr)),f=min(0.9,x$f*sf)) })
SCEN<-list(`reserve (no harvest)`=NULL, `managed (harvest)`=REG,
           `managed (intensive)`=scale_reg(REG,0.7,1.3), `managed (conservation)`=scale_reg(REG,1.6,0.5))
FIPS2ABBR <- c("1"="AL","4"="AZ","5"="AR","6"="CA","8"="CO","9"="CT","10"="DE","12"="FL","13"="GA","16"="ID",
 "17"="IL","18"="IN","19"="IA","20"="KS","21"="KY","22"="LA","23"="ME","24"="MD","25"="MA","26"="MI","27"="MN",
 "28"="MS","29"="MO","30"="MT","31"="NE","32"="NV","33"="NH","34"="NJ","35"="NM","36"="NY","37"="NC","38"="ND",
 "39"="OH","40"="OK","41"="OR","42"="PA","44"="RI","45"="SC","46"="SD","47"="TN","48"="TX","49"="UT","50"="VT",
 "51"="VA","53"="WA","54"="WV","55"="WI","56"="WY")
chap<-function(age,a,b,c) a*pmax(age,1e-6)^b*c^age

## ---- VAT + membership (same base as scenarios) ----
v<-read.dbf(VAT,as.is=TRUE); names(v)<-toupper(names(v)); v<-v[,intersect(c("TM_ID","PLT_CN","COUNT"),names(v))]
v$PLT_CN<-sub("\\.0+$","",format(v$PLT_CN,scientific=FALSE,trim=TRUE))
mf<-list.files(cfg,pattern="^ycx_membership_.*\\.csv$",full.names=TRUE)
mem<-do.call(rbind,lapply(mf,function(f){d<-read.csv(f,colClasses="character"); d[,c("PLT_CN","STATECD","ft_group","prov_code","owner4","STDAGE")]}))
mem<-mem[!duplicated(mem$PLT_CN),]; mem$STDAGE<-suppressWarnings(as.numeric(mem$STDAGE))
key<-match(v$PLT_CN,mem$PLT_CN); v<-v[!is.na(key),]; mm<-mem[key[!is.na(key)],]
v<-cbind(v,mm[,c("STATECD","ft_group","prov_code","owner4","STDAGE")]); v<-v[is.finite(v$STDAGE)&v$STDAGE>0,]
v$abbr<-FIPS2ABBR[as.character(as.integer(v$STATECD))]; v<-v[!is.na(v$abbr),]
v$cell<-paste(v$ft_group,v$prov_code,v$owner4,sep="|"); v$pcell<-paste(v$ft_group,v$prov_code,sep="|")
v$area_ha<-v$COUNT*PIX_HA; v$oreg<-ifelse(v$owner4 %in% names(REG), v$owner4, DEF_REG)
cat(sprintf("[tps] imputations: %d\n", nrow(v)))

## ---- AG biomass curves (agb_tonac): cell + state fallback ----
L<-list()
for (st in unique(v$abbr)){ fp<-file.path(out,sprintf("ycx_%s_fits.csv",st)); if(!file.exists(fp)) next
  f<-read.csv(fp,stringsAsFactors=FALSE); f<-f[f$response=="agb_tonac",]
  for(i in seq_len(nrow(f))){r<-f[i,]; id<-if(r$scope=="state")paste0(st,"@@state") else paste0(st,"@@",r$cell_key)
    if(is.null(L[[id]])) L[[id]]<-c(r$a,r$b,r$c)} }
getc<-function(st,cell){k<-L[[paste0(st,"@@",cell)]]; if(!is.null(k))return(k); L[[paste0(st,"@@state")]]}

## ---- product fractions lookup (state, ft|prov, ageclass) ----
pf<-read.csv(file.path(out,"products","product_fractions_by_cell_age.csv"),stringsAsFactors=FALSE)
pf<-pf[is.finite(pf$saw_bio_frac+pf$pulp_bio_frac+pf$res_bio_frac),]
FRAC<-setNames(lapply(seq_len(nrow(pf)),function(i)c(pf$saw_bio_frac[i],pf$pulp_bio_frac[i],pf$res_bio_frac[i])),
               paste(pf$state,pf$cell,pf$ageclass,sep="@@"))
cm<-aggregate(cbind(saw_bio_frac,pulp_bio_frac,res_bio_frac)~state+cell,pf,mean)
CM<-setNames(lapply(seq_len(nrow(cm)),function(i)as.numeric(cm[i,3:5])),paste(cm$state,cm$cell,sep="@@"))
sm<-aggregate(cbind(saw_bio_frac,pulp_bio_frac,res_bio_frac)~state,pf,mean)
SM<-setNames(lapply(seq_len(nrow(sm)),function(i)as.numeric(sm[i,2:4])),sm$state)
GLOB<-c(0.4,0.3,0.3)
getfrac<-function(st,pc,ac){f<-FRAC[[paste(st,pc,ac,sep="@@")]];if(!is.null(f))return(f)
  f<-CM[[paste(st,pc,sep="@@")]];if(!is.null(f))return(f); f<-SM[[st]];if(!is.null(f))return(f); GLOB}

## ---- per-pixel projection: returns stock (tons/ac) and stand age each step ----
ny<-length(years)
proj<-function(age0,abc,regset,owner){
  a<-abc[1];b<-abc[2];cc<-abc[3]; stock<-numeric(ny); agev<-numeric(ny)
  if(is.null(regset)){ agev<-age0+(years-START); stock<-chap(agev,a,b,cc); stock[!is.finite(stock)|stock<0]<-0; return(list(stock=stock,age=agev)) }
  reg<-regset[[owner]]
  if(reg$type=="clearcut"){ age<-age0
    for(j in seq_len(ny)){ if(j>1){age<-age+STEP; if(age>=reg$R) age<-REGEN_AGE+(age-reg$R)}; agev[j]<-age; stock[j]<-chap(age,a,b,cc) }
  } else { S<-chap(age0,a,b,cc)
    for(j in seq_len(ny)){ ra<-age0+(years[j]-START); agev[j]<-ra
      if(j>1){ S<-max(S+(chap(ra,a,b,cc)-chap(ra-STEP,a,b,cc)),0)
        if(floor(ra/reg$E)>floor((ra-STEP)/reg$E)) S<-(1-reg$f)*S }
      stock[j]<-S } }
  stock[!is.finite(stock)|stock<0]<-0; list(stock=stock,age=agev)
}

## ---- accumulate state x year x product per scenario ----
states<-sort(unique(v$abbr)); scn<-names(SCEN)
acc<-setNames(lapply(scn,function(.) array(0,dim=c(length(states),length(offs),3),
       dimnames=list(states,paste0("yr",offs),PROD))), scn)
n_noc<-0L
for(i in seq_len(nrow(v))){
  abc<-getc(v$abbr[i],v$cell[i]); if(is.null(abc)){n_noc<-n_noc+1L;next}
  st<-v$abbr[i]; si<-match(st,states); pc<-v$pcell[i]; ow<-v$oreg[i]; ar<-v$area_ha[i]
  for(sc in scn){ pj<-proj(v$STDAGE[i],abc,SCEN[[sc]],ow)
    bio<-pj$stock[ocol]*TONAC_TO_MGHA*ar/1e6                 # Tg dry, at decade offsets
    ac<-as.character(cut(pj$age[ocol],AGE_BRK,labels=AGE_LAB))
    for(j in seq_along(offs)){ fr<-getfrac(st,pc,ac[j]); acc[[sc]][si,j,]<-acc[[sc]][si,j,]+bio[j]*fr } }
}
cat(sprintf("[tps] projected %d imputations (no curve %d)\n", nrow(v)-n_noc, n_noc))

## ---- outputs ----
long<-do.call(rbind,lapply(scn,function(sc) do.call(rbind,lapply(states,function(st) do.call(rbind,lapply(PROD,function(p)
  data.frame(state=st,scenario=sc,product=p,year_offset=offs,bio_Tg=round(acc[[sc]][st,,p],3),row.names=NULL)))))))
write.csv(long,file.path(td,"conus_products_scenarios_100yr.csv"),row.names=FALSE)

summ<-do.call(rbind,lapply(scn,function(sc){ cs<-apply(acc[[sc]],c(2,3),sum)
  data.frame(scenario=sc,product=PROD,bio_t0_Tg=round(cs["yr0",],0),bio_t100_Tg=round(cs["yr100",],0),
    share_t100=round(cs["yr100",]/sum(cs["yr100",]),3),row.names=NULL) }))
write.csv(summ,file.path(td,"conus_products_scenarios_summary.csv"),row.names=FALSE)
cat("\n[tps] === CONUS product biomass by scenario (Tg dry, t0 -> t100) ===\n"); print(summ,row.names=FALSE)

## ---- figure: sawtimber across scenarios ----
png(file.path(figd,"treemap_conus_products_scenarios.png"),width=900,height=560,res=120)
op<-par(mar=c(4,4.5,3,9),xpd=NA); yr<-TM_BASE+offs
cols<-c(`reserve (no harvest)`="#1b7837",`managed (conservation)`="#5aae61",`managed (harvest)`="#d6604d",`managed (intensive)`="#b2182b")
saw<-sapply(scn,function(sc) apply(acc[[sc]],c(2,3),sum)[,"sawtimber"]); ymax<-max(saw)*1.05
plot(NA,xlim=range(yr),ylim=c(0,ymax),xlab="Year",ylab="Standing sawtimber biomass (Tg dry)",
     main="CONUS standing sawtimber biomass by management scenario")
grid(col="grey88"); for(sc in scn) lines(yr,saw[,sc],type="o",pch=19,lwd=2.4,col=cols[[sc]])
legend(par("usr")[2],par("usr")[4],legend=names(cols),col=cols,lwd=2.4,pch=19,bty="n",cex=0.8)
par(op); dev.off()
cat("[tps] wrote conus_products_scenarios_100yr.csv, _summary.csv, figure\n")
