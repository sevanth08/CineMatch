/* CineMatch authentication (Supabase Auth). Plain JS, no build step.
   Relies on: config.js (public settings), vendor/supabase.js (supabase-js 2.117.3 UMD). */
(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
var cfg=window.CINEMATCH_CONFIG||{};
var url=String(cfg.SUPABASE_URL||"").trim();
var key=String(cfg.SUPABASE_PUBLISHABLE_KEY||"").trim();
var dlg=$("authDlg"),form=$("authForm");
var ls=[],client=null,state="ok",mode="signin",busy=false,user=null,lastEmail="",coolLeft=0,coolTimer=null,toastTimer=null;
var G_LABEL="Continue with Google";

var M={
  signin:{t:"Sign in",b:"Sign in",bb:"Signing in\u2026",pw:true,email:true},
  signup:{t:"Create account",b:"Create account",bb:"Creating account\u2026",pw:true,email:true},
  reset:{t:"Reset password",b:"Send reset link",bb:"Sending\u2026",pw:false,email:true},
  recovery:{t:"New password",b:"Update password",bb:"Updating\u2026",pw:true,email:false}
};

/* ---------- setup & safety checks ---------- */
function privileged(k){
  if(/^sb_secret_/i.test(k))return true;
  try{var p=k.split(".")[1];if(p){var j=JSON.parse(atob(p.replace(/-/g,"+").replace(/_/g,"/")));return j.role==="service_role"}}catch(e){}
  return false}
if(!url||!key||!/^https:\/\//i.test(url))state="noconfig";
else if(privileged(key)){state="badkey";console.error("CineMatch: config.js contains a secret/service_role key. Use the publishable key only. Sign-in is disabled.")}
else if(!window.supabase||!window.supabase.createClient){state="nolib";console.error("CineMatch: vendor/supabase.js did not load.")}
else{try{client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}catch(e){state="nolib";console.error(e)}}

/* Works at https://<user>.github.io/CineMatch/ (project path) and at a domain root. */
function siteUrl(){var p=location.pathname.replace(/index\.html$/,"");if(p.slice(-1)!=="/")p+="/";return location.origin+p}

/* ---------- small UI helpers ---------- */
function msg(t,kind){var m=$("aMsg");m.textContent=t||"";m.className=kind==="err"?"err":""}
function toast(t){var el=$("toast");el.textContent=t;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.hidden=true},6000)}
function invalid(id){$(id).setAttribute("aria-invalid","true")}
function clearInvalid(){["aEmail","aPw","aPw2"].forEach(function(i){$(i).removeAttribute("aria-invalid")})}
function showResend(on){$("resend").hidden=!on}

function setBusy(b){
  busy=b;form.setAttribute("aria-busy",b?"true":"false");
  ["aSubmit","gBtn","tabIn","tabUp","forgot","back","aEmail","aPw","aPw2"].forEach(function(i){$(i).disabled=b});
  $("resend").disabled=b||coolLeft>0;
  $("aSubmit").textContent=b&&!$("gBtn").dataset.go?M[mode].bb:M[mode].b;
  if(!b){delete $("gBtn").dataset.go;$("gBtn").textContent=G_LABEL}}

function setMode(m){
  mode=m;var c=M[m],auth=m==="signin"||m==="signup";
  $("authTitle").textContent=c.t;
  $("tabIn").setAttribute("aria-pressed",m==="signin");$("tabUp").setAttribute("aria-pressed",m==="signup");
  $("tabs").hidden=!auth;$("gWrap").hidden=!auth;
  $("emailRow").hidden=!c.email;$("pwRow").hidden=!c.pw;
  $("pwLabel").textContent=m==="recovery"?"New password":"Password";
  $("aPw").autocomplete=m==="signin"?"current-password":"new-password";
  $("pwHint").hidden=!(m==="signup"||m==="recovery");$("pw2Row").hidden=!(m==="signup"||m==="recovery");$("aPw2").value="";
  $("forgot").hidden=m!=="signin";$("back").hidden=m!=="reset";
  showResend(false);clearInvalid();msg("");
  $("aSubmit").textContent=c.b}

function openDlg(m,note,kind){
  if(state!=="ok"){
    dlg.classList.add("off");
    $("authTitle").textContent="Sign in";
    $("authOff").textContent=
      state==="nolib"?"Sign-in couldn\u2019t load. Refresh the page to try again. You can still browse and get recommendations.":
      state==="badkey"?"Sign-in is switched off because config.js holds a private key. Use the publishable key only.":
      "Sign-in isn\u2019t set up on this site yet. You can still browse and get recommendations.";
  }else{dlg.classList.remove("off");setMode(m);if(note)msg(note,kind)}
  if(!dlg.open){if(typeof dlg.showModal==="function")dlg.showModal();else dlg.setAttribute("open","")}
  var f=state!=="ok"?$("authClose"):(mode==="recovery"?$("aPw"):$("aEmail"));if(f)f.focus()}
function closeDlg(){if(typeof dlg.close==="function")dlg.close();else dlg.removeAttribute("open")}

/* ---------- readable errors ---------- */
function friendly(e){
  var c=(e&&e.code)||"",m=String((e&&e.message)||""),s=e&&e.status;
  if(e&&(e.name==="AuthRetryableFetchError"||s===0||/failed to fetch|networkerror|load failed|fetch is not defined/i.test(m)))
    return"Can\u2019t reach the sign-in service. Check your connection and try again.";
  var map={
    invalid_credentials:"Wrong email or password.",
    email_not_confirmed:"Please confirm your email first. Check your inbox for the link, or resend it below.",
    user_already_exists:"An account with this email already exists. Try signing in instead.",
    email_exists:"An account with this email already exists. Try signing in instead.",
    weak_password:"That password is too weak. Use at least 8 characters with a mix of letters and numbers.",
    over_email_send_rate_limit:"Too many emails sent. Please wait a few minutes and try again.",
    over_request_rate_limit:"Too many attempts. Please wait a moment and try again.",
    email_address_invalid:"That email address isn\u2019t accepted. Check it and try again.",
    signup_disabled:"New sign-ups are turned off right now.",
    same_password:"Choose a password different from your current one.",
    provider_disabled:"Google sign-in isn\u2019t enabled for this site yet.",
    otp_expired:"That link has expired or was already used. Request a new one.",
    validation_failed:"Please check the details you entered.",
    session_not_found:"Your session expired. Please sign in again.",
    reauthentication_needed:"Please sign in again to change your password."};
  if(map[c])return map[c];
  if(/invalid login credentials/i.test(m))return map.invalid_credentials;
  if(/not confirmed/i.test(m))return map.email_not_confirmed;
  if(/already registered/i.test(m))return map.user_already_exists;
  if(/rate limit/i.test(m))return map.over_request_rate_limit;
  console.error("CineMatch auth error:",e);
  return"Something went wrong. Please try again."}

function fail(e){msg(friendly(e),"err");if(e&&e.code==="email_not_confirmed")showResend(true)}

/* ---------- validation ---------- */
function check(){
  var e=$("aEmail").value.trim(),p=$("aPw").value,c=M[mode];
  if(c.email){
    if(!e)return["aEmail","Enter your email address."];
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return["aEmail","That email address doesn\u2019t look right."]}
  if(c.pw){
    if(!p)return["aPw",mode==="recovery"?"Enter a new password.":"Enter your password."];
    if(mode!=="signin"&&p.length<8)return["aPw","Use at least 8 characters for your password."];
    if(mode!=="signin"&&$("aPw2").value!==p)return["aPw2","The two passwords don\u2019t match."]}
  return null}

/* ---------- actions ---------- */
async function run(email,pw){
  var r;
  if(mode==="signin"){
    r=await client.auth.signInWithPassword({email:email,password:pw});if(r.error)throw r.error;
    closeDlg();toast("Signed in as "+email+".")}
  else if(mode==="signup"){
    r=await client.auth.signUp({email:email,password:pw,options:{emailRedirectTo:siteUrl()}});if(r.error)throw r.error;
    var d=r.data||{};
    if(d.user&&Array.isArray(d.user.identities)&&d.user.identities.length===0){
      msg("An account with this email already exists. Try signing in, or reset your password.","err");return}
    if(d.session){closeDlg();toast("Account created. You\u2019re signed in.")}
    else{msg("Check your inbox: we sent a confirmation link to "+email+". Open it on this device to finish signing up.");showResend(true)}}
  else if(mode==="reset"){
    r=await client.auth.resetPasswordForEmail(email,{redirectTo:siteUrl()});if(r.error)throw r.error;
    msg("If an account exists for "+email+", a reset link is on its way. Check your inbox and spam folder.")}
  else if(mode==="recovery"){
    r=await client.auth.updateUser({password:pw});if(r.error)throw r.error;
    closeDlg();toast("Password updated. You\u2019re signed in.")}}

form.addEventListener("submit",function(ev){
  ev.preventDefault();if(busy||!client)return;
  clearInvalid();var bad=check();
  if(bad){invalid(bad[0]);msg(bad[1],"err");$(bad[0]).focus();return}
  var email=$("aEmail").value.trim(),pw=$("aPw").value;lastEmail=email;
  setBusy(true);msg("");showResend(false);
  run(email,pw).catch(fail).then(function(){setBusy(false)})});

$("gBtn").onclick=function(){
  if(busy||!client)return;msg("");setBusy(true);
  $("gBtn").dataset.go="1";$("gBtn").textContent="Redirecting to Google\u2026";
  client.auth.signInWithOAuth({provider:"google",options:{redirectTo:siteUrl()}})
    .then(function(r){if(r&&r.error)throw r.error})
    .catch(function(e){fail(e);setBusy(false)})};

$("resend").onclick=function(){
  if(busy||!client||coolLeft>0)return;
  var email=lastEmail||$("aEmail").value.trim();if(!email){msg("Enter your email address first.","err");return}
  setBusy(true);
  client.auth.resend({type:"signup",email:email,options:{emailRedirectTo:siteUrl()}})
    .then(function(r){if(r.error)throw r.error;msg("Confirmation email sent to "+email+".");cooldown(30)})
    .catch(fail).then(function(){setBusy(false)})};
function cooldown(n){
  coolLeft=n;clearInterval(coolTimer);
  function tick(){$("resend").textContent=coolLeft>0?"Resend in "+coolLeft+"s":"Resend confirmation email";$("resend").disabled=busy||coolLeft>0;
    if(coolLeft<=0){clearInterval(coolTimer)}coolLeft--}
  tick();coolTimer=setInterval(tick,1000)}

$("tabIn").onclick=function(){if(!busy)setMode("signin")};
$("tabUp").onclick=function(){if(!busy)setMode("signup")};
$("forgot").onclick=function(){if(!busy){var e=$("aEmail").value;setMode("reset");$("aEmail").value=e;$("aEmail").focus()}};
$("back").onclick=function(){if(!busy){setMode("signin");$("aEmail").focus()}};
$("authClose").onclick=closeDlg;
dlg.addEventListener("click",function(e){if(e.target===dlg)closeDlg()});
dlg.addEventListener("close",function(){$("aPw").value="";$("aPw2").value="";setBusy(false);if(mode==="recovery")setMode("signin")});
window.addEventListener("pageshow",function(e){if(e.persisted)setBusy(false)});

/* ---------- header: signed-in state, sign out ---------- */
function renderUser(session){
  user=session&&session.user?session.user:null;
  var who=$("who"),btn=$("authBtn");
  if(user){who.textContent="Signed in as "+(user.email||"you");who.hidden=false;btn.textContent="Sign out"}
  else{who.hidden=true;who.textContent="";btn.textContent="Sign in"}
  ls.forEach(function(f){try{f(user)}catch(e){console.error(e)}})}

$("authBtn").onclick=function(){
  if(state!=="ok"||!user){openDlg("signin");return}
  var btn=$("authBtn");btn.disabled=true;btn.textContent="Signing out\u2026";
  /* scope local = sign out this browser only, not every device */
  client.auth.signOut({scope:"local"})
    .then(function(r){if(r&&r.error)throw r.error;toast("Signed out.")})
    .catch(function(e){toast(friendly(e))})
    .then(function(){btn.disabled=false;renderUser(null)})};

/* ---------- return from email link / Google ---------- */
function authParams(){
  var h=new URLSearchParams(location.hash.replace(/^#/,"")),q=new URLSearchParams(location.search);
  return{h:h,q:q,any:/(^|[#?&])(access_token|refresh_token|code|error|error_code|type)=/.test(location.hash+"&"+location.search)}}
function cleanUrl(){if(window.history&&history.replaceState)history.replaceState(null,"",siteUrl())}

if(state==="ok"){
  var ap=authParams(),urlErr=null;
  if(ap.any&&(ap.h.get("error")||ap.q.get("error")||ap.h.get("error_code")||ap.q.get("error_code"))){
    var ec=ap.h.get("error_code")||ap.q.get("error_code")||"",ed=ap.h.get("error_description")||ap.q.get("error_description")||"";
    urlErr=friendly({code:ec,message:ed});
    if(urlErr==="Something went wrong. Please try again."&&ed)urlErr=ed}
  var recovering=false;
  client.auth.onAuthStateChange(function(ev,session){
    /* keep this callback synchronous: no awaited supabase calls in here */
    renderUser(session);
    if(ev==="PASSWORD_RECOVERY"){recovering=true;openDlg("recovery","Choose a new password for your account.")}
    if(ev==="SIGNED_OUT"&&dlg.open&&mode==="recovery")closeDlg()});
  client.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;renderUser(s);
    if(ap.any)cleanUrl();
    if(urlErr)openDlg("signin",urlErr+" You can request a new link with \u201cForgot password?\u201d or sign in again.","err");
    else if(s&&ap.any&&!recovering)toast("You\u2019re signed in as "+(s.user.email||"you")+".")})
   .catch(function(e){console.error(e)})
}
window.CM_AUTH={ok:state==="ok",client:client,user:function(){return user},open:function(m,n){openDlg(m||"signin",n)},toast:toast,onChange:function(f){ls.push(f);f(user)}};
})();
