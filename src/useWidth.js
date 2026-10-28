// Rendered width of a box, so inline SVG charts can size their viewBox to the panel
// (text keeps its on-screen size) or scale fixed-projection map chrome on phones.
import { useEffect, useState } from "react";
export default function useWidth(initial = 460, min = 320, max = 720){
  const [box, setBox] = useState(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if(!box) return;
    const apply = cw => { if(cw > 0) setW(Math.max(min, Math.min(max, Math.round(cw)))); };
    apply(box.getBoundingClientRect().width);
    if(typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => apply(e.contentRect.width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, min, max]);
  return [setBox, w];
}
