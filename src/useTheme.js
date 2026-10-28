// Active theme ("light" or "dark"): the explicit data-theme on <html> when set by the
// header toggle or main.jsx, otherwise the OS preference. Re-renders on either change.
import { useEffect, useState } from "react";
const read = () => {
  const t = document.documentElement.dataset.theme;
  if(t === "light" || t === "dark") return t;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};
export default function useTheme(){
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const update = () => setTheme(read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    if(mq) mq.addEventListener("change", update);
    return () => { mo.disconnect(); if(mq) mq.removeEventListener("change", update); };
  }, []);
  return theme;
}
