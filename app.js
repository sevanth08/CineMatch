/* CineMatch discovery: TMDB (via Supabase Edge Function "tmdb"), moods, watchlist, preferences. */
(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
var cfg=window.CINEMATCH_CONFIG||{},A=window.CM_AUTH||{};
var base=String(cfg.SUPABASE_URL||"").replace(/\/$/,""),IMG="https://image.tmdb.org/t/p/w342";
var G={28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",53:"Thriller",10752:"War"};
var MOODS=[
 {id:"feelgood",label:"Feel-good",g:[35,10751,10402],x:"27,53,80,10752",r:6.8},
 {id:"laugh",label:"Laugh out loud",g:[35],x:"18,27,53,10752",r:6.5},
 {id:"romantic",label:"Romantic",g:[10749],x:"27,53,28",r:6.8},
 {id:"heartfelt",label:"Heartfelt",g:[18,10749],x:"27,28,53",r:7.5},
 {id:"edge",label:"Edge of my seat",g:[53,9648],x:"10751,16,35",r:6.8},
 {id:"mind",label:"Mind-bending",g:[878,9648],x:"10751,16,35",r:7.2},
 {id:"adrenaline",label:"Adrenaline",g:[28,12],x:"10751,16,10749",r:6.6},
 {id:"epic",label:"Epic escape",g:[14,12,878],x:"27,18,99",r:6.8},
 {id:"spooky",label:"Spooky night",g:[27],x:"35,10751,16",r:6.2}];
var wl=[],saved={},uid=null,mood=null,dlgMovie=null,prefT=null;

function api(p){
  if(!base||!cfg.SUPABASE_PUBLISHABLE_KEY)return Promise.reject(new Error("Movie data isn\u2019t connected yet."));
  var u=new URL(base+"/functions/v1/tmdb");Object.keys(p).forEach(function(k){u.searchParams.set(k,p[k])});
  return fetch(u.toString(),{headers:{apikey:cfg.SUPABASE_PUBLISHABLE_KEY}}).then(function(r){
    return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||"Movie service error");return j})})}
function errText(e){return /fetch|network/i.test(e.message)?"Can\u2019t reach the movie service. Check your connection and try again.":(e.message||"Something went wrong.")}
function poster(m){return m.poster_path?IMG+m.poster_path:null}
function el(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e}
function names(m){return(m.genre_ids||[]).map(function(g){return G[g]}).filter(Boolean)}
function meta(m){var a=[];if(m.year)a.push(m.year);if(m.rating)a.push("\u2605 "+Number(m.rating).toFixed(1));return a.join(" \u00b7 ")}

function skeleton(box,n){var b=$(box);b.innerHTML="";for(var i=0;i<n;i++)b.appendChild(el("div","sk"))}
function fill(box,list,why,emptyMsg){
  var b=$(box);b.innerHTML="";
  if(!list.length){b.appendChild(el("p","empty",emptyMsg));return}
  list.forEach(function(m){b.appendChild(card(m,why?why(m):""))})}

function card(m,why){
  var a=el("article","mc"),p=poster(m),ph;
  if(p){ph=el("img","ph");ph.src=p;ph.alt="Poster for "+m.title;ph.loading="lazy";ph.onerror=function(){var d=el("div","ph",m.title);this.replaceWith(d)}}
  else ph=el("div","ph",m.title);
  var b=el("div","b");b.appendChild(el("h3",null,m.title));b.appendChild(el("div","meta",meta(m)));
  var g=names(m).slice(0,3).join(", ");if(g)b.appendChild(el("div","meta",g));
  if(why)b.appendChild(el("p","why",why));
  var acts=el("div","acts"),d=el("button","btn","Details");d.type="button";d.onclick=function(){openDetails(m,why)};
  acts.appendChild(d);acts.appendChild(saveBtn(m));b.appendChild(acts);a.appendChild(ph);a.appendChild(b);return a}

function saveBtn(m){
  var b=el("button","btn save");b.type="button";b.dataset.id=m.id;paint(b);
  b.onclick=function(){toggle(m,b)};return b}
function paint(b){var on=!!saved[b.dataset.id];b.setAttribute("aria-pressed",on);b.textContent=on?"Saved \u2713":"+ Watchlist";b.setAttribute("aria-label",(on?"Remove from":"Add to")+" watchlist")}
function repaint(){document.querySelectorAll("button.save").forEach(paint)}

function toggle(m,btn){
  if(!A.ok||!A.user()){A.open&&A.open("signin","Sign in to save films to your watchlist.");return}
  var on=!!saved[m.id],t=A.client.from("watchlist");btn.disabled=true;
  var q=on?t.delete().eq("tmdb_id",m.id):t.insert({tmdb_id:m.id,title:String(m.title).slice(0,300),poster_path:m.poster_path||null,year:m.year?Number(m.year):null});
  Promise.resolve(q).then(function(r){
    if(r.error&&r.error.code!=="23505")throw r.error;
    if(on)delete saved[m.id];else saved[m.id]=1;
    return loadWL()}).then(function(){A.toast(on?"Removed from your watchlist.":"Saved to your watchlist.")})
   .catch(function(e){A.toast("Couldn\u2019t update your watchlist. Please try again.");console.error(e)})
   .then(function(){btn.disabled=false;repaint()})}

function loadWL(){
  if(!uid){wl=[];saved={};renderWL();return Promise.resolve()}
  return Promise.resolve(A.client.from("watchlist").select("tmdb_id,title,poster_path,year,created_at").order("created_at",{ascending:false}))
   .then(function(r){if(r.error)throw r.error;wl=r.data||[];saved={};wl.forEach(function(w){saved[w.tmdb_id]=1});renderWL();repaint()})
   .catch(function(e){console.error(e);$("wlBox").replaceChildren(el("p","empty","Couldn\u2019t load your watchlist. Refresh to try again."))})}
function renderWL(){
  var box=$("wlBox");box.innerHTML="";
  if(!uid){var p=el("p","empty","Sign in to build a watchlist that follows you across devices. ");var b=el("button","btn","Sign in");b.type="button";b.onclick=function(){A.open&&A.open("signin")};p.appendChild(b);box.appendChild(p);return}
  if(!wl.length){box.appendChild(el("p","empty","Your watchlist is empty. Tap \u201c+ Watchlist\u201d on any film to save it here."));return}
  var g=el("div","mgrid");wl.forEach(function(w){g.appendChild(card({id:w.tmdb_id,title:w.title,year:w.year?String(w.year):"",poster_path:w.poster_path,genre_ids:[]},""))});box.appendChild(g)}

/* ---- details dialog ---- */
function openDetails(m,why){
  var d=$("movDlg"),c=$("movBody");c.innerHTML="";dlgMovie=m;
  var p=poster(m);if(p){var i=el("img","dp");i.src=p;i.alt="Poster for "+m.title;c.appendChild(i)}
  var t=el("div","dt");t.appendChild(el("h2","ext",m.title));t.appendChild(el("p","meta",[meta(m),names(m).join(", ")].filter(Boolean).join(" \u00b7 ")));
  t.appendChild(el("p",null,m.overview||"No description available for this film yet."));if(why)t.appendChild(el("p","why",why));
  t.appendChild(saveBtn(m));c.appendChild(t);
  if(typeof d.showModal==="function")d.showModal();else d.setAttribute("open","");}
$("movClose").onclick=function(){$("movDlg").close()};
$("movDlg").addEventListener("click",function(e){if(e.target===this)this.close()});

/* ---- moods ---- */
$("moods").innerHTML="";
MOODS.forEach(function(m){var b=el("button","theme",m.label);b.type="button";b.setAttribute("aria-pressed","false");b.dataset.id=m.id;$("moods").appendChild(b)});
$("moods").addEventListener("click",function(e){var b=e.target.closest(".theme");if(b)pick(b.dataset.id,true)});
function pick(id,save){
  mood=MOODS.filter(function(m){return m.id===id})[0];if(!mood)return;
  document.querySelectorAll("#moods .theme").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.id===id)});
  $("moodMsg").textContent="Finding "+mood.label.toLowerCase()+" films\u2026";skeleton("moodGrid",6);
  api({action:"discover",with:mood.g.join("|"),without:mood.x,minr:mood.r}).then(function(j){
    if(!mood||mood.id!==id)return;
    $("moodMsg").textContent=mood.label+": "+(j.results||[]).length+" films for tonight.";
    fill("moodGrid",j.results||[],function(m){
      var hit=(m.genre_ids||[]).filter(function(g){return mood.g.indexOf(g)>-1}).map(function(g){return G[g]}).join(", ");
      return"Why it fits \u201c"+mood.label+"\u201d: "+(hit||"popular pick")+"; rated "+Number(m.rating).toFixed(1)+"/10 by "+Number(m.votes).toLocaleString()+" viewers."},"No films matched this mood right now.")})
   .catch(function(e){$("moodMsg").textContent="";$("moodGrid").replaceChildren(el("p","empty",errText(e)))});
  if(save)savePrefs()}

/* ---- search & trending ---- */
$("sform").addEventListener("submit",function(ev){
  ev.preventDefault();var q=$("sq").value.trim();
  if(!q){$("sMsg").textContent="Type a film title to search.";return}
  $("sMsg").textContent="Searching\u2026";skeleton("sGrid",6);$("sBtn").disabled=true;
  api({action:"search",q:q}).then(function(j){$("sMsg").textContent="";fill("sGrid",j.results||[],null,"No films found for \u201c"+q+"\u201d. Try another title.")})
   .catch(function(e){$("sMsg").textContent="";$("sGrid").replaceChildren(el("p","empty",errText(e)))}).then(function(){$("sBtn").disabled=false})});
function loadTrending(){
  skeleton("tGrid",6);
  api({action:"trending"}).then(function(j){fill("tGrid",j.results||[],function(){return"Trending worldwide this week."},"Nothing is trending right now.")})
   .catch(function(e){$("tGrid").replaceChildren(el("p","empty",errText(e)))})}

/* ---- preferences (signed-in only) ---- */
function savePrefs(){
  if(!A.ok||!uid)return;clearTimeout(prefT);
  prefT=setTimeout(function(){
    Promise.resolve(A.client.from("user_preferences").upsert({user_id:uid,theme:document.documentElement.dataset.theme,last_mood:mood?mood.id:null,updated_at:new Date().toISOString()},{onConflict:"user_id"}))
     .then(function(r){if(r.error)console.error(r.error)})},400)}
function loadPrefs(){
  Promise.resolve(A.client.from("user_preferences").select("theme,last_mood").maybeSingle()).then(function(r){
    if(r.error||!r.data)return;
    if(r.data.theme&&window.setTheme)window.setTheme(r.data.theme);
    if(r.data.last_mood&&!mood)pick(r.data.last_mood,false)}).catch(function(e){console.error(e)})}
$("theme").addEventListener("click",savePrefs);

/* ---- nav ---- */
$("menuBtn").onclick=function(){var o=$("nav").classList.toggle("open");this.setAttribute("aria-expanded",o)};
$("navLinks").addEventListener("click",function(e){if(e.target.closest("a")){$("nav").classList.remove("open");$("menuBtn").setAttribute("aria-expanded","false")}});

/* ---- auth state ---- */
renderWL();loadTrending();
if(A.onChange)A.onChange(function(u){
  var id=u?u.id:null;if(id===uid)return;uid=id;
  if(uid){loadWL();loadPrefs()}else{wl=[];saved={};renderWL();repaint()}});
})();
