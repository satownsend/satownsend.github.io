/* Online-only home-screen app. No service worker or offline write queue. */
(function(){
  'use strict';
  let installPrompt=null;
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function installState(message){
    const button=document.getElementById('installAppBtn'),status=document.getElementById('appInstallStatus');
    if(button)button.hidden=installed()||!installPrompt;
    if(status)status.textContent=message||(installed()?'You’re using the installed app. Open Plants to get started.':installPrompt?'Your browser can install the app. Use Install app below.':'Use the instructions below to add the app to your Home Screen.');
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installState();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installState('App installed. Look for Scott’s Yard on your Home Screen or in your apps.');});
  function init(){
    document.documentElement.classList.toggle('yard-app-standalone',installed());
    installState();
    const button=document.getElementById('installAppBtn');
    if(button)button.addEventListener('click',async()=>{
      if(!installPrompt)return;
      const prompt=installPrompt;installPrompt=null;button.hidden=true;
      try{await prompt.prompt();const choice=await prompt.userChoice;installState(choice.outcome==='accepted'?'Installation requested. Follow your browser’s instructions to finish.':'Installation dismissed. You can use your browser’s install menu later.');}
      catch(_){installState('Use your browser’s install menu or the instructions below.');}
    });
    const notice=document.createElement('p');notice.className='yard-app-connection';notice.setAttribute('role','status');
    notice.textContent='You’re offline. Live weather, uploads and sign-in need an internet connection.';
    document.body.appendChild(notice);
    const connection=()=>{notice.hidden=navigator.onLine!==false;};connection();
    window.addEventListener('online',connection);window.addEventListener('offline',connection);
    if(!document.getElementById('plant-tab-dashboard'))return;
    document.body.classList.add('yard-app-mobile');
    const dock=document.createElement('nav');dock.className='yard-app-dock';dock.setAttribute('aria-label','Plant shortcuts');
    dock.innerHTML='<button type="button" class="ghost" data-app-target="plants">Plants</button><button type="button" class="ghost" data-app-target="log">Quick log</button><button type="button" class="ghost" data-app-target="calendar">Care</button><button type="button" class="ghost" data-app-target="weather">Weather</button>';
    dock.addEventListener('click',event=>{const button=event.target.closest('[data-app-target]');if(button)document.dispatchEvent(new CustomEvent('yard-app-navigate',{detail:{target:button.dataset.appTarget}}));});
    document.body.appendChild(dock);
    const current=()=>{
      const view=location.hash.slice(1)||'dashboard';
      dock.querySelectorAll('button').forEach(button=>{
        const active=button.dataset.appTarget===(view==='dashboard'?'plants':view);
        if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
      });
    };
    document.addEventListener('yard-app-view',current);window.addEventListener('hashchange',current);window.addEventListener('popstate',current);current();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
