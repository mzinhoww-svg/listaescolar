/**
 * Sessões do agent-browser por conta de demonstração (login por link mágico via Mailpit), sonda de layout e
 * cookie por sessão. Compartilhado por scripts/s28-medir.mjs e scripts/s29-checks.mjs.
 * Só opera nas sessões cujo nome `sessionName(k)` devolve; nunca `close --all`.
 */
import { execFileSync } from "node:child_process";

import { assertLocalUrls } from "./local-host.mjs";

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {{ base: string, mailpit: string, sessionName: (k: string) => string }} cfg */
export function createSessions({ base, mailpit, sessionName }) {
  assertLocalUrls({ BASE: base, MAILPIT: mailpit });
  const ab = (k, ...a) => sh("agent-browser", ["--session", sessionName(k), ...a]);
  async function login(k, email, next) {
    const count = async () => (await (await fetch(`${mailpit}/api/v1/search?query=to:${email}`)).json()).messages_count;
    const before = await count();
    ab(k, "open", `${base}/entrar?next=${next}`);
    ab(k, "fill", "#email", email);
    ab(k, "press", "Enter");
    for (let i = 0; i < 20 && (await count()) <= before; i++) await sleep(1000);
    const list = await (await fetch(`${mailpit}/api/v1/search?query=to:${email}`)).json();
    const msg = await (await fetch(`${mailpit}/api/v1/message/${list.messages[0].ID}`)).json();
    ab(k, "open", msg.Text.match(/https?:\/\/[^\s"<>]+/)[0]);
  }

  /** Falha alto se a sessão não está logada de fato (evita medir a tela de login por engano). */
  function assertLogged(k, path) {
    const res = JSON.parse(ab(k, "cookies", "get", "--json"));
    const header = res.data.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const out = sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", "-H", `Cookie: ${header}`, `${base}${path}`]);
    if (out.includes("/entrar")) throw new Error(`sessão ${k} não está logada para ${path}: ${out}`);
  }

  function cookieHeader(k) {
    const res = JSON.parse(ab(k, "cookies", "get", "--json"));
    return res.data.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }


  return { ab, login, assertLogged, cookieHeader };
}

export { sh, sleep };

// Checagens de layout a 390 px (Task 20): rolagem horizontal, `main`/`h1`, alvos de toque < 44 px, texto < 12 px.
export const PROBE = `(()=>{
const vis=e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&c.display!=='none'};
const sel=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).slice(0,2).join('.'):'');
const vw=document.documentElement.clientWidth;
const out={path:location.pathname,sw:document.documentElement.scrollWidth,vw,h1:document.querySelectorAll('h1').length,main:document.querySelectorAll('main').length,over:[],small:[],tiny:[]};
if(out.sw>vw+1){out.over=[];const clipped=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p);if(c.overflowX!=='visible'&&p.getBoundingClientRect().right<=vw+1)return true}return false};for(const e of document.body.querySelectorAll('*')){const r=e.getBoundingClientRect();if(r.width>0&&r.right>vw+1&&!clipped(e)){out.over.push(sel(e)+' '+Math.round(r.right)+' pos='+getComputedStyle(e).position);if(out.over.length>=5)break}}}
out.targets=[];out.acts=[];
const clipOf=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p).overflowX;if(c==='auto'||c==='scroll'||c==='hidden'||c==='clip')return Math.min(p.getBoundingClientRect().right,vw)}return vw};
for(const e of document.querySelectorAll('a[href],button,select,textarea,summary,[role=button],[role=tab],input:not([type=hidden])')){
 if(!vis(e)||e.closest('.sr-only')||e.matches('.sr-only'))continue;
 const c=getComputedStyle(e);const inTable=!!e.closest('table,td,th');
 let r=e.getBoundingClientRect();
 if(e.tagName!=='INPUT'||!/checkbox|radio/.test(e.type)){const cr=clipOf(e);if(r.width>0&&(r.left>=cr-1||r.right-cr>r.width/2)&&inTable)out.acts.push({label:sel(e)+' "'+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,24)+'"',left:r.left,right:r.right,clipRight:cr,inTable})}
 if(e.tagName==='A'&&c.display==='inline'&&!inTable)continue;
 if(e.tagName==='INPUT'&&/checkbox|radio/.test(e.type)){const l=e.closest('label')||(e.id&&document.querySelector('label[for="'+e.id+'"]'));if(l)r=l.getBoundingClientRect();}
 if(r.height<43.5||r.width<43.5){out.small.push(sel(e)+' '+Math.round(r.width)+'x'+Math.round(r.height));out.targets.push({label:sel(e),w:r.width,h:r.height})}
}
out.targets=out.targets.slice(0,40);out.acts=out.acts.slice(0,20);
const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
while((n=w.nextNode())){if(!n.textContent.trim())continue;const p=n.parentElement;if(!p||!vis(p)||p.closest('.sr-only,script,style,svg'))continue;const f=parseFloat(getComputedStyle(p).fontSize);if(f<11.99)out.tiny.push(sel(p)+' '+f+'px')}
out.small=[...new Set(out.small)].slice(0,8);out.tiny=[...new Set(out.tiny)].slice(0,5);
return JSON.stringify(out)})()`;

