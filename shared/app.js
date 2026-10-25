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
    // VisualViewport follows the software keyboard; layout viewport units do not.
    const viewport=window.visualViewport;
    let frame=0;
    const editable=element=>element?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable="true"]');
    const geometry=()=>{
      frame=0;
      const height=viewport?.height||window.innerHeight,offset=viewport?.offsetTop||0;
      const inset=Math.max(0,window.innerHeight-height-offset);
      document.documentElement.style.setProperty('--yard-visible-height',`${height}px`);
      document.documentElement.style.setProperty('--yard-keyboard-inset',`${inset}px`);
      const keyboard=inset>120&&editable(document.activeElement);
      document.body.classList.toggle('yard-app-keyboard',keyboard);
    };
    const scheduleGeometry=()=>{if(!frame)frame=requestAnimationFrame(geometry);};
    viewport?.addEventListener('resize',scheduleGeometry);viewport?.addEventListener('scroll',scheduleGeometry);
    window.addEventListener('resize',scheduleGeometry);
    document.addEventListener('focusin',scheduleGeometry);document.addEventListener('focusout',scheduleGeometry);
    geometry();
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
    // Use actual rendered heights so wrapping/text-size and safe areas are covered.
    const measure=()=>{
      const px=element=>element&&getComputedStyle(element).display!=='none'?element.getBoundingClientRect().height:0;
      const undo=document.getElementById('undoToast'),care=document.getElementById('careToast');
      document.documentElement.style.setProperty('--yard-dock-height',`${px(dock)}px`);
      document.documentElement.style.setProperty('--yard-undo-height',`${px(undo)}px`);
      document.documentElement.style.setProperty('--yard-toast-height',`${px(undo)+px(care)+(px(undo)&&px(care)?8:0)}px`);
    };
    if(window.ResizeObserver){const observer=new ResizeObserver(measure);[dock,document.getElementById('undoToast'),document.getElementById('careToast')].filter(Boolean).forEach(element=>observer.observe(element));}
    window.addEventListener('resize',measure);measure();
    let shortcut=null;
    const current=event=>{
      const view=location.hash.slice(1)||'dashboard';
      if(event?.type==='yard-app-view')shortcut=event.detail?.shortcut||null;
      else if(event?.type==='hashchange'||event?.type==='popstate')shortcut=null;
      const activeTarget=view==='dashboard'?(shortcut||'plants'):view;
      dock.querySelectorAll('button').forEach(button=>{
        if(button.dataset.appTarget===activeTarget)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
      });
    };
    document.addEventListener('focusin',event=>{
      if(event.target.closest('#quickLogPanel')){shortcut='log';current();}
      else if(event.target.closest('#dashboardView')&&!event.target.closest('#settingsPanel')){shortcut=null;current();}
    });
    document.addEventListener('yard-app-view',current);window.addEventListener('hashchange',current);window.addEventListener('popstate',current);current();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
