## ycx_csi_sample.R  (per-state Climate Site Index from forest plots)
##
## Samples the Climate Site Index projection rasters (CSI_2030/2060/2090,
## meters, EPSG:4326) at every forested FIA plot location in each state's
## membership table, and writes the forest-area-weighted (equal-plot) mean
## CSI by horizon. These drive a state-specific climate productivity signal
## in ycx_02 (CSI_2030 is the near-present baseline).
##
## Usage: Rscript ycx_csi_sample.R [out_dir]
## Inputs : <out>/config/ycx_membership_*.csv  (LAT, LON, STATECD)
##          ~/raster_layers/csi/CSI_{2030,2060,2090}.tif
## Output : <out>/config/csi_states.csv  (state,csi_2030,csi_2060,csi_2090,n)

suppressMessages(library(terra))
out  <- if (length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else
        file.path(Sys.getenv("HOME"), "yield_curves_conus")
cfg  <- file.path(out, "config")
csid <- file.path(Sys.getenv("HOME"), "raster_layers", "csi")

files <- list.files(cfg, pattern="^ycx_membership_.*\\.csv$", full.names=TRUE)
cat(sprintf("[csi] %d membership files\n", length(files)))

all <- do.call(rbind, lapply(files, function(f){
  st <- sub("^ycx_membership_", "", sub("\\.csv$", "", basename(f)))
  d <- read.csv(f, stringsAsFactors=FALSE)
  d <- d[is.finite(d$LON) & is.finite(d$LAT), c("LON","LAT")]
  if (nrow(d)==0) return(NULL)
  data.frame(state=st, LON=d$LON, LAT=d$LAT)
}))
cat(sprintf("[csi] %d plot points across %d states\n",
            nrow(all), length(unique(all$state))))

pts <- vect(all[,c("LON","LAT")], geom=c("LON","LAT"), crs="EPSG:4326")
res <- data.frame(state=all$state)
for (h in c("2030","2060","2090")) {
  r <- rast(file.path(csid, sprintf("CSI_%s.tif", h)))
  v <- terra::extract(r, pts)[,2]
  res[[paste0("csi_",h)]] <- v
}

agg <- aggregate(cbind(csi_2030,csi_2060,csi_2090) ~ state, data=res,
                 FUN=function(x) mean(x, na.rm=TRUE))
n   <- aggregate(csi_2030 ~ state, data=res,
                 FUN=function(x) sum(is.finite(x)))
names(n)[2] <- "n"
agg <- merge(agg, n, by="state")
agg[,2:4] <- round(agg[,2:4], 3)
write.csv(agg, file.path(cfg, "csi_states.csv"), row.names=FALSE)

cat("[csi] per-state CSI (2030 -> 2090 change %):\n")
agg$chg_pct <- round(100*(agg$csi_2090/agg$csi_2030 - 1), 1)
print(agg[order(agg$chg_pct), c("state","csi_2030","csi_2090","chg_pct","n")],
      row.names=FALSE)
cat(sprintf("[csi] wrote %s\n", file.path(cfg, "csi_states.csv")))
