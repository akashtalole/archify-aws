// Viewer runtime embedded in every generated page (no external requests). Mirrors Archify's reader features
// for AWS diagrams: deep links, Reach, Route Probe, Node Finder, Passport, Guide, Presentation, Export.
//
//   #focus=<id>[&reach=downstream|upstream|both]     focus a node and highlight authored reachability
//   #route=<from>~<to>                                shortest authored directed route between two ids
//   ?theme=dark|light   ?present=1                    theme / presentation stage
//
// Reach and Route use ONLY the drawn relationships (edges/messages), never geometry.
export const VIEWER_CSS = `
.diagram{position:relative}
.aws .node{cursor:pointer}.aws .node.sel text{font-weight:700}.aws .node.sel use{filter:drop-shadow(0 0 6px #ff9900)}
.aws .edge.route .eline,.aws .edge.hl .eline{stroke:#ff9900;stroke-width:3}
.aws .edge.route .arw,.aws .edge.hl .arw{stroke:#ff9900}
#passport{position:absolute;right:12px;top:12px;width:320px;max-height:calc(100% - 24px);overflow:auto;background:var(--card);color:var(--ink);border:1px solid var(--bd);border-radius:8px;box-shadow:0 6px 24px #0003;padding:12px 14px;z-index:5;font-size:13px}
#passport h3{margin:0 0 2px;font-size:15px}#passport .sub{color:var(--muted);font-size:12px;margin-bottom:8px}
#passport h4{margin:10px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
#passport ul{list-style:none;margin:0;padding:0}#passport li a{display:block;padding:3px 6px;border-radius:4px;color:inherit;text-decoration:none;cursor:pointer}#passport li a:hover{background:var(--pbg)}
#passport .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
#passport button,#bar button,.menu button{background:transparent;color:inherit;border:1px solid var(--bd);border-radius:4px;padding:3px 8px;font:inherit;cursor:pointer}
#passport button:hover,#bar button:hover,.menu button:hover{background:var(--pbg)}
#passport .x{position:absolute;right:8px;top:6px;border:0;font-size:16px}
#bar{display:none;padding:8px 14px;border-bottom:1px solid var(--bd);font-size:13px;gap:10px;align-items:center;flex-wrap:wrap}#bar.on{display:flex}
#bar b{color:#b36b00}
.overlay{position:fixed;inset:0;background:#0006;display:none;align-items:flex-start;justify-content:center;padding-top:12vh;z-index:20}.overlay.on{display:flex}
.panel{background:var(--card);color:var(--ink);border:1px solid var(--bd);border-radius:8px;width:min(520px,92vw);box-shadow:0 12px 40px #0006;padding:12px}
.panel input{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--bd);border-radius:6px;background:var(--pbg);color:inherit}
.panel ul{list-style:none;margin:8px 0 0;padding:0;max-height:50vh;overflow:auto}.panel li{padding:6px 8px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;gap:8px}
.panel li.on,.panel li:hover{background:var(--pbg)}.panel li small{color:var(--muted)}
.panel kbd{border:1px solid var(--bd);border-bottom-width:2px;border-radius:4px;padding:0 6px;font:12px monospace;background:var(--pbg)}
.panel table{width:100%;border-collapse:collapse}.panel td{padding:4px 6px;border-top:1px solid var(--bd)}
.menu{position:relative}.menu .items{display:none;position:absolute;right:0;top:34px;background:var(--card);color:var(--ink);border:1px solid var(--bd);border-radius:6px;padding:4px;z-index:10;min-width:180px;box-shadow:0 6px 24px #0004}
.menu.open .items{display:grid}.menu .items button{text-align:left;border:0}
body.present header,body.present .card:not(.diagram),body.present #bar,body.present footer{display:none}
body.present main{max-width:none;padding:0}body.present .diagram{border:0;border-radius:0;height:100vh;display:grid;place-items:center;overflow:hidden}
body.present .diagram svg.aws{width:100vw;height:100vh}
`;

export const VIEWER_JS = `
(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const svg=$("svg.aws"),body=document.body,stage=$("#stage");
if(!svg)return;
const nodes=$$("svg.aws .node"),edges=$$("svg.aws .edge"),groups=$$("svg.aws .group");
const info=new Map();
nodes.forEach(n=>info.set(n.dataset.id,{id:n.dataset.id,label:n.dataset.label,service:n.dataset.service,category:n.dataset.category,el:n,kind:"node"}));
groups.forEach(g=>{if(g.dataset.id&&!info.has(g.dataset.id))info.set(g.dataset.id,{id:g.dataset.id,label:g.dataset.label,service:"Group",category:"",el:g,kind:"group"})});
const E=edges.map((el,i)=>({i,el,from:el.dataset.from,to:el.dataset.to,label:el.dataset.label||"",step:el.dataset.step||""}));
const out=new Map(),inn=new Map();
for(const e of E){(out.get(e.from)||out.set(e.from,[]).get(e.from)).push(e);(inn.get(e.to)||inn.set(e.to,[]).get(e.to)).push(e)}
const name=id=>info.get(id)?.label||id;
const state={focus:null,reach:null,route:null,theme:body.classList.contains("dark")?"dark":"light"};

function reach(id,dir){ // authored reachability over directed relationships
  const seenN=new Set([id]),seenE=new Set(),q=[id];
  const walk=(adj,next)=>{const s=new Set([id]),qq=[id];while(qq.length){const c=qq.shift();for(const e of adj.get(c)||[]){seenE.add(e);const n=next(e);if(!s.has(n)){s.add(n);seenN.add(n);qq.push(n)}}}};
  if(dir==="downstream"||dir==="both")walk(out,e=>e.to);
  if(dir==="upstream"||dir==="both")walk(inn,e=>e.from);
  return{nodes:seenN,edges:seenE};
}
function route(a,b){ // shortest directed path (fewest hops), resolved only from authored edges
  if(!info.has(a)||!info.has(b))return{error:"unknown endpoint"};
  const prev=new Map([[a,null]]),q=[a];
  while(q.length){const c=q.shift();if(c===b)break;for(const e of out.get(c)||[])if(!prev.has(e.to)){prev.set(e.to,e);q.push(e.to)}}
  if(!prev.has(b))return{error:"no directed route from "+name(a)+" to "+name(b)};
  const path=[];let c=b;while(prev.get(c)){path.unshift(prev.get(c));c=prev.get(c).from}
  return{path,nodes:new Set([a,...path.map(e=>e.to)]),edges:new Set(path)};
}
function clear(){nodes.concat(edges).forEach(e=>e.classList.remove("dim","hl","route","sel"))}
function paint(nodeSet,edgeSet,cls){
  nodes.forEach(n=>n.classList.toggle("dim",!nodeSet.has(n.dataset.id)));
  edges.forEach((el,i)=>{const on=edgeSet.has(E[i]);el.classList.toggle("dim",!on);el.classList.toggle(cls,on)});
}
const bar=$("#bar");
function say(html){bar.innerHTML=html;bar.classList.toggle("on",!!html)}
function setHash(){
  let h="";
  if(state.route)h="#route="+state.route.join("~");
  else if(state.focus)h="#focus="+state.focus+(state.reach?"&reach="+state.reach:"");
  history.replaceState(null,"",location.pathname+location.search+h);
}
function render(){
  clear();closePassport(false);
  if(state.route){
    const r=route(state.route[0],state.route[1]);
    if(r.error){say("<span>"+r.error+"</span><button id=cl>Clear</button>");$("#cl").onclick=reset;return}
    paint(r.nodes,r.edges,"route");
    say("<span><b>Route</b> "+[state.route[0],...r.path.map(e=>e.to)].map(name).join(" → ")+" · "+r.path.length+" hop"+(r.path.length>1?"s":"")+" (authored relationships only)</span><button id=cl>Clear</button>");
    $("#cl").onclick=reset;return;
  }
  if(state.focus&&info.has(state.focus)){
    const f=info.get(state.focus);f.el.classList.add("sel");
    if(state.reach){
      const r=reach(state.focus,state.reach);paint(r.nodes,r.edges,"hl");f.el.classList.remove("dim");f.el.classList.add("sel");
      say("<span><b>Reach "+state.reach+"</b> of "+name(state.focus)+": "+(r.nodes.size-1)+" node(s), "+r.edges.size+" relationship(s) — authored reachability, not runtime impact</span><button id=cl>Clear</button>");
      $("#cl").onclick=reset;
    }else{
      const keep=new Set([state.focus]),ke=new Set();
      for(const e of [...(out.get(state.focus)||[]),...(inn.get(state.focus)||[])]){keep.add(e.from);keep.add(e.to);ke.add(e)}
      paint(keep,ke,"hl");say("");
    }
    openPassport(state.focus);
  }else say("");
}
function reset(){state.focus=state.reach=state.route=null;setHash();render()}
function focusOn(id,reachDir){state.route=null;state.focus=id;state.reach=reachDir||null;setHash();render()}

// Passport
const passport=document.createElement("div");passport.id="passport";passport.hidden=true;stage.appendChild(passport);
function closePassport(clearFocus){passport.hidden=true;if(clearFocus){state.focus=state.reach=null;setHash();render()}}
function openPassport(id){
  const f=info.get(id);
  const list=(arr,key)=>arr&&arr.length?"<ul>"+arr.map(e=>"<li><a data-go='"+e[key]+"'>"+(e.step?"<b>"+e.step+"</b> ":"")+name(e[key])+(e.label?" <small>· "+e.label+"</small>":"")+"</a></li>").join("")+"</ul>":"<div class=sub>none authored</div>";
  passport.innerHTML="<button class=x aria-label=Close>×</button><h3>"+f.label+"</h3><div class=sub>"+f.service+(f.category?" · "+f.category:"")+" · <code>"+f.id+"</code></div>"
   +"<h4>Upstream (calls this)</h4>"+list(inn.get(id),"from")+"<h4>Downstream (this calls)</h4>"+list(out.get(id),"to")
   +"<div class=row><button data-r=downstream>Reach ↓</button><button data-r=upstream>Reach ↑</button><button data-r=both>Both</button><button data-rt>Route to…</button><button data-cp>Copy link</button></div>";
  passport.hidden=false;
  passport.querySelector(".x").onclick=()=>closePassport(true);
  passport.querySelectorAll("[data-go]").forEach(a=>a.onclick=()=>focusOn(a.dataset.go,state.reach));
  passport.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>focusOn(id,b.dataset.r));
  passport.querySelector("[data-cp]").onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(location.href);say("<span>Link copied</span>");setTimeout(()=>{if(!state.route&&!state.reach)say("")},1200)};
  passport.querySelector("[data-rt]").onclick=()=>openFinder("Route from "+f.label+" to…",t=>{state.focus=null;state.reach=null;state.route=[id,t.id];setHash();render()});
}
nodes.forEach(n=>n.addEventListener("click",ev=>{ev.stopPropagation();focusOn(n.dataset.id,state.reach)}));
svg.addEventListener("click",e=>{if(e.target===svg||e.target.classList.contains("bg"))reset()});
let hoverOn=false;
nodes.forEach(n=>{n.addEventListener("mouseenter",()=>{if(state.focus||state.route)return;hoverOn=true;const id=n.dataset.id,keep=new Set([id]),ke=new Set();for(const e of [...(out.get(id)||[]),...(inn.get(id)||[])]){keep.add(e.from);keep.add(e.to);ke.add(e)}paint(keep,ke,"hl")});
 n.addEventListener("mouseleave",()=>{if(hoverOn&&!state.focus&&!state.route){clear();hoverOn=false}})});
$$(".steps li").forEach(li=>{li.addEventListener("mouseenter",()=>{if(state.focus||state.route)return;const k=new Set([li.dataset.from,li.dataset.to]);const ke=new Set(E.filter(e=>k.has(e.from)&&k.has(e.to)));paint(k,ke,"hl")});li.addEventListener("mouseleave",()=>{if(!state.focus&&!state.route)clear()});li.addEventListener("click",()=>focusOn(li.dataset.from,"downstream"))});
$$(".pillar li[data-nodes]").forEach(li=>{const ids=li.dataset.nodes.split(" ").filter(Boolean);if(!ids.length)return;li.addEventListener("mouseenter",()=>{if(state.focus||state.route)return;nodes.forEach(n=>n.classList.toggle("dim",!ids.includes(n.dataset.id)));edges.forEach(e=>e.classList.add("dim"))});li.addEventListener("mouseleave",()=>{if(!state.focus&&!state.route)clear()})});

// Finder (also used to pick a route target)
const fo=document.createElement("div");fo.className="overlay";fo.innerHTML="<div class=panel><input type=text placeholder='Find a node by label, service or id…' aria-label='Node finder'><ul></ul></div>";body.appendChild(fo);
const fi=fo.querySelector("input"),fl=fo.querySelector("ul");let fpick=null,fsel=0,fres=[];
function fRender(){const q=fi.value.trim().toLowerCase();fres=[...info.values()].filter(i=>!q||(i.label+" "+i.id+" "+i.service).toLowerCase().includes(q)).slice(0,30);fsel=Math.min(fsel,Math.max(0,fres.length-1));fl.innerHTML=fres.map((r,i)=>"<li class='"+(i===fsel?"on":"")+"' data-i='"+i+"'><span>"+r.label+"</span><small>"+r.service+" · "+r.id+"</small></li>").join("")||"<li><small>No matches</small></li>";fl.querySelectorAll("li[data-i]").forEach(li=>li.onclick=()=>choose(fres[+li.dataset.i]))}
function choose(r){if(!r)return;closeOv();const cb=fpick;fpick=null;if(cb)cb(r);else{focusOn(r.id,null);r.el.scrollIntoView({block:"center",inline:"center",behavior:"smooth"})}}
function openFinder(ph,cb){fpick=cb||null;fi.placeholder=ph||"Find a node by label, service or id…";fi.value="";fsel=0;fo.classList.add("on");fRender();fi.focus()}
function closeOv(){$$(".overlay").forEach(o=>o.classList.remove("on"))}
fi.addEventListener("input",()=>{fsel=0;fRender()});
fi.addEventListener("keydown",e=>{if(e.key==="ArrowDown"){fsel=Math.min(fsel+1,fres.length-1);fRender();e.preventDefault()}else if(e.key==="ArrowUp"){fsel=Math.max(fsel-1,0);fRender();e.preventDefault()}else if(e.key==="Enter")choose(fres[fsel])});
fo.addEventListener("click",e=>{if(e.target===fo)closeOv()});

// Guide
const go=document.createElement("div");go.className="overlay";go.innerHTML="<div class=panel><h3 style='margin:0 0 8px'>Diagram guide</h3><table>"
+"<tr><td><kbd>/</kbd> or <kbd>Ctrl/⌘ K</kbd></td><td>Find a node</td></tr><tr><td>Click a node</td><td>Focus it and open its Passport (upstream / downstream facts)</td></tr>"
+"<tr><td>Passport → Reach</td><td>Highlight everything authored downstream, upstream or both</td></tr><tr><td>Passport → Route to…</td><td>Shortest authored directed route to another node</td></tr>"
+"<tr><td><kbd>Esc</kbd></td><td>Clear focus / close panels</td></tr><tr><td><kbd>t</kbd></td><td>Toggle light / dark</td></tr><tr><td><kbd>p</kbd></td><td>Presentation stage</td></tr>"
+"<tr><td><kbd>?</kbd></td><td>This guide</td></tr><tr><td>URL <code>#focus=id&amp;reach=downstream</code></td><td>Deep link to a focus / reach</td></tr><tr><td>URL <code>#route=a~b</code></td><td>Deep link to a route</td></tr></table>"
+"<p style='color:var(--muted);font-size:12px;margin:8px 0 0'>Reach and Route follow only the relationships drawn in this diagram — authored reachability, not runtime causality.</p></div>";body.appendChild(go);
go.addEventListener("click",e=>{if(e.target===go)closeOv()});

// Theme, presentation
function setTheme(t){state.theme=t;svg.classList.toggle("theme-dark",t==="dark");svg.classList.toggle("theme-light",t!=="dark");body.classList.toggle("dark",t==="dark")}
function present(on){body.classList.toggle("present",on===undefined?!body.classList.contains("present"):on)}
$("#theme")&&($("#theme").onclick=()=>setTheme(state.theme==="dark"?"light":"dark"));
$("#find")&&($("#find").onclick=()=>openFinder());
$("#guide")&&($("#guide").onclick=()=>go.classList.add("on"));
$("#present")&&($("#present").onclick=()=>present());

// Export (client-side; viewer state is stripped from every export)
function cleanClone(){
  const c=svg.cloneNode(true);
  c.querySelectorAll(".dim,.hl,.route,.sel").forEach(e=>e.classList.remove("dim","hl","route","sel"));
  c.removeAttribute("style");
  return c;
}
function svgString(c){return new XMLSerializer().serializeToString(c)}
function download(blob,fn){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
const base=(document.title||"architecture").replace(/[^\\w-]+/g,"-").toLowerCase().slice(0,60);
function raster(type,q,cb){
  const c=cleanClone(),vb=svg.viewBox.baseVal,sc=2;
  const img=new Image();img.onload=()=>{const cv=document.createElement("canvas");cv.width=vb.width*sc;cv.height=vb.height*sc;const x=cv.getContext("2d");x.fillStyle=state.theme==="dark"?"#161E2D":"#fff";x.fillRect(0,0,cv.width,cv.height);x.drawImage(img,0,0,cv.width,cv.height);cv.toBlob(cb,type,q)};
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgString(c));
}
const exp={
  "svg":()=>{const c=cleanClone();const st=c.querySelector("style");
    // dual-theme SVG: light by default, dark when the viewer's OS prefers it
    c.setAttribute("class","aws theme-light");
    st.textContent+="@media (prefers-color-scheme:dark){.aws.theme-light{--bg:#161E2D;--fg:#ffffff;--muted:#aab4c3;--line:#d5dbdb;--halo:#161E2D;--badge:#ffffff;--badgeFg:#000000}.aws.theme-light .only-dark{display:inline}.aws.theme-light .only-light{display:none}}";
    download(new Blob([svgString(c)],{type:"image/svg+xml"}),base+".svg")},
  "png":()=>raster("image/png",undefined,b=>download(b,base+".png")),
  "jpeg":()=>raster("image/jpeg",.92,b=>download(b,base+".jpg")),
  "webp":()=>raster("image/webp",.92,b=>download(b,base+".webp")),
  "copy":()=>raster("image/png",undefined,b=>{navigator.clipboard&&window.ClipboardItem?navigator.clipboard.write([new ClipboardItem({"image/png":b})]).then(()=>say("<span>PNG copied</span>")):download(b,base+".png");setTimeout(()=>{if(!state.route&&!state.reach&&!state.focus)say("")},1400)})
};
const menu=$(".menu");
if(menu){menu.querySelector("button").onclick=e=>{e.stopPropagation();menu.classList.toggle("open")};
 menu.querySelectorAll(".items button").forEach(b=>b.onclick=()=>{menu.classList.remove("open");exp[b.dataset.x]()});
 document.addEventListener("click",()=>menu.classList.remove("open"))}

document.addEventListener("keydown",e=>{
  const typing=/INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if(e.key==="Escape"){if($$(".overlay.on").length)closeOv();else if(body.classList.contains("present"))present(false);else reset();return}
  if(typing)return;
  if(e.key==="/"||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k")){e.preventDefault();openFinder()}
  else if(e.key==="?"){go.classList.add("on")}
  else if(e.key==="t")setTheme(state.theme==="dark"?"light":"dark");
  else if(e.key==="p")present();
});

// Deep links
function fromHash(){
  const h=location.hash.slice(1),p=new URLSearchParams(h.replace(/~/g,"%7E"));
  state.focus=state.reach=state.route=null;
  const r=p.get("route");
  if(r){const[a,b]=decodeURIComponent(r).split("~");if(a&&b)state.route=[a,b]}
  else if(p.get("focus")){state.focus=p.get("focus");const rd=p.get("reach");if(["downstream","upstream","both"].includes(rd))state.reach=rd}
  render();
}
window.addEventListener("hashchange",fromHash);
const q=new URLSearchParams(location.search);
if(q.get("theme")==="dark"||q.get("theme")==="light")setTheme(q.get("theme"));
if(q.get("present")==="1")present(true);
fromHash();
window.__archify={ready:true,nodes:nodes.length,edges:E.length,reach:(id,d)=>{const r=reach(id,d);return{nodes:[...r.nodes],edges:r.edges.size}},route:(a,b)=>{const r=route(a,b);return r.error?{error:r.error}:{nodes:[...r.nodes],hops:r.path.length}},focus:focusOn,state,export:exp};
if(q.get("check")==="1"){ // machine-readable self-check used by finalize (never shown to readers)
  const fs_=[...svg.querySelectorAll("text")].map(t=>parseFloat(getComputedStyle(t).fontSize)||0).filter(Boolean);
  const scale=svg.getBoundingClientRect().width/(svg.viewBox.baseVal.width||1);
  let selftest="ok";
  try{const first=nodes[0]&&nodes[0].dataset.id;if(first){window.__archify.reach(first,"both");window.__archify.route(first,first)}}catch(e){selftest=String(e)}
  const pre=document.createElement("pre");pre.id="archify-check";
  pre.textContent=JSON.stringify({ready:true,nodes:nodes.length,edges:E.length,overflowX:Math.max(0,document.documentElement.scrollWidth-innerWidth),minFontPx:Math.round(Math.min(...fs_)*scale*10)/10,symbols:svg.querySelectorAll("symbol").length,badUse:[...svg.querySelectorAll("use")].filter(u=>!svg.querySelector(u.getAttribute("href"))).length,selftest});
  body.appendChild(pre);
}
})();
`;
