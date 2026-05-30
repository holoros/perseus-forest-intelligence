## ycx_00_strata.R  (CONUS-generalized yield-curve stratification)
##
## Generalizes the Maine yc_01_collapse_strata.R to any state. Builds a
## per-state stratification and plot membership using:
##   forest-type group : FIA FORTYPCD collapsed to its group code
##                       (floor(FORTYPCD/10)*10) with a national name lookup
##   province          : EPA Level III ecoregion (NA_L3CODE / NA_L3NAME),
##                       spatially joined from plot LAT/LON
##   owner             : USFS forest-ownership raster RDS-2025-0045
##                       (Family->NIPF, Corporate->Industrial, State->State,
##                        Federal/Local/Tribal->Public-Other), with FIA
##                        OWNGRPCD fallback where the raster is
##                        Unknown/Non-Forest/Water at the plot point.
##
## Usage: Rscript ycx_00_strata.R <STATE_ABBR>
## Inputs : ~/fia_data/<ST>_PLOT.csv, <ST>_COND.csv
##          ~/SiteIndex/NA_Eco_L3_WGS84.shp        (EPA L3, EPSG:4326)
##          ~/landowner/US_forest_ownership.tif    (NAD83, EPSG:4269)
## Outputs: <out>/config/ycx_membership_<ST>.csv
##          <out>/config/ycx_strata_<ST>.csv

suppressMessages({ library(terra); library(sf) })

args   <- commandArgs(trailingOnly = TRUE)
ST     <- if (length(args) >= 1) toupper(args[1]) else stop("need state abbr")
fia    <- if (length(args) >= 2) args[2] else file.path(Sys.getenv("HOME"), "fia_data")
out    <- if (length(args) >= 3) args[3] else file.path(Sys.getenv("HOME"), "yield_curves_conus")
eco_shp<- file.path(Sys.getenv("HOME"), "SiteIndex", "NA_Eco_L3_WGS84.shp")
own_tif<- file.path(Sys.getenv("HOME"), "landowner", "US_forest_ownership.tif")
cfg    <- file.path(out, "config")
dir.create(cfg, recursive = TRUE, showWarnings = FALSE)
MIN_PLOTS <- 30L

cat(sprintf("[ycx_00] state=%s\n", ST))

## ---- forest-type group lookup (national FIA group codes) -------------
ftgrp_name <- c(
  "100"="White/red/jack pine","120"="Spruce/fir","140"="Longleaf/slash pine",
  "160"="Loblolly/shortleaf pine","170"="Other eastern softwoods",
  "180"="Pinyon/juniper","200"="Douglas-fir","220"="Ponderosa pine",
  "240"="Western white pine","260"="Fir/spruce/mtn hemlock","280"="Lodgepole pine",
  "300"="Hemlock/Sitka spruce","320"="Western larch","340"="Redwood",
  "360"="Other western softwoods","370"="California mixed conifer",
  "380"="Exotic softwoods","400"="Oak/pine","500"="Oak/hickory",
  "600"="Oak/gum/cypress","700"="Elm/ash/cottonwood","800"="Maple/beech/birch",
  "900"="Aspen/birch","910"="Alder/maple","920"="Western oak",
  "940"="Tanoak/laurel","950"="Other hardwoods","960"="Woodland hardwoods",
  "970"="Exotic hardwoods","980"="Tropical hardwoods","990"="Nonstocked")
ft_group <- function(fortypcd) {
  g <- floor(as.numeric(fortypcd) / 10) * 10
  nm <- ftgrp_name[as.character(g)]
  ifelse(is.na(nm), NA_character_, nm)
}

## ---- owner mapping ---------------------------------------------------
# raster legend: 0 Unknown,1 Non-Forest,2 Water,3 Family,4 Corporate,
#                5 Tribal,6 Federal,7 State,8 Local
own_from_raster <- c("3"="NIPF","4"="Industrial","7"="State",
                     "6"="Public-Other","8"="Public-Other","5"="Public-Other")
# FIA OWNGRPCD fallback: 10/20 Federal-ish -> Public-Other, 30 -> State, 40 -> NIPF
own_from_owngrp <- function(owngrpcd) {
  ifelse(owngrpcd %in% c(10,20), "Public-Other",
  ifelse(owngrpcd == 30, "State",
  ifelse(owngrpcd == 40, "NIPF", NA_character_)))
}

## ---- load PLOT -------------------------------------------------------
plt <- read.csv(file.path(fia, sprintf("%s_PLOT.csv", ST)),
                stringsAsFactors = FALSE)
names(plt)[names(plt) == "CN"] <- "PLT_CN"
plt <- plt[, intersect(c("PLT_CN","STATECD","UNITCD","COUNTYCD","PLOT",
                         "INVYR","PLOT_STATUS_CD","LAT","LON"), names(plt))]
plt$LAT <- suppressWarnings(as.numeric(plt$LAT))
plt$LON <- suppressWarnings(as.numeric(plt$LON))
plt <- plt[!is.na(plt$LAT) & !is.na(plt$LON), ]
# forest plots only where status available
if ("PLOT_STATUS_CD" %in% names(plt))
  plt <- plt[is.na(plt$PLOT_STATUS_CD) | plt$PLOT_STATUS_CD == 1, ]
cat(sprintf("  PLOT rows with coords: %d\n", nrow(plt)))

## ---- load COND (dominant condition per plot) -------------------------
cond <- read.csv(file.path(fia, sprintf("%s_COND.csv", ST)),
                 colClasses = "character", stringsAsFactors = FALSE)
ck <- intersect(c("PLT_CN","CONDID","CONDPROP_UNADJ","FORTYPCD","OWNCD",
                  "OWNGRPCD","STDAGE","TRTCD1","TRTYR1","DSTRBCD1","DSTRBYR1"),
                names(cond))
cond <- cond[, ck]
for (c0 in setdiff(ck, "PLT_CN"))
  cond[[c0]] <- suppressWarnings(as.numeric(cond[[c0]]))
cond <- cond[order(cond$PLT_CN, -cond$CONDPROP_UNADJ), ]
cond <- cond[!duplicated(cond$PLT_CN), ]
cond <- cond[!is.na(cond$FORTYPCD) & cond$FORTYPCD > 0 & cond$FORTYPCD < 990, ]
cat(sprintf("  forested dominant conditions: %d\n", nrow(cond)))

dat <- merge(plt, cond, by = "PLT_CN")
dat$ft_group <- ft_group(dat$FORTYPCD)
dat <- dat[!is.na(dat$ft_group), ]
cat(sprintf("  plots with forest-type group: %d\n", nrow(dat)))

## ---- province: EPA Level III spatial join ----------------------------
pts <- vect(dat[, c("LON","LAT")], geom = c("LON","LAT"), crs = "EPSG:4326")
eco <- vect(eco_shp)
if (is.na(crs(eco, proj = TRUE)) || crs(eco) == "") crs(eco) <- "EPSG:4326"
eco <- project(eco, "EPSG:4326")
ji  <- relate(pts, eco, "intersects", pairs = TRUE)
prov_code <- rep(NA_character_, nrow(dat)); prov_name <- prov_code
ed <- as.data.frame(eco)
prov_code[ji[,1]] <- as.character(ed$NA_L3CODE[ji[,2]])
prov_name[ji[,1]] <- as.character(ed$NA_L3NAME[ji[,2]])
dat$prov_code <- prov_code
dat$prov_name <- prov_name
cat(sprintf("  plots joined to an EPA L3 province: %d / %d\n",
            sum(!is.na(dat$prov_code)), nrow(dat)))

## ---- owner: ownership raster extract ---------------------------------
ras <- rast(own_tif)
ov  <- terra::extract(ras, project(pts, crs(ras)))[, 2]
dat$own_code  <- ov
dat$owner4    <- own_from_raster[as.character(ov)]
# fallback to OWNGRPCD where raster class is Unknown/NonForest/Water/NA
need_fb <- is.na(dat$owner4)
dat$owner4[need_fb] <- own_from_owngrp(dat$OWNGRPCD[need_fb])
dat <- dat[!is.na(dat$owner4), ]
cat(sprintf("  plots with owner class: %d (raster %.0f%%, fallback %.0f%%)\n",
            nrow(dat),
            100*mean(!need_fb[match(dat$PLT_CN, dat$PLT_CN)]),
            100*mean(need_fb)))

## ---- drop plots lacking a province -----------------------------------
dat <- dat[!is.na(dat$prov_code), ]

## ---- cell key + treatment --------------------------------------------
dat$cell_key <- paste(dat$ft_group, dat$prov_code, dat$owner4, sep = "|")

harvest_codes <- c(10, 20, 30, 50)
sev_dstrb     <- c(10, 12, 20, 22, 30, 50, 52)
dat$has_harvest <- dat$TRTCD1 %in% harvest_codes & !is.na(dat$TRTYR1) &
                   (dat$INVYR - dat$TRTYR1) <= 30
dat$has_disturb <- dat$DSTRBCD1 %in% sev_dstrb & !is.na(dat$DSTRBYR1) &
                   (dat$INVYR - dat$DSTRBYR1) <= 20
dat$treatment <- ifelse(dat$has_harvest, "harvested",
                  ifelse(dat$has_disturb, "disturbed", "untreated"))

## ---- strata table ----------------------------------------------------
agg <- aggregate(PLT_CN ~ ft_group + prov_code + prov_name + owner4,
                 data = dat, FUN = length)
names(agg)[ncol(agg)] <- "n_plots"
agg$cell_key <- paste(agg$ft_group, agg$prov_code, agg$owner4, sep = "|")
agg$flag <- ifelse(agg$n_plots < MIN_PLOTS, "<min", "ok")
agg <- agg[order(-agg$n_plots), ]
write.csv(agg, file.path(cfg, sprintf("ycx_strata_%s.csv", ST)),
          row.names = FALSE)

membership <- dat[, c("STATECD","COUNTYCD","PLOT","PLT_CN","INVYR","LAT","LON",
                      "FORTYPCD","ft_group","prov_code","prov_name",
                      "own_code","owner4","cell_key","STDAGE","treatment")]
write.csv(membership, file.path(cfg, sprintf("ycx_membership_%s.csv", ST)),
          row.names = FALSE)

cat(sprintf("\n[ycx_00] %s: %d cells (%d with n>=%d), %d plots\n",
            ST, nrow(agg), sum(agg$n_plots >= MIN_PLOTS), MIN_PLOTS, nrow(dat)))
cat("  treatment mix: ");  print(table(dat$treatment))
cat("  owner mix:     ");  print(table(dat$owner4))
cat("Top 15 cells:\n"); print(head(agg[, c("cell_key","n_plots")], 15), row.names = FALSE)
