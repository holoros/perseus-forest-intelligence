## ycx_maps.R  — CONUS choropleths of the v1.4 recalibration + disturbance story
## Reads per-state results, joins to maps::map_data("state"), renders 3 panels.
## Output: treemap/maps/conus_recal_disturb_maps.png (+ _thumb.png)
suppressMessages({library(ggplot2); library(maps); library(dplyr)})
out <- if(length(commandArgs(TRUE))>=1) commandArgs(TRUE)[1] else file.path(Sys.getenv("HOME"),"yield_curves_conus")
td<-file.path(out,"treemap"); md<-file.path(td,"maps"); dir.create(md,showWarnings=FALSE,recursive=TRUE)

ABBR2NAME <- c(AL="alabama",AZ="arizona",AR="arkansas",CA="california",CO="colorado",CT="connecticut",
 DE="delaware",FL="florida",GA="georgia",ID="idaho",IL="illinois",IN="indiana",IA="iowa",KS="kansas",
 KY="kentucky",LA="louisiana",ME="maine",MD="maryland",MA="massachusetts",MI="michigan",MN="minnesota",
 MS="mississippi",MO="missouri",MT="montana",NE="nebraska",NV="nevada",NH="new hampshire",NJ="new jersey",
 NM="new mexico",NY="new york",NC="north carolina",ND="north dakota",OH="ohio",OK="oklahoma",OR="oregon",
 PA="pennsylvania",RI="rhode island",SC="south carolina",SD="south dakota",TN="tennessee",TX="texas",
 UT="utah",VT="vermont",VA="virginia",WA="washington",WV="west virginia",WI="wisconsin",WY="wyoming")

rc <- read.csv(file.path(td,"recal_cell","conus_recal_capped_100yr.csv"))
r2 <- rc[rc$year==2122,]; r2$uplift <- 100*(r2$recal_Tg/r2$hybrid_Tg - 1)
val<- read.csv(file.path(td,"recal_cell","recal_cell_validation.csv"))
val$bias_fix <- (val$recal_pctyr - val$hybrid_pctyr)            # %/yr closed toward obs
nn <- read.csv(file.path(td,"disturb","disturb_state_netneg.csv"))

mk <- function(df, valcol){
  df$region <- ABBR2NAME[df$state]; df <- df[!is.na(df$region),]
  left_join(map_data("state"), df[,c("region",valcol)], by="region")
}
base_theme <- theme_void(base_size=12) + theme(legend.position="bottom",
  plot.title=element_text(face="bold",size=12,hjust=0.5), legend.key.width=unit(22,"pt"))

p1 <- ggplot(mk(r2,"uplift"), aes(long,lat,group=group,fill=uplift)) +
  geom_polygon(color="white",linewidth=0.15) + coord_fixed(1.3) +
  scale_fill_viridis_c(option="D",name="% uplift") +
  labs(title="Recalibration growth uplift\n(100-yr reserve, recal vs hybrid)") + base_theme
p2 <- ggplot(mk(val,"bias_fix"), aes(long,lat,group=group,fill=bias_fix)) +
  geom_polygon(color="white",linewidth=0.15) + coord_fixed(1.3) +
  scale_fill_viridis_c(option="C",name="%/yr") +
  labs(title="Near-term growth correction\n(recal minus hybrid, toward FIA obs)") + base_theme
p3 <- ggplot(mk(nn,"pct_netneg"), aes(long,lat,group=group,fill=pct_netneg)) +
  geom_polygon(color="white",linewidth=0.15) + coord_fixed(1.3) +
  scale_fill_distiller(palette="YlOrRd",direction=1,name="% area") +
  labs(title="Disturbance-exposed decline\n(% forest below 2022 stock, severe arm)") + base_theme

# combine without patchwork: use gridExtra if present, else save separately
if("gridExtra" %in% rownames(installed.packages())){
  g <- gridExtra::arrangeGrob(p1,p2,p3,nrow=1)
  ggsave(file.path(md,"conus_recal_disturb_maps.png"), g, width=15, height=5.2, dpi=200)
  ggsave(file.path(md,"conus_recal_disturb_maps_thumb.png"), g, width=15, height=5.2, dpi=48)
} else {
  for(nm in c("uplift","biasfix","netneg")) {}
  ggsave(file.path(md,"map_recal_uplift.png"), p1, width=6, height=5, dpi=200)
  ggsave(file.path(md,"map_bias_fix.png"), p2, width=6, height=5, dpi=200)
  ggsave(file.path(md,"map_disturb_decline.png"), p3, width=6, height=5, dpi=200)
}
cat(sprintf("[maps] uplift range %.0f..%.0f%%, decline area max %.0f%%\n",
  min(r2$uplift),max(r2$uplift),max(nn$pct_netneg)))
cat("[maps] wrote treemap/maps/\n")
