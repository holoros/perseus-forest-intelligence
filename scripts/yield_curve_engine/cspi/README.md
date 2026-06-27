# CSPI site-productivity asymptote covariate (#75 step 3)

CSPI scales the per-cell yield-curve asymptote in the canonical FIADB engine, behind the
YCX_CSPI_ASYM flag. Default OFF; live engine unchanged. See docs/decisions/0005.
Knobs (sign-off pending): beta=1.0; clamp [0.80,1.25]; sparse shrink 30/(30+n_plots).
Verified rcp45 48 states: CONUS t0 +0.02%, 2125 -0.00%; per-state -0.39% to +0.72%.
