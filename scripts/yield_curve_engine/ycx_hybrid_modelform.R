## ycx_hybrid_modelform.R
##
## Model-form stress test for a HYBRID yield curve: asymptotic growth up to a
## forest-type x ecoregion breakpoint A*, then decline beyond it. Compares four
## candidate forms by 5-fold CV on the FIA chronosequence (AG carbon, lb/ac):
##
##   CR     Chapman-Richards            y = A*(1-exp(-k*age))^p          (asymptotic, no decline)
##   PD     peak-decline (current)      y = b1*age^b2*b3^age             (current engine form)
##   HYB    CR x decline tail           y = CR(age) * exp(-d*max(0,age-A*))   (NEW hybrid)
##   PDA    re-anchored peak-decline    PD with peak fixed at A*         (peak = A* per cell)
##
## A* (the breakpoint) is the EMPIRICAL CULMINATION age, computed per
## forest-type x ecoregion cell (age bin of maximum smoothed mean carbon),
## with forest-type then state fallback for thin cells. The CV compares the
## functional forms at the state level; the per-cell A* table is written
## separately as the production breakpoint input for the winning form.
##
## Usage: Rscript ycx_hybrid_modelform.R <out_dir> [ST1 ST2 ...]
##   default pilot states: ME MN IN WA GA

args <- commandArgs(trailingOnly = TRUE)
out  <- if (length(args) >= 1) args[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
STATES <- if (length(args) >= 2) toupper(args[-1]) else c("ME","MN","IN","WA","GA")
cfg <- file.path(out,"config"); fia <- file.path(Sys.getenv("HOME"),"fia_data")
sdir <- file.path(out,"hybrid"); dir.create(sdir, showWarnings=FALSE, recursive=TRUE)
set.seed(20260531); MIN_PLOTS_CELL <- 40L; AGE_BIN <- 10L
ASTAR_MIN <- 30; ASTAR_MAX <- 200
cat(sprintf("[hyb] states: %s\n", paste(STATES, collapse=" ")))

## ---- plot-level carbon (lb/ac) vs stand age, per state (mirrors ycx_01) ----
load_state <- function(ST) {
  mem <- read.csv(file.path(cfg, sprintf("ycx_membership_%s.csv", ST)), stringsAsFactors=FALSE)
  mem <- mem[order(mem$PLT_CN, -mem$INVYR), ]; mem <- mem[!duplicated(mem$PLT_CN), ]
  tf <- file.path(fia, sprintf("%s_TREE.csv", ST))
  hdr <- gsub('"','',strsplit(readLines(tf,n=1),",")[[1]])
  need <- c("PLT_CN","STATUSCD","CARBON_AG","TPA_UNADJ")
  idx <- match(need, hdr); if (any(is.na(idx))) stop("missing cols in ",ST)
  slim <- file.path(sdir, sprintf(".tmp_%s.csv", ST))
  system(sprintf("cut -d, -f%s '%s' > '%s'", paste(idx,collapse=","), tf, slim))
  tr <- read.csv(slim, stringsAsFactors=FALSE); unlink(slim)
  for (c0 in c("CARBON_AG","TPA_UNADJ")) tr[[c0]] <- suppressWarnings(as.numeric(tr[[c0]]))
  tr$STATUSCD <- suppressWarnings(as.integer(tr$STATUSCD))
  tr <- tr[!is.na(tr$STATUSCD) & tr$STATUSCD==1, ]
  cb <- aggregate(I(CARBON_AG*TPA_UNADJ) ~ PLT_CN, tr, sum, na.rm=TRUE)
  names(cb)[2] <- "carbon_lbac"
  pd <- merge(cb, mem[,c("PLT_CN","ft_group","prov_code","owner4","STDAGE","treatment")], by="PLT_CN")
  pd <- pd[pd$treatment=="untreated" & !is.na(pd$STDAGE) & pd$STDAGE>0 &
           is.finite(pd$carbon_lbac) & pd$carbon_lbac>0, ]
  pd$cell <- paste(pd$ft_group, pd$prov_code, sep="|")
  pd$state <- ST; pd
}

## ---- empirical culmination A*: age bin of max smoothed mean carbon ----
culmination <- function(age, y) {
  if (length(age) < 10) return(NA_real_)
  b <- AGE_BIN * (age %/% AGE_BIN) + AGE_BIN/2
  m <- tapply(y, b, mean, na.rm=TRUE)
  ab <- as.numeric(names(m))
  ok <- ab >= ASTAR_MIN - AGE_BIN & ab <= ASTAR_MAX + AGE_BIN
  if (!any(ok)) return(NA_real_)
  m <- m[ok]; ab <- ab[ok]
  if (length(m) < 3) return(NA_real_)
  ms <- stats::filter(m, rep(1/3,3)); ms[is.na(ms)] <- m[is.na(ms)]   # 3-bin smooth
  a <- ab[which.max(ms)]
  min(max(a, ASTAR_MIN), ASTAR_MAX)
}

## ---- candidate fits: return predict() closure on a fold, or NULL ----
chap   <- function(age,A,k,p) A*(1-exp(-k*age))^p
fit_CR <- function(age,y){
  st <- list(A=max(y)*1.1, k=0.03, p=3)
  m <- tryCatch(nls(y~chap(age,A,k,p), start=st,
        control=nls.control(maxiter=200,warnOnly=TRUE)), error=function(e) NULL)
  if (is.null(m)) return(NULL); co <- coef(m)
  if (any(!is.finite(co))||co["A"]<=0) return(NULL)
  function(a) chap(a, co["A"], co["k"], co["p"])
}
fit_PD <- function(age,y){
  m <- tryCatch(lm(log(y) ~ log(age) + age), error=function(e) NULL); if(is.null(m)) return(NULL)
  cf <- coef(m); if (cf[3]>0){ m<-lm(log(y)~log(age)); cf<-c(coef(m),0) }
  b1<-exp(cf[1]); b2<-cf[2]; b3<-exp(cf[3])
  function(a) b1*pmax(a,1e-6)^b2*b3^a
}
fit_HYB <- function(age,y,Astar){
  if (!is.finite(Astar)) return(NULL)
  hf <- function(age,A,k,p,d) chap(age,A,k,p)*exp(-d*pmax(0,age-Astar))
  st <- list(A=max(y)*1.1,k=0.03,p=3,d=0.005)
  m <- tryCatch(nls(y~hf(age,A,k,p,d), start=st,
        lower=c(A=0,k=1e-4,p=0.3,d=0), algorithm="port",
        control=nls.control(maxiter=300,warnOnly=TRUE)), error=function(e) NULL)
  if (is.null(m)) return(NULL); co<-coef(m); if(any(!is.finite(co))||co["A"]<=0) return(NULL)
  function(a) chap(a,co["A"],co["k"],co["p"])*exp(-co["d"]*pmax(0,a-Astar))
}
fit_PDA <- function(age,y,Astar){          # peak-decline with peak fixed at A*
  if (!is.finite(Astar)||Astar<=0) return(NULL)
  ## peak of b1*age^b2*b3^age at age* = b2 / -ln(b3); fix age*=A* -> ln b3 = -b2/A*
  ## log y = log b1 + b2*log age + (-b2/A*)*age = log b1 + b2*(log age - age/A*)
  z <- log(age) - age/Astar
  m <- tryCatch(lm(log(y) ~ z), error=function(e) NULL); if(is.null(m)) return(NULL)
  b1<-exp(coef(m)[1]); b2<-coef(m)[2]; if(!is.finite(b1)||!is.finite(b2)) return(NULL)
  function(a) b1*pmax(a,1e-6)^b2*exp(-b2/Astar*a)
}

rmse <- function(pred,obs){ e<-pred-obs; sqrt(mean(e^2,na.rm=TRUE)) }
forms <- c("CR","PD","HYB","PDA")

## ---- per state: 5-fold CV of the four forms (pooled plots, A*=state culm) ----
cv_state <- function(pd){
  ST <- pd$state[1]; n <- nrow(pd)
  Astar <- culmination(pd$STDAGE, pd$carbon_lbac)
  k <- 5; fold <- sample(rep(1:k, length.out=n))
  err <- matrix(NA_real_, k, length(forms), dimnames=list(NULL,forms))
  for (f in 1:k){
    tr <- pd[fold!=f,]; te <- pd[fold==f,]
    fits <- list(CR=fit_CR(tr$STDAGE,tr$carbon_lbac),
                 PD=fit_PD(tr$STDAGE,tr$carbon_lbac),
                 HYB=fit_HYB(tr$STDAGE,tr$carbon_lbac,Astar),
                 PDA=fit_PDA(tr$STDAGE,tr$carbon_lbac,Astar))
    for (fm in forms){ fn<-fits[[fm]]; if(!is.null(fn)) err[f,fm]<-rmse(fn(te$STDAGE),te$carbon_lbac) }
  }
  data.frame(state=ST, n_plots=n, Astar=round(Astar,0),
             t(round(colMeans(err,na.rm=TRUE),0)), stringsAsFactors=FALSE)
}

## ---- per-cell empirical culmination table (production breakpoint input) ----
cell_astar <- function(pd){
  ST <- pd$state[1]
  cells <- split(pd, pd$cell)
  ft_astar <- tapply(seq_len(nrow(pd)), pd$ft_group,
                     function(ix) culmination(pd$STDAGE[ix], pd$carbon_lbac[ix]))
  st_astar <- culmination(pd$STDAGE, pd$carbon_lbac)
  do.call(rbind, lapply(names(cells), function(cn){
    d <- cells[[cn]]; a <- if (nrow(d)>=MIN_PLOTS_CELL) culmination(d$STDAGE,d$carbon_lbac) else NA
    src <- "cell"
    if (!is.finite(a)) { a <- ft_astar[[d$ft_group[1]]]; src <- "ft" }
    if (!is.finite(a)) { a <- st_astar; src <- "state" }
    data.frame(state=ST, cell_key=cn, ft_group=d$ft_group[1], prov_code=d$prov_code[1],
               n_plots=nrow(d), Astar=round(a,0), Astar_src=src, stringsAsFactors=FALSE)
  }))
}

CV <- list(); CELL <- list()
for (ST in STATES){
  pd <- tryCatch(load_state(ST), error=function(e){cat("  load fail",ST,conditionMessage(e),"\n");NULL})
  if (is.null(pd)||nrow(pd)<50) next
  cat(sprintf("  %s: %d untreated plots, %d cells\n", ST, nrow(pd), length(unique(pd$cell))))
  CV[[ST]] <- cv_state(pd); CELL[[ST]] <- cell_astar(pd)
}
cvtab <- do.call(rbind, CV); celltab <- do.call(rbind, CELL)
write.csv(cvtab,   file.path(sdir,"hybrid_cv_by_state.csv"), row.names=FALSE)
write.csv(celltab, file.path(sdir,"hybrid_cell_astar.csv"),  row.names=FALSE)

## pooled mean CV RMSE across states (plot-weighted)
w <- cvtab$n_plots
pooled <- sapply(forms, function(fm) round(sum(cvtab[[fm]]*w,na.rm=TRUE)/sum(w[!is.na(cvtab[[fm]])]),0))
cat("\n[hyb] === CV RMSE (lb/ac AG carbon; lower = better) ===\n")
print(cvtab, row.names=FALSE)
cat("\n[hyb] plot-weighted pooled CV RMSE:\n"); print(pooled)
best <- names(pooled)[which.min(pooled)]
cat(sprintf("\n[hyb] BEST FORM (pooled): %s\n", best))
writeLines(c("HYBRID model-form stress test (5-fold CV, AG carbon lb/ac)",
             sprintf("states: %s", paste(STATES,collapse=" ")),
             "pooled CV RMSE:", paste(sprintf("  %s = %s", names(pooled), pooled)),
             sprintf("best form: %s", best),
             sprintf("per-cell A* breakpoints written: %d cells", nrow(celltab))),
           file.path(sdir,"hybrid_modelform_report.txt"))
cat(sprintf("[hyb] wrote hybrid/ outputs (cv_by_state, cell_astar, report)\n"))
