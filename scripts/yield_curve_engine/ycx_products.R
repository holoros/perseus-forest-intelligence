## ycx_products.R
##
## Allocate standing yield into wood products from FIA tree records, so a
## projected yield (biomass / volume) can be split into product pools. Three
## products, softwood and hardwood tracked separately, using FIA's own size
## thresholds and volume partitions:
##
##   sawtimber : sawlog portion of sawtimber-size trees
##               (softwood DBH >= 9 in, hardwood DBH >= 11 in)
##               vol = VOLCSNET ; biomass = DRYBIO_SAWLOG
##   pulpwood  : merch bole not in sawlog + whole merch bole of poletimber
##               (5 in <= DBH < sawtimber threshold)
##               vol = (VOLCFNET - VOLCSNET) on sawtimber trees + VOLCFNET on poletimber
##               biomass = (DRYBIO_BOLE - DRYBIO_SAWLOG) + DRYBIO_BOLE(pole)
##   residue   : non-merch (tops, limbs, saplings < 5 in)
##               biomass = (DRYBIO_AG - DRYBIO_BOLE) all trees + DRYBIO_AG(saplings)
##
## Fractions are computed per forest-type x ecoregion cell AND per broad age
## class (<40, 40-80, 80+ yr) so allocation tracks the sawtimber shift as
## stands mature. Output: per-cell-x-ageclass product fractions (of AG biomass
## and of merch volume) + a state product summary.
##
## Usage: Rscript ycx_products.R <out_dir> [ST1 ST2 ...]   default: ME MN IN WA GA

args <- commandArgs(trailingOnly = TRUE)
out  <- if (length(args) >= 1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
STATES <- if (length(args) >= 2) toupper(args[-1]) else c("ME","MN","IN","WA","GA")
cfg <- file.path(out,"config"); fia <- file.path(Sys.getenv("HOME"),"fia_data")
pdir <- file.path(out,"products"); dir.create(pdir, showWarnings=FALSE, recursive=TRUE)
SAW_SW <- 9.0; SAW_HW <- 11.0; POLE_MIN <- 5.0
AGE_BRK <- c(-Inf,40,80,Inf); AGE_LAB <- c("young<40","mature40-80","old80+")
TONAC_TO_MGHA <- 2.2417 / 2.4710538 * 2.4710538   # keep lb->ton handled below
cat(sprintf("[prod] states: %s\n", paste(STATES, collapse=" ")))

alloc_state <- function(ST){
  mem <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", ST)), stringsAsFactors=FALSE)
  mem <- mem[order(mem$PLT_CN,-mem$INVYR),]; mem <- mem[!duplicated(mem$PLT_CN),]
  tf <- file.path(fia, sprintf("%s_TREE.csv", ST))
  hdr <- gsub('"','',strsplit(readLines(tf,n=1),",")[[1]])
  need <- c("PLT_CN","STATUSCD","SPGRPCD","DIA","TPA_UNADJ",
            "VOLCFNET","VOLCSNET","DRYBIO_SAWLOG","DRYBIO_BOLE","DRYBIO_AG")
  idx <- match(need,hdr); if(any(is.na(idx))) stop("missing cols ",ST,": ",paste(need[is.na(idx)],collapse=","))
  slim <- file.path(pdir, sprintf(".tmp_%s.csv",ST))
  system(sprintf("cut -d, -f%s '%s' > '%s'", paste(idx,collapse=","), tf, slim))
  t <- read.csv(slim, stringsAsFactors=FALSE); unlink(slim)
  for (c0 in c("DIA","TPA_UNADJ","VOLCFNET","VOLCSNET","DRYBIO_SAWLOG","DRYBIO_BOLE","DRYBIO_AG"))
    t[[c0]] <- suppressWarnings(as.numeric(t[[c0]]))
  t$STATUSCD<-suppressWarnings(as.integer(t$STATUSCD)); t$SPGRPCD<-suppressWarnings(as.integer(t$SPGRPCD))
  t <- t[!is.na(t$STATUSCD)&t$STATUSCD==1 & is.finite(t$DIA)&t$DIA>0 & is.finite(t$TPA_UNADJ),]
  for (c0 in c("VOLCFNET","VOLCSNET","DRYBIO_SAWLOG","DRYBIO_BOLE","DRYBIO_AG")) t[[c0]][!is.finite(t[[c0]])]<-0
  sw <- !is.na(t$SPGRPCD) & t$SPGRPCD<=24
  sawthr <- ifelse(sw, SAW_SW, SAW_HW)
  is_saw <- t$DIA >= sawthr; is_pole <- t$DIA>=POLE_MIN & t$DIA<sawthr; is_sap <- t$DIA<POLE_MIN
  tpa <- t$TPA_UNADJ
  ## per-acre volume (cuft/ac)
  saw_vol  <- ifelse(is_saw, t$VOLCSNET, 0) * tpa
  pulp_vol <- (ifelse(is_saw, pmax(t$VOLCFNET-t$VOLCSNET,0), 0) + ifelse(is_pole, t$VOLCFNET, 0)) * tpa
  ## per-acre biomass (lb/ac -> tons/ac via /2000)
  saw_bio  <- ifelse(is_saw, t$DRYBIO_SAWLOG, 0) * tpa /2000
  pulp_bio <- (ifelse(is_saw, pmax(t$DRYBIO_BOLE-t$DRYBIO_SAWLOG,0),0) + ifelse(is_pole,t$DRYBIO_BOLE,0)) * tpa /2000
  res_bio  <- (pmax(t$DRYBIO_AG-t$DRYBIO_BOLE,0) + ifelse(is_sap,t$DRYBIO_AG,0)) * tpa /2000
  grp <- ifelse(sw,"SW","HW")
  agg <- aggregate(cbind(saw_vol,pulp_vol,saw_bio,pulp_bio,res_bio) ~ PLT_CN, data=
            data.frame(PLT_CN=t$PLT_CN, saw_vol,pulp_vol,saw_bio,pulp_bio,res_bio), sum, na.rm=TRUE)
  ## SW/HW split of biomass for the softwood fraction metric
  swbio <- aggregate(I((saw_bio+pulp_bio+res_bio)*(grp=="SW")) ~ PLT_CN,
                     data=data.frame(PLT_CN=t$PLT_CN, saw_bio,pulp_bio,res_bio,grp), sum)
  names(swbio)[2] <- "sw_bio"
  p <- Reduce(function(a,b) merge(a,b,by="PLT_CN",all=TRUE), list(agg, swbio))
  p <- merge(p, mem[,c("PLT_CN","ft_group","prov_code","STDAGE")], by="PLT_CN")
  p <- p[!is.na(p$STDAGE)&p$STDAGE>0,]
  p$cell <- paste(p$ft_group,p$prov_code,sep="|")
  p$ageclass <- cut(p$STDAGE, AGE_BRK, labels=AGE_LAB)
  p$state <- ST; p
}

frac_table <- function(p){
  ST <- p$state[1]
  g <- aggregate(cbind(saw_vol,pulp_vol,saw_bio,pulp_bio,res_bio,sw_bio) ~ state+cell+ft_group+prov_code+ageclass,
                 data=p, sum, na.rm=TRUE)
  g$merch_vol <- g$saw_vol+g$pulp_vol
  g$ag_bio    <- g$saw_bio+g$pulp_bio+g$res_bio
  g$saw_vol_frac  <- ifelse(g$merch_vol>0, g$saw_vol/g$merch_vol, NA)
  g$pulp_vol_frac <- ifelse(g$merch_vol>0, g$pulp_vol/g$merch_vol, NA)
  g$saw_bio_frac  <- ifelse(g$ag_bio>0, g$saw_bio/g$ag_bio, NA)
  g$pulp_bio_frac <- ifelse(g$ag_bio>0, g$pulp_bio/g$ag_bio, NA)
  g$res_bio_frac  <- ifelse(g$ag_bio>0, g$res_bio/g$ag_bio, NA)
  g$sw_frac       <- ifelse(g$ag_bio>0, g$sw_bio/g$ag_bio, NA)
  cols <- c("state","cell","ft_group","prov_code","ageclass",
            "saw_vol_frac","pulp_vol_frac","saw_bio_frac","pulp_bio_frac","res_bio_frac","sw_frac")
  for (c0 in c("saw_vol_frac","pulp_vol_frac","saw_bio_frac","pulp_bio_frac","res_bio_frac","sw_frac"))
    g[[c0]] <- round(g[[c0]],4)
  g[,cols]
}

state_summary <- function(p){
  ST <- p$state[1]
  s <- colSums(p[,c("saw_vol","pulp_vol","saw_bio","pulp_bio","res_bio")], na.rm=TRUE)
  data.frame(state=ST,
    saw_vol_frac =round(s["saw_vol"]/(s["saw_vol"]+s["pulp_vol"]),3),
    pulp_vol_frac=round(s["pulp_vol"]/(s["saw_vol"]+s["pulp_vol"]),3),
    saw_bio_frac =round(s["saw_bio"]/sum(s[c("saw_bio","pulp_bio","res_bio")]),3),
    pulp_bio_frac=round(s["pulp_bio"]/sum(s[c("saw_bio","pulp_bio","res_bio")]),3),
    res_bio_frac =round(s["res_bio"]/sum(s[c("saw_bio","pulp_bio","res_bio")]),3),
    row.names=NULL)
}

FR <- list(); SM <- list()
for (ST in STATES){
  p <- tryCatch(alloc_state(ST), error=function(e){cat("  fail",ST,conditionMessage(e),"\n");NULL})
  if (is.null(p)||nrow(p)<50) next
  cat(sprintf("  %s: %d plots allocated\n", ST, nrow(p)))
  FR[[ST]] <- frac_table(p); SM[[ST]] <- state_summary(p)
}
frtab <- do.call(rbind, FR); smtab <- do.call(rbind, SM)
write.csv(frtab, file.path(pdir,"product_fractions_by_cell_age.csv"), row.names=FALSE)
write.csv(smtab, file.path(pdir,"product_summary_by_state.csv"), row.names=FALSE)
cat("\n[prod] === state product summary (fractions) ===\n"); print(smtab, row.names=FALSE)
cat(sprintf("[prod] wrote products/ outputs (%d cell-age fraction rows)\n", nrow(frtab)))
