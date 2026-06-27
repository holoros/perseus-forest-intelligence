#!/usr/bin/env python3
"""Block 2 hook: build a per-rcp CSI table so the engine can read rcp-native climate instead of
a single CSI trajectory scaled by SCALE_rcp. First cut reproduces current behavior exactly
(rcp85 = full observed CSI stress; rcp45 = half the departure, i.e. the current SCALE_rcp=0.5),
so plugging real ClimateNA-derived per-rcp CSI later is drop-in. Run on Cardinal from
~/yield_curves_conus. Output config/csi_states_ext_rcp.csv. Also validates the refactored pm
hook reproduces the current pm(t)."""
import csv
rows=list(csv.DictReader(open("config/csi_states_ext.csv")))
def half(v): return 1+0.5*(float(v)-1)
with open("config/csi_states_ext_rcp.csv","w") as out:
    out.write("state,rcp,csi_2030,csi_2060,csi_2090,source\n")
    for r in rows:
        s=r["state"]; c30,c60,c90=r["csi_2030"],r["csi_2060"],r["csi_2090"]
        out.write("%s,rcp85,%s,%s,%s,firstcut_from_observed\n"%(s,c30,c60,c90))
        out.write("%s,rcp45,%s,%.4f,%.4f,firstcut_from_observed\n"%(s,c30,half(c60),half(c90)))
print("wrote config/csi_states_ext_rcp.csv: %d states x 2 rcp"%len(rows))
# validate refactored hook reproduces current pm (ME, 2090)
BETA=0.45
me=[r for r in rows if r["state"]=="ME"][0]; c30=float(me["csi_2030"]); c90=float(me["csi_2090"])
def pm_old(csi,scale): return 1+scale*BETA*(csi/c30-1)
pm_new_85=1+BETA*(c90/c30-1)            # csi already rcp-specific -> no SCALE factor
pm_new_45=1+BETA*(half(c90)/c30-1)
print("ME 2090 rcp85: old(scale=1.0)=%.4f  new(rcp-native)=%.4f"%(pm_old(c90,1.0),pm_new_85))
print("ME 2090 rcp45: old(scale=0.5)=%.4f  new(rcp-native)=%.4f"%(pm_old(c90,0.5),pm_new_45))
print("match => refactor is behavior-preserving; real per-rcp CSI replaces the columns later")
