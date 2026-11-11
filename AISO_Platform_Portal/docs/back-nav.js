"use strict";
/* "返回" links go to the PREVIOUS page (browser history) when the visitor came from another page of this site; otherwise they follow their own href. */
document.addEventListener("click",e=>{
 const a=e.target.closest&&e.target.closest("a.pg-back");
 if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 try{
  if(document.referrer&&new URL(document.referrer).origin===location.origin&&history.length>1){e.preventDefault();history.back()}
 }catch(_){}
});
