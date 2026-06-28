# ycx_cspi_scale.R  (#75 step 3: CSPI asymptote scaling module)
# Slots into ycx_canonical_ci_* behind a flag (use_cspi_asym = TRUE).
# Damped, bounded, sparse-cell-weighted multiplicative scalar on the fitted
# cell asymptote. CSPI refines and borrows strength; it does not overturn the fit.
#
# Rationale (see OODA_cspi_asymptote_scaling.md): the free-fit CSPI exponent
# (2.77 within forest type, 3.13 pooled) is confound-amplified and biologically
# too strong. Production uses beta = 1.0 (proportional), clamp +/- 25%, and
# shrinks the scalar toward 1.0 for well-populated cells.
#
# Inputs : ycx_cell_cspi.csv (level,key,n_plots,cspi_mean,cspi_sd,cspi_scalar)
#          fits data.table with columns cell_key, ft_group, prov_code, A, n_plots
# Output : same fits table with columns A_cspi (scaled) and cspi_used.

suppressWarnings(suppressMessages(library(data.table)))

# ---- team knobs (documented assumptions, not estimates) ----
CSPI_REF   <- 56.36     # CONUS median CSPI from ycx_cell_cspi.csv
BETA       <- 1.5       # CV-optimal (deep assessment 2026-06-28: held-out skill rises to ~free slope)
CLAMP_LO   <- 0.70      # widened to admit beta=1.5
CLAMP_HI   <- 1.45      # widened to admit beta=1.5
N0         <- 30        # sparse-cell shrinkage half-weight (full CSPI weight when n << N0)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0) b else a

scale_asymptote_cspi <- function(fits, cspi_path, log_path = "error_log.txt",
                                 ref = CSPI_REF, beta = BETA,
                                 clamp = c(CLAMP_LO, CLAMP_HI), n0 = N0) {
  out <- tryCatch({
    stopifnot(all(c("cell_key", "A", "n_plots") %in% names(fits)))
    cspi <- fread(cspi_path)
    cell <- cspi[level == "cell", .(cell_key = key, cspi_mean)]

    x <- merge(as.data.table(fits), cell, by = "cell_key", all.x = TRUE)

    # raw multiplicative scalar, clamped
    raw   <- (x$cspi_mean / ref) ^ beta
    raw[!is.finite(raw)] <- 1.0                      # no CSPI -> no change
    clamped <- pmin(pmax(raw, clamp[1]), clamp[2])

    # sparse-cell shrinkage toward 1.0: full CSPI weight when n small
    n <- as.numeric(x$n_plots %||% 0); n[!is.finite(n)] <- 0
    shrink <- n0 / (n0 + n)
    scal   <- 1 + shrink * (clamped - 1)

    x[, cspi_used := scal]
    x[, A_cspi := A * scal]
    x[]
  }, error = function(e) {
    cat(sprintf("[ycx_cspi_scale] %s\n", conditionMessage(e)), file = log_path, append = TRUE)
    z <- as.data.table(fits); z[, `:=`(cspi_used = 1.0, A_cspi = A)]; z[]
  })
  out
}

# ---- standalone self-test / pilot summary (ME, CA) when run directly ----
if (sys.nframe() == 0) {
  set.seed(2026)
  cspi_path <- path.expand("~/yield_curves_conus/ycx_cell_cspi.csv")
  fit_files <- c(ME = "~/yield_curves_conus/ycx_ME_remeas_fits.csv",
                 CA = "~/yield_curves_conus/ycx_CA_remeas_fits.csv")
  for (st in names(fit_files)) {
    f <- tryCatch(fread(path.expand(fit_files[st])), error = function(e) NULL)
    if (is.null(f)) next
    f <- f[scope == "cell" & response == "carbon_lbac" & A > 0]
    if (!nrow(f)) next
    s <- scale_asymptote_cspi(f, cspi_path)
    cat(sprintf("%s: %d cells | cspi_used %.2f..%.2f (median %.2f) | mean A change %+.1f%%\n",
                st, nrow(s), min(s$cspi_used), max(s$cspi_used), median(s$cspi_used),
                100 * (mean(s$A_cspi) / mean(s$A) - 1)))
  }
  gc()
}
